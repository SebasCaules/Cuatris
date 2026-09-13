"""Guardarrailes de los workflows de GitHub Actions (`cuatris guardarrailes .github`).

Los workflows son el unico codigo del repositorio que corre con permisos: un error ahi no lo
atrapa ningun test de la suite. Este modulo revisa, sobre el YAML ya parseado, las cinco reglas
del plan de la Fase 4 («Sobre los workflows corre ademas un punado de guardarrailes»):

`permisos-faltantes`
    Cada job declara `permissions` de forma explicita. Heredar el valor por defecto del
    repositorio hace que un cambio en la configuracion de la plataforma cambie en silencio lo
    que puede hacer cada job.
`interpolacion-peligrosa`
    Ninguna cadena del paso que la plataforma vaya a ejecutar o evaluar —`run:`, `if:` y las
    entradas de `with:` que la accion pasa a un interprete (`ENTRADAS_QUE_EJECUTAN`)— interpola
    `${{ github.event.* }}` ni `${{ github.head_ref }}`. Esos valores los escribe quien abre el
    PR y se expanden **antes** de que el paso corra: un titulo de PR con comillas y `;` es
    ejecucion de codigo con los permisos del job, y el `with.script` de `actions/github-script`
    es un sumidero tan directo como un `run:`. Quedan fuera a proposito el `env:` del paso y las
    entradas de `with:` que son datos (`ref`, `repository`, `path`…): pasar el dato por una
    variable de entorno o por el `ref:` de `actions/checkout` es justamente el remedio.
`accion-sin-sha` / `accion-sin-version`
    Toda accion de terceros esta fijada a un SHA de 40 caracteres y lleva la version en un
    comentario en la misma linea (`# v4.2.2`). Una etiqueta como `@v4` la mueve su autor.
`secreto-prohibido`
    No hay `secrets.` fuera de `GITHUB_TOKEN`: el repositorio no tiene secretos y no debe
    empezar a tenerlos sin que alguien lo note.
`pull-request-target-con-permisos`
    En un workflow disparado por `pull_request_target`, el job que trae codigo del PR tiene
    `permissions: {}`. Cuenta como traerlo un `actions/checkout` cuyo `ref:` o `repository:`
    apunta al head, un `run:` que nombra `refs/pull/`, y tambien un `run:` que hace
    `git fetch`/`git checkout`/`gh pr checkout` del head del PR —por interpolacion directa o
    por una variable de `env:` que lo reciba—, que es la forma habitual de traerlo por SHA.
    Ese es el unico precio que vuelve aceptable a `pull_request_target`.

Un directorio se recorre **recursivamente**, y no se revisan solo los workflows: un
`action.yml` local (`.github/actions/<nombre>/action.yml`) tiene `run:` y `uses:` propios y
corre con los permisos del job que lo invoca, asi que se le aplican las reglas de pasos. Lo
que no es ni workflow ni accion —`ISSUE_TEMPLATE/config.yml`, por ejemplo— se saltea cuando
se llego a el recorriendo un directorio, y se revisa igual cuando se lo nombra explicitamente.

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
"""Extensiones de los YAML que se revisan al recorrer un directorio."""

INTERPOLACIONES_PELIGROSAS = (
    re.compile(r"\$\{\{\s*github\.event\b[^}]*\}\}"),
    re.compile(r"\$\{\{\s*github\.head_ref\b[^}]*\}\}"),
)
"""Expresiones que no pueden aparecer en `run:`, `if:` ni `with:`; las escribe quien abre el PR."""

ENTRADAS_QUE_EJECUTAN = ("script", "inlinescript", "command", "cmd", "run", "entrypoint", "args")
"""Entradas de `with:` que la accion entrega a un interprete: ahi interpolar es ejecutar.

