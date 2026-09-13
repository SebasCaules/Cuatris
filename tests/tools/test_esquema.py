"""Tests de C2 — JSON Schema, deduccion de tipo y subcomando `cuatris validar`."""

from __future__ import annotations

from pathlib import Path

import pytest
from cuatris.cli import main
from cuatris.validar import TIPOS, deducir_tipo, esquema, hay_errores, validar_archivo
from cuatris.validar.esquema import DIRECTORIO_SCHEMAS, compilar, esquema_de

# Reglas de C2 que cada fixture de `deben-fallar` tiene que disparar, y solo esa.
FIXTURES_C2 = {
    "aulas-string.json": ("schema", "aulas debe ser de tipo array"),
    "campo-desconocido.json": ("campo-desconocido", "campo desconocido «aula»"),
    "codigo-sin-punto.json": ("schema", "codigo no cumple el patron"),
    "dia-invalido.json": ("schema", "dia debe ser uno de"),
    "fecha-con-hora.json": ("schema", "periodo.desde no cumple el patron"),
    "hora-mal-formada.json": ("schema", "bloques[0].desde no cumple el patron"),
}


def _reglas(hallazgos) -> list[str]:
    return [hallazgo.regla for hallazgo in hallazgos]


def _horarios_con(campo: str, valor: str) -> dict:
    """Un documento de horarios minimo con `campo` puesto en `valor` en su unico bloque."""
    bloque = {
        "aulas": [],
        "desde": "13:00",
        "dia": "lunes",
        "hasta": "14:00",
        "modalidad": "virtual_asincronica",
        "sede": None,
    }
    bloque[campo] = valor
    return {
        "contrato": "1.1.0",
        "cursos": [
            {
                "codigo": "61.27",
                "comisiones": [{"bloques": [bloque], "docentes": [], "id": "A"}],
                "desde": "2026-07-26",
                "dictado_conjunto": [],
                "hasta": "2026-12-31",
                "nombre": "Análisis de Coyuntura Económica",
            }
        ],
        "fuente": {"capturado": "2026-09-12", "sistema": "sga"},
        "periodo": {
            "anio": 2026,
            "cuatrimestre": "2C",
            "desde": "2026-07-26",
            "hasta": "2026-12-31",
            "id": "2026-2C",
        },
    }


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
            if (
                isinstance(hijo, dict)
                and "description" not in hijo
                and "$ref" not in hijo
            ):
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
    """Ningun archivo de `deben-pasar` produce errores.

    Advertencias si puede haber: `c3-docente-repetido.json` existe justamente para producir
    una (`colision-de-docente` es warning por diseño, nunca error).
    """
    archivos = sorted((fixtures / "deben-pasar").rglob("*.json"))
    assert len(archivos) >= 6
    for ruta in archivos:
        hallazgos = validar_archivo(ruta)
        assert not hay_errores(hallazgos), (
            f"{ruta} deberia validar sin errores: {hallazgos}"
        )


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
    assert ["003T", "004T"] in [
        bloque["aulas"] for bloque in comisiones["B"]["bloques"]
    ]
    assert ["202R", "203R"] in [
        bloque["aulas"] for bloque in comisiones["K"]["bloques"]
    ]
    # Comision que cruza sedes.
    assert {bloque["sede"] for bloque in comisiones["A"]["bloques"]} == {
        "rectorado",
        "sdt",
    }
    # Cupo completo.
    assert (
        comisiones["A"]["cupo"]["capacidad"]
        == comisiones["A"]["ocupacion"]["inscriptos"]
        == 48
    )
    # Comision con identificador que no es una letra de la serie.
    assert [comision["id"] for comision in cursos["72.44"]["comisiones"]] == ["S"]
    # Modalidades mixtas dentro de una comision.
    modalidades = {b["modalidad"] for b in cursos["30.28"]["comisiones"][0]["bloques"]}
    assert modalidades == {"blended", "presencial"}
    # Periodo corto.
    assert (cursos["15.09"]["desde"], cursos["15.09"]["hasta"]) == (
        "2026-09-18",
        "2026-10-16",
    )
    # Homonimas con distinto codigo.
    assert (
        cursos["23.05"]["nombre"]
        == cursos["25.66"]["nombre"]
        == "Acústica para Ingenieros"
    )


