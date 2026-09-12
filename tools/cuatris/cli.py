"""CLI `cuatris`: punto de entrada unico de las herramientas de datos.

Subcomandos propios de este modulo: `fmt` y `validar`.

Como agregar un subcomando
--------------------------
Deja un modulo `tools/cuatris/<nombre>.py` (o un paquete) que exponga:

    AYUDA = "Una linea de ayuda."
    def configurar(parser): ...        # agrega los argumentos del subcomando
    def ejecutar(args) -> int: ...     # devuelve el codigo de salida

y registralo en `MODULOS_EXTERNOS` (una linea; ese registro es del orquestador). El modulo se
importa recien cuando el usuario invoca ese subcomando, asi que un subcomando roto no rompe
`cuatris validar`; pero si al invocarlo falta una dependencia, el error se ve entero.
"""

from __future__ import annotations

import argparse
import difflib
import importlib
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from cuatris import canon
from cuatris import validar as validacion
from cuatris.validar import TIPOS, ErrorDeApertura

MODULOS_EXTERNOS: dict[str, str] = {
    "abreviaciones": "cuatris.abreviaciones",
    "plan": "cuatris.plan",
}
"""Subcomandos que aportan otros modulos: nombre -> modulo importable (importacion perezosa)."""

TRACEBACK = "--traceback"
"""Opcion global: muestra el traceback completo en vez del mensaje de error resumido."""

OK = 0
HAY_ERRORES = 1
NO_SE_PUDO_ABRIR = 2

__all__ = ["SUBCOMANDOS", "main"]


def _configurar_fmt(parser: argparse.ArgumentParser) -> None:
    """Argumentos de `cuatris fmt`."""
    parser.add_argument("archivos", nargs="+", type=Path, help="Archivos JSON a reescribir.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="No escribe nada: sale con 1 si algun archivo no esta en forma canonica.",
    )
    parser.set_defaults(funcion=_ejecutar_fmt)


def _ejecutar_fmt(args: argparse.Namespace) -> int:
    """Reescribe los archivos en forma canonica o, con `--check`, solo informa."""
    salida = OK
    for ruta in args.archivos:
        try:
            texto = canon.leer_texto(ruta)
        except OSError as exc:
            print(f"ERROR {ruta}: no se pudo abrir el archivo: {exc.strerror or exc}")
            salida = NO_SE_PUDO_ABRIR
            continue
        except canon.ErrorCanonico as exc:
            print(f"ERROR {ruta}: {exc}")
            salida = max(salida, HAY_ERRORES)
            continue
        try:
            canonico = canon.serializar(canon.cargar_texto(texto))
        except canon.ErrorCanonico as exc:
            print(f"ERROR {ruta}: {exc}")
            salida = max(salida, HAY_ERRORES)
            continue
        if texto == canonico:
            continue
        if args.check:
            print(f"ERROR {ruta}: no esta en forma canonica")
            print(_diff(texto, canonico, str(ruta)))
            salida = max(salida, HAY_ERRORES)
        else:
            Path(ruta).write_text(canonico, encoding="utf-8", newline="\n")
            print(f"reescrito {ruta}")
    return salida


def _diff(actual: str, canonico: str, nombre: str, contexto: int = 1, lineas: int = 20) -> str:
    """Diff unificado corto entre el archivo y su forma canonica."""
    crudo = list(
        difflib.unified_diff(
            actual.splitlines(keepends=True),
            canonico.splitlines(keepends=True),
            fromfile=f"{nombre} (actual)",
            tofile=f"{nombre} (canonico)",
            n=contexto,
        )
    )
    recorte = crudo[:lineas]
    texto = "".join(recorte).rstrip("\n")
    if len(crudo) > lineas:
        texto += f"\n  … {len(crudo) - lineas} lineas mas de diferencia"
    return texto


def _configurar_validar(parser: argparse.ArgumentParser) -> None:
    """Argumentos de `cuatris validar`."""
    parser.add_argument("archivos", nargs="+", type=Path, help="Archivos de datos a validar.")
    parser.add_argument(
        "--tipo",
        choices=TIPOS,
        default=None,
        help="Fuerza el tipo de archivo en vez de deducirlo de la ruta.",
    )
    parser.set_defaults(funcion=_ejecutar_validar)


