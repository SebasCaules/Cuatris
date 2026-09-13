#!/usr/bin/env python3
"""Convierte electivas.csv y obligatorias.csv en electivas.json y obligatorias.json ordenados.

El formato de salida usa listas de materias con campos normalizados y una lista de
aristas de correlativas (`from` -> `to`). Sirve como fuente para el mapa en la web.
"""

import argparse
import csv
import json
import pathlib
import re
from typing import Dict, List, Tuple


CODE_RE = re.compile(r"^(\d+\.\d+)\s*-\s*(.+)$")


def clean_cell(value: str) -> str:
    """Normaliza una celda quitando BOM, NBSP y espacios laterales."""
    if value is None:
        return ""
    return (
        str(value)
        .replace("\ufeff", "")
        .replace("\xa0", " ")
        .replace("\n", " ")
        .strip()
    )


def parse_int(value: str):
    """Convierte a int/float cuando es posible, sino devuelve None."""
    text = clean_cell(value).lower()
    if not text or text == "nan":
        return None
    try:
        number = float(text)
        if number.is_integer():
            return int(number)
        return number
    except ValueError:
        return None


def split_codes(text: str) -> List[str]:
    """Extrae códigos de materia con formato 00.00 del string."""
    return re.findall(r"\d+\.\d+", clean_cell(text))


def write_json(path: pathlib.Path, data: Dict):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------- Electivas ---------------------- #
def parse_electivas(path: pathlib.Path) -> Dict:
    """Lee electivas.csv (separador ;) y devuelve materias + correlativas."""
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f, delimiter=";")
        rows = list(reader)

    if not rows:
        return {"areas": [], "materias": [], "aristas_correlativas": []}

    header = [clean_cell(h) for h in rows[0]]
    base_cols = ["Materia", "Créditos", "Créditos requeridos", "Correlativas"]
    area_cols = [c for c in header if c and c not in base_cols]

    materias = []
    edges = set()

    for row in rows[1:]:
        cells = [clean_cell(c) for c in row]
        if all(not c for c in cells):
            continue

        row_map = {header[i]: cells[i] for i in range(min(len(header), len(cells)))}
        materia_raw = row_map.get("Materia", "")
        match = CODE_RE.match(materia_raw)
        if not match:
            continue

        code, name = match.groups()
        credits = parse_int(row_map.get("Créditos", ""))
        cred_req = parse_int(row_map.get("Créditos requeridos", ""))
        corr_raw = row_map.get("Correlativas", "")
        correlativas = split_codes(corr_raw)

        areas = [
            col for col in area_cols if row_map.get(col, "").strip().lower() == "x"
        ]

        materias.append(
            {
                "codigo": code,
                "nombre": name,
                "creditos": credits,
                "creditos_requeridos": cred_req,
                "correlativas": correlativas,
                "areas": areas,
            }
        )

        for pre in correlativas:
            edges.add((pre, code))

    materias.sort(key=lambda m: m["codigo"])
    edge_list = [{"from": a, "to": b} for a, b in sorted(edges)]

    return {"areas": area_cols, "materias": materias, "aristas_correlativas": edge_list}


# --------------------- Obligatorias --------------------- #
def parse_obligatorias(path: pathlib.Path) -> Dict:
    """Parsea obligatorias.csv, incluyendo ciclo y sección (Año / Cuatrimestre)."""
    materias = []
    edges = set()
    current_cycle = None
    current_section = None

    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f, delimiter=";")
        for row in reader:
            cells = [clean_cell(c) for c in row]
            if all(not c for c in cells):
                continue

            first = cells[0]

            if first.startswith("Ciclo"):
                current_cycle = first
                current_section = None
                continue

            if first.startswith("Requisito"):
                continue

            if first.startswith("Año") and "Cuatrimestre" in first:
                current_section = first
                continue

            if first in {"Materia", "Materias Electivas"}:
                continue

            if first.startswith("Se requiere completar"):
                continue

            match = CODE_RE.match(first)
            if not match:
                continue

            code, name = match.groups()
            credits = parse_int(cells[1] if len(cells) > 1 else "")
            cred_req = parse_int(cells[2] if len(cells) > 2 else "")
            corr_raw = cells[3] if len(cells) > 3 else ""
            correlativas = split_codes(corr_raw)

            materias.append(
                {
                    "codigo": code,
                    "nombre": name,
                    "creditos": credits,
                    "creditos_requeridos": cred_req,
                    "correlativas": correlativas,
                    "ciclo": current_cycle,
                    "seccion": current_section,
                }
            )

            for pre in correlativas:
                edges.add((pre, code))

    materias.sort(key=lambda m: m["codigo"])
    edge_list = [{"from": a, "to": b} for a, b in sorted(edges)]

    ciclos = sorted({m["ciclo"] for m in materias if m.get("ciclo")})

    return {
        "ciclos": ciclos,
        "materias": materias,
        "aristas_correlativas": edge_list,
    }


# ------------------------ CLI --------------------------- #
def main():
    ap = argparse.ArgumentParser(
        description="Genera electivas.json y obligatorias.json ordenados."
    )
    ap.add_argument("--electivas-csv", default="electivas.csv", help="Ruta al CSV original de electivas.")
    ap.add_argument(
        "--obligatorias-csv", default="obligatorias.csv", help="Ruta al CSV original de obligatorias."
    )
    ap.add_argument("--electivas-json", default="electivas.json", help="Salida JSON para electivas.")
    ap.add_argument("--obligatorias-json", default="obligatorias.json", help="Salida JSON para obligatorias.")
    args = ap.parse_args()

    ele_data = parse_electivas(pathlib.Path(args.electivas_csv))
    obl_data = parse_obligatorias(pathlib.Path(args.obligatorias_csv))

    write_json(pathlib.Path(args.electivas_json), ele_data)
    write_json(pathlib.Path(args.obligatorias_json), obl_data)

    print(
        f"Listo: {args.electivas_json} ({len(ele_data['materias'])} materias) y "
        f"{args.obligatorias_json} ({len(obl_data['materias'])} materias)."
    )


if __name__ == "__main__":
    main()
