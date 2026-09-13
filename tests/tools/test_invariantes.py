"""Tests de C3 — invariantes: lo que el schema no puede expresar.

Cada regla tiene un caso que pasa y uno que falla. Las fixtures `c3-*.json` congelan el caso
que falla en un archivo completo, canonico y valido para C1 y C2; los casos chicos se arman
en memoria para que se lea de un vistazo que separa al valido del invalido.
"""

from __future__ import annotations

import copy
import shutil
from pathlib import Path

import pytest
from cuatris import canon
from cuatris.cli import main
from cuatris.validar import Contexto, contexto_de_datos, validar_archivo
from cuatris.validar.invariantes import DURACION_MAXIMA_MINUTOS, revisar
from cuatris.validar.reporte import ERROR, WARNING

# Reglas de C3 que cada fixture de `deben-fallar` tiene que disparar, y solo esa.
FIXTURES_C3 = {
    "c3-abreviacion-duplicada.json": "abreviacion-duplicada",
    "c3-abreviacion-sin-materia.json": "abreviacion-sin-materia",
    "c3-bloque-demasiado-largo.json": "bloque-demasiado-largo",
    "c3-bloque-invertido.json": "bloque-invertido",
    "c3-codigo-duplicado.json": "codigo-duplicado",
    "c3-colision-de-aula.json": "colision-de-aula",
    "c3-comision-duplicada.json": "comision-duplicada",
    "c3-correlativa-inexistente.json": "correlativa-inexistente",
    "c3-correlativas-ciclicas.json": "correlativas-ciclicas",
    "c3-creditos-requeridos-excesivos.json": "creditos-requeridos-excesivos",
    "c3-cuatrimestre-incoherente.json": "cuatrimestre-incoherente",
    "c3-curso-fuera-del-periodo.json": "curso-fuera-del-periodo",
    "c3-curso-invertido.json": "curso-invertido",
    "c3-franja-fuera-de-rango.json": "franja-fuera-de-rango",
    "c3-materia-duplicada.json": "materia-duplicada",
    "c3-minor-en-obligatoria.json": "minor-en-obligatoria",
    "c3-minor-inexistente.json": "minor-inexistente",
    "c3-periodo-incoherente.json": "periodo-incoherente",
    "c3-sede-desconocida.json": "sede-desconocida",
}

PERIODO = {
    "anio": 2026,
    "cuatrimestre": "2C",
    "desde": "2026-07-26",
    "hasta": "2026-12-31",
    "id": "2026-2C",
}

CONTEXTO = Contexto(
    codigos=frozenset({"72.44", "93.18"}), sedes=frozenset({"rectorado", "sdt"})
)


def _reglas(hallazgos) -> list[str]:
    return [hallazgo.regla for hallazgo in hallazgos]


def _errores(hallazgos) -> list[str]:
    return [hallazgo.regla for hallazgo in hallazgos if hallazgo.nivel == ERROR]


def _bloque(dia: str, desde: str, hasta: str, aulas: list[str], **cambios) -> dict:
    bloque = {
        "aulas": aulas,
        "desde": desde,
        "dia": dia,
        "hasta": hasta,
        "modalidad": "presencial",
        "sede": "rectorado",
    }
    bloque.update(cambios)
    return bloque


def _curso(codigo: str, bloques: list[dict], **cambios) -> dict:
    curso = {
        "codigo": codigo,
        "comisiones": [{"bloques": bloques, "docentes": [], "id": "A"}],
        "desde": "2026-07-26",
        "dictado_conjunto": [],
        "hasta": "2026-12-31",
        "nombre": "Algebra Lineal",
    }
    curso.update(cambios)
    return curso


def _horarios(cursos: list[dict]) -> dict:
    return {
        "contrato": "1.0.0",
        "cursos": cursos,
        "fuente": {"capturado": "2026-09-09", "sistema": "sga"},
        "periodo": dict(PERIODO),
    }


def _revisar_horarios(
    cursos: list[dict], contexto: Contexto | None = None
) -> list[str]:
    return _reglas(revisar(_horarios(cursos), "horarios", "prueba.json", contexto))


# --- las fixtures congeladas -------------------------------------------------------------


@pytest.mark.parametrize(("nombre", "regla"), sorted(FIXTURES_C3.items()))
def test_fixture_que_debe_fallar_en_c3(
    fixtures: Path, raiz: Path, nombre: str, regla: str
) -> None:
    """Cada fixture de C3 produce exactamente ese error, con el contexto de `data/`."""
    contexto = contexto_de_datos(raiz / "data")
    assert _errores(
        validar_archivo(fixtures / "deben-fallar" / nombre, contexto=contexto)
    ) == [regla]


def test_las_fixtures_que_pasan_no_tienen_errores(fixtures: Path) -> None:
    """`c3-dictado-conjunto` y `c3-docente-repetido` pasan; el segundo solo advierte."""
    conjunto = fixtures / "deben-pasar" / "c3-dictado-conjunto.json"
    docente = fixtures / "deben-pasar" / "c3-docente-repetido.json"
    assert validar_archivo(conjunto) == []
    assert _reglas(validar_archivo(docente)) == ["colision-de-docente"]
    assert validar_archivo(docente)[0].nivel == WARNING