def test_el_contrato_1_1_0_admite_domingo_y_virtual(fixtures: Path) -> None:
    """N0-28: los dos valores que trajo la corrida real del 2026-09-12 validan sin ruido.

    61.27 dicta en las cuatro comisiones un bloque virtual asincronico **en domingo**, y
    25.20 com. K publica un bloque «Virtual» a secas, sin decir si es sincronica. Si el
    schema los rechaza, el scraper no puede publicar el cuatrimestre.
    """
    from cuatris import canon

    ruta = fixtures / "deben-pasar" / "horarios-domingo-virtual.json"
    assert validar_archivo(ruta) == []

    datos = canon.cargar(ruta)
    assert datos["contrato"] == "1.1.0"
    cursos = {curso["codigo"]: curso for curso in datos["cursos"]}

    comisiones = {c["id"]: c for c in cursos["61.27"]["comisiones"]}
    assert sorted(comisiones) == ["A", "B", "C", "D"]
    for comision in comisiones.values():
        domingos = [b for b in comision["bloques"] if b["dia"] == "domingo"]
        assert len(domingos) == 1
        assert domingos[0]["modalidad"] == "virtual_asincronica"
        # Un bloque virtual no ocupa aula ni sede: por eso `sede` admite `null`.
        assert domingos[0]["sede"] is None
        assert domingos[0]["aulas"] == []

    bloques = cursos["25.20"]["comisiones"][0]["bloques"]
    virtual = [b for b in bloques if b["modalidad"] == "virtual"]
    assert len(virtual) == 1
    assert (virtual[0]["dia"], virtual[0]["desde"], virtual[0]["hasta"]) == (
        "miercoles",
        "15:00",
        "18:00",
    )
    assert virtual[0]["sede"] is None


@pytest.mark.parametrize(
    ("campo", "valor"),
    [
        ("dia", "lunes"),
        ("dia", "sabado"),
        ("dia", "domingo"),
        ("modalidad", "presencial"),
        ("modalidad", "virtual_sincronica"),
        ("modalidad", "virtual_asincronica"),
        ("modalidad", "virtual"),
        ("modalidad", "blended"),
    ],
)
def test_los_enum_del_bloque_aceptan_todos_sus_valores(campo: str, valor: str) -> None:
    """Cada valor del enum de `dia` y de `modalidad` pasa el schema."""
    assert esquema.revisar(_horarios_con(campo, valor), "horarios", "prueba.json") == []


@pytest.mark.parametrize(
    ("campo", "valor"),
    [
        ("dia", "sábado"),
        ("dia", "domingos"),
        ("dia", "Domingo"),
        ("modalidad", "Virtual"),
        ("modalidad", "virtual_asincronico"),
    ],
)
def test_un_valor_fuera_del_enum_del_bloque_sigue_rechazado(
    campo: str, valor: str
) -> None:
    """Extender un enum no es abrirlo: lo que no esta en la lista sigue siendo error."""
    hallazgos = esquema.revisar(_horarios_con(campo, valor), "horarios", "prueba.json")
    assert _reglas(hallazgos) == ["schema"]
    assert f"{campo} debe ser uno de" in hallazgos[0].mensaje


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

    datos = canon.cargar(fixtures / "deben-fallar" / "dia-invalido.json")
    assert (
        deducir_tipo(fixtures / "deben-fallar" / "dia-invalido.json", datos)
        == "horarios"
    )
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


def test_validar_sale_con_1_con_errores(
    fixtures: Path, capsys: pytest.CaptureFixture
) -> None:
    """Con errores sale con 1 e imprime una linea por hallazgo."""
    ruta = fixtures / "deben-fallar" / "dia-invalido.json"
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


# --- el corpus de ejemplo de la app tambien es del contrato (F2.7) ------------------------


def _archivos_del_ejemplo(raiz: Path) -> list[Path]:
    ejemplo = raiz / "app" / "src" / "datos" / "ejemplo"
    return [ejemplo / "index.json", *sorted((ejemplo / "v1").rglob("*.json"))]


def test_el_corpus_de_ejemplo_de_la_app_cumple_el_contrato(raiz: Path) -> None:
    """Tiene forma de documento del contrato: el contrato tambien lo manda.

    Es el corpus contra el que corren los tests de `app/src/datos/`: si es mas permisivo que
    `data/`, la app pasa sus pruebas con datos que el validador rechaza al publicarlos.
    """
    from cuatris.validar import contexto_de_datos

    ejemplo = raiz / "app" / "src" / "datos" / "ejemplo"
    contexto = contexto_de_datos(ejemplo)
    for ruta in _archivos_del_ejemplo(raiz):
        hallazgos = validar_archivo(ruta, contexto=contexto)
        assert not hay_errores(hallazgos), f"{ruta}: {hallazgos}"


def test_el_corpus_de_ejemplo_esta_canonico_y_con_los_hashes_al_dia(raiz: Path) -> None:
    """Si cambia un archivo hay que rehacer el indice: el hash lo dice."""
    from cuatris import canon

    for ruta in _archivos_del_ejemplo(raiz):
        assert canon.esta_canonico(ruta), ruta


def test_el_vocabulario_de_ejemplo_tiene_las_sedes_observadas(raiz: Path) -> None:
    """N0-9: solo sedes observadas. `sdf` entro el 2026-09-12: la corrida real del scraper
    mostro «Sede Distrito Financiero» en el detalle de un curso."""
    from cuatris import canon

    ejemplo = raiz / "app" / "src" / "datos" / "ejemplo" / "v1" / "vocabulario.json"
    publicado = raiz / "data" / "v1" / "vocabulario.json"
    sedes = [sede["id"] for sede in canon.cargar(ejemplo)["sedes"]]
    assert sedes == [sede["id"] for sede in canon.cargar(publicado)["sedes"]]
    assert sedes == ["rectorado", "sdf", "sdt"]
