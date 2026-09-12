"""Tests de la forma canonica y del subcomando `cuatris fmt`."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from cuatris import canon
from cuatris.cli import main

MINIMO = {"contrato": "1.0.0", "sedes": [{"id": "rectorado", "nombre": "Rectorado"}]}


def test_serializar_es_la_forma_del_contrato() -> None:
    """Claves ordenadas, sangria de 2, acentos sin escapar y salto de linea final."""
    texto = canon.serializar({"b": 1, "a": "Álgebra"})
    assert texto == '{\n  "a": "Álgebra",\n  "b": 1\n}\n'


def test_serializar_es_idempotente() -> None:
    """Reserializar la forma canonica no la cambia."""
    una = canon.serializar(MINIMO)
    assert canon.serializar(canon.cargar_texto(una)) == una


def test_cargar_rechaza_claves_duplicadas(tmp_path: Path) -> None:
    """`{"a": 1, "a": 2}` es error: el humano lee una cosa y el parser usa otra."""
    ruta = tmp_path / "dup.json"
    ruta.write_text('{\n  "a": 1,\n  "a": 2\n}\n', encoding="utf-8")
    with pytest.raises(canon.ErrorClaveDuplicada) as error:
        canon.cargar(ruta)
    assert "«a»" in str(error.value)


def test_cargar_rechaza_bom(tmp_path: Path) -> None:
    """Un BOM al principio del archivo se rechaza con un mensaje propio."""
    ruta = tmp_path / "bom.json"
    ruta.write_bytes(canon.BOM_UTF8 + canon.serializar(MINIMO).encode("utf-8"))
    with pytest.raises(canon.ErrorCanonico, match="BOM"):
        canon.cargar(ruta)


def test_cargar_rechaza_crlf(tmp_path: Path) -> None:
    """Los finales de linea CRLF se rechazan con un mensaje propio."""
    ruta = tmp_path / "crlf.json"
    ruta.write_bytes(canon.serializar(MINIMO).replace("\n", "\r\n").encode("utf-8"))
    with pytest.raises(canon.ErrorCanonico, match="LF"):
        canon.cargar(ruta)


def test_esta_canonico_distingue_las_dos_formas(tmp_path: Path) -> None:
    """El mismo contenido escrito de otra manera no esta canonico."""
    bueno = tmp_path / "bueno.json"
    bueno.write_text(canon.serializar(MINIMO), encoding="utf-8")
    malo = tmp_path / "malo.json"
    malo.write_text(json.dumps(MINIMO, indent=4, sort_keys=False) + "\n", encoding="utf-8")
    assert canon.esta_canonico(bueno)
    assert not canon.esta_canonico(malo)


def test_hash_canonico_es_estable(tmp_path: Path, fixtures: Path) -> None:
    """El hash depende del contenido canonico, no de como este escrito el archivo."""
    original = fixtures / "deben-pasar" / "v1" / "vocabulario.json"
    esperado = canon.hash_canonico(original)
    assert canon.hash_canonico(original) == esperado
    assert esperado.startswith("sha256:")
    assert len(esperado) == len("sha256:") + 64

    desordenado = tmp_path / "desordenado.json"
    datos = canon.cargar(original)
    desordenado.write_text(
        json.dumps(datos, ensure_ascii=False, indent=4, sort_keys=False) + "\n", encoding="utf-8"
    )
    assert canon.hash_canonico(desordenado) == esperado


def test_fmt_reescribe_y_es_idempotente(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    """`cuatris fmt` deja el archivo canonico y una segunda corrida no lo toca."""
    ruta = tmp_path / "vocabulario.json"
    ruta.write_text(json.dumps(MINIMO, indent=4, sort_keys=False) + "\n", encoding="utf-8")

    assert main(["fmt", str(ruta)]) == 0
    primera = ruta.read_text(encoding="utf-8")
    assert primera == canon.serializar(MINIMO)

    capsys.readouterr()
    assert main(["fmt", str(ruta)]) == 0
    assert ruta.read_text(encoding="utf-8") == primera
    assert capsys.readouterr().out == ""


def test_fmt_check_no_escribe_y_muestra_diff(
    tmp_path: Path, capsys: pytest.CaptureFixture
) -> None:
    """`--check` sale con 1, deja el archivo intacto y muestra un diff unificado."""
    ruta = tmp_path / "vocabulario.json"
    crudo = json.dumps(MINIMO, indent=4, sort_keys=False) + "\n"
    ruta.write_text(crudo, encoding="utf-8")

    assert main(["fmt", "--check", str(ruta)]) == 1
    salida = capsys.readouterr().out
    assert ruta.read_text(encoding="utf-8") == crudo
    assert "no esta en forma canonica" in salida
    assert "---" in salida and "+++" in salida


def test_fmt_check_acepta_las_fixtures_que_deben_pasar(fixtures: Path) -> None:
    """Todas las fixtures de `deben-pasar` estan guardadas en forma canonica."""
    archivos = sorted(str(ruta) for ruta in (fixtures / "deben-pasar").rglob("*.json"))
    assert archivos
    assert main(["fmt", "--check", *archivos]) == 0


def test_fmt_sale_con_2_si_no_puede_abrir(tmp_path: Path, capsys: pytest.CaptureFixture) -> None:
    """Un archivo inexistente es un problema de invocacion, no de datos."""
    assert main(["fmt", "--check", str(tmp_path / "no-existe.json")]) == 2
    assert "no se pudo abrir" in capsys.readouterr().out
