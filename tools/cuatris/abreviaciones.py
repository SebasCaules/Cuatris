"""Curaduría de las abreviaciones de materias (`data/v1/abreviaciones.json`).

La abreviación es el nombre corto con el que la gente llama a la materia (POD, Cripto, PAW).
Es el único dato de materia que **no** se deriva de una fuente oficial: se mantiene a mano en
un CSV de ida y vuelta y se aplica por código, porque seis nombres se repiten en códigos
distintos.

    cuatris abreviaciones exportar --plan … --abreviaciones … > abreviaciones.csv
    cuatris abreviaciones importar abreviaciones.csv --salida data/v1/abreviaciones.json

Reglas: gana `correccion` si no está vacía, si no `abreviacion_propuesta`; los valores son
únicos (error duro con los códigos en conflicto); todo código del CSV existe en el plan y toda
materia del plan tiene abreviación.

`cli.py` registra el subcomando con `configurar_subcomando(subparsers)` y ejecuta
`args.funcion(args)` (alias `args.func`).
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
from pathlib import Path

CONTRATO = "1.0.0"
COLUMNAS = ("codigo", "nombre", "abreviacion_propuesta", "correccion", "nota")
LARGO_MINIMO = 1
LARGO_MAXIMO = 24
RE_CODIGO = re.compile(r"^\d{2}\.\d{2}$")

#: El CSV curado se guarda en UTF-8 con BOM para que Excel lo abra bien; exportar escribe el
#: mismo prólogo e importar lo tolera (`utf-8-sig`).
CODIFICACION_CSV = "utf-8-sig"

PLAN_POR_DEFECTO = "data/v1/planes/S10-Rev23.json"


class ErrorAbreviaciones(Exception):
    """El CSV o el JSON de abreviaciones no cumple alguna de las reglas duras."""


def serializar_canonico(obj: object) -> str:
    """Forma canónica de CONTRATO-v1.md: claves ordenadas, indent 2, UTF-8 sin escapar."""
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def escribir_json_canonico(ruta: Path, obj: object) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(serializar_canonico(obj), encoding="utf-8", newline="\n")


def _sin_claves_duplicadas(pares: list[tuple[str, object]]) -> dict:
    vistas: dict[str, object] = {}
    for clave, valor in pares:
        if clave in vistas:
            raise ErrorAbreviaciones(f"clave repetida en el JSON: {clave!r}")
        vistas[clave] = valor
    return vistas


def leer_json(ruta: Path) -> dict:
    return json.loads(ruta.read_text(encoding="utf-8"), object_pairs_hook=_sin_claves_duplicadas)


def codigos_del_plan(plan: dict) -> list[str]:
    """Códigos de las materias del plan, en el orden en el que están en el archivo."""
    materias = plan.get("materias")
    if not isinstance(materias, list) or not materias:
        raise ErrorAbreviaciones("el plan no tiene la lista «materias»")
    return [str(m["codigo"]) for m in materias]


def nombres_del_plan(plan: dict) -> dict[str, str]:
    return {str(m["codigo"]): str(m["nombre"]) for m in plan["materias"]}


def _validar_abreviacion(codigo: str, valor: str) -> None:
    if not LARGO_MINIMO <= len(valor) <= LARGO_MAXIMO:
        raise ErrorAbreviaciones(
            f"{codigo}: la abreviación debe tener entre {LARGO_MINIMO} y {LARGO_MAXIMO} "
            f"caracteres y {valor!r} tiene {len(valor)}"
        )


def leer_csv(texto: str) -> dict[str, str]:
    """CSV curado → `{codigo: abreviación elegida}`, con todas las validaciones de forma."""
    lector = csv.DictReader(io.StringIO(texto.lstrip("\ufeff")))
    if lector.fieldnames is None:
        raise ErrorAbreviaciones("el CSV está vacío")
    leidas = tuple(nombre.strip() for nombre in lector.fieldnames)
    if leidas != COLUMNAS:
        raise ErrorAbreviaciones(
            f"columnas inesperadas {list(leidas)}; se esperaba {list(COLUMNAS)}"
        )

    elegidas: dict[str, str] = {}
    for numero, fila in enumerate(lector, start=2):
        codigo = (fila["codigo"] or "").strip()
        if not codigo:
            raise ErrorAbreviaciones(f"fila {numero}: falta el código")
        if not RE_CODIGO.match(codigo):
            raise ErrorAbreviaciones(f"fila {numero}: código con forma inesperada {codigo!r}")
        if codigo in elegidas:
            raise ErrorAbreviaciones(f"fila {numero}: el código {codigo} aparece dos veces")
        propuesta = (fila["abreviacion_propuesta"] or "").strip()
        correccion = (fila["correccion"] or "").strip()
        elegida = correccion or propuesta
        if not elegida:
            raise ErrorAbreviaciones(
                f"fila {numero}: {codigo} no tiene ni abreviación propuesta ni corrección"
            )
        _validar_abreviacion(codigo, elegida)
        elegidas[codigo] = elegida
    if not elegidas:
        raise ErrorAbreviaciones("el CSV no tiene ninguna fila de datos")
    return elegidas


def validar_unicidad(abreviaciones: dict[str, str]) -> None:
    """La unicidad es error duro: dos materias con la misma abreviación son indistinguibles."""
    por_valor: dict[str, list[str]] = {}
    for codigo, valor in abreviaciones.items():
        por_valor.setdefault(valor, []).append(codigo)
    repetidas = {valor: sorted(codigos) for valor, codigos in por_valor.items() if len(codigos) > 1}
    if repetidas:
        detalle = "; ".join(
            f"{valor!r}: {', '.join(codigos)}" for valor, codigos in sorted(repetidas.items())
        )
        raise ErrorAbreviaciones(f"abreviaciones repetidas: {detalle}")


def validar_contra_plan(abreviaciones: dict[str, str], plan: dict) -> None:
    codigos = set(codigos_del_plan(plan))
    sobran = sorted(set(abreviaciones) - codigos)
    if sobran:
        raise ErrorAbreviaciones(f"hay códigos que no están en el plan: {', '.join(sobran)}")
    faltan = sorted(codigos - set(abreviaciones))
    if faltan:
        raise ErrorAbreviaciones(f"hay materias del plan sin abreviación: {', '.join(faltan)}")


def importar(texto_csv: str, plan: dict) -> dict:
    """CSV curado + plan → el contenido de `data/v1/abreviaciones.json`."""
    abreviaciones = leer_csv(texto_csv)
    validar_unicidad(abreviaciones)
    validar_contra_plan(abreviaciones, plan)
    return {"contrato": CONTRATO, "abreviaciones": abreviaciones}


def exportar(plan: dict, documento: dict) -> str:
    """Plan + `abreviaciones.json` → el CSV de curaduría, en el orden del plan."""
    abreviaciones = documento.get("abreviaciones")
    if not isinstance(abreviaciones, dict):
        raise ErrorAbreviaciones("el archivo de abreviaciones no tiene el objeto «abreviaciones»")
    validar_unicidad(abreviaciones)
    validar_contra_plan(abreviaciones, plan)

    nombres = nombres_del_plan(plan)
    buffer = io.StringIO()
    escritor = csv.writer(buffer, lineterminator="\n")
    escritor.writerow(COLUMNAS)
    for codigo in codigos_del_plan(plan):
        # `correccion` y `nota` salen vacías: lo elegido ya está en la columna de la propuesta.
        escritor.writerow([codigo, nombres[codigo], abreviaciones[codigo], "", ""])
    return "﻿" + buffer.getvalue()


# --------------------------------------------------------------------------- CLI


def _comando_importar(args: argparse.Namespace) -> int:
    plan = leer_json(Path(args.plan))
    texto = Path(args.csv).read_text(encoding=CODIFICACION_CSV)
    documento = importar(texto, plan)
    escribir_json_canonico(Path(args.salida), documento)
    print(f"{len(documento['abreviaciones'])} abreviaciones → {args.salida}", file=sys.stderr)
    return 0


def _comando_exportar(args: argparse.Namespace) -> int:
    plan = leer_json(Path(args.plan))
    documento = leer_json(Path(args.abreviaciones))
    texto = exportar(plan, documento)
    if args.salida:
        Path(args.salida).write_text(texto, encoding="utf-8", newline="")
        print(f"escrito {args.salida}", file=sys.stderr)
    else:
        sys.stdout.write(texto)
    return 0


AYUDA = "Importa y exporta el CSV curado de abreviaciones."

#: Acciones de `cuatris abreviaciones`, por si el parser se arma sin `set_defaults`.
ACCIONES = {"importar": _comando_importar, "exportar": _comando_exportar}


def configurar(parser: argparse.ArgumentParser) -> None:
    """Agrega las acciones de `cuatris abreviaciones` a un parser ya creado."""
    acciones = parser.add_subparsers(dest="accion", required=True)

    importar_cmd = acciones.add_parser("importar", help="CSV curado → abreviaciones.json")
    importar_cmd.add_argument("csv", help="CSV con las columnas " + ", ".join(COLUMNAS))
    importar_cmd.add_argument("--plan", default=PLAN_POR_DEFECTO, help="plan contra el que validar")
    importar_cmd.add_argument("--salida", required=True, help="archivo JSON a escribir")
    importar_cmd.set_defaults(funcion=_comando_importar, func=_comando_importar)

    exportar_cmd = acciones.add_parser("exportar", help="plan + abreviaciones.json → CSV curado")
    exportar_cmd.add_argument(
        "--plan", default=PLAN_POR_DEFECTO, help="plan del que salen los nombres"
    )
    exportar_cmd.add_argument(
        "--abreviaciones",
        default="data/v1/abreviaciones.json",
        help="abreviaciones.json a exportar",
    )
    exportar_cmd.add_argument("--salida", help="archivo a escribir; sin esto, sale por stdout")
    exportar_cmd.set_defaults(funcion=_comando_exportar, func=_comando_exportar)


def ejecutar(args: argparse.Namespace) -> int:
    """Corre la acción elegida y devuelve el código de salida."""
    return ACCIONES[args.accion](args)


def configurar_subcomando(subparsers) -> argparse.ArgumentParser:
    """Registra `cuatris abreviaciones` en los subparsers de `cli.py`."""
    abreviaciones = subparsers.add_parser("abreviaciones", help=AYUDA, description=AYUDA)
    abreviaciones.set_defaults(funcion=ejecutar, func=ejecutar)
    configurar(abreviaciones)
    return abreviaciones
