"""Tests del barrido `cuatris sga bajar` y del checkpoint.

**Ningun test hace red**: el SGA esta simulado con `httpx.MockTransport` y todas las paginas
salen del corpus anonimizado de `tests/corpus/sga/`. Las paginas del listado se arman
recortando filas del listado real, para que los anclajes que se prueban sean los del HTML del
SGA y no los de un HTML escrito para el test.

Las credenciales que aparecen son inventadas y no valen en ningun lado.
"""

from __future__ import annotations

import argparse
import logging
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from bs4 import BeautifulSoup
from cuatris import canon, sga
from cuatris import validar as validacion
from cuatris.sga import bajar, parsers
from cuatris.sga.checkpoint import CACHE, Checkpoint, ErrorDeCheckpoint
from cuatris.sga.cliente import ClienteSGA, enlace_de_pestana, enlace_por_texto

USUARIO = "usuario.de.prueba"
CLAVE = "contrasena-de-prueba-461"

#: Formulario de login segun `material-raw/02-sga/HALLAZGOS.md` (la pantalla de login no esta
#: en el corpus: capturarla exigiria una sesion real).
LOGIN = """<html><head><title>Sistema de Gestión Académica</title></head><body>
<form id="id1" method="post" action="../../../c1f7ad4/login;jsessionid=NODO1">
  <input type="hidden" name="id1_hf_0" id="id1_hf_0" value="" />
  <input type="text" maxlength="20" name="user" />
  <input type="password" maxlength="20" name="password" />
  <input type="submit" name="login" value="Ingresar" />
</form></body></html>"""

URL_LOGIN = "https://sga.itba.edu.ar/c1f7ad4/login;jsessionid=NODO1"
COOKIES = [("set-cookie", "JSESSIONID=abc; Path=/")]

_CODIGO = re.compile(r"^\d{2}\.\d{2}$")


# --------------------------------------------------------------------------------------
# Corpus y recortes
# --------------------------------------------------------------------------------------


@pytest.fixture(scope="session")
def corpus_sga(corpus: Path) -> Path:
    return corpus / "sga"


@pytest.fixture(scope="session")
def html_listado(corpus_sga: Path) -> str:
    """Listado de cursos de Grado / Segundo Cuat. / 2026, pagina 1 de 24."""
    return (corpus_sga / "oferta-materias.html").read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def html_listado_1c(corpus_sga: Path) -> str:
    """Listado filtrado con un solo curso, 72.44 del Primer Cuat. 2026."""
    return (corpus_sga / "oferta-filtrada-nombreycuatri.html").read_text(
        encoding="utf-8"
    )


@pytest.fixture(scope="session")
def html_algebra(corpus_sga: Path) -> str:
    """93.18 Algebra Lineal, detalle con la pestana Comisiones ya abierta."""
    return (corpus_sga / "horarios-materia-multiples-comisiones.html").read_text(
        encoding="utf-8"
    )


@pytest.fixture(scope="session")
def html_cripto_plantel(corpus_sga: Path) -> str:
    """72.44, detalle con la pestana Plantel Docente abierta (como lo deja la lupa)."""
    return (corpus_sga / "horarios-materia-detalle.html").read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def html_cripto_comisiones(corpus_sga: Path) -> str:
    """72.44, pestana Comisiones."""
    return (corpus_sga / "horarios-materia-detalle-comisiones.html").read_text(
        encoding="utf-8"
    )


def _codigo_de_fila(fila: Any) -> str | None:
    for celda in fila.find_all(["td", "th"], recursive=False):
        texto = celda.get_text(" ", strip=True)
        if _CODIGO.match(texto):
            return texto
    return None


def recortar(html: str, codigos: set[str], *, con_siguiente: bool = False) -> str:
    """Deja en el listado solo las filas de `codigos` y, si se pide, quita el «siguiente».

    Sirve para simular paginas cortas sin inventar HTML: las filas son las del SGA.
    """
    sopa = BeautifulSoup(html, "html.parser")
    for fila in sopa.select("tbody tr"):
        codigo = _codigo_de_fila(fila)
        if codigo is not None and codigo not in codigos:
            fila.decompose()
    if not con_siguiente:
        for enlace in sopa.select("div.navigator a.next"):
            enlace.decompose()
    return str(sopa)


