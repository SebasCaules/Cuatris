"""CLI `cuatris`: el scraper del SGA.

    cuatris sga bajar --anio 2027 --cuatrimestre 1C

El unico subcomando es `sga` (tools/cuatris/sga/). Las demas herramientas del proyecto
anterior (fmt, validar, triage, indice, plan) fueron reemplazadas por scripts/datos/ (Node).
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from cuatris import sga

TRACEBACK = "--traceback"
"""Opcion global: muestra el traceback completo en vez del mensaje de error resumido."""

__all__ = ["main"]


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cuatris", description="Herramientas de datos de Cuatris."
    )
    parser.add_argument(
        TRACEBACK, action="store_true", help="Muestra el traceback completo si algo falla."
    )
    sub = parser.add_subparsers(dest="subcomando", metavar="subcomando", required=True)
    hijo = sub.add_parser("sga", help=sga.AYUDA, description=sga.AYUDA)
    sga.configurar(hijo)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Punto de entrada del ejecutable `cuatris`."""
    args = _parser().parse_args(argv)
    try:
        return sga.ejecutar(args)
    except Exception as exc:  # noqa: BLE001 - el mensaje limpio es el contrato de la CLI
        if getattr(args, "traceback", False):
            raise
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":  # pragma: no cover - punto de entrada
    raise SystemExit(main())