`with.script` de `actions/github-script` es JavaScript que se evalua tal cual; `inlineScript`
de `azure/cli` y `command`/`run`/`args`/`entrypoint` de las acciones de contenedor son shell.
Las demas entradas —`ref`, `repository`, `path`, `version`…— llegan a la accion como variables
de entorno (`INPUT_<NOMBRE>`) y no las evalua nadie: interpolar el SHA del head en el `ref:` de
`actions/checkout` es la forma **correcta** de traer el PR, no una falla, y marcarla seria el
falso positivo cronico que la amenaza A10 obliga a evitar."""

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
            raise ErrorYaml(f"linea {linea.numero}: este parser lee un solo documento por archivo")
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
                raise ErrorYaml(f"linea {linea.numero}: sangria inesperada en «{linea.contenido}»")
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
        if hijo.sangria == sangria and (hijo.contenido == "-" or hijo.contenido.startswith("- ")):
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


def _cadenas_ejecutables(paso: dict[str, Any]) -> Iterator[tuple[str, Any]]:
    """Cadenas del paso que la plataforma ejecuta o evalua, con el nombre de su clave.

    Son `run:` (el shell), `if:` (la expresion que decide si el paso corre) y las entradas de
    `with:` que la accion entrega a un interprete (`ENTRADAS_QUE_EJECUTAN`). El `env:` del paso
    queda deliberadamente afuera: mover el dato a una variable de entorno y usarla entre
    comillas es el remedio, no la falla. Las demas entradas de `with:`, tampoco: son datos.
    """
    for clave in ("run", "if"):
        valor = paso.get(clave)
        if isinstance(valor, str):
            yield clave, valor
    con = paso.get("with")
    if isinstance(con, dict):
        for entrada, valor in con.items():
            if str(entrada).lower() not in ENTRADAS_QUE_EJECUTAN:
                continue
            for cadena in _cadenas_de(valor):
                yield f"with.{entrada}", cadena


def _revisar_interpolaciones(
    jobs: dict[str, Any], archivo: str, sujeto: str = "el job"
) -> list[Hallazgo]:
    """Ninguna cadena ejecutable del paso interpola datos que escribe quien abre el PR."""
    hallazgos: list[Hallazgo] = []
    for nombre, job in jobs.items():
        for paso in _pasos(job):
            for clave, cadena in _cadenas_ejecutables(paso):
                linea = _linea_de(cadena)
                for patron in INTERPOLACIONES_PELIGROSAS:
                    encontrado = patron.search(str(cadena))
                    if encontrado is None:
                        continue
                    hallazgos.append(
                        Hallazgo(
                            ERROR,
                            "interpolacion-peligrosa",
                            _ubicacion(archivo, linea),
                            f"{sujeto} «{nombre}» interpola «{encontrado.group(0)}» dentro de "
                            f"`{clave}:`: ese texto lo escribe quien abre el PR y se expande "
                            "antes de que el paso corra; pasalo por una variable de entorno y "
                            "usala entre comillas",
                        )
                    )
    return hallazgos


def _revisar_acciones(jobs: dict[str, Any], archivo: str, sujeto: str = "el job") -> list[Hallazgo]:
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
                        f"{sujeto} «{nombre}» usa «{texto}» sin fijarlo a un SHA de 40 "
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
                        f"{sujeto} «{nombre}» fija «{fijado.group('accion')}» a un SHA pero "
                        "no deja la version en un comentario en la misma linea (`# v4.2.2`): sin "
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

NAMESPACE_PULL = "pull/"
"""La forma corta del mismo namespace: `git fetch origin pull/<n>/head` es sintaxis valida."""

ORDENES_QUE_TRAEN_CODIGO = ("git fetch", "git checkout", "git pull", "gh pr checkout")
"""Ordenes con las que un `run:` trae el arbol del PR sin nombrar nunca `refs/pull/`."""

DATO_DEL_PR = re.compile(
    r"\$\{\{\s*github\."
    r"(?:event\.pull_request\.head|head_ref|event\.pull_request\.number|event\.number)"
    r"\b[^}]*\}\}"
)
"""Expresion que nombra el PR: su head (SHA, rama, repositorio de quien lo abre) o su numero.