def test_los_siete_casos_raros_siguen_sin_errores(fixtures: Path, raiz: Path) -> None:
    """C3 no puede rechazar ninguno de los siete casos reales, con contexto o sin el."""
    ruta = fixtures / "deben-pasar" / "horarios-casos-raros.json"
    assert validar_archivo(ruta) == []
    hallazgos = validar_archivo(ruta, contexto=contexto_de_datos(raiz / "data"))
    assert _errores(hallazgos) == []


def test_los_datos_del_repositorio_no_tienen_errores(raiz: Path) -> None:
    """El plan y las abreviaciones que se publican pasan C3 con su propio contexto."""
    contexto = contexto_de_datos(raiz / "data")
    for relativa in ("v1/planes/S10-Rev23.json", "v1/abreviaciones.json"):
        assert validar_archivo(raiz / "data" / relativa, contexto=contexto) == [], (
            relativa
        )


# --- horarios: identidades, franjas y fechas ---------------------------------------------


def test_el_codigo_es_unico_y_el_nombre_no_importa() -> None:
    """Dos materias homonimas con codigos distintos son validas; dos veces el mismo codigo no."""
    homonimas = [
        _curso(
            "23.05", [_bloque("lunes", "08:00", "10:00", ["002R"])], nombre="Acustica"
        ),
        _curso(
            "25.66", [_bloque("martes", "08:00", "10:00", ["002R"])], nombre="Acustica"
        ),
    ]
    assert _revisar_horarios(homonimas) == []
    repetido = [
        _curso("23.05", [_bloque("lunes", "08:00", "10:00", ["002R"])]),
        _curso("23.05", [_bloque("martes", "08:00", "10:00", ["003R"])]),
    ]
    assert _revisar_horarios(repetido) == ["codigo-duplicado"]


def test_la_comision_es_unica_dentro_del_curso() -> None:
    """El mismo `id` de comision puede estar en dos cursos, pero no dos veces en uno."""
    curso = _curso("93.18", [_bloque("lunes", "08:00", "10:00", ["002R"])])
    otro = _curso("72.44", [_bloque("martes", "08:00", "10:00", ["002R"])])
    assert _revisar_horarios([curso, otro]) == []
    repetida = copy.deepcopy(curso)
    repetida["comisiones"].append(
        {
            "bloques": [_bloque("martes", "08:00", "10:00", ["003R"])],
            "docentes": [],
            "id": "A",
        }
    )
    assert _revisar_horarios([repetida]) == ["comision-duplicada"]


@pytest.mark.parametrize(
    ("desde", "hasta", "esperado"),
    [
        ("07:00", "15:00", []),
        ("14:00", "16:00", []),
        ("16:00", "14:00", ["bloque-invertido"]),
        ("14:00", "14:00", ["bloque-invertido"]),
        ("06:59", "08:00", ["franja-fuera-de-rango"]),
        ("21:00", "23:30", ["franja-fuera-de-rango"]),
        ("08:00", "16:01", ["bloque-demasiado-largo"]),
    ],
)
def test_la_franja_del_bloque(desde: str, hasta: str, esperado: list[str]) -> None:
    """`desde < hasta`, entre 07:00 y 23:00, y nunca mas de ocho horas seguidas."""
    assert _revisar_horarios(
        [_curso("93.18", [_bloque("lunes", desde, hasta, ["002R"])])]
    ) == (esperado)


def test_el_periodo_corto_es_valido_y_el_que_se_sale_no() -> None:
    """15.09 va del 18/09 al 16/10: un curso corto es valido; uno fuera del periodo no."""
    corto = _curso(
        "15.09",
        [_bloque("viernes", "19:00", "22:00", ["101T"], sede="sdt")],
        desde="2026-09-18",
        hasta="2026-10-16",
    )
    assert _revisar_horarios([corto]) == []
    afuera = copy.deepcopy(corto)
    afuera["hasta"] = "2027-01-15"
    assert _revisar_horarios([afuera]) == ["curso-fuera-del-periodo"]
    invertido = copy.deepcopy(corto)
    invertido["desde"], invertido["hasta"] = corto["hasta"], corto["desde"]
    assert _revisar_horarios([invertido]) == ["curso-invertido"]


# --- horarios: sedes ----------------------------------------------------------------------


def test_la_sede_se_comprueba_contra_el_vocabulario() -> None:
    """Una sede que no existe es error; sin contexto, C3 no inventa la comprobacion."""
    curso = _curso("93.18", [_bloque("lunes", "08:00", "10:00", ["002R"], sede="sdt")])
    assert _revisar_horarios([curso], CONTEXTO) == []
    ajena = _curso("93.18", [_bloque("lunes", "08:00", "10:00", ["002R"], sede="sdf")])
    assert _revisar_horarios([ajena], CONTEXTO) == ["sede-desconocida"]
    assert _revisar_horarios([ajena]) == []


def test_sin_vocabulario_la_sede_queda_en_advertencia() -> None:
    """«No pude comprobarlo» se informa como advertencia, no como error."""
    curso = _curso("93.18", [_bloque("lunes", "08:00", "10:00", ["002R"], sede="sdf")])
    hallazgos = revisar(_horarios([curso]), "horarios", "prueba.json", Contexto())
    assert _reglas(hallazgos) == ["sin-vocabulario"]
    assert hallazgos[0].nivel == WARNING


