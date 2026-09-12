"""Guardarrailes de los workflows de GitHub Actions (`cuatris guardarrailes .github/workflows`).

Los workflows son el unico codigo del repositorio que corre con permisos: un error ahi no lo
atrapa ningun test de la suite. Este modulo revisa, sobre el YAML ya parseado, las cinco reglas
del plan de la Fase 4 («Sobre los workflows corre ademas un punado de guardarrailes»):

`permisos-faltantes`
    Cada job declara `permissions` de forma explicita. Heredar el valor por defecto del
    repositorio hace que un cambio en la configuracion de la plataforma cambie en silencio lo
    que puede hacer cada job.
`interpolacion-peligrosa`
    Ningun `run:` interpola `${{ github.event.* }}` ni `${{ github.head_ref }}`. Esos valores
    los escribe quien abre el PR y se expanden **antes** de que el shell vea la linea: un
    titulo de PR con comillas y `;` es ejecucion de codigo con los permisos del job.
`accion-sin-sha` / `accion-sin-version`
    Toda accion de terceros esta fijada a un SHA de 40 caracteres y lleva la version en un
    comentario en la misma linea (`# v4.2.2`). Una etiqueta como `@v4` la mueve su autor.
`secreto-prohibido`
    No hay `secrets.` fuera de `GITHUB_TOKEN`: el repositorio no tiene secretos y no debe
    empezar a tenerlos sin que alguien lo note.
`pull-request-target-con-permisos`
    En un workflow disparado por `pull_request_target`, el job que trae codigo del PR —un
    `actions/checkout` cuyo `ref:` o `repository:` apunta al head, o un `run:` que busca
    `refs/pull/`— tiene `permissions: {}`. Ese es el unico precio que vuelve aceptable a
    `pull_request_target`.

El parser de YAML es propio y esta en este mismo archivo: el subconjunto que usan los
workflows es chico, y las bibliotecas de YAML de PyPI publican wheels por plataforma, asi que
romperian la vendorizacion (gap G-05). Lo que el parser no entiende, lo rechaza con el numero
de linea; nunca adivina.
"""

from __future__ import annotations

import argparse
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from cuatris.validar.reporte import ERROR, WARNING, Hallazgo, hay_errores

AYUDA = "Revisa los guardarrailes de seguridad de los workflows de GitHub Actions."

EXTENSIONES = (".yml", ".yaml")
"""Archivos que se consideran workflows dentro de un directorio."""

INTERPOLACIONES_PELIGROSAS = (
    re.compile(r"\$\{\{\s*github\.event\b[^}]*\}\}"),
    re.compile(r"\$\{\{\s*github\.head_ref\b[^}]*\}\}"),
)
"""Expresiones que no pueden aparecer dentro de un `run:`; las escribe quien abre el PR."""

SECRETO = re.compile(r"\$\{\{\s*secrets\.(?P<nombre>[A-Za-z_][A-Za-z0-9_]*)[^}]*\}\}")
SECRETOS_PERMITIDOS = ("GITHUB_TOKEN",)
"""Unico secreto admitido: lo emite la propia ejecucion y caduca con ella."""

SHA_FIJADO = re.compile(r"^(?P<accion>[^@\s]+/[^@\s]+)@(?P<sha>[0-9a-f]{40})$")
VERSION_EN_COMENTARIO = re.compile(r"^v?\d+(\.\d+)*")
"""El comentario de un `uses:` fijado tiene que empezar por la version (`v4.2.2`)."""

OK = 0
HAY_ERRORES = 1
NO_SE_PUDO_ABRIR = 2

__all__ = [
    "AYUDA",
    "Cadena",
    "ErrorYaml",
    "Mapa",
    "configurar",
    "ejecutar",
    "main",
    "cargar_yaml",
    "revisar_archivo",
    "revisar_ruta",
]


# --------------------------------------------------------------------------------------
# Parser de YAML: el subconjunto que usan los workflows, con numero de linea
# --------------------------------------------------------------------------------------


class ErrorYaml(Exception):
    """El archivo no es YAML valido, o usa algo que este parser no entiende."""