# --------------------------------------------------------------------------------------
# SGA simulado
# --------------------------------------------------------------------------------------


class SGAFalso:
    """Servidor simulado: responde por URL exacta y registra lo que se le pidio.

    Una URL que no esta en el mapa devuelve 404, para que un pedido inesperado se vea en el
    test en vez de pasar desapercibido.
    """

    def __init__(self, inicio: str, paginas: dict[str, str] | None = None) -> None:
        self.inicio = inicio
        self.paginas = dict(paginas or {})
        self.pedidos: list[str] = []

    def agregar(self, url: str, html: str) -> None:
        self.paginas[url] = html

    def manejar(self, peticion: httpx.Request) -> httpx.Response:
        url = str(peticion.url)
        self.pedidos.append(url)
        if peticion.url.path == "/app2/":
            return httpx.Response(200, html=LOGIN, headers=COOKIES)
        if url == URL_LOGIN:
            return httpx.Response(200, html=self.inicio)
        if url in self.paginas:
            return httpx.Response(200, html=self.paginas[url])
        return httpx.Response(404, text=f"sin ruta simulada para {url}")

    def cliente(self) -> ClienteSGA:
        return ClienteSGA(
            transporte=httpx.MockTransport(self.manejar),
            reloj=lambda: 0.0,
            dormir=lambda _s: None,
        )

    def pidio(self, url: str) -> bool:
        return url in self.pedidos


def _fila(html: str, codigo: str) -> parsers.FilaListado:
    for fila in parsers.parsear_listado(html).filas:
        if fila.codigo == codigo:
            return fila
    raise AssertionError(f"el corpus no trae la fila de {codigo}")


def _argumentos(**valores: Any) -> argparse.Namespace:
    """Arma los argumentos como lo hace `cli.py`: por el parser real del subcomando."""
    parser = argparse.ArgumentParser(prog="cuatris")
    sub = parser.add_subparsers(dest="subcomando")
    hijo = sub.add_parser("sga")
    sga.configurar(hijo)
    partes = ["sga", "bajar"]
    for nombre, valor in valores.items():
        opcion = "--" + nombre.replace("_", "-")
        if valor is True:
            partes.append(opcion)
        elif valor is not None and valor is not False:
            partes += [opcion, str(valor)]
    return parser.parse_args(partes)