def test_la_sede_nula_vale_con_cualquier_modalidad() -> None:
    """`sede: null` es «el SGA no publica sede para este bloque», sea cual sea la modalidad.

    Casos reales del 2026-09-13: bloques presenciales sin aula asignada (74.61, 32.57 com. N,
    17.06 com. C) y practicas de laboratorio (`laboratorio`, 25 cursos) que no traen aula.
    """
    for modalidad in ("virtual_sincronica", "presencial", "laboratorio"):
        curso = _curso(
            "93.18",
            [_bloque("lunes", "08:00", "10:00", [], sede=None, modalidad=modalidad)],
        )
        assert _revisar_horarios([curso], CONTEXTO) == [], modalidad


def test_las_fechas_de_una_comision_van_juntas_ordenadas_y_dentro_del_curso() -> None:
    """Contrato 1.1.0: una comision puede tener `desde`/`hasta` propios (dos ediciones de un
    seminario bajo el mismo codigo: 81.73, 03/08–11/09 y 14/09–23/10)."""
    bien = _curso(
        "93.18",
        [_bloque("sabado", "20:00", "21:00", [], sede=None, modalidad="virtual")],
    )
    bien["comisiones"][0]["desde"] = "2026-08-03"
    bien["comisiones"][0]["hasta"] = "2026-09-11"
    assert _revisar_horarios([bien], CONTEXTO) == []

    incompleta = _curso("93.18", [_bloque("sabado", "20:00", "21:00", [], sede=None)])
    incompleta["comisiones"][0]["desde"] = "2026-08-03"
    assert _revisar_horarios([incompleta], CONTEXTO) == ["comision-fecha-incompleta"]

    invertida = _curso("93.18", [_bloque("sabado", "20:00", "21:00", [], sede=None)])
    invertida["comisiones"][0]["desde"] = "2026-09-11"
    invertida["comisiones"][0]["hasta"] = "2026-08-03"
    assert _revisar_horarios([invertida], CONTEXTO) == ["comision-invertida"]

    fuera = _curso("93.18", [_bloque("sabado", "20:00", "21:00", [], sede=None)])
    fuera["comisiones"][0]["desde"] = "2026-07-01"
    fuera["comisiones"][0]["hasta"] = "2026-09-11"
    assert _revisar_horarios([fuera], CONTEXTO) == ["comision-fuera-del-curso"]


def test_dos_ediciones_con_fechas_propias_no_chocan_con_lo_que_hay_entre_ellas() -> (
    None
):
    """La colision de aula mira la vigencia de la comision, no la envolvente del curso."""
    seminario = _curso("72.44", [_bloque("lunes", "08:00", "10:00", ["201R"])])
    seminario["desde"], seminario["hasta"] = "2026-08-03", "2026-10-23"
    seminario["comisiones"][0]["desde"] = "2026-08-03"
    seminario["comisiones"][0]["hasta"] = "2026-09-11"
    otro = _curso("93.18", [_bloque("lunes", "08:00", "10:00", ["201R"])])
    otro["desde"], otro["hasta"] = "2026-09-14", "2026-10-23"
    assert _revisar_horarios([seminario, otro], CONTEXTO) == []
    del seminario["comisiones"][0]["desde"], seminario["comisiones"][0]["hasta"]
    assert _revisar_horarios([seminario, otro], CONTEXTO) == ["colision-de-aula"]


def test_el_domingo_y_la_modalidad_virtual_pasan_las_invariantes() -> None:
    """Contrato 1.1.0: ninguna regla de C3 mira el dia ni distingue «virtual» (N0-28).

    61.27 dicta el domingo en modalidad virtual asincronica y 25.20 com. K publica un bloque
    «Virtual» a secas: son dias y modalidades como cualquier otra, sin sede y sin aula.
    """
    domingo = _curso(
        "61.27",
        [
            _bloque(
                "domingo",
                "13:00",
                "14:00",
                [],
                sede=None,
                modalidad="virtual_asincronica",
            )
        ],
    )
    virtual = _curso(
        "25.20",
        [_bloque("miercoles", "15:00", "18:00", [], sede=None, modalidad="virtual")],
    )
    assert _revisar_horarios([domingo, virtual]) == []


# --- horarios: colisiones -----------------------------------------------------------------


def _par_en_el_mismo_aula(**cambios) -> list[dict]:
    """Dos cursos distintos en el aula 001R de rectorado, el lunes, con franjas que se pisan."""
    uno = _curso("93.18", [_bloque("lunes", "14:00", "16:00", ["001R"])], **cambios)
    otro = _curso("72.44", [_bloque("lunes", "15:00", "18:00", ["001R"])])
    return [uno, otro]


def test_colision_de_aula_entre_cursos_distintos() -> None:
    """Dos cursos distintos no pueden compartir aula, sede, dia y franja."""
    assert _revisar_horarios(_par_en_el_mismo_aula()) == ["colision-de-aula"]


def test_dos_aulas_simultaneas_de_la_misma_comision_son_validas() -> None:
    """93.18 com. B usa 003T y 004T el mismo miercoles: es un caso real."""
    curso = _curso(
        "93.18", [_bloque("miercoles", "10:00", "12:00", ["003T", "004T"], sede="sdt")]
    )
    assert _revisar_horarios([curso]) == []