class Cadena(str):
    """Un escalar de texto que recuerda en que linea estaba y que comentario lo seguia."""

    linea: int
    comentario: str

    def __new__(cls, valor: str, linea: int = 0, comentario: str = "") -> Cadena:
        objeto = super().__new__(cls, valor)
        objeto.linea = linea
        objeto.comentario = comentario
        return objeto


class Mapa(dict):
    """Un mapeo que recuerda en que linea aparecio cada clave."""

    lineas: dict[str, int]

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.lineas = {}

    def linea_de(self, clave: str, por_defecto: int = 0) -> int:
        """Linea donde aparece la clave, o `por_defecto` si no se registro."""
        return self.lineas.get(clave, por_defecto)


_LITERALES = {
    "true": True,
    "false": False,
    "null": None,
    "~": None,
}
"""Escalares con significado propio (esquema core de YAML 1.2; `on`/`yes` quedan como texto)."""

_ENTERO = re.compile(r"^-?\d+$")
_DECIMAL = re.compile(r"^-?\d+\.\d+$")
_CLAVE = re.compile(r"^(?P<clave>(?:\"[^\"]*\"|'[^']*'|[^\s:#][^:#]*?))\s*:(?=\s|$)")
_NO_SOPORTADO = (
    ("&", "anclas (`&nombre`)"),
    ("*", "alias (`*nombre`)"),
    ("!", "etiquetas (`!tipo`)"),
    ("?", "claves complejas (`? clave`)"),
)


class _Linea:
    """Una linea del archivo ya separada en sangria, contenido y comentario."""

    __slots__ = ("numero", "sangria", "contenido", "comentario", "cruda")

    def __init__(self, numero: int, cruda: str) -> None:
        self.numero = numero
        self.cruda = cruda
        sin_comentario, self.comentario = _partir_comentario(cruda)
        self.sangria = len(sin_comentario) - len(sin_comentario.lstrip(" "))
        self.contenido = sin_comentario.strip()

    def __repr__(self) -> str:  # pragma: no cover - solo para depurar
        return f"_Linea({self.numero}, {self.contenido!r})"


def _partir_comentario(linea: str) -> tuple[str, str]:
    """Separa el comentario `#` de la linea, respetando las comillas."""
    comilla: str | None = None
    indice = 0
    while indice < len(linea):
        caracter = linea[indice]
        if comilla is not None:
            if caracter == comilla:
                comilla = None
        elif caracter in "\"'":
            comilla = caracter
        elif caracter == "#" and (indice == 0 or linea[indice - 1] in " \t"):
            return linea[:indice].rstrip(), linea[indice + 1 :].strip()
        indice += 1
    return linea.rstrip(), ""


def _lineas_utiles(texto: str) -> list[_Linea]:
    """Lineas con contenido, ya sin comentarios sueltos ni lineas en blanco."""
    utiles: list[_Linea] = []
    for numero, cruda in enumerate(texto.splitlines(), start=1):
        if "\t" in cruda[: len(cruda) - len(cruda.lstrip(" \t"))]:
            raise ErrorYaml(f"linea {numero}: la sangria usa tabuladores; YAML exige espacios")
        linea = _Linea(numero, cruda)
        if linea.contenido:
            utiles.append(linea)
    return utiles


def cargar_yaml(texto: str) -> Any:
    """Parsea el subconjunto de YAML que usan los workflows y devuelve objetos de Python."""
    if texto.startswith("﻿"):
        raise ErrorYaml("linea 1: el archivo empieza con BOM; debe ser UTF-8 sin BOM")
    # Ojo: `revisar_archivo` lee con `read_text`, que traduce CRLF a LF (universal newlines),
    # asi que un workflow con finales CRLF **no** se rechaza: se analiza normalmente y sus
    # reglas se aplican igual. Este chequeo solo alcanza a quien pase el texto crudo (por
    # ejemplo los tests o un futuro lector binario), donde un CR suelto si romperia el
    # recorte de lineas de este parser.
    if "\r" in texto:
        raise ErrorYaml(
            "el archivo tiene retornos de carro (CR); los finales de linea deben ser LF"
        )
    crudas = texto.splitlines()
    lineas = _lineas_utiles(texto)
    if not lineas:
        return None
    if lineas[0].contenido == "---":
        lineas = lineas[1:]
    for linea in lineas:
        if linea.contenido in ("---", "..."):
            raise ErrorYaml(
                f"linea {linea.numero}: este parser lee un solo documento por archivo"
            )
    estado = _Estado(lineas, crudas)
    valor = estado.nodo(lineas[0].sangria)
    if estado.indice < len(estado.lineas):
        sobra = estado.lineas[estado.indice]
        raise ErrorYaml(f"linea {sobra.numero}: sangria inesperada en «{sobra.contenido}»")
    return valor


