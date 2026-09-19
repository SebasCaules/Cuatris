"""Lectura del SGA del ITBA y scraper en vivo.

`parsers` trabaja siempre sobre HTML ya descargado (no hace red) y `normalizar` traduce los
textos del SGA al vocabulario del contrato v1. Sobre esas dos piezas se apoya el scraper en
vivo (Fase 3 del plan de backend): `cliente` pone la sesion, las cookies, el ritmo y los
reintentos; `checkpoint` hace que una corrida cortada se pueda reanudar; `bajar` es el
subcomando `cuatris sga bajar`.

Este modulo tambien es el punto de entrada del subcomando `sga` de `cli.py`: expone `AYUDA`,
`configurar(parser)` y `ejecutar(args)`. `cliente`, `checkpoint` y `bajar` se importan recien
cuando se los invoca, para que `import cuatris.sga` siga siendo barato (y siga funcionando
sin `httpx` instalado) para quien solo quiere los parsers.
"""

from __future__ import annotations

import argparse

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

AYUDA = "Scraper del SGA: baja los horarios de un cuatrimestre (corrida local)."
"""Ayuda del subcomando `cuatris sga`, que `cli.py` muestra en el listado de subcomandos."""


def configurar(parser: argparse.ArgumentParser) -> None:
    """Registra las acciones de `cuatris sga`. Hoy la unica es `bajar`."""
    from . import bajar as accion_bajar

    acciones = parser.add_subparsers(dest="accion", metavar="accion", required=True)
    hijo = acciones.add_parser("bajar", help=accion_bajar.AYUDA, description=accion_bajar.AYUDA)
    accion_bajar.configurar(hijo)


def ejecutar(args: argparse.Namespace) -> int:
    """Ejecuta la accion elegida; devuelve el codigo de salida del proceso.

    `configurar` deja la funcion en `funcion_sga` y no en `funcion`, que es la que usa
    `cli.py` para llegar hasta aca.
    """
    funcion = getattr(args, "funcion_sga", None)
    if funcion is None:  # pragma: no cover - `required=True` lo impide
        raise SystemExit("Falta la accion de «cuatris sga» (por ahora, «bajar»).")
    return funcion(args)


__all__ = [
    "AYUDA",
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
    "configurar",
    "ejecutar",
    "extraer_formulario_login",
    "extraer_ids_filtro",
    "normalizar",
    "parsear_comisiones",
    "parsear_curso",
    "parsear_listado",
    "parsers",
]
