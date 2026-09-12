"""Tests de C2 — JSON Schema, deduccion de tipo y subcomando `cuatris validar`."""

from __future__ import annotations

from pathlib import Path

import pytest
from cuatris.cli import main
from cuatris.validar import TIPOS, deducir_tipo, validar_archivo
from cuatris.validar.esquema import DIRECTORIO_SCHEMAS, compilar, esquema_de

# Reglas de C2 que cada fixture de `deben-fallar` tiene que disparar, y solo esa.
FIXTURES_C2 = {
    "aulas-string.json": ("schema", "aulas debe ser de tipo array"),
    "campo-desconocido.json": ("campo-desconocido", "campo desconocido «aula»"),
    "codigo-sin-punto.json": ("schema", "codigo no cumple el patron"),
    "dia-domingo.json": ("schema", "dia debe ser uno de"),
    "fecha-con-hora.json": ("schema", "periodo.desde no cumple el patron"),
    "hora-mal-formada.json": ("schema", "bloques[0].desde no cumple el patron"),
}


def _reglas(hallazgos) -> list[str]:
    return [hallazgo.regla for hallazgo in hallazgos]


@pytest.mark.parametrize("tipo", TIPOS)
def test_los_cinco_schemas_existen_y_compilan(tipo: str) -> None:
    """Cada tipo del contrato tiene su schema draft-07 y `fastjsonschema` lo acepta."""
    esquema = esquema_de(tipo)
    assert esquema["$schema"] == "http://json-schema.org/draft-07/schema#"
    assert esquema["$id"] == (
        f"https://sebascaules.github.io/Cuatris/schemas/v1/{tipo}.schema.json"
    )
    assert esquema["additionalProperties"] is False
    assert compilar(tipo) is not None


@pytest.mark.parametrize("tipo", TIPOS)
def test_cada_campo_tiene_descripcion(tipo: str) -> None:
    """Ningun campo del contrato queda sin una linea que lo explique."""
    sin_descripcion: list[str] = []

    def recorrer(nodo: object, ruta: str) -> None:
        if not isinstance(nodo, dict):
            return
        for clave, hijo in nodo.get("properties", {}).items():
            if isinstance(hijo, dict) and "description" not in hijo and "$ref" not in hijo:
                sin_descripcion.append(f"{ruta}.{clave}")
            recorrer(hijo, f"{ruta}.{clave}")
        for clave, hijo in nodo.get("definitions", {}).items():
            recorrer(hijo, f"{ruta}#{clave}")
        for clave in ("items",):
            if isinstance(nodo.get(clave), dict):
                recorrer(nodo[clave], f"{ruta}[]")

    recorrer(esquema_de(tipo), tipo)
    assert sin_descripcion == []


def test_todas_las_fixtures_que_deben_pasar_validan(fixtures: Path) -> None:
    """Ningun archivo de `deben-pasar` produce errores ni advertencias."""
    archivos = sorted((fixtures / "deben-pasar").rglob("*.json"))
    assert len(archivos) == 6
    for ruta in archivos:
        assert validar_archivo(ruta) == [], f"{ruta} deberia validar sin hallazgos"


def test_los_siete_casos_raros_validan_sin_advertencias(fixtures: Path) -> None:
    """Si el schema rechaza uno de los siete casos reales, el schema esta mal."""
    ruta = fixtures / "deben-pasar" / "horarios-casos-raros.json"
    assert validar_archivo(ruta) == []

    from cuatris import canon

    datos = canon.cargar(ruta)
    cursos = {curso["codigo"]: curso for curso in datos["cursos"]}
    algebra = cursos["93.18"]
    comisiones = {comision["id"]: comision for comision in algebra["comisiones"]}

    # Letras no contiguas: A-H y K.
    assert sorted(comisiones) == ["A", "B", "C", "D", "E", "F", "G", "H", "K"]
    # Un bloque en dos aulas a la vez.
    assert ["003T", "004T"] in [bloque["aulas"] for bloque in comisiones["B"]["bloques"]]
    assert ["202R", "203R"] in [bloque["aulas"] for bloque in comisiones["K"]["bloques"]]
    # Comision que cruza sedes.
    assert {bloque["sede"] for bloque in comisiones["A"]["bloques"]} == {"rectorado", "sdt"}
    # Cupo completo.
    assert comisiones["A"]["cupo"]["capacidad"] == comisiones["A"]["ocupacion"]["inscriptos"] == 48
    # Comision con identificador que no es una letra de la serie.
    assert [comision["id"] for comision in cursos["72.44"]["comisiones"]] == ["S"]
    # Modalidades mixtas dentro de una comision.
    modalidades = {b["modalidad"] for b in cursos["30.28"]["comisiones"][0]["bloques"]}
    assert modalidades == {"blended", "presencial"}
    # Periodo corto.
    assert (cursos["15.09"]["desde"], cursos["15.09"]["hasta"]) == ("2026-09-18", "2026-10-16")
    # Homonimas con distinto codigo.
    assert cursos["23.05"]["nombre"] == cursos["25.66"]["nombre"] == "Acústica para Ingenieros"