class _Estado:
    """Cursor sobre las lineas utiles; cada `nodo` consume un bloque completo."""

    def __init__(self, lineas: list[_Linea], crudas: list[str]) -> None:
        self.lineas = lineas
        self.crudas = crudas
        self.indice = 0

    # -- utilidades ---------------------------------------------------------------------

    def actual(self) -> _Linea | None:
        return self.lineas[self.indice] if self.indice < len(self.lineas) else None

    def nodo(self, sangria: int) -> Any:
        """Lee el bloque que empieza en la linea actual con esa sangria."""
        linea = self.actual()
        if linea is None:
            return None
        if linea.contenido == "-" or linea.contenido.startswith("- "):
            return self._secuencia(sangria)
        return self._mapeo(sangria)

    # -- secuencias ---------------------------------------------------------------------

    def _secuencia(self, sangria: int) -> list[Any]:
        elementos: list[Any] = []
        while True:
            linea = self.actual()
            if linea is None or linea.sangria != sangria:
                break
            if not (linea.contenido == "-" or linea.contenido.startswith("- ")):
                break
            resto = linea.contenido[1:].strip()
            if not resto:
                self.indice += 1
                hijo = self.actual()
                if hijo is None or hijo.sangria <= sangria:
                    elementos.append(None)
                else:
                    elementos.append(self.nodo(hijo.sangria))
                continue
            elementos.append(self._elemento_en_linea(linea, resto, sangria))
        return elementos

    def _elemento_en_linea(self, linea: _Linea, resto: str, sangria: int) -> Any:
        """Elemento de secuencia escrito en la misma linea del guion."""
        clave = _CLAVE.match(resto)
        if clave is None:
            self.indice += 1
            return _escalar(resto, linea)
        # `- clave: valor` abre un mapeo cuya sangria es la del texto tras el guion.
        desplazamiento = linea.sangria + len(linea.contenido) - len(resto)
        recortada = _Linea(linea.numero, " " * desplazamiento + resto)
        recortada.comentario = linea.comentario
        self.lineas[self.indice] = recortada
        return self._mapeo(desplazamiento, tope=sangria)

    # -- mapeos -------------------------------------------------------------------------

    def _mapeo(self, sangria: int, tope: int | None = None) -> Mapa:
        mapa = Mapa()
        while True:
            linea = self.actual()
            if linea is None:
                break
            if linea.sangria < sangria:
                break
            if linea.sangria > sangria:
                raise ErrorYaml(
                    f"linea {linea.numero}: sangria inesperada en «{linea.contenido}»"
                )
            if linea.contenido == "-" or linea.contenido.startswith("- "):
                if tope is not None and sangria > tope:
                    break
                raise ErrorYaml(
                    f"linea {linea.numero}: se esperaba «clave: valor» y hay un elemento de lista"
                )
            coincidencia = _CLAVE.match(linea.contenido)
            if coincidencia is None:
                raise ErrorYaml(
                    f"linea {linea.numero}: no entiendo «{linea.contenido}»; se esperaba «clave:»"
                )
            clave = _texto_de_clave(coincidencia.group("clave"), linea)
            if clave in mapa:
                raise ErrorYaml(f"linea {linea.numero}: la clave «{clave}» esta repetida")
            resto = linea.contenido[coincidencia.end() :].strip()
            mapa.lineas[clave] = linea.numero
            mapa[clave] = self._valor_de_clave(linea, resto, sangria)
        return mapa

    def _valor_de_clave(self, linea: _Linea, resto: str, sangria: int) -> Any:
        """Valor de `clave:`: en la misma linea, un bloque literal, o el bloque de abajo."""
        if resto and resto[0] in "|>":
            self.indice += 1
            return self._escalar_de_bloque(linea, resto, sangria)
        if resto:
            self.indice += 1
            return _escalar(resto, linea)
        self.indice += 1
        hijo = self.actual()
        if hijo is None:
            return None
        if hijo.sangria > sangria:
            return self.nodo(hijo.sangria)
        if hijo.sangria == sangria and (
            hijo.contenido == "-" or hijo.contenido.startswith("- ")
        ):
            # Secuencia al mismo nivel que su clave: YAML lo permite y los workflows lo usan.
            return self._secuencia(sangria)
        return None

    def _escalar_de_bloque(self, linea: _Linea, cabecera: str, sangria: int) -> Cadena:
        """Lee un escalar de bloque (`|`, `|-`, `>`, `>-`) usando las lineas crudas."""
        estilo = cabecera[0]
        modificadores = cabecera[1:].strip()
        if modificadores not in ("", "-", "+"):
            raise ErrorYaml(
                f"linea {linea.numero}: no entiendo el bloque «{cabecera}»; este parser admite "
                "«|», «|-», «|+», «>», «>-» y «>+»"
            )
        cuerpo: list[str] = []
        numero = linea.numero  # 1-indexado sobre `crudas`
        sangria_bloque: int | None = None
        while numero < len(self.crudas):
            cruda = self.crudas[numero]
            if not cruda.strip():
                cuerpo.append("")
                numero += 1
                continue
            actual = len(cruda) - len(cruda.lstrip(" "))
            if actual <= sangria:
                break
            if sangria_bloque is None:
                sangria_bloque = actual
            cuerpo.append(cruda[sangria_bloque:])
            numero += 1
        # `self.indice` ya avanzo una linea; hay que saltar todas las del bloque.
        while self.indice < len(self.lineas) and self.lineas[self.indice].numero <= numero:
            self.indice += 1
        while cuerpo and cuerpo[-1] == "":
            cuerpo.pop()
        if estilo == "|":
            texto = "\n".join(cuerpo)
        else:
            texto = _plegar(cuerpo)
        if modificadores != "-":
            texto += "\n"
        return Cadena(texto, linea.numero, linea.comentario)