def test_el_dictado_conjunto_no_es_colision() -> None:
    """Si los dos codigos se dictan juntos, compartir el aula es lo esperado."""
    cursos = _par_en_el_mismo_aula(dictado_conjunto=["72.44"])
    assert _revisar_horarios(cursos) == []
    al_reves = _par_en_el_mismo_aula()
    al_reves[1]["dictado_conjunto"] = ["93.18"]
    assert _revisar_horarios(al_reves) == []


def test_no_hay_colision_si_los_bloques_no_se_pisan() -> None:
    """Tocarse por el extremo no es solaparse: 14:00-16:00 y 16:00-18:00 conviven."""
    cursos = _par_en_el_mismo_aula()
    cursos[1]["comisiones"][0]["bloques"][0]["desde"] = "16:00"
    assert _revisar_horarios(cursos) == []


def test_no_hay_colision_si_los_periodos_no_se_pisan() -> None:
    """Un curso corto que termina antes de que empiece el otro no le ocupa el aula."""
    cursos = _par_en_el_mismo_aula(desde="2026-07-26", hasta="2026-08-31")
    cursos[1]["desde"] = "2026-09-18"
    assert _revisar_horarios(cursos) == []


def test_el_bloque_virtual_no_ocupa_aula() -> None:
    """Lo que no se dicta en un aula no puede chocar en un aula."""
    cursos = _par_en_el_mismo_aula()
    cursos[1]["comisiones"][0]["bloques"][0]["modalidad"] = "virtual_sincronica"
    assert _revisar_horarios(cursos) == []
    sin_aula = _par_en_el_mismo_aula()
    sin_aula[1]["comisiones"][0]["bloques"][0]["aulas"] = []
    assert _revisar_horarios(sin_aula) == []


def test_la_colision_de_docente_es_advertencia() -> None:
    """Los homonimos y los titulares nominales existen: advertir si, rechazar nunca."""
    cursos = _par_en_el_mismo_aula(dictado_conjunto=["72.44"])
    cursos[0]["comisiones"][0]["docentes"] = ["Peña, Nelly Haydee"]
    cursos[1]["comisiones"][0]["docentes"] = ["Peña, Nelly Haydee"]
    hallazgos = revisar(_horarios(cursos), "horarios", "prueba.json", None)
    assert _reglas(hallazgos) == ["colision-de-docente"]
    assert hallazgos[0].nivel == WARNING
    cursos[1]["comisiones"][0]["docentes"] = ["Cabana, Adriana Elena"]
    assert _revisar_horarios(cursos) == []


def test_el_mismo_docente_en_dos_comisiones_del_mismo_curso_no_advierte() -> None:
    """93.18 repite docentes entre sus comisiones: es la carga real, no un choque."""
    curso = _curso("93.18", [_bloque("lunes", "14:00", "16:00", ["001R"])])
    curso["comisiones"][0]["docentes"] = ["Peña, Nelly Haydee"]
    curso["comisiones"].append(
        {
            "bloques": [_bloque("lunes", "14:00", "16:00", ["007R"])],
            "docentes": ["Peña, Nelly Haydee"],
            "id": "B",
        }
    )
    assert _revisar_horarios([curso]) == []


# --- horarios: ocupacion y plan -----------------------------------------------------------


@pytest.mark.parametrize(
    ("capacidad", "inscriptos", "esperado"),
    [(48, 48, []), (48, 10, []), (48, 49, ["sobrecupo"])],
)
def test_el_sobrecupo_es_advertencia(
    capacidad: int, inscriptos: int, esperado: list[str]
) -> None:
    """48/48 es el caso real de 93.18 com. A; el sobrecupo existe y solo se advierte."""
    curso = _curso("93.18", [_bloque("lunes", "14:00", "16:00", ["001R"])])
    curso["comisiones"][0]["cupo"] = {"capacidad": capacidad}
    curso["comisiones"][0]["ocupacion"] = {"al": "2026-09-09", "inscriptos": inscriptos}
    assert _revisar_horarios([curso]) == esperado


def test_el_codigo_fuera_del_plan_es_advertencia() -> None:
    """Los horarios traen todas las carreras: en el Sprint 1 eso se advierte, no se rechaza."""
    curso = _curso("15.09", [_bloque("lunes", "14:00", "16:00", ["001R"])])
    hallazgos = revisar(_horarios([curso]), "horarios", "prueba.json", CONTEXTO)
    assert _reglas(hallazgos) == ["codigo-fuera-del-plan"]
    assert hallazgos[0].nivel == WARNING
    del_plan = _curso("72.44", [_bloque("lunes", "14:00", "16:00", ["001R"])])
    assert _revisar_horarios([del_plan], CONTEXTO) == []


# --- planes -------------------------------------------------------------------------------


def _plan(materias: list[dict], **cambios) -> dict:
    plan = {
        "carrera": "Ingenieria en Informatica",
        "contrato": "1.0.0",
        "electivas": {"creditos_requeridos": 27},
        "materias": materias,
        "minors": [
            {"creditos_minimos": 14, "nombre": "Ciencia de Datos", "sigla": "CD"}
        ],
        "plan": "S10-Rev23",
        "titulos": [
            {
                "creditos": 147,
                "id": "analista",
                "nombre": "Analista",
                "tipo": "intermedio",
            },
            {
                "creditos": 243,
                "id": "ingeniero",
                "nombre": "Ingeniero/a",
                "tipo": "principal",
            },
        ],
    }
    plan.update(cambios)
    return plan


