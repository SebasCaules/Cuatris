"""C1 — triage: los controles baratos que corren antes de cualquier schema.

Todo lo que se revisa aqui es independiente del tipo de archivo (salvo los hashes de
`index.json` y el major del contrato) y no necesita instalar nada: tamano, profundidad, claves
duplicadas, caracteres de control e invisibles, claves prohibidas, forma canonica, fechas que
no existen en el calendario y datos personales.
"""

from __future__ import annotations

import datetime as dt
import re
from pathlib import Path
from typing import Any

from cuatris import canon
from cuatris.validar.reporte import ERROR, Hallazgo

TAMANO_MAXIMO = 8 * 1024 * 1024
"""Tamano maximo de un archivo de datos, en bytes (8 MiB)."""

PROFUNDIDAD_MAXIMA = 12
"""Anidamiento maximo admitido dentro del JSON."""

MAJOR_CONTRATO = 1
"""Major del contrato que implementan `schemas/v1/` y que lee la SPA (`MAJOR_SOPORTADO`)."""

CONTRATO = re.compile(r"^(\d+)\.\d+\.\d+$")
"""SemVer del campo `contrato`; el primer grupo es el major."""

FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
"""Forma de las fechas del contrato; que ademas existan en el calendario se comprueba aparte."""

CLAVES_PROHIBIDAS = ("__proto__", "constructor", "prototype")
"""Claves que contaminan el prototipo al deserializar en el navegador."""

INVISIBLES = (
    (0x200B, 0x200F),
    (0x202A, 0x202E),
    (0x2066, 0x2069),
)
"""Rangos de caracteres invisibles y de override bidireccional (Trojan Source)."""

CORREO = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]{2,}")
"""Direccion de correo electronico."""

TELEFONO = re.compile(r"(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{4}(?!\d)")
"""Telefono escrito con separadores; se exige separador para no marcar fechas ni hashes."""

LEGAJO = re.compile(r"legajo\W{0,12}\d{5,6}(?!\d)", re.IGNORECASE)
"""Numero de cinco o seis digitos precedido por la palabra «legajo»."""

PRIVACIDAD = (
    ("privacidad-correo", CORREO, "parece una direccion de correo"),
    ("privacidad-telefono", TELEFONO, "parece un numero de telefono"),
    ("privacidad-legajo", LEGAJO, "parece un numero de legajo"),
)

__all__ = [
    "MAJOR_CONTRATO",
    "PROFUNDIDAD_MAXIMA",
    "TAMANO_MAXIMO",
    "profundidad",
    "profundidad_del_texto",
    "revisar_bytes",
    "revisar_contrato",
    "revisar_datos",
    "revisar_index",
    "revisar_texto",
]


def _recorte(texto: str, largo: int = 60) -> str:
    """Recorta un fragmento para que el mensaje de error siga entrando en una linea."""
    plano = texto if len(texto) <= largo else texto[:largo] + "…"
    return plano.replace("\n", "\\n").replace("\r", "\\r")


def revisar_bytes(crudo: bytes, archivo: str) -> list[Hallazgo]:
    """Controles sobre los bytes: tamano, BOM, finales de linea y codificacion."""
    hallazgos: list[Hallazgo] = []
    if len(crudo) > TAMANO_MAXIMO:
        hallazgos.append(
            Hallazgo(
                ERROR,
                "tamano",
                archivo,
                f"el archivo pesa {len(crudo)} bytes y el maximo es {TAMANO_MAXIMO}",
            )
        )
    if crudo.startswith(canon.BOM_UTF8):
        hallazgos.append(
            Hallazgo(ERROR, "bom", archivo, "el archivo empieza con BOM; debe ser UTF-8 sin BOM")
        )
    if b"\r" in crudo:
        hallazgos.append(
            Hallazgo(
                ERROR,
                "crlf",
                archivo,
                "el archivo tiene retornos de carro (CR); los finales de linea deben ser LF",
            )
        )
    return hallazgos


