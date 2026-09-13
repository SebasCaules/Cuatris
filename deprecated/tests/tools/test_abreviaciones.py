"""Tests del ciclo de curaduría de abreviaciones."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest
from cuatris import abreviaciones as modulo

CABECERA = ",".join(modulo.COLUMNAS)


@pytest.fixture(scope="session")
def plan(raiz: Path) -> dict:
    return modulo.leer_json(raiz / "data" / "v1" / "planes" / "S10-Rev23.json")


@pytest.fixture(scope="session")
def csv_curado(raiz: Path) -> str:
    return (raiz / "entregables" / "03-abreviaciones-materias.csv").read_text(
        encoding=modulo.CODIFICACION_CSV
    )


@pytest.fixture(scope="session")
def documento(csv_curado: str, plan: dict) -> dict:
    return modulo.importar(csv_curado, plan)


def _csv(filas: list[tuple[str, str, str, str, str]]) -> str:
    return (
        CABECERA
        + "\n"
        + "".join(",".join(f'"{c}"' for c in fila) + "\n" for fila in filas)
    )


# --------------------------------------------------------------------------- importar


def test_importa_las_163(documento: dict, plan: dict) -> None:
    assert documento["contrato"] == "1.0.0"
    assert len(documento["abreviaciones"]) == 163
    assert set(documento["abreviaciones"]) == {m["codigo"] for m in plan["materias"]}


def test_valores_conocidos(documento: dict) -> None:
    # Los dos ejemplos de CONTRATO-v1.md §3.
    assert documento["abreviaciones"]["72.42"] == "POD"
    assert documento["abreviaciones"]["72.44"] == "Cripto"


def test_desempate_por_codigo(documento: dict) -> None:
    # 82.08 está en la lista vigente y conserva la abreviación limpia; 72.64 lleva el código.
    abreviaciones = documento["abreviaciones"]
    assert abreviaciones["82.08"] == "Cloud"
    assert abreviaciones["72.64"] == "Cloud (72.64)"


def test_gana_la_correccion(plan: dict) -> None:
    texto = _csv(
        [("72.42", "Programación de Objetos Distribuidos", "POD", "Distribuidos", "")]
    )
    assert modulo.leer_csv(texto) == {"72.42": "Distribuidos"}


def test_correccion_vacia_deja_la_propuesta(plan: dict) -> None:
    texto = _csv([("72.42", "Programación de Objetos Distribuidos", "POD", "", "")])
    assert modulo.leer_csv(texto) == {"72.42": "POD"}


def test_valores_unicos(documento: dict) -> None:
    valores = list(documento["abreviaciones"].values())
    assert len(set(valores)) == len(valores)
    assert all(1 <= len(v) <= 24 for v in valores)


# --------------------------------------------------------------------------- errores duros


def test_abreviacion_repetida_rompe_con_los_codigos() -> None:
    with pytest.raises(
        modulo.ErrorAbreviaciones, match=r"72\.42.*72\.44|72\.44.*72\.42"
    ):
        modulo.validar_unicidad({"72.42": "POD", "72.44": "POD", "72.45": "PF"})


def test_codigo_que_no_esta_en_el_plan_rompe(plan: dict) -> None:
    abreviaciones = {m["codigo"]: m["codigo"] for m in plan["materias"]}
    abreviaciones["99.99"] = "Inventada"
    with pytest.raises(modulo.ErrorAbreviaciones, match="99.99"):
        modulo.validar_contra_plan(abreviaciones, plan)


def test_materia_del_plan_sin_abreviacion_rompe(plan: dict, documento: dict) -> None:
    abreviaciones = dict(documento["abreviaciones"])
    del abreviaciones["72.45"]
    with pytest.raises(modulo.ErrorAbreviaciones, match="72.45"):
        modulo.validar_contra_plan(abreviaciones, plan)


def test_columnas_distintas_rompen() -> None:
    with pytest.raises(modulo.ErrorAbreviaciones, match="columnas inesperadas"):
        modulo.leer_csv("codigo,abreviacion\n72.42,POD\n")


def test_codigo_repetido_rompe() -> None:
    texto = _csv([("72.42", "Una", "POD", "", ""), ("72.42", "Otra", "PODD", "", "")])
    with pytest.raises(modulo.ErrorAbreviaciones, match="dos veces"):
        modulo.leer_csv(texto)


def test_fila_sin_abreviacion_rompe() -> None:
    with pytest.raises(modulo.ErrorAbreviaciones, match="ni abreviación propuesta"):
        modulo.leer_csv(_csv([("72.42", "Una", "", "", "")]))


def test_abreviacion_demasiado_larga_rompe() -> None:
    largo = "P" * 25
    with pytest.raises(modulo.ErrorAbreviaciones, match="entre 1 y 24"):
        modulo.leer_csv(_csv([("72.42", "Una", largo, "", "")]))


def test_codigo_con_forma_rara_rompe() -> None:
    with pytest.raises(modulo.ErrorAbreviaciones, match="forma inesperada"):
        modulo.leer_csv(_csv([("7242", "Una", "POD", "", "")]))


def test_json_con_claves_repetidas_rompe(tmp_path: Path) -> None:
    archivo = tmp_path / "abreviaciones.json"
    archivo.write_text('{"contrato": "1.0.0", "contrato": "2.0.0"}', encoding="utf-8")
    with pytest.raises(modulo.ErrorAbreviaciones, match="clave repetida"):
        modulo.leer_json(archivo)


# --------------------------------------------------------------------------- exportar


def test_exportar_tiene_las_columnas_y_el_orden_del_plan(
    plan: dict, documento: dict
) -> None:
    texto = modulo.exportar(plan, documento)
    assert texto.startswith("﻿" + CABECERA + "\n")
    assert "\r" not in texto
    lineas = texto.lstrip("﻿").rstrip("\n").split("\n")
    assert len(lineas) == 164
    codigos = [linea.split(",")[0] for linea in lineas[1:]]
    assert codigos == [m["codigo"] for m in plan["materias"]]


def test_exportar_deja_correccion_y_nota_vacias(plan: dict, documento: dict) -> None:
    texto = modulo.exportar(plan, documento)
    for linea in texto.lstrip("﻿").rstrip("\n").split("\n")[1:]:
        assert linea.endswith(",,"), linea


def test_ida_y_vuelta_sin_cambios(plan: dict, documento: dict) -> None:
    texto = modulo.exportar(plan, documento)
    assert modulo.importar(texto, plan) == documento


def test_nombres_del_csv_exportado_salen_del_plan(plan: dict, documento: dict) -> None:
    texto = modulo.exportar(plan, documento)
    assert "ARQUITECTURA DE MICROSERVICIOS" in texto


# --------------------------------------------------------------------------- archivo publicado


def test_archivo_publicado_es_el_que_produce_el_comando(
    raiz: Path, documento: dict
) -> None:
    publicado = (raiz / "data" / "v1" / "abreviaciones.json").read_text(
        encoding="utf-8"
    )
    assert publicado == modulo.serializar_canonico(documento)


def test_forma_canonica(raiz: Path) -> None:
    crudo = (raiz / "data" / "v1" / "abreviaciones.json").read_bytes()
    assert not crudo.startswith(b"\xef\xbb\xbf")
    assert b"\r" not in crudo
    assert crudo.endswith(b"\n")
    texto = crudo.decode("utf-8")
    assert texto == modulo.serializar_canonico(json.loads(texto))


# --------------------------------------------------------------------------- CLI


def test_subcomandos(raiz: Path, tmp_path: Path) -> None:
    parser = argparse.ArgumentParser(prog="cuatris")
    subparsers = parser.add_subparsers(dest="comando", required=True)
    modulo.configurar_subcomando(subparsers)
    ruta_plan = str(raiz / "data" / "v1" / "planes" / "S10-Rev23.json")
    csv_exportado = tmp_path / "abreviaciones.csv"
    json_vuelta = tmp_path / "abreviaciones.json"

    args = parser.parse_args(
        [
            "abreviaciones",
            "exportar",
            "--plan",
            ruta_plan,
            "--abreviaciones",
            str(raiz / "data" / "v1" / "abreviaciones.json"),
            "--salida",
            str(csv_exportado),
        ]
    )
    assert args.funcion(args) == 0

    args = parser.parse_args(
        [
            "abreviaciones",
            "importar",
            str(csv_exportado),
            "--plan",
            ruta_plan,
            "--salida",
            str(json_vuelta),
        ]
    )
    assert args.funcion(args) == 0
    original = (raiz / "data" / "v1" / "abreviaciones.json").read_bytes()
    assert json_vuelta.read_bytes() == original