def _plegar(cuerpo: list[str]) -> str:
    """Plegado de un escalar `>`: una linea en blanco es un salto, el resto son espacios."""
    partes: list[str] = []
    for fragmento in cuerpo:
        if fragmento == "":
            partes.append("\n")
        elif partes and partes[-1] not in ("\n",):
            partes.append(" " + fragmento)
        else:
            partes.append(fragmento)
    return "".join(partes)


def _texto_de_clave(crudo: str, linea: _Linea) -> str:
    """Desenvuelve la clave de sus comillas; las claves siempre son texto."""
    crudo = crudo.strip()
    if len(crudo) >= 2 and crudo[0] == crudo[-1] and crudo[0] in "\"'":
        return crudo[1:-1]
    for simbolo, nombre in _NO_SOPORTADO:
        if crudo.startswith(simbolo):
            raise ErrorYaml(f"linea {linea.numero}: este parser no admite {nombre}")
    return crudo


def _escalar(crudo: str, linea: _Linea) -> Any:
    """Convierte un escalar suelto: comillas, flujo (`[]`/`{}`), literales y numeros."""
    crudo = crudo.strip()
    for simbolo, nombre in _NO_SOPORTADO:
        if crudo.startswith(simbolo):
            raise ErrorYaml(f"linea {linea.numero}: este parser no admite {nombre}")
    if crudo.startswith("[") or crudo.startswith("{"):
        valor, sobrante = _flujo(crudo, linea)
        if sobrante.strip():
            raise ErrorYaml(f"linea {linea.numero}: sobra «{sobrante.strip()}» despues del flujo")
        return valor
    if len(crudo) >= 2 and crudo[0] == crudo[-1] and crudo[0] in "\"'":
        return Cadena(_desenvolver(crudo, linea), linea.numero, linea.comentario)
    if crudo in _LITERALES:
        return _LITERALES[crudo]
    if _ENTERO.match(crudo):
        return int(crudo)
    if _DECIMAL.match(crudo):
        return float(crudo)
    return Cadena(crudo, linea.numero, linea.comentario)