def revisar_texto(texto: str, archivo: str) -> tuple[list[Hallazgo], Any | None]:
    """Parsea el texto y compara contra la forma canonica; devuelve tambien el objeto.

    El anidamiento se cuenta sobre el texto **antes** de parsear: el parser de la biblioteca
    estandar es recursivo y un documento de miles de niveles lo tumba con `RecursionError`
    mucho antes de que `revisar_datos` pueda mirar el objeto. Ese error tambien se atrapa
    aqui, por si algun documento se las arregla para agotar la pila dentro del tope: un
    archivo ilegible es un hallazgo suyo y no puede cortar el lote (N0-8).
    """
    hallazgos: list[Hallazgo] = []
    nivel = profundidad_del_texto(texto)
    if nivel > PROFUNDIDAD_MAXIMA:
        return [
            Hallazgo(
                ERROR,
                "profundidad",
                archivo,
                f"el anidamiento llega a {nivel} y el maximo es {PROFUNDIDAD_MAXIMA}",
            )
        ], None
    try:
        datos = canon.cargar_texto(texto)
    except canon.ErrorClaveDuplicada as exc:
        return [Hallazgo(ERROR, "clave-duplicada", archivo, str(exc))], None
    except canon.ErrorCanonico as exc:
        return [Hallazgo(ERROR, "json-invalido", archivo, str(exc))], None
    except RecursionError:
        return [
            Hallazgo(
                ERROR,
                "profundidad",
                archivo,
                "el parser se quedo sin pila al leer el archivo: el anidamiento es excesivo",
            )
        ], None
    if texto != canon.serializar(datos):
        hallazgos.append(
            Hallazgo(
                ERROR,
                "no-canonico",
                archivo,
                "el archivo no esta en forma canonica; corre `cuatris fmt` sobre el",
            )
        )
    return hallazgos, datos


def profundidad(datos: Any) -> int:
    """Devuelve el anidamiento maximo del objeto (un escalar suelto es 0)."""
    maxima = 0
    pila: list[tuple[Any, int]] = [(datos, 0)]
    while pila:
        valor, nivel = pila.pop()
        maxima = max(maxima, nivel)
        if isinstance(valor, dict):
            pila.extend((hijo, nivel + 1) for hijo in valor.values())
        elif isinstance(valor, list):
            pila.extend((hijo, nivel + 1) for hijo in valor)
    return maxima


def profundidad_del_texto(texto: str) -> int:
    """Anidamiento maximo del JSON sin parsearlo, contando los corchetes fuera de los strings.

    Cuenta lo mismo que `profundidad` sobre el objeto ya parseado —el nivel del valor mas
    hondo, con la raiz en 0— pero leyendo el texto caracter por caracter, que es lo unico que
    se puede hacer antes de que el parser recursivo se quede sin pila.
    """
    maxima = 0
    nivel = 0
    en_cadena = False
    escapado = False
    for caracter in texto:
        if en_cadena:
            if escapado:
                escapado = False
            elif caracter == "\\":
                escapado = True
            elif caracter == '"':
                en_cadena = False
            continue
        if caracter == '"':
            en_cadena = True
            maxima = max(maxima, nivel)
        elif caracter in "[{":
            maxima = max(maxima, nivel)
            nivel += 1
        elif caracter in "]}":
            nivel = max(nivel - 1, 0)
        elif caracter not in " \t\n\r,:":
            maxima = max(maxima, nivel)
    return maxima


def _invisible(texto: str) -> str | None:
    """Devuelve el primer caracter invisible o de override bidireccional, si lo hay."""
    for caracter in texto:
        punto = ord(caracter)
        if any(desde <= punto <= hasta for desde, hasta in INVISIBLES):
            return f"U+{punto:04X}"
    return None


def _control(texto: str) -> str | None:
    """Devuelve el primer caracter de control, si lo hay; los strings no llevan saltos."""
    for caracter in texto:
        punto = ord(caracter)
        if punto < 0x20 or punto == 0x7F:
            return f"U+{punto:04X}"
    return None