@pytest.fixture
def entorno_con_credenciales(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(bajar.VAR_USUARIO, USUARIO)
    monkeypatch.setenv(bajar.VAR_CLAVE, CLAVE)


# --------------------------------------------------------------------------------------
# Filtros y paginacion
# --------------------------------------------------------------------------------------


def test_el_filtro_usa_los_nombres_de_campo_del_html_y_no_ids_fijos(
    html_listado: str,
) -> None:
    filtros = parsers.extraer_ids_filtro(html_listado)
    falso = SGAFalso(html_listado)
    falso.agregar(filtros.accion or "", html_listado)

    with falso.cliente() as cliente:
        bajar.filtrar_listado(
            cliente,
            html_listado,
            nivel="Grado",
            cuatrimestre_texto="Segundo Cuat.",
            anio=2026,
        )

    envio = [u for u in falso.pedidos if u == filtros.accion]
    assert envio, "el filtro se postea al «action» del formulario del listado"
    # Los valores de los desplegables salen del `value` del `<option>` con ese texto visible.
    assert bajar.valor_de_opcion(html_listado, filtros.campos["Nivel"], "Grado") == "1"
    assert (
        bajar.valor_de_opcion(html_listado, filtros.campos["Período"], "Segundo Cuat.")
        == "1"
    )


def test_el_filtro_avisa_si_el_desplegable_no_tiene_la_opcion(
    html_listado: str,
) -> None:
    filtros = parsers.extraer_ids_filtro(html_listado)
    with pytest.raises(parsers.EstructuraInesperada, match="Doctorado"):
        bajar.valor_de_opcion(html_listado, filtros.campos["Nivel"], "Doctorado")


def test_la_paginacion_sigue_el_enlace_siguiente_hasta_el_final(
    html_listado: str,
) -> None:
    """Dos paginas simuladas: el barrido junta las filas de las dos y para al terminar."""
    siguiente = parsers.parsear_listado(html_listado).paginacion.enlace_siguiente
    assert siguiente
    pagina1 = recortar(html_listado, {"30.28", "23.05"}, con_siguiente=True)
    pagina2 = recortar(html_listado, {"93.18", "25.03"})

    falso = SGAFalso(html_listado, {siguiente: pagina2})
    with falso.cliente() as cliente:
        filas = list(bajar.recorrer_listado(cliente, pagina1, periodo="2026-2C"))

    assert [f.codigo for f in filas] == ["30.28", "23.05", "93.18", "25.03"]
    assert falso.pidio(siguiente)


def test_la_paginacion_se_detiene_en_el_limite(html_listado: str) -> None:
    siguiente = parsers.parsear_listado(html_listado).paginacion.enlace_siguiente
    pagina1 = recortar(html_listado, {"30.28", "23.05"}, con_siguiente=True)
    falso = SGAFalso(html_listado, {siguiente or "": recortar(html_listado, {"93.18"})})

    with falso.cliente() as cliente:
        filas = list(
            bajar.recorrer_listado(cliente, pagina1, periodo="2026-2C", limite=1)
        )

    assert [f.codigo for f in filas] == ["30.28"]
    assert not falso.pidio(siguiente or ""), (
        "con --limite no se pide la pagina siguiente"
    )


def test_una_fila_de_otro_periodo_corta_el_barrido(html_listado: str) -> None:
    pagina = recortar(html_listado, {"30.28"})
    falso = SGAFalso(html_listado)
    with (
        falso.cliente() as cliente,
        pytest.raises(parsers.EstructuraInesperada, match="filtro"),
    ):
        list(bajar.recorrer_listado(cliente, pagina, periodo="2026-1C"))


# --------------------------------------------------------------------------------------
# Detalle de un curso
# --------------------------------------------------------------------------------------


def test_bajar_curso_abre_la_pestana_comisiones_desde_el_plantel(
    html_listado_1c: str, html_cripto_plantel: str, html_cripto_comisiones: str
) -> None:
    fila = _fila(html_listado_1c, "72.44")
    url_pestana = enlace_de_pestana(html_cripto_plantel, "Comisiones")
    falso = SGAFalso(
        html_listado_1c,
        {
            fila.enlace_detalle or "": html_cripto_plantel,
            url_pestana: html_cripto_comisiones,
        },
    )
    with falso.cliente() as cliente:
        curso = bajar.bajar_curso(cliente, fila)

    assert curso.codigo == "72.44"
    assert curso.comisiones
    # Las fechas de dictado no estan en el detalle: se copian de la fila del listado.
    assert (curso.desde, curso.hasta) == (fila.desde, fila.hasta)
    assert falso.pidio(url_pestana)


def test_bajar_curso_falla_si_el_sga_devuelve_otro_curso(
    html_listado: str, html_algebra: str
) -> None:
    fila = _fila(html_listado, "30.28")
    falso = SGAFalso(html_listado, {fila.enlace_detalle or "": html_algebra})
    with (
        falso.cliente() as cliente,
        pytest.raises(parsers.EstructuraInesperada, match="93.18"),
    ):
        bajar.bajar_curso(cliente, fila)


# --------------------------------------------------------------------------------------
# Checkpoint
# --------------------------------------------------------------------------------------


def test_el_checkpoint_guarda_una_linea_por_curso(tmp_path: Path) -> None:
    punto = Checkpoint(tmp_path / "2026-2C.jsonl", "2026-2C")
    punto.agregar("93.18", {"codigo": "93.18", "comisiones": []})
    punto.agregar("30.28", {"codigo": "30.28", "comisiones": []})

    assert punto.codigos() == {"93.18", "30.28"}
    assert list(punto.cargar()) == ["93.18", "30.28"]  # conserva el orden de escritura
    assert (
        len((tmp_path / "2026-2C.jsonl").read_text(encoding="utf-8").splitlines()) == 2
    )


def test_el_checkpoint_descarta_la_ultima_linea_truncada(tmp_path: Path) -> None:
    ruta = tmp_path / "2026-2C.jsonl"
    punto = Checkpoint(ruta, "2026-2C")
    punto.agregar("93.18", {"codigo": "93.18"})
    with ruta.open("a", encoding="utf-8") as archivo:
        archivo.write('{"codigo": "30.2')  # corte a mitad de la escritura

    assert punto.codigos() == {"93.18"}


def test_el_checkpoint_rechaza_una_linea_rota_en_el_medio(tmp_path: Path) -> None:
    ruta = tmp_path / "2026-2C.jsonl"
    ruta.write_text(
        '{"codigo": "9\n{"codigo": "30.28", "curso": {}}\n', encoding="utf-8"
    )
    with pytest.raises(ErrorDeCheckpoint, match="JSON valido"):
        Checkpoint(ruta, "2026-2C").cargar()


def test_el_checkpoint_rechaza_otro_periodo(tmp_path: Path) -> None:
    ruta = tmp_path / "2026-2C.jsonl"
    Checkpoint(ruta, "2026-1C").agregar("93.18", {"codigo": "93.18"})
    with pytest.raises(ErrorDeCheckpoint, match="2026-1C"):
        Checkpoint(ruta, "2026-2C").cargar()


def test_borrar_el_checkpoint(tmp_path: Path) -> None:
    punto = Checkpoint(tmp_path / "2026-2C.jsonl", "2026-2C")
    assert punto.borrar() is False
    punto.agregar("93.18", {"codigo": "93.18"})
    assert punto.borrar() is True
    assert punto.codigos() == set()


# --------------------------------------------------------------------------------------
# Barrido completo
# --------------------------------------------------------------------------------------


def _sga_de_algebra(html_listado: str, html_algebra: str) -> tuple[SGAFalso, str]:
    """SGA simulado con una sola pagina de listado: 93.18 Algebra Lineal."""
    filtros = parsers.extraer_ids_filtro(html_listado)
    url_cursos = enlace_por_texto(html_listado, "Cursos")
    pagina = recortar(html_listado, {"93.18"})
    fila = _fila(html_listado, "93.18")
    falso = SGAFalso(
        html_listado,
        {
            url_cursos: html_listado,
            filtros.accion or "": pagina,
            fila.enlace_detalle or "": html_algebra,
        },
    )
    return falso, fila.enlace_detalle or ""


def _correr(
    falso: SGAFalso, monkeypatch: pytest.MonkeyPatch, **valores: Any
) -> tuple[int, argparse.Namespace]:
    monkeypatch.setattr(bajar, "ClienteSGA", lambda **_kwargs: falso.cliente())
    args = _argumentos(**valores)
    return sga.ejecutar(args), args


@pytest.fixture
def nivel_de_httpx_restaurado() -> Iterator[logging.Logger]:
    """`configurar_registro` toca un logger global; el test lo deja como estaba."""
    registro = logging.getLogger("httpx")
    previo = registro.level
    try:
        yield registro
    finally:
        registro.setLevel(previo)


def test_configurar_registro_calla_el_log_de_httpx_con_el_jsessionid(
    caplog: pytest.LogCaptureFixture, nivel_de_httpx_restaurado: logging.Logger
) -> None:
    """Subir el log a INFO no puede destapar el «HTTP Request: …» de httpx.

    Esa linea trae la URL entera, y las del SGA llevan `;jsessionid=<token>`: con el logger
    de httpx en INFO, un barrido escribe ~500 veces la sesion viva en la terminal.
    """
    bajar.configurar_registro()
    caplog.set_level(logging.INFO)
    url = "https://sga.itba.edu.ar/app2/;jsessionid=ABC123SECRETO?0-1.-login"
    transporte = httpx.MockTransport(
        lambda _peticion: httpx.Response(200, html="<html></html>")
    )
    with httpx.Client(transport=transporte) as http:
        http.get(url)

    assert "ABC123SECRETO" not in caplog.text
    assert not nivel_de_httpx_restaurado.isEnabledFor(logging.INFO)
    assert nivel_de_httpx_restaurado.isEnabledFor(logging.WARNING), (
        "los errores se siguen viendo"
    )


def test_el_archivo_de_algebra_lineal_pasa_el_validador(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
) -> None:
    """Criterio de aceptacion: el archivo producido valida sin errores."""
    falso, _ = _sga_de_algebra(html_listado, html_algebra)
    salida = tmp_path / "2026-2C.json"
    codigo, _args = _correr(
        falso,
        monkeypatch,
        anio=2026,
        cuatrimestre="2C",
        salida=salida,
        cache=tmp_path / "cache",
        data=raiz / "data",
    )

    assert codigo == 0
    assert not (tmp_path / "2026-2C.invalido.json").exists()
    hallazgos = validacion.validar_archivo(
        salida, "horarios", validacion.contexto_de_datos(raiz / "data")
    )
    assert [h.linea() for h in hallazgos if h.nivel == validacion.ERROR] == []

    datos = canon.cargar(salida)
    assert datos["contrato"] == "1.0.0"
    assert datos["periodo"]["id"] == "2026-2C"
    assert datos["fuente"]["sistema"] == "sga"
    curso = datos["cursos"][0]
    assert curso["codigo"] == "93.18"
    # HALLAZGOS.md: nueve comisiones (A-H y K) y 27 bloques tras fusionar las aulas dobles.
    assert len(curso["comisiones"]) == 9
    assert sum(len(c["bloques"]) for c in curso["comisiones"]) == 27
    assert salida.read_text(encoding="utf-8") == canon.serializar(datos)


def test_al_reanudar_no_se_vuelve_a_pedir_el_curso_ya_bajado(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
) -> None:
    falso, url_detalle = _sga_de_algebra(html_listado, html_algebra)
    salida = tmp_path / "2026-2C.json"
    cache = tmp_path / "cache"
    comunes: dict[str, Any] = {
        "anio": 2026,
        "cuatrimestre": "2C",
        "salida": salida,
        "cache": cache,
        "data": raiz / "data",
    }

    assert _correr(falso, monkeypatch, **comunes)[0] == 0
    primero = canon.cargar(salida)
    assert falso.pidio(url_detalle)

    segundo_falso, _ = _sga_de_algebra(html_listado, html_algebra)
    assert _correr(segundo_falso, monkeypatch, **comunes)[0] == 0
    assert not segundo_falso.pidio(url_detalle), (
        "el curso del checkpoint no se vuelve a pedir"
    )
    assert canon.cargar(salida) == primero


def test_desde_cero_borra_el_checkpoint_y_vuelve_a_bajar(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
) -> None:
    falso, url_detalle = _sga_de_algebra(html_listado, html_algebra)
    cache = tmp_path / "cache"
    comunes: dict[str, Any] = {
        "anio": 2026,
        "cuatrimestre": "2C",
        "salida": tmp_path / "2026-2C.json",
        "cache": cache,
        "data": raiz / "data",
    }
    assert _correr(falso, monkeypatch, **comunes)[0] == 0
    assert (cache / "2026-2C.jsonl").is_file()

    otro, url_detalle = _sga_de_algebra(html_listado, html_algebra)
    assert _correr(otro, monkeypatch, desde_cero=True, **comunes)[0] == 0
    assert otro.pidio(url_detalle)


def test_un_archivo_que_no_valida_queda_como_invalido_y_sale_con_1(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Un aula mas larga de lo que admite el contrato tiene que frenar la publicacion.

    El archivo rechazado va al directorio de cache y **no** queda en el arbol de datos: uno
    olvidado ahi rompe `cuatris indice actualizar` (dos archivos para el mismo periodo) y los
    gates de CI, que validan todos los JSON de `data/`.
    """
    roto = html_algebra.replace(
        "001R #----&gt; Sede Rectorado",
        "001R-un-codigo-de-aula-larguisimo #----&gt; Sede Rectorado",
    )
    assert roto != html_algebra
    falso, _ = _sga_de_algebra(html_listado, roto)
    datos = tmp_path / "data" / "v1" / "horarios"
    datos.mkdir(parents=True)
    salida = datos / "2026-2C.json"
    cache = tmp_path / "cache"

    codigo, _args = _correr(
        falso,
        monkeypatch,
        anio=2026,
        cuatrimestre="2C",
        salida=salida,
        cache=cache,
        data=raiz / "data",
    )

    assert codigo == 1
    assert not salida.exists()
    assert list(datos.iterdir()) == [], (
        "nada rechazado puede quedar dentro del arbol de datos"
    )
    invalido = cache / "2026-2C.invalido.json"
    assert invalido.is_file()
    assert str(invalido) in capsys.readouterr().out


def test_ruta_invalida_no_cae_nunca_dentro_del_arbol_de_datos(tmp_path: Path) -> None:
    """Con o sin `--cache`, el descarte se escribe en el cache, no al lado de la salida."""
    salida = tmp_path / "data" / "v1" / "horarios" / "2026-2C.json"
    assert bajar.ruta_invalida(salida, tmp_path / "cache") == (
        tmp_path / "cache" / "2026-2C.invalido.json"
    )
    assert bajar.ruta_invalida(salida) == Path(CACHE) / "2026-2C.invalido.json"


def test_el_limite_baja_solo_esos_cursos(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
    capsys: pytest.CaptureFixture[str],
) -> None:
    falso, _ = _sga_de_algebra(html_listado, html_algebra)
    salida = tmp_path / "2026-2C.json"
    codigo, _args = _correr(
        falso,
        monkeypatch,
        anio=2026,
        cuatrimestre="2C",
        salida=salida,
        limite=1,
        cache=tmp_path / "cache",
        data=raiz / "data",
    )

    assert codigo == 0
    assert len(canon.cargar(salida)["cursos"]) == 1
    assert "no para publicar" in capsys.readouterr().out


def test_la_ayuda_de_bajar_muestra_todas_las_opciones_en_espanol(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """`cuatris sga bajar --help`: el criterio de aceptacion de la tarea."""
    parser = argparse.ArgumentParser(prog="cuatris sga")
    sga.configurar(parser)
    with pytest.raises(SystemExit):
        parser.parse_args(["bajar", "--help"])
    texto = capsys.readouterr().out

    for opcion in (
        "--anio",
        "--cuatrimestre",
        "--salida",
        "--limite",
        "--desde-cero",
        "--ritmo",
        "--nivel",
        "--guardar-html",
    ):
        assert opcion in texto
    assert "cuatrimestre" in texto and "Peticiones por segundo" in texto
    # Nada de ingles en la ayuda propia del subcomando.
    assert not re.search(r"\b(file|output|help of|download)\b", texto)


def test_periodo_de_filas_cubre_los_periodos_cortos(html_listado: str) -> None:
    """15.09 va del 18/09 al 16/10: tiene que caer dentro del periodo, no ampliarlo."""
    filas = parsers.parsear_listado(html_listado).filas
    periodo = bajar.periodo_de_filas(filas, anio=2026, cuatrimestre="2C")
    assert (periodo.desde, periodo.hasta) == ("2026-07-26", "2026-12-31")
    corto = next(f for f in filas if f.codigo == "15.09")
    assert periodo.desde <= corto.desde <= corto.hasta <= periodo.hasta


def test_credenciales_salen_del_entorno_sin_preguntar() -> None:
    usuario, clave = bajar.credenciales(
        {bajar.VAR_USUARIO: USUARIO, bajar.VAR_CLAVE: CLAVE},
        preguntar_usuario=lambda _p: pytest.fail("no deberia preguntar el usuario"),
        preguntar_clave=lambda _p: pytest.fail("no deberia preguntar la clave"),
    )
    assert (usuario, clave) == (USUARIO, CLAVE)


def test_credenciales_pregunta_lo_que_falta() -> None:
    usuario, clave = bajar.credenciales(
        {},
        preguntar_usuario=lambda _p: USUARIO,
        preguntar_clave=lambda _p: CLAVE,
    )
    assert (usuario, clave) == (USUARIO, CLAVE)


def test_los_enlaces_del_listado_se_resuelven_contra_la_pagina_del_listado(
    html_listado: str,
) -> None:
    """Regresion de la corrida real del 2026-09-12: los `href` del listado son relativos a
    la pagina del listado, no a la ultima pagina recibida (el detalle de otro curso, mas
    corto): resolverlos tarde sacaba el enlace de `/app2/` y el SGA respondia 404."""
    pagina = recortar(html_listado, {"30.28", "23.05"})
    falso = SGAFalso(html_listado, {})
    with falso.cliente() as cliente:
        cliente.iniciar_sesion("usuario.de.prueba", "clave")
        filas = list(bajar.recorrer_listado(cliente, pagina, periodo="2026-2C"))

    assert cliente.ultima_respuesta is not None
    base = cliente.ultima_respuesta.url
    for fila in filas:
        assert fila.enlace_detalle is not None
        assert fila.enlace_detalle.startswith("https://sga.itba.edu.ar/app2/"), (
            fila.enlace_detalle
        )
        assert "/../" not in fila.enlace_detalle
        assert fila.enlace_detalle != base


def _curso_contrato(
    codigo: str, nombre: str, comision: str, bloques: list[dict]
) -> dict:
    return {
        "codigo": codigo,
        "nombre": nombre,
        "desde": "2026-07-26",
        "hasta": "2026-12-31",
        "dictado_conjunto": [],
        "comisiones": [{"id": comision, "docentes": [], "bloques": bloques}],
    }


def test_los_homonimos_con_la_misma_aula_y_horario_quedan_como_dictado_conjunto() -> (
    None
):
    """Caso real del 2026-09-12: 23.05 y 25.66 «Acustica para Ingenieros», comision K,
    jueves 16-19 en 604F (sdf). Sin la marca, C3 lo tomaba por una colision de aula."""
    bloque = {
        "dia": "jueves",
        "desde": "16:00",
        "hasta": "19:00",
        "sede": "sdf",
        "modalidad": "presencial",
        "aulas": ["604F"],
    }
    acustica_a = _curso_contrato(
        "23.05", "Acústica para Ingenieros", "K", [dict(bloque)]
    )
    acustica_b = _curso_contrato(
        "25.66", "Acústica para Ingenieros", "K", [dict(bloque)]
    )
    otro = _curso_contrato("30.28", "Accionamientos Industriales", "A", [dict(bloque)])
    cursos = [acustica_a, acustica_b, otro]

    bajar.vincular_dictado_conjunto(cursos)

    assert acustica_a["dictado_conjunto"] == ["25.66"]
    assert acustica_b["dictado_conjunto"] == ["23.05"]
    # Misma aula y horario pero otro nombre: sigue siendo una colision para C3.
    assert otro["dictado_conjunto"] == []


def test_los_homonimos_sin_bloque_en_comun_no_se_vinculan() -> None:
    a = _curso_contrato(
        "23.05",
        "Acústica para Ingenieros",
        "K",
        [
            {
                "dia": "jueves",
                "desde": "16:00",
                "hasta": "19:00",
                "sede": "sdf",
                "modalidad": "presencial",
                "aulas": ["604F"],
            }
        ],
    )
    b = _curso_contrato(
        "25.66",
        "Acústica para Ingenieros",
        "K",
        [
            {
                "dia": "martes",
                "desde": "16:00",
                "hasta": "19:00",
                "sede": "sdf",
                "modalidad": "presencial",
                "aulas": ["604F"],
            }
        ],
    )
    bajar.vincular_dictado_conjunto([a, b])
    assert a["dictado_conjunto"] == [] and b["dictado_conjunto"] == []
