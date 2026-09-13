"""Tests de los parsers del SGA contra el corpus anonimizado de `tests/corpus/sga/`.

Los conteos que aparecen como literales (9 comisiones, 31 bloques, 20 filas, 472 cursos)
son el contraste con `material-raw/02-sga/HALLAZGOS.md`: el valor esperado se recalcula del
HTML con un recorrido independiente del parser y despues se compara contra el literal, de
modo que si el HTML del corpus cambiara el test falle y muestre la discrepancia.

Ningun test hace red.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import pytest
from bs4 import BeautifulSoup
from cuatris.sga import normalizar, parsers

#: Fecha de captura del material (`material-raw/02-sga/HALLAZGOS.md`).
CAPTURADO = "2026-09-09"


@pytest.fixture(scope="session")
def corpus_sga(corpus: Path) -> Path:
    return corpus / "sga"


def _leer(carpeta: Path, nombre: str) -> str:
    return (carpeta / nombre).read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def html_algebra(corpus_sga: Path) -> str:
    """93.18 Algebra Lineal: nueve comisiones, el caso rico de HALLAZGOS.md."""
    return _leer(corpus_sga, "horarios-materia-multiples-comisiones.html")


@pytest.fixture(scope="session")
def html_cripto(corpus_sga: Path) -> str:
    """72.44 Criptografia y Seguridad: una comision con un bloque virtual."""
    return _leer(corpus_sga, "horarios-materia-detalle-comisiones.html")


@pytest.fixture(scope="session")
def html_plantel(corpus_sga: Path) -> str:
    """Mismo curso, pero con la pestana Plantel Docente abierta."""
    return _leer(corpus_sga, "horarios-materia-detalle.html")


@pytest.fixture(scope="session")
def html_listado(corpus_sga: Path) -> str:
    return _leer(corpus_sga, "oferta-materias.html")


@pytest.fixture(scope="session")
def html_listado_filtrado(corpus_sga: Path) -> str:
    return _leer(corpus_sga, "oferta-filtrada-nombreycuatri.html")


# --------------------------------------------------------------------------------------
# Recuento independiente del HTML (no usa los parsers)
# --------------------------------------------------------------------------------------


def _celdas_de_horarios(html: str) -> list[BeautifulSoup]:
    """Celdas «Horarios» de la tabla de comisiones, recorriendo el HTML a mano."""
    sopa = BeautifulSoup(html, "html.parser")
    for tabla in sopa.find_all("table"):
        encabezados = [th.get_text(strip=True) for th in tabla.find_all("th")]
        if "Comisión" in encabezados and "Horarios" in encabezados:
            columna = encabezados.index("Horarios")
            celdas = []
            for fila in tabla.find("tbody").find_all("tr", recursive=False):
                celdas.append(fila.find_all("td", recursive=False)[columna])
            return celdas
    raise AssertionError("El corpus no tiene la tabla de comisiones.")


def _filas_del_listado(html: str) -> int:
    """Filas de la tabla de cursos, anclando por encabezado y nunca por un id de Wicket."""
    sopa = BeautifulSoup(html, "html.parser")
    for tabla in sopa.find_all("table"):
        encabezados = [th.get_text(strip=True) for th in tabla.find_all("th")]
        if "Cód." in encabezados and "Materia" in encabezados:
            cuerpo = tabla.find("tbody")
            assert cuerpo is not None, "La tabla del listado no tiene <tbody>."
            return len(cuerpo.find_all("tr", recursive=False))
    raise AssertionError("El corpus no tiene la tabla del listado de cursos.")


def _renglones_del_html(html: str) -> int:
    """Cantidad de `<div>` de bloque en el HTML: un renglon = un dia con una sola aula."""
    return sum(
        len(celda.find_all("div", recursive=False))
        for celda in _celdas_de_horarios(html)
    )


# --------------------------------------------------------------------------------------
# parsear_comisiones
# --------------------------------------------------------------------------------------


def test_algebra_tiene_nueve_comisiones_con_letras_no_contiguas(
    html_algebra: str,
) -> None:
    comisiones = parsers.parsear_comisiones(html_algebra)
    ids = [c.id for c in comisiones]

    assert len(comisiones) == len(_celdas_de_horarios(html_algebra))
    assert len(comisiones) == 9, "HALLAZGOS.md dice 9 comisiones para 93.18"
    assert ids == ["A", "B", "C", "D", "E", "F", "G", "H", "K"]
    assert "I" not in ids and "J" not in ids


def test_algebra_tiene_treinta_y_un_renglones_de_horario(html_algebra: str) -> None:
    comisiones = parsers.parsear_comisiones(html_algebra)
    crudos = sum(len(c.bloques_crudos) for c in comisiones)

    assert crudos == _renglones_del_html(html_algebra)
    assert crudos == 31, "HALLAZGOS.md dice 31 bloques en las 9 comisiones de 93.18"
    # Cada renglon del SGA trae como mucho un aula; al fusionar, la cuenta de aulas se
    # conserva y los renglones simultaneos pasan a ser un bloque con dos aulas.
    assert sum(len(b.aulas) for c in comisiones for b in c.bloques) == 31
    assert sum(len(c.bloques) for c in comisiones) == 27


def test_comisiones_con_dos_aulas_simultaneas(html_algebra: str) -> None:
    comisiones = {c.id: c for c in parsers.parsear_comisiones(html_algebra)}

    miercoles = [b for b in comisiones["B"].bloques if b.dia == "miercoles"]
    assert len(miercoles) == 1
    assert miercoles[0].aulas == ("003T", "004T")
    assert (miercoles[0].desde, miercoles[0].hasta) == ("10:00", "12:00")
    assert miercoles[0].sede == "sdt"

    lunes = [b for b in comisiones["K"].bloques if b.dia == "lunes"]
    assert len(lunes) == 1
    assert lunes[0].aulas == ("202R", "203R")
    assert (lunes[0].desde, lunes[0].hasta) == ("08:00", "10:00")


def test_comision_que_cruza_sedes_y_cupo_completo(html_algebra: str) -> None:
    comisiones = {c.id: c for c in parsers.parsear_comisiones(html_algebra)}
    a = comisiones["A"]

    sedes = {b.dia: b.sede for b in a.bloques}
    assert sedes == {"lunes": "rectorado", "miercoles": "sdt", "jueves": "rectorado"}
    assert all(b.modalidad == "presencial" for b in a.bloques)
    assert a.cupo == parsers.Cupo(capacidad=48)
    assert a.ocupacion == parsers.Ocupacion(inscriptos=48, al=None)
    assert a.docentes == ("Cabana, Adriana Elena", "Peña, Nelly Haydee")


def test_bloque_virtual_sin_aula_ni_sede(html_cripto: str) -> None:
    comisiones = parsers.parsear_comisiones(html_cripto)
    assert [c.id for c in comisiones] == ["S"]

    jueves = [b for b in comisiones[0].bloques if b.dia == "jueves"]
    assert len(jueves) == 1
    assert jueves[0].modalidad == "virtual_sincronica"
    assert jueves[0].sede is None
    assert jueves[0].aulas == ()


def test_comisiones_rechaza_un_html_sin_la_tabla() -> None:
    with pytest.raises(parsers.EstructuraInesperada):
        parsers.parsear_comisiones("<html><body><p>Sin tabla</p></body></html>")


def test_bloque_con_modalidad_desconocida_falla_con_el_texto_original() -> None:
    html = """
    <table><thead><tr><th>Comisión</th><th>Horarios</th><th>Profesores</th>
    <th>Cupo</th></tr></thead><tbody><tr>
      <td><label>A</label></td>
      <td><div><span>Lunes</span><span>14:00</span> - <span>16:00</span>
        <span><span><span>Aula externa: <span>Holográfica</span></span></span></span>
      </div></td>
      <td></td><td>1 / 2</td>
    </tr></tbody></table>
    """
    with pytest.raises(normalizar.ValorDesconocido) as error:
        parsers.parsear_comisiones(html)
    assert "Holográfica" in str(error.value)


def test_bloque_presencial_sin_aula_no_queda_sin_sede_en_silencio() -> None:
    """CONTRATO-v1.md §1: `sede: null` solo si la modalidad no es presencial."""
    html = """
    <table><thead><tr><th>Comisión</th><th>Horarios</th><th>Profesores</th>
    <th>Cupo</th></tr></thead><tbody><tr>
      <td><label>A</label></td>
      <td><div><span>Lunes</span><span>14:00</span> - <span>16:00</span>
        <span><span><span>Aula externa: <span>Presencial</span></span></span></span>
      </div></td>
      <td></td><td>1 / 20</td>
    </tr></tbody></table>
    """
    with pytest.raises(parsers.EstructuraInesperada) as error:
        parsers.parsear_comisiones(html)
    assert "presencial" in str(error.value)


@pytest.mark.parametrize("cupo", ["lleno / -", "48 / 49 / 50", "sin datos", "- / 30"])
def test_un_cupo_con_la_forma_rota_falla_como_error_de_dominio(cupo: str) -> None:
    """Una celda de cupo que no es «inscriptos / capacidad» da `EstructuraInesperada`.

    Sin el guardia que exige dos numeros, `int("lleno")` sube como `ValueError` crudo hasta la
    CLI: un stacktrace en medio de una bajada en vez de un error legible con el fragmento.
    """
    html = f"""
    <table><thead><tr><th>Comisión</th><th>Horarios</th><th>Profesores</th>
    <th>Cupo</th></tr></thead><tbody><tr>
      <td><label>A</label></td>
      <td><div><span>Lunes</span><span>14:00</span> - <span>16:00</span>
        <span><span><span>Aula ITBA: <span>001R #----&gt; Sede Rectorado</span></span>
        <span>Aula externa: <span>Presencial</span></span></span></span>
      </div></td>
      <td></td><td>{cupo}</td>
    </tr></tbody></table>
    """
    with pytest.raises(parsers.EstructuraInesperada) as error:
        parsers.parsear_comisiones(html)
    assert "cupo" in str(error.value)
    assert cupo in str(error.value)


def test_celda_de_horarios_con_marcado_desconocido_no_deja_la_comision_sin_bloques() -> (
    None
):
    """Si Wicket cambia el `<div>` por otro tag, se avisa en vez de devolver `bloques=[]`."""
    html = """
    <table><thead><tr><th>Comisión</th><th>Horarios</th><th>Profesores</th>
    <th>Cupo</th></tr></thead><tbody><tr>
      <td><label>A</label></td>
      <td><p><span>Lunes</span><span>14:00</span> - <span>16:00</span>
        <span><span><span>Aula ITBA: <span>001R #----> Sede Rectorado</span></span></span></span>
        <span><span><span>Aula externa: <span>Presencial</span></span></span></span>
      </p></td>
      <td></td><td>1 / 20</td>
    </tr></tbody></table>
    """
    with pytest.raises(parsers.EstructuraInesperada) as error:
        parsers.parsear_comisiones(html)
    assert "Horarios" in str(error.value)


# --------------------------------------------------------------------------------------
# parsear_curso
# --------------------------------------------------------------------------------------


def test_curso_toma_codigo_nombre_y_departamento_de_la_cabecera(
    html_algebra: str,
) -> None:
    curso = parsers.parsear_curso(html_algebra)

    assert curso.codigo == "93.18"
    assert curso.nombre == "Álgebra Lineal"
    assert curso.departamento == "Ciencias Exactas y Naturales"
    assert curso.cuatrimestre == "Segundo Cuat."
    assert curso.anio == 2026
    # El detalle del curso no publica fechas de dictado: salen del listado.
    assert curso.desde is None and curso.hasta is None
    assert len(curso.comisiones) == 9


def test_curso_rechaza_una_pestana_que_no_sea_comisiones(html_plantel: str) -> None:
    with pytest.raises(parsers.EstructuraInesperada) as error:
        parsers.parsear_curso(html_plantel)
    assert "Comisiones" in str(error.value)


# --------------------------------------------------------------------------------------
# parsear_listado
# --------------------------------------------------------------------------------------


def test_listado_trae_las_filas_de_la_pagina_y_el_enlace_al_detalle(
    html_listado: str,
) -> None:
    listado = parsers.parsear_listado(html_listado)
    filas_html = _filas_del_listado(html_listado)

    assert len(listado.filas) == filas_html
    assert len(listado.filas) == 20, "HALLAZGOS.md dice que el listado pagina de a 20"

    primera = listado.filas[0]
    assert primera.codigo == "30.28"
    assert primera.nombre == "Accionamientos Industriales"
    assert primera.departamento == "Ambiente y Movilidad"
    assert primera.nivel == "Grado"
    assert primera.periodo == "2026-2C"
    assert primera.cuatrimestre_texto == "Segundo Cuat."
    assert primera.anio == 2026
    assert primera.desde == "2026-07-26"
    assert primera.hasta == "2026-12-31"
    assert primera.activo is True
    assert primera.alumnos == 3
    assert primera.enlace_detalle is not None
    assert primera.enlace_detalle.startswith("https://sga.itba.edu.ar/app2/")
    assert all(f.enlace_detalle for f in listado.filas)

    # El caso «dos materias homonimas con distinto codigo» de HALLAZGOS.md.
    acustica = [
        f.codigo for f in listado.filas if f.nombre == "Acústica para Ingenieros"
    ]
    assert acustica == ["23.05", "25.66"]


def test_paginacion_del_listado(html_listado: str) -> None:
    sopa = BeautifulSoup(html_listado, "html.parser")
    etiqueta = sopa.select_one("div.navigatorLabel").get_text(" ", strip=True)
    total_html = int(re.search(r"de\s+(\d+)", etiqueta).group(1))

    paginacion = parsers.parsear_listado(html_listado).paginacion

    assert paginacion.total_filas == total_html
    assert paginacion.total_filas == 472, "HALLAZGOS.md dice 472 cursos"
    assert paginacion.pagina == 1
    assert paginacion.primera_fila == 1
    assert paginacion.ultima_fila == 20
    assert paginacion.tamano_pagina == 20
    assert paginacion.total_paginas == 24, "472 cursos de a 20 son 24 paginas"
    assert paginacion.hay_siguiente is True
    assert (
        paginacion.enlace_siguiente == sopa.select_one("div.navigator a.next")["href"]
    )
    assert paginacion.enlace_ultima == sopa.select_one("div.navigator a.last")["href"]


def test_listado_de_una_sola_pagina_no_tiene_siguiente(
    html_listado_filtrado: str,
) -> None:
    listado = parsers.parsear_listado(html_listado_filtrado)

    assert len(listado.filas) == 1
    assert listado.filas[0].codigo == "72.44"
    assert listado.filas[0].periodo == "2026-1C"
    assert listado.filas[0].desde == "2026-03-01"
    assert listado.filas[0].hasta == "2026-07-25"
    assert listado.paginacion.hay_siguiente is False
    assert listado.paginacion.enlace_siguiente is None
    assert listado.paginacion.total_filas is None


# --------------------------------------------------------------------------------------
# Extractores de Wicket
# --------------------------------------------------------------------------------------


def test_ids_de_filtro_se_extraen_del_html_y_no_se_fijan(html_listado: str) -> None:
    filtros = parsers.extraer_ids_filtro(html_listado)

    assert re.fullmatch(r"results:topToolbars:toolbars:\d+", filtros.prefijo)
    assert filtros.campos["Cód."] == f"{filtros.prefijo}:filters:1:filter:filter"
    assert filtros.campos["Materia"] == f"{filtros.prefijo}:filters:2:filter:filter"
    assert filtros.campos["Nivel"] == f"{filtros.prefijo}:filters:3:filter:filter"
    assert (
        filtros.campos["Departamento"] == f"{filtros.prefijo}:filters:4:filter:filter"
    )
    assert filtros.campos["Período"] == f"{filtros.prefijo}:filters:5:filter:filter"
    assert filtros.campos["Año"] == f"{filtros.prefijo}:filters:6:filter:filter"
    assert filtros.campo_go == f"{filtros.prefijo}:filters:12:filter:go"
    assert filtros.id_formulario and filtros.accion
    assert filtros.campo_oculto == f"{filtros.id_formulario}_hf_0"


def test_ids_de_filtro_fallan_si_el_html_no_los_tiene() -> None:
    with pytest.raises(parsers.EstructuraInesperada):
        parsers.extraer_ids_filtro("<html><body></body></html>")


#: Formulario de login tal como lo documenta `material-raw/02-sga/HALLAZGOS.md`.
#: No hay HTML de login en el corpus: la pantalla no se guardo porque se llega a ella sin
#: sesion y el material se capturo ya autenticado.
HTML_LOGIN = """
<html><body>
<form id="id1" method="post" action="../../../ruta-cifrada;jsessionid=XYZ">
  <input type="hidden" name="id1_hf_0" id="id1_hf_0" />
  <input type="text"     maxlength="20" name="user"     class="required valid"/>
  <input type="password" maxlength="20" name="password" class="required valid"/>
  <input type="hidden" id="js" value="0" name="js" class="valid">
  <input type="submit" name="login" value="Ingresar">
