"""Tests de C1 — triage: los controles baratos previos al schema."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from cuatris import canon
from cuatris.cli import main
from cuatris.validar import validar_archivo
from cuatris.validar.reporte import ERROR
from cuatris.validar.triage import (
    PROFUNDIDAD_MAXIMA,
    TAMANO_MAXIMO,
    profundidad,
    profundidad_del_texto,
    revisar_bytes,
    revisar_datos,
    revisar_texto,
)

# Reglas de C1 que cada fixture de `deben-fallar` tiene que disparar, y solo esa.
FIXTURES_C1 = {
    "clave-duplicada.json": "clave-duplicada",
    "bidi-override.json": "bidi-override",
    "no-canonico.json": "no-canonico",
    "correo-en-docente.json": "privacidad-correo",
    "contrato-major-ajeno.json": "contrato-incompatible",
    "fecha-inexistente.json": "fecha-invalida",
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
    hallazgos = validar_archivo(
        fixtures / "deben-fallar" / "hash-incorrecto" / "index.json"
    )
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
    assert _reglas(revisar_datos({"nota": "11 4321-1234"}, "x.json")) == [
        "privacidad-telefono"
    ]
    assert _reglas(revisar_datos({"nota": "legajo 61234"}, "x.json")) == [
        "privacidad-legajo"
    ]


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


def test_no_canonico_se_detecta_sin_romper_el_resto(
    tmp_path: Path, fixtures: Path
) -> None:
    """Un archivo valido pero mal formateado da un solo error, el de forma canonica."""
    datos = canon.cargar(fixtures / "deben-pasar" / "v1" / "vocabulario.json")
    ruta = tmp_path / "vocabulario.json"
    ruta.write_text(
        json.dumps(datos, ensure_ascii=False, indent=4) + "\n", encoding="utf-8"
    )
    assert _reglas(validar_archivo(ruta)) == ["no-canonico"]


# --- el major del contrato (F2.1) --------------------------------------------------------


def test_el_major_del_contrato_de_v1_es_1(fixtures: Path, tmp_path: Path) -> None:
    """Un archivo de `v1` que declara otro major es error: el corte va en el directorio."""
    datos = canon.cargar(fixtures / "deben-pasar" / "v1" / "vocabulario.json")
    ruta = tmp_path / "vocabulario.json"
    for version, esperado in (
        ("1.0.0", []),
        ("1.7.3", []),
        ("2.0.0", ["contrato-incompatible"]),
    ):
        ruta.write_text(
            canon.serializar({**datos, "contrato": version}), encoding="utf-8"
        )
        assert _reglas(validar_archivo(ruta)) == esperado, version


def test_el_major_ajeno_se_ve_en_los_cinco_tipos(
    fixtures: Path, tmp_path: Path
) -> None:
    """La regla no depende del tipo: los cinco schemas son de `v1`."""
    origen = {
        "index.json": fixtures / "deben-pasar" / "index.json",
        "vocabulario.json": fixtures / "deben-pasar" / "v1" / "vocabulario.json",
        "abreviaciones.json": fixtures / "deben-pasar" / "v1" / "abreviaciones.json",
        "planes.json": fixtures / "deben-pasar" / "v1" / "planes" / "S10-Rev23.json",
        "horarios.json": fixtures / "deben-pasar" / "c3-dictado-conjunto.json",
    }
    for nombre, ruta in origen.items():
        datos = {**canon.cargar(ruta), "contrato": "9.9.9"}
        destino = tmp_path / nombre
        destino.write_text(canon.serializar(datos), encoding="utf-8")
        assert "contrato-incompatible" in _reglas(validar_archivo(destino)), nombre


def test_un_contrato_ausente_o_mal_formado_lo_informa_c2(tmp_path: Path) -> None:
    """C1 no duplica el mensaje del schema: sin `contrato` valido se calla."""
    ruta = tmp_path / "vocabulario.json"
    ruta.write_text(canon.serializar({"sedes": []}), encoding="utf-8")
    assert "contrato-incompatible" not in _reglas(validar_archivo(ruta))


# --- fechas que no existen en el calendario (F2.4) ----------------------------------------


def test_una_fecha_con_la_forma_correcta_puede_no_existir() -> None:
    """El patron del schema acepta el 31 de septiembre; C1 construye la fecha."""
    assert revisar_datos({"desde": "2026-09-30", "hasta": "2026-12-31"}, "x.json") == []
    assert _reglas(revisar_datos({"hasta": "2026-09-31"}, "x.json")) == [
        "fecha-invalida"
    ]
    assert _reglas(revisar_datos({"al": "2026-02-30"}, "x.json")) == ["fecha-invalida"]
    assert _reglas(revisar_datos({"al": "2026-13-01"}, "x.json")) == ["fecha-invalida"]


def test_el_29_de_febrero_depende_del_anio() -> None:
    """2024 es bisiesto y 2026 no: la regla no puede ser un rango de dias."""
    assert revisar_datos({"al": "2024-02-29"}, "x.json") == []
    assert _reglas(revisar_datos({"al": "2026-02-29"}, "x.json")) == ["fecha-invalida"]


def test_lo_que_no_tiene_forma_de_fecha_no_se_toca() -> None:
    """La regla solo mira los strings que cumplen el patron entero del contrato."""
    datos = {
        "periodo": "2026-2C",
        "esperado": "2026-11",
        "aula": "001R",
        "hora": "14:00",
    }
    assert revisar_datos(datos, "x.json") == []


def test_la_fixture_de_fecha_inexistente_pasa_el_schema(fixtures: Path) -> None:
    """El caso vale porque el dia cae dentro del periodo: comparar strings no lo detecta."""
    datos = canon.cargar(fixtures / "deben-fallar" / "fecha-inexistente.json")
    assert datos["cursos"][0]["hasta"] == "2026-09-31"
    assert datos["periodo"]["desde"] < "2026-09-31" < datos["periodo"]["hasta"]


# --- el indice no puede mentir sobre el periodo (F2.2) ------------------------------------


def _indice_de_prueba(fixtures: Path, tmp_path: Path) -> Path:
    """Copia `deben-pasar` a un directorio escribible y devuelve su `index.json`."""
    destino = tmp_path / "data"
    shutil.copytree(fixtures / "deben-pasar", destino)
    return destino / "index.json"


def test_el_indice_declara_el_periodo_del_archivo(
    fixtures: Path, tmp_path: Path
) -> None:
    """Cambiar el periodo del indice sin tocar el archivo es un error, no un silencio."""
    ruta = _indice_de_prueba(fixtures, tmp_path)
    assert validar_archivo(ruta) == []
    datos = canon.cargar(ruta)
    datos["horarios"][0]["periodo"] = "2020-1C"
    ruta.write_text(canon.serializar(datos), encoding="utf-8")
    hallazgos = validar_archivo(ruta)
    assert _reglas(hallazgos) == ["periodo-incorrecto"]
    assert "2026-2C" in hallazgos[0].mensaje


def test_el_indice_declara_la_vigencia_del_archivo(
    fixtures: Path, tmp_path: Path
) -> None:
    """`desde` y `hasta` mandan sobre que periodo esta activo: tambien se comprueban."""
    ruta = _indice_de_prueba(fixtures, tmp_path)
    datos = canon.cargar(ruta)
    datos["horarios"][0]["desde"] = "2020-01-01"
    datos["horarios"][0]["hasta"] = "2020-12-31"
    ruta.write_text(canon.serializar(datos), encoding="utf-8")
    hallazgos = validar_archivo(ruta)
    assert _reglas(hallazgos) == ["periodo-incorrecto", "periodo-incorrecto"]
    assert all(hallazgo.nivel == ERROR for hallazgo in hallazgos)


def test_el_publicado_del_indice_no_sale_del_archivo(
    fixtures: Path, tmp_path: Path
) -> None:
    """`publicado` es del indice y no tiene con que compararse: no puede dar un falso error."""
    ruta = _indice_de_prueba(fixtures, tmp_path)
    datos = canon.cargar(ruta)
    datos["horarios"][0]["publicado"] = "2026-10-05"
    ruta.write_text(canon.serializar(datos), encoding="utf-8")
    assert validar_archivo(ruta) == []


# --- rutas del indice fuera del directorio de datos (F2.11) -------------------------------


def test_el_indice_no_sigue_una_ruta_fuera_del_directorio(
    fixtures: Path, tmp_path: Path
) -> None:
    """C1 corre antes que el schema: es esta capa la que no puede seguir un `..` del PR."""
    ruta = _indice_de_prueba(fixtures, tmp_path)
    afuera = tmp_path / "secreto.json"
    afuera.write_text(canon.serializar({"contrato": "1.0.0"}), encoding="utf-8")
    datos = canon.cargar(ruta)
    datos["vocabulario"]["archivo"] = "../secreto.json"
    ruta.write_text(canon.serializar(datos), encoding="utf-8")
    reglas = _reglas(validar_archivo(ruta))
    assert "archivo-fuera-del-directorio" in reglas
    assert "archivo-faltante" not in reglas
    assert "hash-incorrecto" not in reglas


def test_una_ruta_absoluta_del_indice_tampoco_se_abre(
    fixtures: Path, tmp_path: Path
) -> None:
    """Una ruta absoluta sale del directorio de datos aunque no lleve ningun `..`."""
    ruta = _indice_de_prueba(fixtures, tmp_path)
    datos = canon.cargar(ruta)
    datos["vocabulario"]["archivo"] = "/etc/passwd"
    ruta.write_text(canon.serializar(datos), encoding="utf-8")
    assert "archivo-fuera-del-directorio" in _reglas(validar_archivo(ruta))


# --- el tope de profundidad se aplica antes de parsear (F2.12) ----------------------------


def test_la_profundidad_del_texto_es_la_del_objeto(fixtures: Path) -> None:
    """Contar corchetes sobre el texto da lo mismo que recorrer el objeto ya parseado."""
    for texto in (
        '{"a": [{"b": 1}]}',
        "{}",
        '{"a": []}',
        '{"a": [[]]}',
        "[1, 2, 3]",
        '"hoja"',
    ):
        assert profundidad_del_texto(texto) == profundidad(canon.cargar_texto(texto)), (
            texto
        )
    for ruta in sorted((fixtures / "deben-pasar").rglob("*.json")):
        texto = canon.leer_texto(ruta)
        assert profundidad_del_texto(texto) == profundidad(canon.cargar_texto(texto)), (
            ruta
        )


def test_los_corchetes_dentro_de_un_string_no_cuentan() -> None:
    """Un nombre con llaves no es anidamiento."""
    assert profundidad_del_texto('{"nombre": "Algebra [{[{"}') == 1
    assert profundidad_del_texto('{"nombre": "comilla \\" y llave {"}') == 1


def test_un_json_de_miles_de_niveles_no_tumba_al_parser() -> None:
    """El parser de la biblioteca es recursivo: el tope se aplica sobre el texto."""
    texto = "[" * 3000 + "]" * 3000
    hallazgos, datos = revisar_texto(texto, "hondo.json")
    assert _reglas(hallazgos) == ["profundidad"]
    assert datos is None
    assert "2999" in hallazgos[0].mensaje


def test_un_archivo_ilegible_no_corta_el_lote(
    tmp_path: Path, fixtures: Path, capsys: pytest.CaptureFixture
) -> None:
    """N0-8: el archivo hondo es un hallazgo suyo y los que siguen se validan igual."""
    hondo = tmp_path / "hondo.json"
    hondo.write_text("[" * 3000 + "]" * 3000 + "\n", encoding="utf-8")
    malo = tmp_path / "vocabulario.json"
    datos = canon.cargar(fixtures / "deben-pasar" / "v1" / "vocabulario.json")
    datos["sedes"][0]["id"] = "Rectorado MAL"
    malo.write_text(canon.serializar(datos), encoding="utf-8")
    assert main(["validar", str(hondo), str(malo)]) == 1
    salida = capsys.readouterr().out.strip().splitlines()
    assert len(salida) == 2
    assert "el anidamiento llega a 2999" in salida[0]
    assert "sedes[0].id no cumple el patron" in salida[1]