El numero cuenta tanto como el head porque es con lo que se lo trae de la forma idiomatica:
`gh pr checkout "$NUMERO"` y `git fetch origin "pull/$NUMERO/head"` terminan las dos con el
arbol del PR en el disco, y ninguna de las dos nombra su head ni la cadena `refs/pull/`.
"""


def _variables_con_datos_del_pr(entornos: tuple[Any, ...]) -> set[str]:
    """Nombres de variables de `env:` cuyo valor interpola el head del PR o su numero."""
    nombres: set[str] = set()
    for entorno in entornos:
        if not isinstance(entorno, dict):
            continue
        for nombre, valor in entorno.items():
            if isinstance(valor, str) and DATO_DEL_PR.search(str(valor)):
                nombres.add(str(nombre))
    return nombres


def _usa_alguna_variable(orden: str, nombres: set[str]) -> bool:
    """Indica si el shell lee alguna de esas variables (`$SHA`, `${SHA}`, `"$SHA"`)."""
    return any(re.search(r"\$\{?" + re.escape(nombre) + r"\b", orden) for nombre in nombres)


def _trae_codigo_del_pr(
    paso: dict[str, Any], entorno_del_job: Any = None, entorno_del_documento: Any = None
) -> bool:
    """Un paso trae codigo del PR si hace checkout de su head o lo trae desde el shell.

    Sin `ref:`, `actions/checkout` bajo `pull_request_target` trae la **rama base**, que es
    codigo de confianza; por eso solo cuenta un `ref:` (o `repository:`) que mencione el head.

    Desde el shell cuentan todas las formas de traerlo: nombrar `refs/pull/<n>/head`, traer el
    head por SHA (`git fetch origin "$SHA" && git checkout FETCH_HEAD`) y traerlo por numero
    (`gh pr checkout "$NUMERO"`, `git fetch origin "pull/$NUMERO/head"`), que es la idiomatica.
    Ninguna de las ultimas usa `actions/checkout`, y las de numero no nombran ni el head ni
    `refs/pull/`, asi que hay que reconocerlas por la orden mas el dato del PR —su head o su
    numero— venga interpolado en la propia linea o por una variable de `env:`, o bien por el
    namespace `pull/<n>/head`, que ya nombra al PR aunque el numero venga de otra parte.
    """
    orden = paso.get("run")
    if isinstance(orden, str):
        texto = str(orden)
        if REF_PULL in texto:
            return True
        if any(traida in texto for traida in ORDENES_QUE_TRAEN_CODIGO):
            if DATO_DEL_PR.search(texto) or NAMESPACE_PULL in texto:
                return True
            variables = _variables_con_datos_del_pr(
                (paso.get("env"), entorno_del_job, entorno_del_documento)
            )
            if variables and _usa_alguna_variable(texto, variables):
                return True
    uso = paso.get("uses")
    if not isinstance(uso, str) or "actions/checkout" not in str(uso):
        return False
    con = paso.get("with")
    if not isinstance(con, dict):
        return False
    entradas = (con.get("ref"), con.get("repository"))
    for valor in entradas:
        if not isinstance(valor, str):
            continue
        texto = str(valor)
        # `ref: refs/pull/<n>/merge`, `ref: ${{ github.event.pull_request.head.sha }}` y
        # `ref: pull/${{ github.event.number }}/head` traen el PR aunque no digan «head».
        if REF_DEL_PR in texto.lower() or REF_PULL in texto or NAMESPACE_PULL in texto:
            return True
        if DATO_DEL_PR.search(texto):
            return True
    return False


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
        entorno_del_job = job.get("env")
        entorno_del_documento = documento.get("env") if isinstance(documento, dict) else None
        if not any(
            _trae_codigo_del_pr(paso, entorno_del_job, entorno_del_documento)
            for paso in _pasos(job)
        ):
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


WORKFLOW = "workflow"
ACCION = "accion"
OTRO = "otro"


def _clase_de_documento(documento: Any) -> str:
    """Que es este YAML: un workflow, una accion local, u otra cosa que no corre nada.

    Una accion local se reconoce por su bloque `runs:` (`using:` mas, si es compuesta,
    `steps:`); un workflow, por `on:` o `jobs:`. Lo demas —la configuracion del selector de
    plantillas de issue, por ejemplo— no lo ejecuta la plataforma y no tiene pasos que revisar.
    """
    if not isinstance(documento, dict):
        return WORKFLOW
    corre = documento.get("runs")
    if isinstance(corre, dict) and ("steps" in corre or "using" in corre):
        return ACCION
    if "on" in documento or "jobs" in documento:
        return WORKFLOW
    return OTRO


def _nombre_de_la_accion(documento: dict[str, Any], camino: Path) -> str:
    """Como nombrar la accion local en los mensajes: su `name:`, o el directorio que la aloja."""
    nombre = documento.get("name")
    if isinstance(nombre, str) and nombre.strip():
        return str(nombre).strip()
    return camino.parent.name or camino.name


def _revisar_accion_local(documento: dict[str, Any], camino: Path, archivo: str) -> list[Hallazgo]:
    """Reglas de pasos sobre un `action.yml` local: interpolaciones, `uses:` y secretos.

    Una accion local no declara `permissions:` ni `on:` —corre dentro del job que la invoca y
    hereda su token—, asi que esas dos reglas no le aplican. Sus `run:` y sus `uses:` si: el
    `uses: ./…` del workflow que la invoca se saltea en `_revisar_acciones` porque no hay SHA
    que fijar, y sin esta revision nadie mira nunca lo que la accion hace.
    """
    nombre = _nombre_de_la_accion(documento, camino)
    pasos = Mapa({nombre: documento.get("runs")})
    hallazgos: list[Hallazgo] = []
    hallazgos.extend(_revisar_interpolaciones(pasos, archivo, "la accion local"))
    hallazgos.extend(_revisar_acciones(pasos, archivo, "la accion local"))
    hallazgos.extend(_revisar_secretos(documento, archivo))
    return hallazgos


def revisar_archivo(ruta: str | Path, exigir_workflow: bool = True) -> list[Hallazgo]:
    """Corre todas las reglas sobre un workflow o una accion local, en orden.

    Con `exigir_workflow` en falso —lo que hace `revisar_ruta` al recorrer un directorio— un
    YAML que no es ni workflow ni accion se saltea en silencio en vez de reclamarle `on:` y
    `jobs:`. Cuando el archivo se nombra explicitamente se lo revisa siempre como workflow:
    quien lo nombro dijo que lo era.
    """
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

    clase = _clase_de_documento(documento)
    if clase == OTRO and not exigir_workflow:
        return []
    if clase == ACCION:
        return _revisar_accion_local(documento, camino, archivo)

    hallazgos: list[Hallazgo] = []
    if "on" not in documento:
        hallazgos.append(Hallazgo(ERROR, "sin-disparador", archivo, "el workflow no declara `on:`"))
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
    """Revisa un workflow, o todos los YAML de un directorio **y de sus subdirectorios**.

    El recorrido es recursivo a proposito: `cuatris guardarrailes .github` tiene que alcanzar
    tanto `.github/workflows/*.yml` como `.github/actions/<nombre>/action.yml`, que corre con
    los permisos del job que lo invoca y que nadie revisaria de otro modo.
    """
    camino = Path(ruta)
    if camino.is_dir():
        archivos = sorted(
            hijo for hijo in camino.rglob("*") if hijo.is_file() and hijo.suffix in EXTENSIONES
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
        hallazgos: list[Hallazgo] = []
        for archivo in archivos:
            hallazgos.extend(revisar_archivo(archivo, exigir_workflow=False))
        return hallazgos
    return revisar_archivo(camino)


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