def _materia(codigo: str, **cambios) -> dict:
    materia = {
        "ciclo": "basico",
        "codigo": codigo,
        "correlativas": [],
        "creditos": 30,
        "creditos_requeridos": 0,
        "cuatrimestre_sugerido": 1,
        "minors": [],
        "nombre": "Materia",
        "vigente": True,
    }
    materia.update(cambios)
    return materia


def _revisar_plan(materias: list[dict], **cambios) -> list[str]:
    return _reglas(revisar(_plan(materias, **cambios), "planes", "plan.json"))


def test_las_correlativas_existen_en_el_plan() -> None:
    """Una correlativa que no esta en `materias[]` es un plan roto."""
    assert (
        _revisar_plan([_materia("72.03"), _materia("72.31", correlativas=["72.03"])])
        == []
    )
    assert _revisar_plan([_materia("72.31", correlativas=["72.03"])]) == [
        "correlativa-inexistente"
    ]


def test_el_grafo_de_correlativas_es_aciclico() -> None:
    """Un ciclo cuelga al planificador; el mensaje tiene que decir cual es."""
    materias = [
        _materia("72.03", correlativas=["93.26"]),
        _materia("93.26", correlativas=["72.03"]),
    ]
    hallazgos = revisar(_plan(materias), "planes", "plan.json")
    assert _reglas(hallazgos) == ["correlativas-ciclicas"]
    assert "72.03" in hallazgos[0].mensaje and "93.26" in hallazgos[0].mensaje
    assert "->" in hallazgos[0].mensaje


def test_una_materia_correlativa_de_si_misma_es_un_ciclo() -> None:
    """El ciclo mas corto tambien se detecta."""
    assert _revisar_plan([_materia("72.03", correlativas=["72.03"])]) == [
        "correlativas-ciclicas"
    ]


def test_el_cuatrimestre_sugerido_es_nulo_solo_en_las_electivas() -> None:
    """`cuatrimestre_sugerido` nulo si y solo si `ciclo` es «electiva»."""
    electiva = _materia("16.04", ciclo="electiva", cuatrimestre_sugerido=None)
    assert _revisar_plan([electiva]) == []
    assert _revisar_plan([_materia("16.04", ciclo="electiva")]) == [
        "cuatrimestre-incoherente"
    ]
    assert _revisar_plan([_materia("72.03", cuatrimestre_sugerido=None)]) == [
        "cuatrimestre-incoherente"
    ]


def test_las_siglas_de_minor_estan_declaradas() -> None:
    """Una electiva solo puede sumar a un minor que exista en `minors[]`."""
    electiva = _materia(
        "16.04", ciclo="electiva", cuatrimestre_sugerido=None, minors=["CD"]
    )
    assert _revisar_plan([electiva]) == []
    ajena = _materia(
        "16.04", ciclo="electiva", cuatrimestre_sugerido=None, minors=["ZZ"]
    )
    assert _revisar_plan([ajena]) == ["minor-inexistente"]


SOLO_PRINCIPAL = [
    {"creditos": 30, "id": "ingeniero", "nombre": "Ingeniero/a", "tipo": "principal"}
]
"""Titulos de un plan chico: su techo son los 30 creditos de su unica materia."""


def test_no_se_pueden_exigir_mas_creditos_de_los_que_da_el_plan() -> None:
    """Un requisito imposible de cumplir es un error de carga, no una carrera dificil."""
    assert (
        _revisar_plan(
            [_materia("72.45", creditos_requeridos=30)], titulos=SOLO_PRINCIPAL
        )
        == []
    )
    assert _revisar_plan(
        [_materia("72.45", creditos_requeridos=31)], titulos=SOLO_PRINCIPAL
    ) == ["creditos-requeridos-excesivos"]
    assert _revisar_plan(
        [_materia("72.03")],
        electivas={"creditos_requeridos": 31},
        titulos=SOLO_PRINCIPAL,
    ) == ["creditos-requeridos-excesivos"]


def test_el_plan_que_lista_solo_parte_de_sus_materias_no_dispara_la_regla() -> None:
    """El techo del plan nunca baja de lo que exige su titulo mas alto.

    El plan de ejemplo de `CONTRATO-v1.md` §4 —el que esta en `deben-pasar/v1/planes/`— lista
    una sola materia de 12 creditos y declara un titulo de 243: medir los requisitos contra
    esos 12 haria saltar la regla por lo que falta, no por lo que esta mal.
    """
    proyecto = _materia(
        "72.45", ciclo="profesional", creditos=12, creditos_requeridos=160
    )
    assert _revisar_plan([proyecto]) == []
    assert _revisar_plan([proyecto], titulos=SOLO_PRINCIPAL) == [
        "creditos-requeridos-excesivos"
    ]


def test_el_codigo_de_materia_no_se_repite() -> None:
    """La identidad de una materia es su codigo."""
    assert _revisar_plan([_materia("72.03"), _materia("93.26")]) == []
    assert _revisar_plan([_materia("72.03"), _materia("72.03")]) == [
        "materia-duplicada"
    ]