def _cadenas(datos: Any) -> list[tuple[str, str, str]]:
    """Lista `(ruta, clase, texto)` de todas las claves y strings del documento."""
    encontradas: list[tuple[str, str, str]] = []
    pila: list[tuple[Any, str]] = [(datos, "")]
    while pila:
        valor, ruta = pila.pop()
        if isinstance(valor, dict):
            for clave, hijo in valor.items():
                hijo_ruta = f"{ruta}.{clave}" if ruta else clave
                encontradas.append((hijo_ruta, "clave", clave))
                pila.append((hijo, hijo_ruta))
        elif isinstance(valor, list):
            for indice, hijo in enumerate(valor):
                pila.append((hijo, f"{ruta}[{indice}]"))
        elif isinstance(valor, str):
            encontradas.append((ruta or "(raiz)", "valor", valor))
    return encontradas


def _existe_la_fecha(texto: str) -> bool:
    """Indica si un `YYYY-MM-DD` con la forma del contrato es ademas un dia del calendario."""
    try:
        dt.date.fromisoformat(texto)
    except ValueError:
        return False
    return True


def revisar_datos(datos: Any, archivo: str) -> list[Hallazgo]:
    """Controles sobre el objeto ya parseado: profundidad, caracteres, fechas y privacidad.

    Las fechas se comprueban aqui y no en el schema porque el patron `^\\d{4}-\\d{2}-\\d{2}$`
    acepta el 31 de septiembre: el contrato pide que la fecha «ademas sea valida como fecha»,
    y eso es exactamente lo que un JSON Schema no puede expresar. Un dia inexistente que se
    publica se compara despues como string en la SPA y pasa por un dia real.
    """
    hallazgos: list[Hallazgo] = []
    nivel = profundidad(datos)
    if nivel > PROFUNDIDAD_MAXIMA:
        hallazgos.append(
            Hallazgo(
                ERROR,
                "profundidad",
                archivo,
                f"el anidamiento llega a {nivel} y el maximo es {PROFUNDIDAD_MAXIMA}",
            )
        )
    for ruta, clase, texto in _cadenas(datos):
        if clase == "clave" and texto in CLAVES_PROHIBIDAS:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "clave-prohibida",
                    archivo,
                    f"clave prohibida «{texto}» en {ruta}: contamina el prototipo del objeto",
                )
            )
        control = _control(texto)
        if control is not None:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "caracter-de-control",
                    archivo,
                    f"caracter de control {control} en {ruta}: «{_recorte(texto)}»",
                )
            )
        invisible = _invisible(texto)
        if invisible is not None:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "bidi-override",
                    archivo,
                    f"caracter invisible o de override bidireccional {invisible} en {ruta}",
                )
            )
        if FECHA.match(texto) and not _existe_la_fecha(texto):
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "fecha-invalida",
                    archivo,
                    f"«{texto}» en {ruta} tiene la forma de una fecha pero ese dia no existe",
                )
            )
        for regla, patron, motivo in PRIVACIDAD:
            coincidencia = patron.search(texto)
            if coincidencia is not None:
                hallazgos.append(
                    Hallazgo(
                        ERROR,
                        regla,
                        archivo,
                        f"dato personal en {ruta}: «{_recorte(coincidencia.group(0))}» {motivo}",
                    )
                )
    return hallazgos


def revisar_contrato(datos: Any, archivo: str) -> list[Hallazgo]:
    """El `contrato` de un documento de `v1` declara major 1.

    El contrato pone el corte de compatibilidad en el directorio: un cambio incompatible crea
    `data/v2/` con `schemas/v2/` y no toca `v1`. Los cinco schemas son de v1 y su patron de
    SemVer acepta cualquier version, asi que sin esta regla un archivo que declara `2.0.0`
    atraviesa los gates, se publica, y recien el navegador del visitante lo rechaza con
    `ContratoIncompatible`. Un `contrato` ausente o mal formado no se informa aqui: es de C2.
    """
    if not isinstance(datos, dict):
        return []
    declarado = datos.get("contrato")
    if not isinstance(declarado, str):
        return []
    coincidencia = CONTRATO.match(declarado)
    if coincidencia is None or int(coincidencia.group(1)) == MAJOR_CONTRATO:
        return []
    return [
        Hallazgo(
            ERROR,
            "contrato-incompatible",
            archivo,
            f"el archivo declara «contrato: {declarado}» y los schemas de «v1» solo admiten "
            f"el major {MAJOR_CONTRATO}; un major distinto vive en su propio directorio de "
            "datos, con sus propios schemas",
        )
    ]