@pytest.mark.parametrize(("nombre", "esperado"), sorted(FIXTURES_C2.items()))
def test_fixture_que_debe_fallar_en_c2(
    fixtures: Path, nombre: str, esperado: tuple[str, str]
) -> None:
    """Cada fixture de C2 produce exactamente el error esperado."""
    regla, fragmento = esperado
    hallazgos = validar_archivo(fixtures / "deben-fallar" / nombre)
    assert _reglas(hallazgos) == [regla]
    assert fragmento in hallazgos[0].mensaje


def test_el_campo_desconocido_pide_un_pr_aparte(fixtures: Path) -> None:
    """El falso positivo aceptado a conciencia se explica en el propio mensaje."""
    hallazgos = validar_archivo(fixtures / "deben-fallar" / "campo-desconocido.json")
    assert hallazgos[0].mensaje.endswith(
        "si el dato es real, hay que actualizar el schema en un PR aparte"
    )


@pytest.mark.parametrize(
    ("ruta", "tipo"),
    [
        ("data/v1/horarios/2026-2C.json", "horarios"),
        ("data/v1/planes/S10-Rev23.json", "planes"),
        ("data/v1/abreviaciones.json", "abreviaciones"),
        ("data/v1/vocabulario.json", "vocabulario"),
        ("data/index.json", "index"),
    ],
)
def test_deduccion_de_tipo_por_ruta(ruta: str, tipo: str) -> None:
    """El tipo sale de la ruta del contrato, sin mirar el contenido."""
    assert deducir_tipo(ruta) == tipo


def test_deduccion_de_tipo_por_contenido(fixtures: Path) -> None:
    """Fuera de `data/`, el tipo se deduce de la forma del documento."""
    from cuatris import canon

    datos = canon.cargar(fixtures / "deben-fallar" / "dia-domingo.json")
    assert deducir_tipo(fixtures / "deben-fallar" / "dia-domingo.json", datos) == "horarios"
    assert deducir_tipo("suelto.json") is None


def test_tipo_forzado_desde_la_linea_de_comandos(fixtures: Path) -> None:
    """`--tipo` fuerza el schema aunque la ruta y el contenido digan otra cosa."""
    ruta = fixtures / "deben-pasar" / "v1" / "vocabulario.json"
    assert validar_archivo(ruta) == []
    hallazgos = validar_archivo(ruta, tipo="abreviaciones")
    assert _reglas(hallazgos) == ["schema"]
    assert "«abreviaciones»" in hallazgos[0].mensaje


def test_validar_sale_con_0_sin_errores(fixtures: Path) -> None:
    """`cuatris validar` sobre las fixtures buenas sale con 0."""
    archivos = [str(ruta) for ruta in sorted((fixtures / "deben-pasar").glob("*.json"))]
    assert main(["validar", *archivos]) == 0


def test_validar_sale_con_1_con_errores(fixtures: Path, capsys: pytest.CaptureFixture) -> None:
    """Con errores sale con 1 e imprime una linea por hallazgo."""
    ruta = fixtures / "deben-fallar" / "dia-domingo.json"
    assert main(["validar", str(ruta)]) == 1
    salida = capsys.readouterr().out.strip().splitlines()
    assert len(salida) == 1
    assert salida[0].startswith(f"ERROR {ruta}: ")


def test_validar_sale_con_2_si_no_puede_abrir(tmp_path: Path) -> None:
    """Un archivo que no se puede abrir es codigo 2, distinto de «hay errores»."""
    assert main(["validar", str(tmp_path / "no-existe.json")]) == 2


def test_los_schemas_del_repositorio_estan_canonicos() -> None:
    """Los schemas tambien son datos: se guardan en la forma canonica del contrato."""
    archivos = sorted(str(ruta) for ruta in DIRECTORIO_SCHEMAS.glob("*.schema.json"))
    assert len(archivos) == len(TIPOS)
    assert main(["fmt", "--check", *archivos]) == 0