def _desenvolver(crudo: str, linea: _Linea) -> str:
    """Contenido de un escalar entre comillas, con los escapes de YAML de doble comilla."""
    cuerpo = crudo[1:-1]
    if crudo[0] == "'":
        return cuerpo.replace("''", "'")
    salida: list[str] = []
    indice = 0
    escapes = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\", "/": "/", "0": "\0"}
    while indice < len(cuerpo):
        caracter = cuerpo[indice]
        if caracter != "\\":
            salida.append(caracter)
            indice += 1
            continue
        indice += 1
        if indice >= len(cuerpo):
            raise ErrorYaml(f"linea {linea.numero}: la cadena termina en una barra invertida")
        siguiente = cuerpo[indice]
        if siguiente in escapes:
            salida.append(escapes[siguiente])
            indice += 1
            continue
        if siguiente in "uU" or siguiente == "x":
            largo = {"x": 2, "u": 4, "U": 8}[siguiente]
            digitos = cuerpo[indice + 1 : indice + 1 + largo]
            if len(digitos) != largo:
                raise ErrorYaml(f"linea {linea.numero}: escape unicode incompleto «\\{siguiente}»")
            salida.append(chr(int(digitos, 16)))
            indice += 1 + largo
            continue
        raise ErrorYaml(f"linea {linea.numero}: escape desconocido «\\{siguiente}»")
    return "".join(salida)


def _flujo(crudo: str, linea: _Linea) -> tuple[Any, str]:
    """Parsea una coleccion en estilo flujo (`[a, b]` o `{a: b}`) en una sola linea."""
    if crudo.startswith("["):
        elementos: list[Any] = []
        resto = crudo[1:].lstrip()
        if resto.startswith("]"):
            return elementos, resto[1:]
        while True:
            valor, resto = _flujo_valor(resto, linea)
            elementos.append(valor)
            resto = resto.lstrip()
            if resto.startswith(","):
                resto = resto[1:].lstrip()
                continue
            if resto.startswith("]"):
                return elementos, resto[1:]
            raise ErrorYaml(f"linea {linea.numero}: falta «]» o «,» en «{crudo}»")
    mapa = Mapa()
    resto = crudo[1:].lstrip()
    if resto.startswith("}"):
        return mapa, resto[1:]
    while True:
        coincidencia = _CLAVE.match(resto)
        if coincidencia is None:
            raise ErrorYaml(f"linea {linea.numero}: se esperaba «clave:» en «{resto}»")
        clave = _texto_de_clave(coincidencia.group("clave"), linea)
        resto = resto[coincidencia.end() :].lstrip()
        valor, resto = _flujo_valor(resto, linea)
        mapa[clave] = valor
        mapa.lineas[clave] = linea.numero
        resto = resto.lstrip()
        if resto.startswith(","):
            resto = resto[1:].lstrip()
            continue
        if resto.startswith("}"):
            return mapa, resto[1:]
        raise ErrorYaml(f"linea {linea.numero}: falta «}}» o «,» en «{crudo}»")


def _flujo_valor(resto: str, linea: _Linea) -> tuple[Any, str]:
    """Un valor dentro de una coleccion en estilo flujo, y lo que queda de la linea."""
    resto = resto.lstrip()
    if resto.startswith("[") or resto.startswith("{"):
        return _flujo(resto, linea)
    if resto[:1] in ("'", '"'):
        comilla = resto[0]
        fin = resto.find(comilla, 1)
        while comilla == "'" and fin != -1 and resto[fin : fin + 2] == "''":
            fin = resto.find(comilla, fin + 2)
        if fin == -1:
            raise ErrorYaml(f"linea {linea.numero}: falta la comilla de cierre en «{resto}»")
        return Cadena(_desenvolver(resto[: fin + 1], linea), linea.numero), resto[fin + 1 :]
    corte = len(resto)
    for indice, caracter in enumerate(resto):
        if caracter in ",]}":
            corte = indice
            break
    return _escalar(resto[:corte], linea), resto[corte:]


# --------------------------------------------------------------------------------------
# Las reglas
# --------------------------------------------------------------------------------------