def test_los_creditos_de_los_titulos_no_bajan() -> None:
    """Si el titulo principal exige menos que un intermedio, se advierte."""
    titulos = [
        {"creditos": 243, "id": "analista", "nombre": "Analista", "tipo": "intermedio"},
        {
            "creditos": 147,
            "id": "ingeniero",
            "nombre": "Ingeniero/a",
            "tipo": "principal",
        },
    ]
    hallazgos = revisar(
        _plan([_materia("72.03")], titulos=titulos), "planes", "plan.json"
    )
    assert _reglas(hallazgos) == ["titulos-creditos-decrecientes"]
    assert hallazgos[0].nivel == WARNING


def test_los_titulos_se_comparan_por_tipo_y_no_por_el_orden_del_arreglo() -> None:
    """Un plan que liste primero el principal es raro, pero no es una advertencia."""
    al_reves = [
        {
            "creditos": 243,
            "id": "ingeniero",
            "nombre": "Ingeniero/a",
            "tipo": "principal",
        },
        {"creditos": 147, "id": "analista", "nombre": "Analista", "tipo": "intermedio"},
        {
            "creditos": 192,
            "id": "bachiller",
            "nombre": "Bachiller",
            "tipo": "intermedio",
        },
    ]
    assert _revisar_plan([_materia("72.03")], titulos=al_reves) == []
    excesivo = copy.deepcopy(al_reves)
    excesivo[1]["creditos"] = 300
    hallazgos = revisar(
        _plan([_materia("72.03")], titulos=excesivo), "planes", "plan.json"
    )
    assert _reglas(hallazgos) == ["titulos-creditos-decrecientes"]
    assert "analista" in hallazgos[0].mensaje and "ingeniero" in hallazgos[0].mensaje


# --- abreviaciones ------------------------------------------------------------------------


def _revisar_abreviaciones(
    mapa: dict[str, str], contexto: Contexto | None = None
) -> list[str]:
    documento = {"abreviaciones": mapa, "contrato": "1.0.0"}
    return _reglas(revisar(documento, "abreviaciones", "abreviaciones.json", contexto))


def test_las_abreviaciones_son_unicas() -> None:
    """Dos materias con la misma abreviacion son indistinguibles en la interfaz."""
    assert _revisar_abreviaciones({"72.42": "POD", "72.44": "Cripto"}) == []
    assert _revisar_abreviaciones({"72.42": "POD", "72.44": "POD"}) == [
        "abreviacion-duplicada"
    ]


def test_toda_abreviacion_apunta_a_una_materia_del_plan() -> None:
    """Una abreviacion de un codigo que no existe es un error duro."""
    solo_cripto = Contexto(codigos=frozenset({"72.44"}))
    assert _revisar_abreviaciones({"72.44": "Cripto"}, solo_cripto) == []
    assert _revisar_abreviaciones({"93.18": "Algebra"}, solo_cripto) == [
        "abreviacion-sin-materia",
        "materia-sin-abreviacion",
    ]


def test_la_materia_sin_abreviacion_solo_se_advierte() -> None:
    """Falta una abreviacion: la interfaz cae al nombre largo, no se rompe."""
    contexto = Contexto(codigos=frozenset({"72.44"}))
    hallazgos = revisar(
        {"abreviaciones": {}, "contrato": "1.0.0"},
        "abreviaciones",
        "abreviaciones.json",
        contexto,
    )
    assert _reglas(hallazgos) == ["materia-sin-abreviacion"]
    assert hallazgos[0].nivel == WARNING
    assert _revisar_abreviaciones({}) == []


# --- orquestacion y CLI --------------------------------------------------------------------


def test_c3_no_corre_si_c1_o_c2_encontraron_errores(fixtures: Path) -> None:
    """Ninguna capa cara toca datos que una barata ya rechazo."""
    hallazgos = validar_archivo(fixtures / "deben-fallar" / "dia-invalido.json")
    assert _reglas(hallazgos) == ["schema"]


def test_el_contexto_sale_del_directorio_de_datos(tmp_path: Path, raiz: Path) -> None:
    """`contexto_de_datos` lee los planes y el vocabulario, y tolera que falten."""
    contexto = contexto_de_datos(raiz / "data")
    assert contexto.codigos is not None and "72.44" in contexto.codigos
    assert contexto.sedes == frozenset({"rectorado", "sdf", "sdt"})
    vacio = contexto_de_datos(tmp_path)
    assert vacio.codigos is None
    assert vacio.sedes is None


def test_validar_con_data_aplica_las_reglas_cruzadas(
    fixtures: Path, raiz: Path
) -> None:
    """`--data` es lo que convierte «sede desconocida» en un error de la linea de comandos."""
    ruta = str(fixtures / "deben-fallar" / "c3-sede-desconocida.json")
    assert main(["validar", ruta, "--data", str(raiz / "data")]) == 1


def test_validar_con_data_inexistente_es_codigo_2(
    tmp_path: Path, fixtures: Path
) -> None:
    """Un `--data` que no es un directorio no se ignora en silencio."""
    ruta = str(fixtures / "deben-pasar" / "c3-dictado-conjunto.json")
    assert main(["validar", ruta, "--data", str(tmp_path / "no-existe")]) == 2


