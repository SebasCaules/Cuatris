"""Validacion de los archivos de datos: deduccion de tipo y orquestacion de las capas.

Las capas corren de barata a cara y ninguna cara toca datos que una barata ya rechazo:
C1 (`triage`) sobre los bytes y el objeto crudo, C2 (`esquema`) contra el JSON Schema. C3
(invariantes) se agrega en la ola siguiente sin tocar este archivo: alcanza con sumar su
llamada al final de `validar_archivo`.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from cuatris import canon
from cuatris.validar import esquema, triage
from cuatris.validar.esquema import TIPOS
from cuatris.validar.reporte import ERROR, WARNING, Hallazgo, formatear, hay_errores

__all__ = [
    "ERROR",
    "TIPOS",
    "WARNING",
    "ErrorDeApertura",
    "Hallazgo",
    "deducir_tipo",
    "formatear",
    "hay_errores",
    "validar_archivo",
]

_POR_RUTA = (
    (re.compile(r"(^|/)v1/horarios/[^/]+\.json$"), "horarios"),
    (re.compile(r"(^|/)v1/planes/[^/]+\.json$"), "planes"),
    (re.compile(r"(^|/)v1/abreviaciones\.json$"), "abreviaciones"),
    (re.compile(r"(^|/)v1/vocabulario\.json$"), "vocabulario"),
    (re.compile(r"(^|/)index\.json$"), "index"),
)

_POR_NOMBRE = (
    (re.compile(r"^horarios([.\-_].*)?\.json$"), "horarios"),
    (re.compile(r"^planes?([.\-_].*)?\.json$"), "planes"),
    (re.compile(r"^abreviaciones([.\-_].*)?\.json$"), "abreviaciones"),
    (re.compile(r"^vocabulario([.\-_].*)?\.json$"), "vocabulario"),
    (re.compile(r"^index([.\-_].*)?\.json$"), "index"),
)

_POR_CONTENIDO = (
    ("horarios", ("periodo", "cursos")),
    ("planes", ("plan", "materias")),
    ("index", ("actualizado", "vocabulario")),
    ("abreviaciones", ("abreviaciones",)),
    ("vocabulario", ("sedes",)),
)


class ErrorDeApertura(OSError):
    """No se pudo abrir el archivo pedido (codigo de salida 2)."""


def deducir_tipo(ruta: str | Path, datos: Any = None) -> str | None:
    """Deduce el tipo de archivo por la ruta, por el nombre y, en ultimo caso, por su forma."""
    texto = Path(ruta).as_posix()
    for patron, tipo in _POR_RUTA:
        if patron.search(texto):
            return tipo
    nombre = Path(ruta).name
    for patron, tipo in _POR_NOMBRE:
        if patron.match(nombre):
            return tipo
    if isinstance(datos, dict):
        for tipo, claves in _POR_CONTENIDO:
            if all(clave in datos for clave in claves):
                return tipo
    return None


def validar_archivo(ruta: str | Path, tipo: str | None = None) -> list[Hallazgo]:
    """Corre C1 y C2 sobre un archivo y devuelve todos los hallazgos, en orden."""
    camino = Path(ruta)
    archivo = str(ruta)
    try:
        crudo = camino.read_bytes()
    except OSError as exc:
        raise ErrorDeApertura(f"no se pudo abrir «{archivo}»: {exc.strerror or exc}") from exc

    hallazgos = triage.revisar_bytes(crudo, archivo)
    try:
        texto = crudo.decode("utf-8")
    except UnicodeDecodeError as exc:
        hallazgos.append(Hallazgo(ERROR, "codificacion", archivo, f"el archivo no es UTF-8: {exc}"))
        return hallazgos
    if crudo.startswith(canon.BOM_UTF8):
        texto = texto[1:]

    del_texto, datos = triage.revisar_texto(texto, archivo)
    hallazgos.extend(del_texto)
    if datos is None:
        return hallazgos

    hallazgos.extend(triage.revisar_datos(datos, archivo))

    deducido = tipo or deducir_tipo(camino, datos)
    if deducido is None:
        hallazgos.append(
            Hallazgo(
                ERROR,
                "tipo-desconocido",
                archivo,
                "no se pudo deducir el tipo de archivo; indicalo con --tipo "
                f"({', '.join(TIPOS)})",
            )
        )
        return hallazgos

    if deducido == "index":
        hallazgos.extend(triage.revisar_index(camino, datos, archivo))
    hallazgos.extend(esquema.revisar(datos, deducido, archivo))
    return hallazgos