def _cadenas_de(valor: Any) -> Iterator[Any]:
    """Recorre el arbol y devuelve cada cadena que encuentra."""
    pila = [valor]
    while pila:
        actual = pila.pop()
        if isinstance(actual, dict):
            pila.extend(actual.values())
        elif isinstance(actual, list):
            pila.extend(actual)
        elif isinstance(actual, str):
            yield actual


def _linea_de(valor: Any, por_defecto: int = 0) -> int:
    """Linea de un escalar que la recuerde; 0 si no la tiene."""
    return getattr(valor, "linea", por_defecto) or por_defecto


def _ubicacion(archivo: str, linea: int) -> str:
    """`archivo:linea` cuando se conoce la linea, `archivo` cuando no."""
    return f"{archivo}:{linea}" if linea else archivo


def _pasos(job: Any) -> list[Any]:
    """Pasos de un job, o lista vacia si el job no declara `steps` (por ejemplo, `uses:`)."""
    pasos = job.get("steps") if isinstance(job, dict) else None
    return [paso for paso in pasos if isinstance(paso, dict)] if isinstance(pasos, list) else []


def _disparadores(documento: Any) -> list[str]:
    """Nombres de los eventos de `on:`, venga como texto, lista o mapeo."""
    if not isinstance(documento, dict):
        return []
    gatillo = documento.get("on")
    if isinstance(gatillo, str):
        return [str(gatillo)]
    if isinstance(gatillo, list):
        return [str(item) for item in gatillo if isinstance(item, str)]
    if isinstance(gatillo, dict):
        return [str(clave) for clave in gatillo]
    return []


def _revisar_permisos(jobs: dict[str, Any], archivo: str) -> list[Hallazgo]:
    """Cada job declara `permissions`; heredar el valor por defecto no cuenta."""
    hallazgos: list[Hallazgo] = []
    for nombre, job in jobs.items():
        if not isinstance(job, dict):
            continue
        linea = jobs.lineas.get(nombre, 0) if isinstance(jobs, Mapa) else 0
        if "permissions" not in job:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "permisos-faltantes",
                    _ubicacion(archivo, linea),
                    f"el job «{nombre}» no declara `permissions`: hereda el valor por defecto "
                    "del repositorio, que puede cambiar sin que nadie lo note",
                )
            )
    return hallazgos


def _revisar_interpolaciones(jobs: dict[str, Any], archivo: str) -> list[Hallazgo]:
    """Ningun `run:` interpola datos que escribe quien abre el PR."""
    hallazgos: list[Hallazgo] = []
    for nombre, job in jobs.items():
        for paso in _pasos(job):
            orden = paso.get("run")
            if not isinstance(orden, str):
                continue
            linea = _linea_de(paso.get("run"))
            for patron in INTERPOLACIONES_PELIGROSAS:
                encontrado = patron.search(orden)
                if encontrado is None:
                    continue
                hallazgos.append(
                    Hallazgo(
                        ERROR,
                        "interpolacion-peligrosa",
                        _ubicacion(archivo, linea),
                        f"el job «{nombre}» interpola «{encontrado.group(0)}» dentro de un "
                        "`run:`: ese texto lo escribe quien abre el PR y se expande antes del "
                        "shell; pasalo por una variable de entorno y usala entre comillas",
                    )
                )
    return hallazgos


def _revisar_acciones(jobs: dict[str, Any], archivo: str) -> list[Hallazgo]:
    """Toda accion de terceros esta fijada a un SHA y lleva la version en el comentario."""
    hallazgos: list[Hallazgo] = []
    for nombre, job in jobs.items():
        usos: list[Any] = []
        if isinstance(job, dict) and isinstance(job.get("uses"), str):
            usos.append(job["uses"])
        for paso in _pasos(job):
            if isinstance(paso.get("uses"), str):
                usos.append(paso["uses"])
        for uso in usos:
            texto = str(uso)
            linea = _linea_de(uso)
            if texto.startswith("./") or texto.startswith("docker://"):
                continue
            fijado = SHA_FIJADO.match(texto)
            if fijado is None:
                hallazgos.append(
                    Hallazgo(
                        ERROR,
                        "accion-sin-sha",
                        _ubicacion(archivo, linea),
                        f"el job «{nombre}» usa «{texto}» sin fijarlo a un SHA de 40 "
                        "caracteres: una etiqueta la mueve su autor cuando quiere",
                    )
                )
                continue
            comentario = getattr(uso, "comentario", "")
            if not VERSION_EN_COMENTARIO.match(comentario.strip()):
                hallazgos.append(
                    Hallazgo(
                        ERROR,
                        "accion-sin-version",
                        _ubicacion(archivo, linea),
                        f"el job «{nombre}» fija «{fijado.group('accion')}» a un SHA pero no "
                        "deja la version en un comentario en la misma linea (`# v4.2.2`): sin "
                        "eso nadie sabe que se esta actualizando",
                    )
                )
    return hallazgos