def test_validar_sin_directorio_de_datos_avisa_lo_que_no_comprobo(
    tmp_path: Path,
    fixtures: Path,
    capsys: pytest.CaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un 0 sin una linea no puede significar «no habia como revisarlo»."""
    ruta = str(fixtures / "deben-fallar" / "c3-sede-desconocida.json")
    monkeypatch.chdir(tmp_path)
    assert main(["validar", ruta]) == 0
    salida = capsys.readouterr().out.strip().splitlines()
    assert len(salida) == 1
    assert salida[0].startswith("WARNING: no hay directorio de datos")
    assert "vocabulario" in salida[0] and "planes" in salida[0]


def test_validar_avisa_si_el_directorio_de_datos_no_tiene_planes(
    tmp_path: Path, raiz: Path, fixtures: Path, capsys: pytest.CaptureFixture
) -> None:
    """Falta el plan: los codigos quedan sin comprobar y se dice, no se calla."""
    datos = tmp_path / "data"
    (datos / "v1").mkdir(parents=True)
    shutil.copy(
        raiz / "data" / "v1" / "vocabulario.json", datos / "v1" / "vocabulario.json"
    )
    ruta = str(fixtures / "deben-pasar" / "c3-dictado-conjunto.json")
    assert main(["validar", ruta, "--data", str(datos)]) == 0
    salida = capsys.readouterr().out.strip().splitlines()
    assert len(salida) == 1
    assert "no tiene «v1/planes/»" in salida[0]


def test_validar_con_el_contexto_completo_no_agrega_avisos(
    raiz: Path, capsys: pytest.CaptureFixture
) -> None:
    """Con el plan y el vocabulario delante no hay nada que avisar."""
    rutas = [
        str(raiz / "data" / "v1" / relativa)
        for relativa in ("planes/S10-Rev23.json", "abreviaciones.json")
    ]
    assert main(["validar", *rutas, "--data", str(raiz / "data")]) == 0
    assert capsys.readouterr().out == ""


def test_validar_sale_con_0_con_solo_advertencias(fixtures: Path, raiz: Path) -> None:
    """Una advertencia informa, no bloquea."""
    ruta = str(fixtures / "deben-pasar" / "c3-docente-repetido.json")
    assert main(["validar", ruta, "--data", str(raiz / "data")]) == 0


def test_las_fixtures_c3_estan_en_forma_canonica(fixtures: Path) -> None:
    """Las fixtures nuevas son archivos del contrato: se guardan como los escribe `fmt`."""
    for carpeta in ("deben-fallar", "deben-pasar"):
        for ruta in sorted((fixtures / carpeta).glob("c3-*.json")):
            assert canon.esta_canonico(ruta), ruta


# --- periodo, dictado conjunto y minors ---------------------------------------------------


@pytest.mark.parametrize(
    ("anio", "cuatrimestre", "identificador", "esperado"),
    [
        (2026, "2C", "2026-2C", []),
        (2027, "1C", "2027-1C", []),
        (2019, "1C", "2026-2C", ["periodo-incoherente"]),
        (2026, "1C", "2026-2C", ["periodo-incoherente"]),
        (2026, "2C", "2027-2C", ["periodo-incoherente"]),
    ],
)
def test_el_id_del_periodo_es_anio_y_cuatrimestre(
    anio: int, cuatrimestre: str, identificador: str, esperado: list[str]
) -> None:
    """El schema no puede relacionar tres campos con patrones independientes; C3 si."""
    datos = _horarios([])
    datos["periodo"].update(
        {"anio": anio, "cuatrimestre": cuatrimestre, "id": identificador}
    )
    assert _reglas(revisar(datos, "horarios", "prueba.json", None)) == esperado


def test_el_periodo_incoherente_dice_cual_seria_el_id() -> None:
    """El mensaje trae el id que corresponde: el que corrige no tiene que deducirlo."""
    datos = _horarios([])
    datos["periodo"].update({"anio": 2019, "cuatrimestre": "1C"})
    hallazgos = revisar(datos, "horarios", "prueba.json", None)
    assert "2019-1C" in hallazgos[0].mensaje
    assert hallazgos[0].nivel == ERROR


def test_el_dictado_conjunto_apunta_a_cursos_del_archivo() -> None:
    """Un codigo que no esta en el archivo apaga la exencion sin que nadie se entere."""
    juntos = [
        _curso(
            "93.18",
            [_bloque("lunes", "08:00", "10:00", ["002R"])],
            dictado_conjunto=["72.44"],
        ),
        _curso("72.44", [_bloque("lunes", "08:00", "10:00", ["002R"])]),
    ]
    assert _revisar_horarios(juntos) == []
    mal = copy.deepcopy(juntos)
    mal[0]["dictado_conjunto"] = ["99.99"]
    reglas = _revisar_horarios(mal)
    assert "dictado-conjunto-inexistente" in reglas
    hallazgos = revisar(_horarios(mal), "horarios", "prueba.json", None)
    tipeado = [h for h in hallazgos if h.regla == "dictado-conjunto-inexistente"]
    assert tipeado[0].nivel == WARNING
    assert "99.99" in tipeado[0].mensaje


def test_el_codigo_mal_tipeado_deja_de_eximir_la_colision() -> None:
    """Es la consecuencia que hace falta avisar: vuelve a aparecer `colision-de-aula`."""
    mal = [
        _curso(
            "93.18",
            [_bloque("lunes", "08:00", "10:00", ["002R"])],
            dictado_conjunto=["7.244"],
        ),
        _curso("72.44", [_bloque("lunes", "08:00", "10:00", ["002R"])]),
    ]
    assert sorted(_revisar_horarios(mal)) == [
        "colision-de-aula",
        "dictado-conjunto-inexistente",
    ]


@pytest.mark.parametrize(
    ("ciclo", "minors", "esperado"),
    [
        ("electiva", ["CD"], []),
        ("electiva", [], []),
        ("basico", [], []),
        ("profesional", [], []),
        ("basico", ["CD"], ["minor-en-obligatoria"]),
        ("profesional", ["CD"], ["minor-en-obligatoria"]),
    ],
)
def test_solo_las_electivas_declaran_minors(
    ciclo: str, minors: list[str], esperado: list[str]
) -> None:
    """Una obligatoria con siglas pinta chips de minor y suma creditos de otra carrera."""
    sugerido = None if ciclo == "electiva" else 1
    materia = _materia(
        "72.44", ciclo=ciclo, cuatrimestre_sugerido=sugerido, minors=minors
    )
    assert _revisar_plan([materia]) == esperado


def test_una_obligatoria_con_un_minor_inexistente_dispara_las_dos_reglas() -> None:
    """Las dos reglas miran cosas distintas y ninguna tapa a la otra."""
    assert sorted(_revisar_plan([_materia("72.44", minors=["ZZ"])])) == [
        "minor-en-obligatoria",
        "minor-inexistente",
    ]


def test_el_plan_del_repositorio_no_tiene_obligatorias_con_minors(raiz: Path) -> None:
    """La regla nueva no rechaza el plan publicado: 44 obligatorias y 85 electivas."""
    datos = canon.cargar(raiz / "data" / "v1" / "planes" / "S10-Rev23.json")
    assert "minor-en-obligatoria" not in _reglas(
        revisar(datos, "planes", "plan.json", None)
    )


# --- lo que el codigo exige tiene que estar escrito (F2.5 y F2.6) -------------------------

DOCUMENTOS_DEL_CONTRATO = (
    "docs/contrato.md",
    "entregables/sprint-1/CONTRATO-v1.md",
)


@pytest.mark.parametrize("relativa", DOCUMENTOS_DEL_CONTRATO)
def test_el_techo_de_ocho_horas_esta_documentado(raiz: Path, relativa: str) -> None:
    """Un error duro que ningun contrato declara es un falso positivo esperando a pasar."""
    texto = (raiz / relativa).read_text(encoding="utf-8")
    assert f"{DURACION_MAXIMA_MINUTOS // 60} h" in texto, relativa
    assert "bloque-demasiado-largo" in texto, relativa


@pytest.mark.parametrize(
    "relativa",
    (*DOCUMENTOS_DEL_CONTRATO, "schemas/v1/horarios.schema.json"),
)
def test_no_se_promete_un_hash_estable_que_no_existe(raiz: Path, relativa: str) -> None:
    """El unico hash del repositorio cubre el archivo entero, `ocupacion` incluida.

    La promesa vuelve cuando exista `hash_estable()`; hasta entonces, prometerla haria que
    alguien construya la corroboracion del Sprint 3 sobre una propiedad que no se cumple.
    """
    texto = (raiz / relativa).read_text(encoding="utf-8")
    assert not hasattr(canon, "hash_estable"), (
        "si existe, hay que volver a documentarla"
    )
    assert "fuera del hash estable" not in texto, relativa


def test_un_intensivo_de_una_semana_en_un_aula_ocupada_es_aviso_y_no_error() -> None:
    """74.61 (24/08–28/08/2026, lunes a viernes 08–13) usa 201R el lunes, donde 92.03 com. D
    esta todo el cuatrimestre 10–13. Lo publica el SGA asi: se avisa (`colision-de-aula-breve`)
    y el archivo se publica. Con mas de una semana en comun sigue siendo error."""
    intensivo = _curso("72.44", [_bloque("lunes", "08:00", "13:00", ["201R"])])
    intensivo["desde"], intensivo["hasta"] = "2026-08-24", "2026-08-28"
    regular = _curso("93.18", [_bloque("lunes", "10:00", "13:00", ["201R"])])

    hallazgos = revisar(_horarios([intensivo, regular]), "horarios", "x.json", CONTEXTO)
    assert [(h.nivel, h.regla) for h in hallazgos] == [
        (WARNING, "colision-de-aula-breve")
    ]

    intensivo["hasta"] = "2026-08-31"  # ocho dias en comun
    assert _revisar_horarios([intensivo, regular], CONTEXTO) == ["colision-de-aula"]


def test_el_fixture_del_intensivo_real_pasa_con_el_aviso(
    fixtures: Path, raiz: Path
) -> None:
    contexto = contexto_de_datos(raiz / "data")
    hallazgos = validar_archivo(
        fixtures / "deben-pasar" / "horarios-intensivo-en-aula-ocupada.json",
        contexto=contexto,
    )
    reglas = sorted({h.regla for h in hallazgos})
    assert not any(h.nivel == ERROR for h in hallazgos), [h.linea() for h in hallazgos]
    assert "colision-de-aula-breve" in reglas