</form>
</body></html>
"""


def test_formulario_de_login_se_ancla_en_el_campo_de_contrasena() -> None:
    accion, ocultos = parsers.extraer_formulario_login(HTML_LOGIN)

    assert accion == "../../../ruta-cifrada;jsessionid=XYZ"
    assert ocultos == {"id1_hf_0": "", "js": "0"}


def test_formulario_de_login_falla_si_no_hay_campo_de_contrasena() -> None:
    with pytest.raises(parsers.EstructuraInesperada):
        parsers.extraer_formulario_login("<html><body><form></form></body></html>")


# --------------------------------------------------------------------------------------
# normalizar
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("Lunes", "lunes"),
        ("Martes", "martes"),
        ("Miércoles", "miercoles"),
        ("Jueves", "jueves"),
        ("Viernes", "viernes"),
        ("Sábado", "sabado"),
    ],
)
def test_normalizar_dia(texto: str, esperado: str) -> None:
    assert normalizar.dia(texto) == esperado


#: Variantes que **no** son la clave de la tabla: son el modo de falla real cuando el SGA
#: publica la pagina sin tilde, en mayusculas, en NFD o con espacios de mas. Si la tabla se
#: consultara con el texto crudo, cada una de estas seria un `ValorDesconocido` en produccion.
@pytest.mark.parametrize(
    ("funcion", "texto", "esperado"),
    [
        (normalizar.dia, "Miercoles", "miercoles"),
        (normalizar.dia, "MIÉRCOLES", "miercoles"),
        (normalizar.dia, "miércoles", "miercoles"),
        (normalizar.dia, unicodedata.normalize("NFD", "Sábado"), "sabado"),
        (normalizar.dia, " Sabado ", "sabado"),
        (normalizar.modalidad, "VIRTUAL SINCRONICO", "virtual_sincronica"),
        (
            normalizar.modalidad,
            unicodedata.normalize("NFD", "Virtual sincrónico"),
            "virtual_sincronica",
        ),
        (normalizar.sede, "sede rectorado", "rectorado"),
        (normalizar.cuatrimestre, " Segundo  Cuat. ", "2C"),
        (normalizar.cuatrimestre, "SEGUNDO CUAT.", "2C"),
    ],
)
def test_normalizar_tolera_acentos_mayusculas_y_espacios(
    funcion, texto: str, esperado: str
) -> None:
    assert funcion(texto) == esperado
    assert texto not in DIAS_Y_TABLAS, (
        "el caso tiene que ser distinto de la clave de la tabla"
    )


#: Las claves literales de las tablas, para comprobar que las variantes de arriba no lo son.
DIAS_Y_TABLAS = (
    set(normalizar.DIAS)
    | set(normalizar.MODALIDADES)
    | set(normalizar.SEDES)
    | set(normalizar.CUATRIMESTRES)
)


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("Presencial", "presencial"),
        ("Virtual Sinc.", "virtual_sincronica"),
        ("Virtual sincrónico", "virtual_sincronica"),
        ("Virtual Asinc.", "virtual_asincronica"),
        ("Blended", "blended"),
    ],
)
def test_normalizar_modalidad(texto: str, esperado: str) -> None:
    assert normalizar.modalidad(texto) == esperado


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("Rectorado", "rectorado"),
        ("Sede Rectorado", "rectorado"),
        ("SDT", "sdt"),
        ("SDF", "sdf"),
        ("Sede Distrito Tecnológico", "sdt"),
        ("Sede Distrito Financiero", "sdf"),
    ],
)
def test_normalizar_sede(texto: str, esperado: str) -> None:
    assert normalizar.sede(texto) == esperado


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [("14:00", "14:00"), ("14", "14:00"), ("8", "08:00"), ("08:30", "08:30")],
)
def test_normalizar_hora(texto: str, esperado: str) -> None:
    assert normalizar.hora(texto) == esperado


def test_normalizar_fecha_y_periodo() -> None:
    assert normalizar.fecha("26/07/2026") == "2026-07-26"
    assert normalizar.fecha("01/03/2026") == "2026-03-01"
    assert normalizar.periodo("Segundo Cuat.", 2026) == "2026-2C"
    assert normalizar.periodo("Primer Cuat.", "2026") == "2026-1C"


@pytest.mark.parametrize(
    ("funcion", "texto"),
    [
        (normalizar.dia, "Domingo"),
        (normalizar.dia, "Lunez"),
        (normalizar.modalidad, "Híbrido"),
        (normalizar.sede, "MADERO"),
        (normalizar.cuatrimestre, "Verano"),
        (normalizar.hora, "25:00"),
        (normalizar.hora, "mediodía"),
        (normalizar.fecha, "2026-07-26"),
        (normalizar.fecha, "31/02/2026"),
    ],
)
def test_valor_desconocido_incluye_el_texto_original(funcion, texto: str) -> None:
    with pytest.raises(normalizar.ValorDesconocido) as error:
        funcion(texto)
    assert texto in str(error.value)
    assert error.value.valor == texto


# --------------------------------------------------------------------------------------
# a_contrato
# --------------------------------------------------------------------------------------


def test_a_contrato_arma_el_json_de_horarios(
    html_cripto: str, html_listado_filtrado: str
) -> None:
    """72.44 en 2026-1C: el detalle da las comisiones y el listado, las fechas de dictado.

    Es el mismo curso y el mismo periodo en las dos paginas del corpus, que es exactamente
    lo que hace el scraper: primero el listado, despues el detalle de cada fila.
    """
    fila = parsers.parsear_listado(html_listado_filtrado).filas[0]
    curso = parsers.parsear_curso(html_cripto)
    assert (curso.codigo, curso.anio, curso.cuatrimestre) == (
        "72.44",
        2026,
        "Primer Cuat.",
    )
    assert fila.codigo == curso.codigo

    curso = parsers.Curso(
        codigo=curso.codigo,
        nombre=curso.nombre,
        departamento=curso.departamento,
        desde=fila.desde,
        hasta=fila.hasta,
        cuatrimestre=curso.cuatrimestre,
        anio=curso.anio,
        comisiones=curso.comisiones,
    )
    periodo = parsers.Periodo(
        id=fila.periodo,
        anio=fila.anio,
        cuatrimestre=normalizar.cuatrimestre(fila.cuatrimestre_texto),
        desde=fila.desde,
        hasta=fila.hasta,
    )

    assert parsers.a_contrato([curso], periodo, CAPTURADO) == {
        "contrato": "1.0.0",
        "periodo": {
            "id": "2026-1C",
            "anio": 2026,
            "cuatrimestre": "1C",
            "desde": "2026-03-01",
            "hasta": "2026-07-25",
        },
        "fuente": {"sistema": "sga", "capturado": CAPTURADO},
        "cursos": [
            {
                "codigo": "72.44",
                "nombre": "Criptografía y Seguridad",
                "departamento": "Sistemas Digitales y Datos",
                "desde": "2026-03-01",
                "hasta": "2026-07-25",
                "dictado_conjunto": [],
                "comisiones": [
                    {
                        "id": "S",
                        "cupo": {"capacidad": 70},
                        "ocupacion": {"inscriptos": 51, "al": CAPTURADO},
                        "docentes": [
                            "Suarez, Leandro Ariel",
                            "Abad, Pablo",
                            "Ramele, Rodrigo",
                            "Arias Roig, Ana Maria",
                        ],
                        "bloques": [
                            {
                                "dia": "lunes",
                                "desde": "15:00",
                                "hasta": "18:00",
                                "sede": "rectorado",
                                "modalidad": "presencial",
                                "aulas": ["002R", "003R"],
                            },
                            {
                                "dia": "jueves",
                                "desde": "16:00",
                                "hasta": "19:00",
                                "sede": None,
                                "modalidad": "virtual_sincronica",
                                "aulas": [],
                            },
                        ],
                    }
                ],
            }
        ],
    }


def test_a_contrato_usa_la_fecha_de_captura_como_al(html_cripto: str) -> None:
    curso = parsers.parsear_curso(html_cripto)
    comision = curso.comisiones[0]
    assert comision.ocupacion.al is None, "la pestana Comisiones no publica fecha"

    curso = parsers.Curso(
        codigo=curso.codigo,
        nombre=curso.nombre,
        departamento=curso.departamento,
        desde="2026-03-01",
        hasta="2026-07-25",
        cuatrimestre=curso.cuatrimestre,
        anio=curso.anio,
        comisiones=curso.comisiones,
    )
    periodo = parsers.Periodo("2026-1C", 2026, "1C", "2026-03-01", "2026-07-25")
    salida = parsers.a_contrato([curso], periodo, "2026-09-20")

    assert salida["cursos"][0]["comisiones"][0]["ocupacion"]["al"] == "2026-09-20"


def test_a_contrato_exige_las_fechas_de_dictado(html_cripto: str) -> None:
    curso = parsers.parsear_curso(html_cripto)
    periodo = parsers.Periodo("2026-1C", 2026, "1C", "2026-03-01", "2026-07-25")

    with pytest.raises(parsers.EstructuraInesperada) as error:
        parsers.a_contrato([curso], periodo, CAPTURADO)
    assert "72.44" in str(error.value)


def test_a_contrato_no_serializa_un_bloque_con_contenido_sin_interpretar() -> None:
    bloque = parsers.Bloque(
        dia="lunes",
        desde="08:00",
        hasta="10:00",
        sede="rectorado",
        modalidad="presencial",
        aulas=("001R",),
        extra="Se dicta en linea la primera semana",
    )
    comision = parsers.Comision(
        id="A",
        cupo=None,
        ocupacion=None,
        docentes=(),
        bloques=(bloque,),
        bloques_crudos=(bloque,),
    )
    curso = parsers.Curso(
        codigo="93.18",
        nombre="Álgebra Lineal",
        departamento=None,
        desde="2026-07-26",
        hasta="2026-12-31",
        cuatrimestre="Segundo Cuat.",
        anio=2026,
        comisiones=(comision,),
    )
    periodo = parsers.Periodo("2026-2C", 2026, "2C", "2026-07-26", "2026-12-31")

    with pytest.raises(parsers.EstructuraInesperada) as error:
        parsers.a_contrato([curso], periodo, CAPTURADO)
    assert "Se dicta en linea la primera semana" in str(error.value)


def test_a_contrato_no_serializa_un_bloque_presencial_sin_sede() -> None:
    bloque = parsers.Bloque(
        dia="lunes",
        desde="08:00",
        hasta="10:00",
        sede=None,
        modalidad="presencial",
        aulas=(),
    )
    comision = parsers.Comision(
        id="A",
        cupo=None,
        ocupacion=None,
        docentes=(),
        bloques=(bloque,),
        bloques_crudos=(bloque,),
    )
    curso = parsers.Curso(
        codigo="93.18",
        nombre="Álgebra Lineal",
        departamento=None,
        desde="2026-07-26",
        hasta="2026-12-31",
        cuatrimestre="Segundo Cuat.",
        anio=2026,
        comisiones=(comision,),
    )
    periodo = parsers.Periodo("2026-2C", 2026, "2C", "2026-07-26", "2026-12-31")

    with pytest.raises(parsers.EstructuraInesperada) as error:
        parsers.a_contrato([curso], periodo, CAPTURADO)
    assert "sede" in str(error.value)


def test_el_corpus_esta_anonimizado(corpus_sga: Path) -> None:
    archivos = sorted(corpus_sga.glob("*.html"))
    assert archivos, "el corpus del SGA esta vacio"
    for archivo in archivos:
        texto = archivo.read_text(encoding="utf-8")
        assert "CAULES" not in texto.upper(), archivo.name
        assert "APELLIDO, NOMBRE" in texto, archivo.name