def _revisar_secretos(documento: Any, archivo: str) -> list[Hallazgo]:
    """No hay `secrets.` fuera de `GITHUB_TOKEN`: el repositorio no tiene secretos."""
    hallazgos: list[Hallazgo] = []
    for cadena in _cadenas_de(documento):
        for encontrado in SECRETO.finditer(str(cadena)):
            if encontrado.group("nombre") in SECRETOS_PERMITIDOS:
                continue
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "secreto-prohibido",
                    _ubicacion(archivo, _linea_de(cadena)),
                    f"se usa el secreto «{encontrado.group('nombre')}» y el repositorio no "
                    "tiene secretos: el unico admitido es `secrets.GITHUB_TOKEN`",
                )
            )
    return hallazgos


REF_DEL_PR = "head"
"""Marca de que un `ref:`/`repository:` apunta al PR: `head_ref`, `pull_request.head.sha`, …"""

REF_PULL = "refs/pull/"
"""Namespace en el que GitHub publica el head de cada PR; traerlo es traer codigo del PR."""


def _trae_codigo_del_pr(paso: dict[str, Any]) -> bool:
    """Un paso trae codigo del PR si hace checkout de su head o lo trae con `git fetch`.

    Sin `ref:`, `actions/checkout` bajo `pull_request_target` trae la **rama base**, que es
    codigo de confianza; por eso solo cuenta un `ref:` (o `repository:`) que mencione el head.
    """
    orden = paso.get("run")
    if isinstance(orden, str) and REF_PULL in str(orden):
        return True
    uso = paso.get("uses")
    if not isinstance(uso, str) or "actions/checkout" not in str(uso):
        return False
    con = paso.get("with")
    if not isinstance(con, dict):
        return False
    entradas = (con.get("ref"), con.get("repository"))
    return any(isinstance(valor, str) and REF_DEL_PR in str(valor).lower() for valor in entradas)


def _revisar_pull_request_target(
    documento: Any, jobs: dict[str, Any], archivo: str
) -> list[Hallazgo]:
    """En `pull_request_target`, el job que hace checkout del PR va con `permissions: {}`."""
    if "pull_request_target" not in _disparadores(documento):
        return []
    hallazgos: list[Hallazgo] = []
    for nombre, job in jobs.items():
        if not isinstance(job, dict):
            continue
        if not any(_trae_codigo_del_pr(paso) for paso in _pasos(job)):
            continue
        linea = jobs.lineas.get(nombre, 0) if isinstance(jobs, Mapa) else 0
        permisos = job.get("permissions")
        if isinstance(permisos, dict) and not permisos:
            continue
        hallazgos.append(
            Hallazgo(
                ERROR,
                "pull-request-target-con-permisos",
                _ubicacion(archivo, linea),
                f"el job «{nombre}» trae codigo del PR en un workflow disparado "
                "por `pull_request_target` y no declara `permissions: {}`: ese token tiene "
                "escritura sobre el repositorio y el PR elige los bytes",
            )
        )
    return hallazgos


