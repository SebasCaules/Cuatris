"""Tests de C1 — triage: los controles baratos previos al schema."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from cuatris import canon
from cuatris.validar import validar_archivo
from cuatris.validar.reporte import ERROR
from cuatris.validar.triage import (
    PROFUNDIDAD_MAXIMA,
    TAMANO_MAXIMO,
    profundidad,
    revisar_bytes,
    revisar_datos,
)

# Reglas de C1 que cada fixture de `deben-fallar` tiene que disparar, y solo esa.
FIXTURES_C1 = {
    "clave-duplicada.json": "clave-duplicada",
    "bidi-override.json": "bidi-override",
    "no-canonico.json": "no-canonico",
    "correo-en-docente.json": "privacidad-correo",
}


def _reglas(hallazgos) -> list[str]:
    return [hallazgo.regla for hallazgo in hallazgos]


@pytest.mark.parametrize(("nombre", "regla"), sorted(FIXTURES_C1.items()))
def test_fixture_que_debe_fallar_en_c1(fixtures: Path, nombre: str, regla: str) -> None:
    """Cada fixture de C1 produce exactamente el error esperado."""
    hallazgos = validar_archivo(fixtures / "deben-fallar" / nombre)
    assert _reglas(hallazgos) == [regla]
    assert hallazgos[0].nivel == ERROR


def test_hash_incorrecto_en_el_indice(fixtures: Path) -> None:
    """Un `hash` que no coincide con el archivo referido es error de C1."""
    hallazgos = validar_archivo(fixtures / "deben-fallar" / "hash-incorrecto" / "index.json")
    assert _reglas(hallazgos) == ["hash-incorrecto"]
    assert "v1/planes/S10-Rev23.json" in hallazgos[0].mensaje


def test_el_indice_bueno_corrobora_todos_los_hashes(fixtures: Path) -> None:
    """El indice de `deben-pasar` referencia archivos reales con su hash correcto."""
    assert validar_archivo(fixtures / "deben-pasar" / "index.json") == []


def test_tamano_maximo() -> None:
    """Un archivo de mas de 8 MiB se rechaza sin parsearlo."""
    crudo = b"x" * (TAMANO_MAXIMO + 1)
    assert _reglas(revisar_bytes(crudo, "grande.json")) == ["tamano"]


def test_bom_y_crlf_en_los_bytes() -> None:
    """El BOM y los retornos de carro se detectan sobre los bytes crudos."""
    assert _reglas(revisar_bytes(canon.BOM_UTF8 + b"{}\n", "x.json")) == ["bom"]
    assert _reglas(revisar_bytes(b"{}\r\n", "x.json")) == ["crlf"]


def test_profundidad_maxima() -> None:
    """El anidamiento tiene un techo duro contra el JSON de profundidad extrema."""
    plano = {"a": [{"b": 1}]}
    assert profundidad(plano) == 3
    hondo: object = "hoja"
    for _ in range(PROFUNDIDAD_MAXIMA + 1):
        hondo = [hondo]
    assert _reglas(revisar_datos(hondo, "hondo.json")) == ["profundidad"]


def test_claves_prohibidas() -> None:
    """`__proto__`, `constructor` y `prototype` no pueden aparecer en ningun nivel."""
    datos = {"cursos": [{"__proto__": {"contaminado": True}}]}
    hallazgos = revisar_datos(datos, "proto.json")
    assert _reglas(hallazgos) == ["clave-prohibida"]
    assert "cursos[0].__proto__" in hallazgos[0].mensaje


def test_caracteres_de_control_y_saltos_de_linea() -> None:
    """Los strings no llevan caracteres de control, ni siquiera saltos de linea."""
    assert _reglas(revisar_datos({"nombre": "Álgebra\nLineal"}, "x.json")) == [
        "caracter-de-control"
    ]
    assert _reglas(revisar_datos({"nombre": "Álgebra\tLineal"}, "x.json")) == [
        "caracter-de-control"
    ]
    assert revisar_datos({"nombre": "Álgebra Lineal"}, "x.json") == []


def test_overrides_bidireccionales_e_invisibles() -> None:
    """Los caracteres de Trojan Source se rechazan aunque el diff se vea normal."""
    for invisible in ("\u200b", "\u200f", "\u202e", "\u2066"):
        assert _reglas(revisar_datos({"codigo": f"93.18{invisible}"}, "x.json")) == [
            "bidi-override"
        ]


def test_datos_personales() -> None:
    """Correo, telefono y legajo son error duro en cualquier string."""
    assert _reglas(revisar_datos({"docentes": ["a.perez@itba.edu.ar"]}, "x.json")) == [
        "privacidad-correo"
    ]
    assert _reglas(revisar_datos({"nota": "11 4321-1234"}, "x.json")) == ["privacidad-telefono"]
    assert _reglas(revisar_datos({"nota": "legajo 61234"}, "x.json")) == ["privacidad-legajo"]


def test_las_fechas_y_los_hashes_no_son_telefonos(fixtures: Path) -> None:
    """El patron de telefono exige separadores para no marcar fechas, horas ni hashes."""
    datos = {
        "desde": "2026-07-26",
        "hasta": "2026-12-31",
        "horario": "14:00 - 16:00",
        "hash": "sha256:" + "0123456789abcdef" * 4,
        "aulas": ["001R", "202R"],
    }
    assert revisar_datos(datos, "x.json") == []
    assert validar_archivo(fixtures / "deben-pasar" / "horarios-casos-raros.json") == []


def test_no_canonico_se_detecta_sin_romper_el_resto(tmp_path: Path, fixtures: Path) -> None:
    """Un archivo valido pero mal formateado da un solo error, el de forma canonica."""
    datos = canon.cargar(fixtures / "deben-pasar" / "v1" / "vocabulario.json")
    ruta = tmp_path / "vocabulario.json"
    ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
    assert _reglas(validar_archivo(ruta)) == ["no-canonico"]
