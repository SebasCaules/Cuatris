"""C2 — validacion contra los JSON Schema draft-07 del contrato.

Los schemas viven en `schemas/v1/` y son el artefacto: se compilan con `fastjsonschema` en el
momento, sin paso de generacion. El error de propiedad desconocida tiene mensaje propio porque
es el falso positivo que mas caro sale: significa que el dato puede ser real y el schema viejo.
"""

from __future__ import annotations

import re
from functools import cache
from pathlib import Path
from typing import Any

import fastjsonschema

from cuatris import canon
from cuatris.validar.reporte import ERROR, Hallazgo

DIRECTORIO_SCHEMAS = Path(__file__).resolve().parents[3] / "schemas" / "v1"
"""Carpeta de los schemas de la version 1 del contrato."""

TIPOS = ("horarios", "planes", "abreviaciones", "vocabulario", "index")
"""Los cinco tipos de archivo que define el contrato v1."""

__all__ = ["DIRECTORIO_SCHEMAS", "TIPOS", "compilar", "esquema_de", "revisar"]


def esquema_de(tipo: str) -> dict[str, Any]:
    """Carga el schema del tipo pedido."""
    if tipo not in TIPOS:
        raise ValueError(f"tipo de archivo desconocido: {tipo}")
    return canon.cargar(DIRECTORIO_SCHEMAS / f"{tipo}.schema.json")


@cache
def compilar(tipo: str):
    """Devuelve el validador compilado del tipo pedido, compilando una sola vez por proceso."""
    return fastjsonschema.compile(esquema_de(tipo))


def _texto(valor: Any) -> str:
    """Formatea un valor del schema para que entre en un mensaje de una linea."""
    if isinstance(valor, list):
        return ", ".join(str(item) for item in valor)
    return str(valor)


def _ruta(nombre: str, tipo: str) -> str:
    """Reemplaza el prefijo `data` de `fastjsonschema` por el nombre del tipo de archivo."""
    if nombre == "data":
        return tipo
    if nombre.startswith("data."):
        return tipo + nombre[len("data") :]
    if nombre.startswith("data["):
        return tipo + nombre[len("data") :]
    return nombre


def _mensaje(error: fastjsonschema.JsonSchemaValueException, tipo: str) -> tuple[str, str]:
    """Traduce el error de `fastjsonschema` a `(regla, mensaje en espanol neutro)`."""
    ruta = _ruta(error.name, tipo)
    regla = error.rule or "schema"
    definicion = error.rule_definition
    if regla == "additionalProperties":
        conocidas = set(error.definition.get("properties", {})) if error.definition else set()
        patrones = error.definition.get("patternProperties") if error.definition else None
        valor = error.value if isinstance(error.value, dict) else {}
        desconocidas = sorted(set(valor) - conocidas)
        if patrones:
            desconocidas = sorted(_sin_patron(desconocidas, patrones))
        nombre = desconocidas[0] if desconocidas else "?"
        return (
            "campo-desconocido",
            f"campo desconocido «{nombre}» en {ruta} — si el dato es real, hay que "
            "actualizar el schema en un PR aparte",
        )
    if regla == "required":
        faltantes = sorted(set(definicion or []) - set(error.value or {}))
        nombres = ", ".join(f"«{nombre}»" for nombre in faltantes) or "?"
        return "schema", f"falta la propiedad obligatoria {nombres} en {ruta}"
    if regla == "type":
        return "schema", f"{ruta} debe ser de tipo {_texto(definicion)}"
    if regla == "enum":
        return "schema", f"{ruta} debe ser uno de: {_texto(definicion)}"
    if regla == "pattern":
        return "schema", f"{ruta} no cumple el patron {_texto(definicion)}"
    if regla in ("minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"):
        return "schema", f"{ruta} incumple {regla} = {_texto(definicion)}"
    return "schema", f"{ruta} incumple la regla «{regla}» del schema: {error.message}"


def _sin_patron(nombres: list[str], patrones: dict[str, Any]) -> list[str]:
    """Descarta los nombres que si estan cubiertos por alguna `patternProperties`."""
    compilados = [re.compile(patron) for patron in patrones]
    return [nombre for nombre in nombres if not any(p.search(nombre) for p in compilados)]


def revisar(datos: Any, tipo: str, archivo: str) -> list[Hallazgo]:
    """Valida el documento contra su schema y devuelve el primer incumplimiento, si lo hay."""
    validador = compilar(tipo)
    try:
        validador(datos)
    except fastjsonschema.JsonSchemaValueException as error:
        regla, mensaje = _mensaje(error, tipo)
        return [Hallazgo(ERROR, regla, archivo, mensaje)]
    return []
