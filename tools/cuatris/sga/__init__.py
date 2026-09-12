"""Lectura del SGA del ITBA.

`parsers` trabaja siempre sobre HTML ya descargado (no hace red) y `normalizar` traduce los
textos del SGA al vocabulario del contrato v1. El scraper en vivo (Fase 3 del plan de
backend) vive fuera de este paquete y usa estas dos piezas.
"""

from . import normalizar, parsers
from .normalizar import ValorDesconocido
from .parsers import (
    Bloque,
    Comision,
    Cupo,
    Curso,
    EstructuraInesperada,
    FilaListado,
    FiltrosListado,
    Listado,
    Ocupacion,
    Paginacion,
    Periodo,
    a_contrato,
    extraer_formulario_login,
    extraer_ids_filtro,
    parsear_comisiones,
    parsear_curso,
    parsear_listado,
)

__all__ = [
    "Bloque",
    "Comision",
    "Cupo",
    "Curso",
    "EstructuraInesperada",
    "FilaListado",
    "FiltrosListado",
    "Listado",
    "Ocupacion",
    "Paginacion",
    "Periodo",
    "ValorDesconocido",
    "a_contrato",
    "extraer_formulario_login",
    "extraer_ids_filtro",
    "normalizar",
    "parsear_comisiones",
    "parsear_curso",
    "parsear_listado",
    "parsers",
]
