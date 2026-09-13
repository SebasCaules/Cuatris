"""Serializacion canonica del contrato de datos.

La forma canonica es la unica valida en el repositorio:
`json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\\n"`, en UTF-8 sin BOM y
con finales de linea LF. Es lo que produce `cuatris fmt` y lo que exige `cuatris fmt --check`.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

BOM_UTF8 = b"\xef\xbb\xbf"

__all__ = [
    "ErrorCanonico",
    "ErrorClaveDuplicada",
    "cargar",
    "cargar_texto",
    "esta_canonico",
    "hash_canonico",
    "hash_de_texto",
    "leer_texto",
    "serializar",
]


class ErrorCanonico(ValueError):
    """El archivo no se puede cargar: BOM, CRLF, claves duplicadas o JSON invalido."""


class ErrorClaveDuplicada(ErrorCanonico):
    """El JSON repite una clave dentro del mismo objeto."""


def _sin_duplicadas(pares: list[tuple[str, Any]]) -> dict[str, Any]:
    """Construye el objeto rechazando claves repetidas en el mismo nivel."""
    visto: dict[str, Any] = {}
    for clave, valor in pares:
        if clave in visto:
            raise ErrorClaveDuplicada(f"clave duplicada «{clave}» en el mismo objeto")
        visto[clave] = valor
    return visto


def leer_texto(ruta: str | Path) -> str:
    """Lee el archivo como texto UTF-8 y rechaza BOM y finales de linea CRLF."""
    crudo = Path(ruta).read_bytes()
    if crudo.startswith(BOM_UTF8):
        raise ErrorCanonico("el archivo empieza con BOM de UTF-8; guardalo en UTF-8 sin BOM")
    if b"\r" in crudo:
        raise ErrorCanonico(
            "el archivo tiene retornos de carro (CR); los finales de linea deben ser LF"
        )
    try:
        return crudo.decode("utf-8")
    except UnicodeDecodeError as exc:  # pragma: no cover - depende del sistema de archivos
        raise ErrorCanonico(f"el archivo no es UTF-8 valido: {exc}") from exc


def cargar_texto(texto: str) -> Any:
    """Parsea un JSON ya leido, rechazando claves duplicadas."""
    try:
        return json.loads(texto, object_pairs_hook=_sin_duplicadas)
    except ErrorCanonico:
        raise
    except json.JSONDecodeError as exc:
        raise ErrorCanonico(
            f"JSON invalido: {exc.msg} (linea {exc.lineno}, columna {exc.colno})"
        ) from exc


def cargar(ruta: str | Path) -> Any:
    """Carga un archivo JSON del contrato; rechaza BOM, CRLF y claves duplicadas."""
    return cargar_texto(leer_texto(ruta))


def serializar(obj: Any) -> str:
    """Devuelve la forma canonica del objeto, con salto de linea final."""
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def esta_canonico(ruta: str | Path) -> bool:
    """Indica si el archivo ya esta byte a byte en forma canonica."""
    texto = leer_texto(ruta)
    return texto == serializar(cargar_texto(texto))


def hash_de_texto(texto: str) -> str:
    """Hash canonico de un contenido JSON ya leido, en la forma `sha256:<hex>`."""
    canonico = serializar(cargar_texto(texto))
    return "sha256:" + hashlib.sha256(canonico.encode("utf-8")).hexdigest()


def hash_canonico(ruta: str | Path) -> str:
    """Hash del contenido canonico del archivo, en la forma `sha256:<hex>`."""
    return hash_de_texto(leer_texto(ruta))
