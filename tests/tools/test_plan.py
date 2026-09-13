"""Tests del importador del plan de estudios contra el corpus anonimizado."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import openpyxl
import pytest
from cuatris import plan as modulo

#: Los créditos de estas dos materias difieren entre el Excel y el SGA; el importador aborta si
#: nadie decide, así que el comando publicado (y estos tests) pasan la decisión explícita.
#: Ver `docs/plan-de-estudios.md`.
CREDITOS_DECIDIDOS = {"72.23": 6, "72.70": 3}


@pytest.fixture(scope="session")
def rutas(corpus: Path) -> dict[str, Path]:
    return {
        "excel": corpus / "plan" / "Plan S10-Rev23.xlsx",
        "sga": corpus / "plan" / "materias-carrera-info.html",
        "titulos": corpus / "plan" / "oferta-carrera-info-titulos.html",
    }


@pytest.fixture(scope="session")
def importado(rutas: dict[str, Path]) -> tuple[dict, dict]:
    return modulo.importar_plan(
        rutas["excel"], rutas["sga"], rutas["titulos"], CREDITOS_DECIDIDOS
    )


@pytest.fixture(scope="session")
def plan_json(importado: tuple[dict, dict]) -> dict:
    return importado[0]


@pytest.fixture(scope="session")
def materias(plan_json: dict) -> dict[str, dict]:
    return {m["codigo"]: m for m in plan_json["materias"]}


# --------------------------------------------------------------------------- conteos


def test_conteos(plan_json: dict) -> None:
    materias = plan_json["materias"]
    assert len(materias) == 163
    vigentes = [m for m in materias if m["vigente"]]
    assert len(vigentes) == 129
    assert len([m for m in vigentes if m["ciclo"] != "electiva"]) == 44
    assert len([m for m in vigentes if m["ciclo"] == "electiva"]) == 85
    # Las 34 que solo están en el SGA entran como electivas no vigentes.
    no_vigentes = [m for m in materias if not m["vigente"]]
    assert len(no_vigentes) == 34
    assert {m["ciclo"] for m in no_vigentes} == {"electiva"}


def test_ciclos_y_cuatrimestres(plan_json: dict) -> None:
    for materia in plan_json["materias"]:
        assert materia["ciclo"] in {"basico", "profesional", "electiva"}
        if materia["ciclo"] == "electiva":
            assert materia["cuatrimestre_sugerido"] is None
            continue
        assert 1 <= materia["cuatrimestre_sugerido"] <= 10
        assert materia["minors"] == []


def test_codigos_unicos_y_con_forma(plan_json: dict) -> None:
    codigos = [m["codigo"] for m in plan_json["materias"]]
    assert len(set(codigos)) == len(codigos)
    for codigo in codigos:
        assert re.fullmatch(r"\d{2}\.\d{2}", codigo), codigo


# --------------------------------------------------------------------------- casos puntuales


def test_proyecto_final(materias: dict[str, dict]) -> None:
    proyecto = materias["72.45"]
    assert proyecto["nombre"] == "Proyecto Final"
    assert proyecto["creditos"] == 12
    assert proyecto["creditos_requeridos"] == 160
    # Año 5, cuatrimestre 1 → (5 - 1) * 2 + 1
    assert proyecto["cuatrimestre_sugerido"] == 9
    assert proyecto["ciclo"] == "profesional"


def test_programacion_imperativa(materias: dict[str, dict]) -> None:
    imperativa = materias["72.31"]
    assert imperativa["correlativas"] == ["93.58", "72.03"]
    assert imperativa["cuatrimestre_sugerido"] == 2
    assert imperativa["ciclo"] == "basico"


def test_bioinformatica_suma_al_minor_de_ciencia_de_datos(
    materias: dict[str, dict],
) -> None:
    bioinformatica = materias["16.50"]
    assert bioinformatica["minors"] == ["CD"]
    assert bioinformatica["correlativas"] == ["72.37"]
    assert bioinformatica["ciclo"] == "electiva"
    assert bioinformatica["vigente"] is True


def test_items_de_cero_creditos(materias: dict[str, dict]) -> None:
    for codigo in ("94.51", "94.52", "72.98"):
        assert materias[codigo]["creditos"] == 0
        assert materias[codigo]["vigente"] is True


def test_fila_repetida_del_excel_se_une(materias: dict[str, dict]) -> None:
    # 73.82 aparece dos veces en la hoja Electivas: idénticas salvo la marca de minor.
    assert materias["73.82"]["minors"] == ["CD"]


def test_creditos_decididos_a_mano(
    materias: dict[str, dict], importado: tuple[dict, dict]
) -> None:
    reporte = importado[1]
    diferencias = {d["codigo"]: d for d in reporte["diferencias_creditos"]}
    assert set(diferencias) == set(CREDITOS_DECIDIDOS)
    assert diferencias["72.23"]["excel"] == 6 and diferencias["72.23"]["sga"] == 1
    assert diferencias["72.70"]["excel"] == 3 and diferencias["72.70"]["sga"] == 1
    for codigo, decidido in CREDITOS_DECIDIDOS.items():
        assert diferencias[codigo]["decidido"] == decidido
        assert materias[codigo]["creditos"] == decidido


def test_nombres_salen_del_sga(materias: dict[str, dict]) -> None:
    assert materias["73.40"]["nombre"] == "ARQUITECTURA DE MICROSERVICIOS"
    assert materias["72.90"]["nombre"] == "Internet de las Cosas (IoT)"


# --------------------------------------------------------------------------- plan


def test_titulos(plan_json: dict) -> None:
    titulos = {t["id"]: t for t in plan_json["titulos"]}
    assert titulos["analista"]["creditos"] == 147
    assert titulos["bachiller"]["creditos"] == 192
    assert titulos["ingeniero"]["creditos"] == 243
    assert titulos["analista"]["tipo"] == "intermedio"
    assert titulos["ingeniero"]["tipo"] == "principal"
    assert titulos["ingeniero"]["requiere_ciclos"] == ["basico", "profesional"]
    assert titulos["ingeniero"]["requiere_electivas"] == 27
    # Las cuatro «Orientación» de 0 créditos del SGA no son títulos del plan.
    assert len(plan_json["titulos"]) == 3


def test_minors(plan_json: dict) -> None:
    minors = plan_json["minors"]
    assert [m["sigla"] for m in minors] == ["CD", "IA", "IRV", "ARQ"]
    assert all(m["creditos_minimos"] == 14 for m in minors)
    # El Excel trae «Arqitectura de Software»; se corrige al cargar.
    assert {m["sigla"]: m["nombre"] for m in minors}[
        "ARQ"
    ] == "Arquitectura de Software"


def test_electivas(plan_json: dict) -> None:
    assert plan_json["electivas"] == {"creditos_requeridos": 27}
    assert plan_json["contrato"] == "1.0.0"
    assert plan_json["plan"] == "S10-Rev23"
    assert plan_json["carrera"] == "Ingeniería en Informática"


def test_todas_las_correlativas_existen(plan_json: dict) -> None:
    codigos = {m["codigo"] for m in plan_json["materias"]}
    for materia in plan_json["materias"]:
        for correlativa in materia["correlativas"]:
            assert correlativa in codigos, f"{materia['codigo']} → {correlativa}"


def test_grafo_de_correlativas_sin_ciclos(plan_json: dict) -> None:
    assert modulo.buscar_ciclos_correlativas(plan_json["materias"]) == []


def test_buscar_ciclos_detecta_un_ciclo() -> None:
    materias = [
        {"codigo": "11.11", "correlativas": ["22.22"]},
        {"codigo": "22.22", "correlativas": ["33.33"]},
        {"codigo": "33.33", "correlativas": ["11.11"]},
    ]
    ciclos = modulo.buscar_ciclos_correlativas(materias)
    assert ciclos, "tenía que encontrar el ciclo 11.11 → 22.22 → 33.33 → 11.11"
    assert set(ciclos[0]) == {"11.11", "22.22", "33.33"}


# --------------------------------------------------------------------------- forma del archivo


def test_archivo_publicado_es_el_que_produce_el_comando(
    raiz: Path, plan_json: dict
) -> None:
    publicado = (raiz / "data" / "v1" / "planes" / "S10-Rev23.json").read_text(
        encoding="utf-8"
    )
    assert publicado == modulo.serializar_canonico(plan_json)


def test_se_regenera_identico(rutas: dict[str, Path], tmp_path: Path) -> None:
    bytes_por_corrida = []
    for numero in (1, 2):
        documento, _reporte = modulo.importar_plan(
            rutas["excel"], rutas["sga"], rutas["titulos"], CREDITOS_DECIDIDOS
        )
        salida = tmp_path / f"corrida-{numero}.json"
        modulo.escribir_json_canonico(salida, documento)
        bytes_por_corrida.append(salida.read_bytes())
    assert bytes_por_corrida[0] == bytes_por_corrida[1]


def test_forma_canonica(raiz: Path) -> None:
    for relativa in ("data/v1/planes/S10-Rev23.json", "data/v1/vocabulario.json"):
        crudo = (raiz / relativa).read_bytes()
        assert not crudo.startswith(b"\xef\xbb\xbf"), f"{relativa} tiene BOM"
        assert b"\r" not in crudo, f"{relativa} tiene CRLF"
        assert crudo.endswith(b"\n")
        texto = crudo.decode("utf-8")
        assert texto == modulo.serializar_canonico(json.loads(texto))


# --------------------------------------------------------------------------- falla ruidosa


def _copiar_excel(
    origen: Path, destino: Path, cambios: list[tuple[str, int, int, object]]
) -> Path:
    libro = openpyxl.load_workbook(origen)
    for hoja, fila, columna, valor in cambios:
        libro[hoja].cell(row=fila, column=columna, value=valor)
    libro.save(destino)
    return destino


def test_encabezado_distinto_rompe(rutas: dict[str, Path], tmp_path: Path) -> None:
    roto = _copiar_excel(
        rutas["excel"], tmp_path / "roto.xlsx", [("Obligatorias", 3, 1, "Materias")]
    )
    with pytest.raises(modulo.ErrorPlan, match="encabezado inesperado"):
        modulo.leer_excel(roto)


def test_bloque_sin_titulo_de_ciclo_rompe(
    rutas: dict[str, Path], tmp_path: Path
) -> None:
    roto = _copiar_excel(
        rutas["excel"], tmp_path / "sin-ciclo.xlsx", [("Obligatorias", 1, 1, "")]
    )
    with pytest.raises(modulo.ErrorPlan, match="bloque sin título de ciclo"):
        modulo.leer_excel(roto)


def test_columna_de_minor_desconocida_rompe(
    rutas: dict[str, Path], tmp_path: Path
) -> None:
    roto = _copiar_excel(
        rutas["excel"],
        tmp_path / "minor.xlsx",
        [("Electivas", 1, 5, "Ciencia Ficción")],
    )
    with pytest.raises(modulo.ErrorPlan, match="columna de minor desconocida"):
        modulo.leer_excel(roto)


def test_diferencia_de_creditos_sin_decidir_rompe(
    rutas: dict[str, Path], tmp_path: Path
) -> None:
    # 10.07 Creatividad vale 3 créditos en las dos fuentes; al cambiarla tiene que romper.
    roto = _copiar_excel(
        rutas["excel"], tmp_path / "creditos.xlsx", [("Electivas", 2, 2, 5)]
    )
    with pytest.raises(modulo.ErrorPlan, match="nadie decidió cuál vale"):
        modulo.importar_plan(roto, rutas["sga"], rutas["titulos"], CREDITOS_DECIDIDOS)


def test_importar_sin_decidir_nada_rompe(rutas: dict[str, Path]) -> None:
    # El comando pelado no elige en silencio: aborta nombrando las dos materias en conflicto.
    with pytest.raises(modulo.ErrorPlan, match="72.23.*72.70"):
        modulo.importar_plan(rutas["excel"], rutas["sga"], rutas["titulos"])


def test_creditos_decididos_con_un_valor_inventado_rompe(
    rutas: dict[str, Path],
) -> None:
    decididos = dict(CREDITOS_DECIDIDOS, **{"72.23": 4})
    with pytest.raises(modulo.ErrorPlan, match="no es ni el valor del Excel"):
        modulo.importar_plan(rutas["excel"], rutas["sga"], rutas["titulos"], decididos)


def test_creditos_decididos_de_una_materia_que_no_difiere_rompe(
    rutas: dict[str, Path],
) -> None:
    decididos = dict(CREDITOS_DECIDIDOS, **{"93.58": 9})
    with pytest.raises(modulo.ErrorPlan, match="ya no difieren"):
        modulo.importar_plan(rutas["excel"], rutas["sga"], rutas["titulos"], decididos)


def test_marca_de_minor_desconocida_rompe(
    rutas: dict[str, Path], tmp_path: Path
) -> None:
    # 16.50 suma al minor CD con una «X»; cualquier otra marca no se descarta en silencio.
    roto = _copiar_excel(
        rutas["excel"], tmp_path / "marca.xlsx", [("Electivas", 6, 5, "✓")]
    )
    with pytest.raises(modulo.ErrorPlan, match="marca de minor CD desconocida"):
        modulo.leer_excel(roto)


def test_materia_debajo_del_pie_de_electivas_rompe(
    rutas: dict[str, Path], tmp_path: Path
) -> None:
    # El pie está en la fila 68; una materia más abajo quedaría fuera de todos los conteos.
    roto = _copiar_excel(
        rutas["excel"],
        tmp_path / "pie.xlsx",
        [("Obligatorias", 69, 1, "72.99 - Materia Nueva")],
    )
    with pytest.raises(modulo.ErrorPlan, match="debajo del pie"):
        modulo.leer_excel(roto)


def _fuentes_minimas() -> tuple[modulo.FuenteExcel, modulo.FuenteSga, dict[str, int]]:
    excel = modulo.FuenteExcel(
        materias={
            "93.58": modulo.MateriaExcel("93.58", "Álgebra", 9, 0, [], "basico", 1),
            "72.31": modulo.MateriaExcel(
                "72.31", "Imperativa", 30, 0, ["93.58"], "profesional", 2
            ),
        },
        orden=["93.58", "72.31"],
        creditos_por_ciclo={"basico": 9, "profesional": 57},
        creditos_electivas=27,
        creditos_minimos_minor=14,
        minors=[
            {"sigla": s, "nombre": n} for s, n in modulo.MINORS_POR_ENCABEZADO.values()
        ],
    )
    sga = modulo.FuenteSga(
        materias={
            "93.58": modulo.MateriaSga("93.58", "Álgebra", 9, 0, []),
            "72.31": modulo.MateriaSga("72.31", "Imperativa", 30, 0, ["93.58"]),
        },
        orden=["93.58", "72.31"],
        creditos_electivas=27,
    )
    return excel, sga, {"analista": 9, "bachiller": 20, "ingeniero": 66}


def test_fuentes_minimas_arman_un_plan() -> None:
    excel, sga, titulos = _fuentes_minimas()
    documento, _reporte = modulo.construir_plan(excel, sga, titulos)
    assert [m["codigo"] for m in documento["materias"]] == ["93.58", "72.31"]


def test_correlativa_inexistente_rompe() -> None:
    excel, sga, titulos = _fuentes_minimas()
    excel.materias["72.31"].correlativas = ["99.99"]
    with pytest.raises(modulo.ErrorPlan, match="99.99"):
        modulo.construir_plan(excel, sga, titulos)


def test_correlativas_circulares_rompen() -> None:
    excel, sga, titulos = _fuentes_minimas()
    excel.materias["93.58"].correlativas = ["72.31"]
    sga.materias["93.58"].correlativas = ["72.31"]
    with pytest.raises(modulo.ErrorPlan, match="ciclos"):
        modulo.construir_plan(excel, sga, titulos)


def test_titulo_que_no_cierra_con_los_ciclos_rompe() -> None:
    excel, sga, titulos = _fuentes_minimas()
    titulos["analista"] = 10
    with pytest.raises(modulo.ErrorPlan, match="Analista"):
        modulo.construir_plan(excel, sga, titulos)


def test_html_de_titulos_sin_tabla_rompe(tmp_path: Path) -> None:
    vacio = tmp_path / "titulos.html"
    vacio.write_text("<html><body><p>nada</p></body></html>", encoding="utf-8")
    with pytest.raises(modulo.ErrorPlan, match="tabla de títulos"):
        modulo.leer_titulos_sga(vacio)


# --------------------------------------------------------------------------- vocabulario


def test_extraer_sedes_saca_el_token_de_aula() -> None:
    html = (
        "<span> Aula ITBA: <span>001R #----&gt; Sede Rectorado</span> </span>"
        "<span> Aula ITBA: <span>12T #----&gt; SDT</span> </span>"
    )
    assert modulo.extraer_sedes(html) == ["Rectorado", "SDT"]
    assert modulo.id_de_sede("Rectorado") == "rectorado"
    assert modulo.id_de_sede("SDT") == "sdt"


def test_construir_vocabulario(tmp_path: Path) -> None:
    (tmp_path / "una.html").write_text(
        "Aula ITBA: <span>001R #----&gt; Sede Rectorado</span>", encoding="utf-8"
    )
    (tmp_path / "otra.html").write_text(
        "Aula ITBA: <span>12T #----&gt; SDT</span>", encoding="utf-8"
    )
    assert modulo.construir_vocabulario(tmp_path) == {
        "contrato": "1.0.0",
        "sedes": [
            {"id": "rectorado", "nombre": "Rectorado"},
            {"id": "sdt", "nombre": "SDT"},
        ],
    }


def test_marca_de_sede_con_otra_forma_rompe(tmp_path: Path) -> None:
    (tmp_path / "rara.html").write_text(
        "Aula ITBA: <span>001R #---- Sede Rectorado</span>", encoding="utf-8"
    )
    with pytest.raises(modulo.ErrorPlan, match="marca de sede con forma inesperada"):
        modulo.construir_vocabulario(tmp_path)


def test_vocabulario_sin_sedes_rompe(tmp_path: Path) -> None:
    (tmp_path / "vacia.html").write_text("<html></html>", encoding="utf-8")
    with pytest.raises(modulo.ErrorPlan, match="token de sede"):
        modulo.construir_vocabulario(tmp_path)


def test_vocabulario_publicado(raiz: Path) -> None:
    documento = json.loads(
        (raiz / "data" / "v1" / "vocabulario.json").read_text(encoding="utf-8")
    )
    assert documento["contrato"] == "1.0.0"
    # Las sedes observadas: en los HTML guardados del SGA y, desde el 2026-09-12, la que
    # mostro la corrida real del scraper («Sede Distrito Financiero»).
    assert documento["sedes"] == [
        {"id": "rectorado", "nombre": "Rectorado"},
        {"id": "sdf", "nombre": "Sede Distrito Financiero"},
        {"id": "sdt", "nombre": "SDT"},
    ]
    for sede in documento["sedes"]:
        assert modulo.RE_ID_SEDE.fullmatch(sede["id"])


# --------------------------------------------------------------------------- CLI


def test_subcomando_importar_escribe_el_archivo(
    rutas: dict[str, Path], tmp_path: Path
) -> None:
    parser = argparse.ArgumentParser(prog="cuatris")
    subparsers = parser.add_subparsers(dest="comando", required=True)
    modulo.configurar_subcomando(subparsers)
    salida = tmp_path / "plan.json"
    args = parser.parse_args(
        [
            "plan",
            "importar",
            "--excel",
            str(rutas["excel"]),
            "--sga",
            str(rutas["sga"]),
            "--titulos",
            str(rutas["titulos"]),
            "--creditos-decididos",
            "72.23=1",
            "--creditos-decididos",
            "72.70=1",
            "--salida",
            str(salida),
        ]
    )
    assert args.creditos_decididos == [("72.23", 1), ("72.70", 1)]
    assert args.funcion(args) == 0
    assert json.loads(salida.read_text(encoding="utf-8"))["plan"] == "S10-Rev23"


def test_creditos_decididos_mal_escritos_rompen() -> None:
    with pytest.raises(argparse.ArgumentTypeError):
        modulo.par_creditos_decididos("72.23")
    with pytest.raises(argparse.ArgumentTypeError):
        modulo.par_creditos_decididos("A=1")
    assert modulo.par_creditos_decididos(" 72.23=1 ") == ("72.23", 1)


# --------------------------------------------------------------------------- corpus


def test_el_corpus_esta_anonimizado(corpus: Path) -> None:
    for archivo in (corpus / "plan").glob("*.html"):
        texto = archivo.read_text(encoding="utf-8")
        assert "CAULES" not in texto, archivo.name
        assert "APELLIDO, NOMBRE" in texto, archivo.name