def _ejecutar_validar(args: argparse.Namespace) -> int:
    """Corre C1 y C2 sobre cada archivo e imprime una linea por hallazgo."""
    salida = OK
    for ruta in args.archivos:
        try:
            hallazgos = validacion.validar_archivo(ruta, args.tipo)
        except ErrorDeApertura as exc:
            print(f"ERROR {ruta}: {exc}")
            salida = NO_SE_PUDO_ABRIR
            continue
        for hallazgo in hallazgos:
            print(hallazgo.linea())
        if validacion.hay_errores(hallazgos):
            salida = max(salida, HAY_ERRORES)
    return salida


SUBCOMANDOS: list[tuple[str, str, Callable[[argparse.ArgumentParser], None]]] = [
    ("fmt", "Reescribe archivos JSON en la forma canonica del contrato.", _configurar_fmt),
    ("validar", "Valida archivos de datos con las capas C1 y C2.", _configurar_validar),
]
"""Subcomandos propios: `(nombre, ayuda, funcion que configura el subparser)`."""


def _externos() -> list[str]:
    """Nombres de los subcomandos registrados en `MODULOS_EXTERNOS`, sin importarlos."""
    return sorted(MODULOS_EXTERNOS)


def _modulo_externo(nombre: str):
    """Importa el modulo registrado para el subcomando; cualquier fallo se propaga entero."""
    ruta = MODULOS_EXTERNOS[nombre]
    modulo = importlib.import_module(ruta)
    if not hasattr(modulo, "configurar"):
        raise RuntimeError(f"el modulo {ruta} no declara `configurar` para el subcomando {nombre}")
    return modulo


def _agregar_externo(subparsers: argparse._SubParsersAction, nombre: str) -> None:
    """Registra el subparser del subcomando externo, importandolo recien ahora."""
    modulo = _modulo_externo(nombre)
    ayuda = getattr(modulo, "AYUDA", f"Subcomando «{nombre}».")
    hijo = subparsers.add_parser(nombre, help=ayuda, description=ayuda)
    hijo.set_defaults(funcion=getattr(modulo, "ejecutar", None))
    modulo.configurar(hijo)


def _construir_parser(invocado: str | None) -> argparse.ArgumentParser:
    """Arma el parser; solo configura a fondo el subcomando invocado (importacion perezosa)."""
    parser = argparse.ArgumentParser(
        prog="cuatris",
        description="Herramientas de datos de Cuatris: contrato, validacion e importadores.",
    )
    subparsers = parser.add_subparsers(dest="subcomando", metavar="subcomando")
    for nombre, ayuda, configurar in SUBCOMANDOS:
        hijo = subparsers.add_parser(nombre, help=ayuda, description=ayuda)
        if nombre == invocado or invocado is None:
            configurar(hijo)
    for nombre in _externos():
        if nombre == invocado:
            _agregar_externo(subparsers, nombre)
        else:
            subparsers.add_parser(nombre, help=f"Subcomando «{nombre}» (ver --help).")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Punto de entrada de la CLI; devuelve el codigo de salida."""
    argumentos = list(sys.argv[1:] if argv is None else argv)
    mostrar_traceback = TRACEBACK in argumentos
    argumentos = [token for token in argumentos if token != TRACEBACK]
    invocado = next((token for token in argumentos if not token.startswith("-")), None)
    parser = _construir_parser(invocado)
    args = parser.parse_args(argumentos)
    funcion = getattr(args, "funcion", None)
    if funcion is None:
        parser.print_help()
        return HAY_ERRORES
    try:
        return funcion(args)
    except Exception as exc:  # noqa: BLE001 - la CLI resume cualquier error de dominio
        if mostrar_traceback:
            raise
        print(f"error: {exc}", file=sys.stderr)
        print(f"(vuelva a correr con {TRACEBACK} para ver el detalle completo)", file=sys.stderr)
        return HAY_ERRORES


if __name__ == "__main__":  # pragma: no cover - punto de entrada
    raise SystemExit(main())
