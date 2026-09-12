"""C1 — triage: los controles baratos que corren antes de cualquier schema.

Todo lo que se revisa aqui es independiente del tipo de archivo (salvo los hashes de
`index.json`) y no necesita instalar nada: tamano, profundidad, claves duplicadas, caracteres
de control e invisibles, claves prohibidas, forma canonica y datos personales.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from cuatris import canon
from cuatris.validar.reporte import ERROR, Hallazgo

TAMANO_MAXIMO = 8 * 1024 * 1024
"""Tamano maximo de un archivo de datos, en bytes (8 MiB)."""

PROFUNDIDAD_MAXIMA = 12
"""Anidamiento maximo admitido dentro del JSON."""

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
    "PROFUNDIDAD_MAXIMA",
    "TAMANO_MAXIMO",
    "profundidad",
    "revisar_bytes",
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
    """Parsea el texto y compara contra la forma canonica; devuelve tambien el objeto."""
    hallazgos: list[Hallazgo] = []
    try:
        datos = canon.cargar_texto(texto)
    except canon.ErrorClaveDuplicada as exc:
        return [Hallazgo(ERROR, "clave-duplicada", archivo, str(exc))], None
    except canon.ErrorCanonico as exc:
        return [Hallazgo(ERROR, "json-invalido", archivo, str(exc))], None
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


def revisar_datos(datos: Any, archivo: str) -> list[Hallazgo]:
    """Controles sobre el objeto ya parseado: profundidad, caracteres, claves y privacidad."""
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


def revisar_index(ruta: Path, datos: Any, archivo: str) -> list[Hallazgo]:
    """Comprueba que cada `hash` de `index.json` coincida con el archivo referido."""
    hallazgos: list[Hallazgo] = []
    base = Path(ruta).resolve().parent
    for referencia in _referencias(datos):
        relativa = referencia.get("archivo")
        esperado = referencia.get("hash")
        if not isinstance(relativa, str) or not isinstance(esperado, str):
            continue
        destino = base / relativa
        try:
            real = canon.hash_canonico(destino)
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
    return hallazgos


def _referencias(datos: Any) -> list[dict[str, Any]]:
    """Devuelve las entradas de `index.json` que declaran `archivo` y `hash`."""
    if not isinstance(datos, dict):
        return []
    encontradas: list[dict[str, Any]] = []
    for valor in datos.values():
        if isinstance(valor, dict) and "archivo" in valor:
            encontradas.append(valor)
        elif isinstance(valor, list):
            encontradas.extend(
                item for item in valor if isinstance(item, dict) and "archivo" in item
            )
    return encontradas