def _dentro(destino: Path, base: Path) -> bool:
    """Indica si la ruta cae dentro del directorio de datos, ya resuelta."""
    try:
        return destino.resolve().is_relative_to(base)
    except OSError:  # pragma: no cover - depende del sistema de archivos
        return False


def revisar_index(ruta: Path, datos: Any, archivo: str) -> list[Hallazgo]:
    """Comprueba cada referencia de `index.json` contra el archivo que dice describir.

    Tres cosas, en este orden: que la ruta caiga dentro del directorio de datos —C1 corre
    antes que el schema, asi que es esta capa la que no puede seguir un `..` escrito en el
    PR—, que el `hash` sea el del contenido canonico, y que el periodo y la vigencia que el
    indice declara sean los del archivo de horarios apuntado, porque **el archivo manda sobre
    el indice** y un indice que miente deja a la SPA sin periodo activo.
    """
    hallazgos: list[Hallazgo] = []
    base = Path(ruta).resolve().parent
    for clave, referencia in _referencias(datos):
        relativa = referencia.get("archivo")
        esperado = referencia.get("hash")
        if not isinstance(relativa, str) or not isinstance(esperado, str):
            continue
        destino = base / relativa
        if not _dentro(destino, base):
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "archivo-fuera-del-directorio",
                    archivo,
                    f"«{relativa}» sale del directorio de datos; toda ruta del indice es "
                    "relativa y queda dentro de el",
                )
            )
            continue
        try:
            texto = canon.leer_texto(destino)
            contenido = canon.cargar_texto(texto)
            real = canon.hash_de_texto(texto)
        except OSError:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "archivo-faltante",
                    archivo,
                    f"«{relativa}» figura en el indice pero no se pudo abrir",
                )
            )
            continue
        except canon.ErrorCanonico as exc:
            hallazgos.append(
                Hallazgo(ERROR, "archivo-faltante", archivo, f"«{relativa}» no se pudo leer: {exc}")
            )
            continue
        if real != esperado:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "hash-incorrecto",
                    archivo,
                    f"el hash de «{relativa}» es {real} y el indice declara {esperado}",
                )
            )
        if clave == "horarios":
            hallazgos.extend(_revisar_periodo_indexado(referencia, contenido, relativa, archivo))
    return hallazgos


def _revisar_periodo_indexado(
    referencia: dict[str, Any], contenido: Any, relativa: str, archivo: str
) -> list[Hallazgo]:
    """El `periodo`, el `desde` y el `hasta` del indice son los del archivo de horarios."""
    if not isinstance(contenido, dict):
        return []
    periodo = contenido.get("periodo")
    if not isinstance(periodo, dict):
        return []
    campos = (("periodo", "id"), ("desde", "desde"), ("hasta", "hasta"))
    hallazgos: list[Hallazgo] = []
    for en_el_indice, en_el_archivo in campos:
        declarado = referencia.get(en_el_indice)
        real = periodo.get(en_el_archivo)
        if not isinstance(declarado, str) or not isinstance(real, str) or declarado == real:
            continue
        hallazgos.append(
            Hallazgo(
                ERROR,
                "periodo-incorrecto",
                archivo,
                f"el indice declara «{en_el_indice}: {declarado}» para «{relativa}» y el "
                f"archivo dice «periodo.{en_el_archivo}: {real}»; el archivo manda sobre el "
                "indice, corre `cuatris indice actualizar`",
            )
        )
    return hallazgos


def _referencias(datos: Any) -> list[tuple[str, dict[str, Any]]]:
    """Devuelve `(clave del indice, entrada)` de todo lo que declara `archivo` y `hash`."""
    if not isinstance(datos, dict):
        return []
    encontradas: list[tuple[str, dict[str, Any]]] = []
    for clave, valor in datos.items():
        if isinstance(valor, dict) and "archivo" in valor:
            encontradas.append((clave, valor))
        elif isinstance(valor, list):
            encontradas.extend(
                (clave, item) for item in valor if isinstance(item, dict) and "archivo" in item
            )
    return encontradas