def revisar_archivo(ruta: str | Path) -> list[Hallazgo]:
    """Corre todas las reglas sobre un workflow y devuelve los hallazgos, en orden."""
    camino = Path(ruta)
    archivo = str(ruta)
    try:
        texto = camino.read_text(encoding="utf-8")
    except OSError as exc:
        raise OSError(f"no se pudo abrir «{archivo}»: {exc.strerror or exc}") from exc
    except UnicodeDecodeError as exc:
        return [Hallazgo(ERROR, "codificacion", archivo, f"el archivo no es UTF-8: {exc}")]

    try:
        documento = cargar_yaml(texto)
    except ErrorYaml as exc:
        return [Hallazgo(ERROR, "yaml-invalido", archivo, str(exc))]

    if not isinstance(documento, dict):
        return [
            Hallazgo(
                ERROR,
                "yaml-invalido",
                archivo,
                "el workflow tiene que ser un mapeo en la raiz (`on:`, `jobs:`, …)",
            )
        ]

    hallazgos: list[Hallazgo] = []
    if "on" not in documento:
        hallazgos.append(
            Hallazgo(ERROR, "sin-disparador", archivo, "el workflow no declara `on:`")
        )
    jobs = documento.get("jobs")
    if not isinstance(jobs, dict) or not jobs:
        hallazgos.append(
            Hallazgo(ERROR, "sin-jobs", archivo, "el workflow no declara ningun job en `jobs:`")
        )
        jobs = Mapa()

    hallazgos.extend(_revisar_permisos(jobs, archivo))
    hallazgos.extend(_revisar_interpolaciones(jobs, archivo))
    hallazgos.extend(_revisar_acciones(jobs, archivo))
    hallazgos.extend(_revisar_secretos(documento, archivo))
    hallazgos.extend(_revisar_pull_request_target(documento, jobs, archivo))
    return hallazgos


def revisar_ruta(ruta: str | Path) -> list[Hallazgo]:
    """Revisa un workflow o todos los de un directorio (sin recorrer subdirectorios)."""
    camino = Path(ruta)
    if camino.is_dir():
        archivos = sorted(
            hijo for hijo in camino.iterdir() if hijo.is_file() and hijo.suffix in EXTENSIONES
        )
        if not archivos:
            return [
                Hallazgo(
                    WARNING,
                    "sin-workflows",
                    str(camino),
                    "el directorio no tiene ningun archivo .yml ni .yaml",
                )
            ]
    else:
        archivos = [camino]
    hallazgos: list[Hallazgo] = []
    for archivo in archivos:
        hallazgos.extend(revisar_archivo(archivo))
    return hallazgos


# --------------------------------------------------------------------------------------
# Subcomando de la CLI
# --------------------------------------------------------------------------------------


def configurar(parser: argparse.ArgumentParser) -> None:
    """Argumentos de `cuatris guardarrailes`."""
    parser.add_argument(
        "rutas",
        nargs="*",
        type=Path,
        default=[Path(".github/workflows")],
        help="Workflows o directorios de workflows (por defecto .github/workflows).",
    )
    parser.set_defaults(funcion=ejecutar)


def ejecutar(args: argparse.Namespace) -> int:
    """Imprime una linea por hallazgo y devuelve el codigo de salida."""
    rutas = list(args.rutas) or [Path(".github/workflows")]
    salida = OK
    todos: list[Hallazgo] = []
    for ruta in rutas:
        try:
            todos.extend(revisar_ruta(ruta))
        except OSError as exc:
            print(f"ERROR {ruta}: {exc}")
            salida = NO_SE_PUDO_ABRIR
    for hallazgo in todos:
        print(hallazgo.linea())
    if hay_errores(todos):
        salida = max(salida, HAY_ERRORES)
    if salida == OK and not todos:
        print(f"guardarrailes: sin hallazgos en {len(rutas)} ruta(s)")
    elif salida == OK:
        print(f"guardarrailes: {len(todos)} aviso(s) en {len(rutas)} ruta(s), ningun error")
    return salida


def main(argv: list[str] | None = None) -> int:
    """Permite correr el guardarrail sin pasar por `cuatris`, mientras se registra en `cli.py`.

        python -m cuatris.validar.guardarrailes .github/workflows
    """
    parser = argparse.ArgumentParser(prog="cuatris guardarrailes", description=AYUDA)
    configurar(parser)
    return ejecutar(parser.parse_args(argv))


if __name__ == "__main__":  # pragma: no cover - punto de entrada
    raise SystemExit(main())
