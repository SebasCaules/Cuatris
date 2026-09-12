"""Tests de `cuatris indice actualizar`: el unico comando que escribe los hashes del indice."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from cuatris import canon, indice
from cuatris.cli import MODULOS_EXTERNOS, main
from cuatris.indice import ErrorIndice, actualizar
from cuatris.validar import validar_archivo

PERIODO = "2026-2C"
ARCHIVO_HORARIOS = f"v1/horarios/{PERIODO}.json"


@pytest.fixture
def datos(tmp_path: Path, raiz: Path, fixtures: Path) -> Path:
    """Un directorio de datos completo y desechable: plan, vocabulario, abreviaciones y horarios."""
    base = tmp_path / "data"
    shutil.copytree(raiz / "data" / "v1", base / "v1")
    (base / "v1" / "horarios").mkdir(parents=True, exist_ok=True)
    shutil.copy(
        fixtures / "deben-pasar" / "v1" / "horarios" / f"{PERIODO}.json",
        base / "v1" / "horarios" / f"{PERIODO}.json",
    )
    return base


def _indice(base: Path) -> dict:
    return canon.cargar(base / "index.json")


def test_actualizar_crea_el_indice_con_los_hashes_reales(datos: Path) -> None:
    """Los hashes que escribe el comando son los que comprueba C1: validar el indice da vacio."""
    ruta, cambio = actualizar(datos, publicado="2026-09-20")
    assert cambio is True
    assert ruta == datos / "index.json"
    assert validar_archivo(ruta) == []
    documento = _indice(datos)
    assert documento["contrato"] == "1.0.0"
    assert documento["actualizado"] == "2026-09-20"
    assert documento["planes"] == [
        {
            "archivo": "v1/planes/S10-Rev23.json",
            "hash": canon.hash_canonico(datos / "v1" / "planes" / "S10-Rev23.json"),
            "plan": "S10-Rev23",
        }
    ]
    assert documento["vocabulario"]["archivo"] == "v1/vocabulario.json"
    assert documento["abreviaciones"]["archivo"] == "v1/abreviaciones.json"


def test_la_entrada_de_horarios_sale_del_propio_archivo(datos: Path) -> None:
    """`periodo`, `desde` y `hasta` se leen del archivo de horarios; el archivo manda."""
    actualizar(datos, publicado="2026-09-20")
    horarios = _indice(datos)["horarios"]
    assert horarios == [
        {
            "archivo": ARCHIVO_HORARIOS,
            "desde": "2026-07-26",
            "hash": canon.hash_canonico(datos / ARCHIVO_HORARIOS),
            "hasta": "2026-12-31",
            "periodo": PERIODO,
            "publicado": "2026-09-20",
        }
    ]


def test_actualizar_es_idempotente(datos: Path) -> None:
    """Correrlo dos veces seguidas no toca el archivo la segunda vez."""
    actualizar(datos, publicado="2026-09-20")
    primero = (datos / "index.json").read_bytes()
    _, cambio = actualizar(datos, publicado="2026-10-01")
    assert cambio is False
    assert (datos / "index.json").read_bytes() == primero


def test_conserva_publicado_y_horarios_esperados(datos: Path) -> None:
    """Lo curado a mano no se pisa: `publicado` de un periodo ya conocido y los esperados."""
    actualizar(datos, publicado="2026-09-20")
    documento = _indice(datos)
    documento["horarios_esperados"] = {"2027-1C": "2026-11"}
    (datos / "index.json").write_text(canon.serializar(documento), encoding="utf-8", newline="\n")

    archivo = datos / ARCHIVO_HORARIOS
    horarios = canon.cargar(archivo)
    horarios["fuente"]["capturado"] = "2026-10-05"
    archivo.write_text(canon.serializar(horarios), encoding="utf-8", newline="\n")

    _, cambio = actualizar(datos, publicado="2026-10-05")
    assert cambio is True
    nuevo = _indice(datos)
    assert nuevo["horarios"][0]["publicado"] == "2026-09-20"
    assert nuevo["horarios_esperados"] == {"2027-1C": "2026-11"}
    assert nuevo["horarios"][0]["hash"] == canon.hash_canonico(archivo)
    assert nuevo["actualizado"] == "2026-10-05"


def test_un_periodo_nuevo_toma_la_fecha_de_publicado(datos: Path, fixtures: Path) -> None:
    """`--publicado` fija la fecha de las entradas nuevas, no de las que ya estaban."""
    actualizar(datos, publicado="2026-09-20")
    origen = fixtures / "deben-pasar" / "horarios-casos-raros.json"
    destino = datos / "v1" / "horarios" / "2027-1C.json"
    documento = canon.cargar(origen)
    documento["periodo"] = {
        "anio": 2027,
        "cuatrimestre": "1C",
        "desde": "2027-03-09",
        "hasta": "2027-07-17",
        "id": "2027-1C",
    }
    for curso in documento["cursos"]:
        curso["desde"] = "2027-03-09"
        curso["hasta"] = "2027-07-17"
    destino.write_text(canon.serializar(documento), encoding="utf-8", newline="\n")

    actualizar(datos, publicado="2026-11-02")
    entradas = {entrada["periodo"]: entrada for entrada in _indice(datos)["horarios"]}
    assert entradas[PERIODO]["publicado"] == "2026-09-20"
    assert entradas["2027-1C"]["publicado"] == "2026-11-02"
    assert entradas["2027-1C"]["desde"] == "2027-03-09"
    assert validar_archivo(datos / "index.json") == []


def test_sin_publicado_se_usa_la_fecha_de_hoy(datos: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """La fecha por defecto es la de hoy, en la forma del contrato."""
    monkeypatch.setattr(indice, "_hoy", lambda: "2026-09-12")
    actualizar(datos)
    assert _indice(datos)["actualizado"] == "2026-09-12"


def test_una_fecha_mal_formada_no_escribe_nada(datos: Path) -> None:
    """Una fecha invalida corta antes de tocar el indice."""
    with pytest.raises(ErrorIndice, match="YYYY-MM-DD"):
        actualizar(datos, publicado="02/11/2026")
    with pytest.raises(ErrorIndice):
        actualizar(datos, publicado="2026-02-30")
    assert not (datos / "index.json").exists()


def test_falla_si_falta_un_archivo_referido(datos: Path) -> None:
    """Un indice al que se le cae una entrada en silencio apaga datos que la pagina servia."""
    actualizar(datos, publicado="2026-09-20")
    (datos / ARCHIVO_HORARIOS).unlink()
    with pytest.raises(ErrorIndice, match=ARCHIVO_HORARIOS):
        actualizar(datos, publicado="2026-09-21")


def test_falla_si_falta_el_vocabulario(datos: Path) -> None:
    """El vocabulario y las abreviaciones son entradas obligatorias del indice."""
    (datos / "v1" / "vocabulario.json").unlink()
    with pytest.raises(ErrorIndice, match="vocabulario"):
        actualizar(datos, publicado="2026-09-20")


def test_falla_si_el_directorio_no_existe(tmp_path: Path) -> None:
    """`--data` tiene que apuntar a un directorio de datos de verdad."""
    with pytest.raises(ErrorIndice, match="directorio de datos"):
        actualizar(tmp_path / "no-existe")


def test_falla_si_un_horario_no_declara_periodo(datos: Path) -> None:
    """Las entradas nuevas salen del propio archivo: sin `periodo` no hay entrada posible."""
    archivo = datos / ARCHIVO_HORARIOS
    documento = canon.cargar(archivo)
    del documento["periodo"]
    archivo.write_text(canon.serializar(documento), encoding="utf-8", newline="\n")
    with pytest.raises(ErrorIndice, match="periodo"):
        actualizar(datos, publicado="2026-09-20")


def test_el_subcomando_de_la_cli(datos: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """`cuatris indice actualizar --data <dir>` escribe el indice y sale con 0.

    El registro de `indice` en `MODULOS_EXTERNOS` es del orquestador (ver W2-1, «Convencion
    de subcomandos»), asi que este test no lo pisa cuando ya esta: solo lo agrega si falta,
    para probar el modulo sin depender de una linea que no es de esta unidad.
    """
    if MODULOS_EXTERNOS.get("indice") is None:
        monkeypatch.setitem(MODULOS_EXTERNOS, "indice", "cuatris.indice")
    assert MODULOS_EXTERNOS["indice"] == "cuatris.indice"
    assert main(["indice", "actualizar", "--data", str(datos), "--publicado", "2026-09-20"]) == 0
    assert (datos / "index.json").is_file()
    assert main(["validar", str(datos / "index.json"), "--data", str(datos)]) == 0


def test_falla_si_sobra_un_json_dentro_de_v1(datos: Path) -> None:
    """Un JSON que el comando no sabe indexar no se sirve: callarlo lo vuelve invisible."""
    (datos / "v1" / "inventado.json").write_text("{}\n", encoding="utf-8", newline="\n")
    with pytest.raises(ErrorIndice, match="v1/inventado.json"):
        actualizar(datos, publicado="2026-09-20")
    assert not (datos / "index.json").exists()


def test_falla_si_dos_horarios_declaran_el_mismo_periodo(datos: Path) -> None:
    """La pagina sirve un archivo por periodo: dos entradas con el mismo `periodo` mienten."""
    copia = datos / "v1" / "horarios" / "copia.json"
    shutil.copy(datos / ARCHIVO_HORARIOS, copia)
    with pytest.raises(ErrorIndice, match=PERIODO):
        actualizar(datos, publicado="2026-09-20")
    assert not (datos / "index.json").exists()


def test_el_modulo_cumple_la_convencion_de_subcomandos() -> None:
    """`cli.py` pide `AYUDA`, `configurar(parser)` y `ejecutar(args)`."""
    assert isinstance(indice.AYUDA, str) and indice.AYUDA
    assert callable(indice.configurar)
    assert callable(indice.ejecutar)
