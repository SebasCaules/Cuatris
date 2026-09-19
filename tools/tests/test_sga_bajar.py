"""Tests del barrido `cuatris sga bajar` y del checkpoint.

**Ningun test hace red**: el SGA esta simulado con `httpx.MockTransport` y todas las paginas
salen del corpus anonimizado de `tests/corpus/sga/`. Las paginas del listado se arman
recortando filas del listado real, para que los anclajes que se prueban sean los del HTML del
SGA y no los de un HTML escrito para el test.

Las credenciales que aparecen son inventadas y no valen en ningun lado.
"""

from __future__ import annotations

import argparse
import copy
import logging
import re
import shutil
import subprocess
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from bs4 import BeautifulSoup

from cuatris import canon, sga
from cuatris.sga import bajar, parsers
from cuatris.sga.checkpoint import CACHE, Checkpoint, ErrorDeCheckpoint, Registro
from cuatris.sga.cliente import (
    ClienteSGA,
    ErrorSGA,
    enlace_de_pestana,
    enlace_por_texto,
)

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

#: Pantalla de error del SGA, la que respondio a las filas 41 a 472 el 2026-09-12.
ERROR_SGA = (
    Path(__file__).resolve().parent / "corpus" / "sga" / "error-inesperado.html"
).read_text(encoding="utf-8")

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

    `/app2/` se comporta como el SGA real: sin sesion devuelve el formulario de login y con
    la sesion viva, la pantalla de inicio. `sesion_viva = False` simula que la sesion vencio.
    """

    def __init__(self, inicio: str, paginas: dict[str, str] | None = None) -> None:
        self.inicio = inicio
        self.paginas = dict(paginas or {})
        self.pedidos: list[str] = []
        self.sesion_viva = False
        #: URL → cuantas veces mas contesta con la pantalla de error del SGA.
        self.vencidas: dict[str, int] = {}
        #: URL → respuestas sucesivas; la ultima se repite (Wicket renueva sus enlaces).
        self.secuencias: dict[str, list[str]] = {}

    def agregar(self, url: str, html: str) -> None:
        self.paginas[url] = html

    def agregar_secuencia(self, url: str, htmls: list[str]) -> None:
        self.secuencias[url] = list(htmls)

    def vencer(self, url: str, veces: int = 1) -> None:
        """Las proximas `veces` peticiones a `url` devuelven la pantalla de error."""
        self.vencidas[url] = veces

    def manejar(self, peticion: httpx.Request) -> httpx.Response:
        url = str(peticion.url)
        self.pedidos.append(url)
        if peticion.url.path == "/app2/":
            if self.sesion_viva:
                return httpx.Response(200, html=self.inicio)
            return httpx.Response(200, html=LOGIN, headers=COOKIES)
        if url == URL_LOGIN:
            self.sesion_viva = True
            return httpx.Response(200, html=self.inicio)
        if self.vencidas.get(url):
            self.vencidas[url] -= 1
            return httpx.Response(200, html=ERROR_SGA)
        secuencia = self.secuencias.get(url)
        if secuencia:
            return httpx.Response(
                200, html=secuencia.pop(0) if len(secuencia) > 1 else secuencia[0]
            )
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

    def orden_de(self, url: str) -> int:
        """Posicion del primer pedido de `url`, para comparar el orden del barrido."""
        assert url in self.pedidos, f"el barrido nunca pidio {url}"
        return self.pedidos.index(url)


def _fila(html: str, codigo: str) -> parsers.FilaListado:
    for fila in parsers.parsear_listado(html).filas:
        if fila.codigo == codigo:
            return fila
    raise AssertionError(f"el corpus no trae la fila de {codigo}")


def _validador_de_node(raiz: Path, archivo: Path) -> int:
    """Corre `scripts/datos/validar.mjs` sobre un archivo de horarios; 0 = sin errores."""
    if shutil.which("node") is None:
        pytest.skip("hace falta node para correr el validador del repositorio")
    with __import__("tempfile").TemporaryDirectory() as tmp:
        carpeta = Path(tmp) / "horarios"
        carpeta.mkdir()
        copia = carpeta / "2026-2C.json"
        shutil.copy(archivo, copia)
        resultado = subprocess.run(
            ["node", str(raiz / "scripts" / "datos" / "validar.mjs"), "--dir", tmp, str(copia)],
            capture_output=True,
            text=True,
            check=False,
        )
    assert "error(es)" in resultado.stdout, resultado.stdout + resultado.stderr
    return resultado.returncode


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


def _sga_con_paginas(html_listado: str, paginas: list[str]) -> SGAFalso:
    """SGA simulado cuyo listado filtrado devuelve, en orden, las paginas dadas."""
    filtros = parsers.extraer_ids_filtro(html_listado)
    siguiente = parsers.parsear_listado(html_listado).paginacion.enlace_siguiente
    assert siguiente, "el corpus tiene que traer el enlace «siguiente»"
    falso = SGAFalso(
        html_listado,
        {
            enlace_por_texto(html_listado, "Cursos"): html_listado,
            filtros.accion or "": paginas[0],
        },
    )
    if len(paginas) > 1:
        # Todas las paginas siguientes se piden por el mismo enlace «siguiente» del corpus.
        falso.agregar_secuencia(siguiente, paginas[1:])
    return falso


def test_la_paginacion_sigue_el_enlace_siguiente_hasta_el_final(
    html_listado: str,
) -> None:
    """Dos paginas simuladas: el barrido las recorre y para al no haber «siguiente»."""
    siguiente = parsers.parsear_listado(html_listado).paginacion.enlace_siguiente
    pagina1 = recortar(html_listado, {"30.28", "23.05"}, con_siguiente=True)
    pagina2 = recortar(html_listado, {"93.18", "25.03"})
    falso = _sga_con_paginas(html_listado, [pagina1, pagina2])

    with falso.cliente() as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)
        barrido = bajar.Barrido(
            cliente, nivel="Grado", cuatrimestre_texto="Segundo Cuat.", anio=2026
        )
        barrido.abrir()
        codigos = [f.codigo for f in barrido.listado.filas]
        assert barrido.siguiente() is True
        assert barrido.pagina == 2
        codigos += [f.codigo for f in barrido.listado.filas]
        assert barrido.siguiente() is False

    assert codigos == ["30.28", "23.05", "93.18", "25.03"]
    assert falso.pidio(siguiente or "")


def test_reabrir_vuelve_a_navegar_desde_la_entrada_hasta_la_misma_pagina(
    html_listado: str,
) -> None:
    """`reabrir()` rehace el camino: `/app2/` → Cursos → filtro → «siguiente» hasta la k."""
    filtros = parsers.extraer_ids_filtro(html_listado)
    url_cursos = enlace_por_texto(html_listado, "Cursos")
    siguiente = parsers.parsear_listado(html_listado).paginacion.enlace_siguiente
    pagina1 = recortar(html_listado, {"30.28"}, con_siguiente=True)
    pagina2 = recortar(html_listado, {"93.18"})
    falso = _sga_con_paginas(html_listado, [pagina1, pagina2])

    with falso.cliente() as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)
        barrido = bajar.Barrido(
            cliente, nivel="Grado", cuatrimestre_texto="Segundo Cuat.", anio=2026
        )
        barrido.abrir()
        barrido.siguiente()
        falso.pedidos.clear()
        barrido.reabrir()

    assert barrido.pagina == 2
    assert [f.codigo for f in barrido.listado.filas] == ["93.18"]
    assert falso.pedidos == [
        "https://sga.itba.edu.ar/app2/",
        url_cursos,
        filtros.accion,
        siguiente,
    ]


def test_el_filtro_roto_se_detecta_en_la_primera_pagina(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
) -> None:
    """Ninguna fila de la pagina 1 es del periodo pedido: se corta ahi, no a los 16 minutos."""
    pagina1 = recortar(html_listado, {"30.28"}, con_siguiente=True)
    falso = _sga_con_paginas(html_listado, [pagina1, recortar(html_listado, {"93.18"})])
    siguiente = parsers.parsear_listado(html_listado).paginacion.enlace_siguiente

    with pytest.raises(parsers.EstructuraInesperada, match="filtro no se aplico"):
        _correr(
            falso,
            monkeypatch,
            anio=2026,
            cuatrimestre="1C",  # el listado del corpus es de 2C
            salida=tmp_path / "2026-1C.json",
            cache=tmp_path / "cache",
        )

    assert not falso.pidio(siguiente or ""), "no se sigue paginando con el filtro roto"
    assert not falso.pidio(_fila(html_listado, "30.28").enlace_detalle or "")


def _registro(
    codigo: str, *, periodo: str, desde: str, hasta: str, nombre: str = "Un curso"
) -> Registro:
    """Un registro del checkpoint como el que escribe el barrido."""
    return Registro(
        codigo=codigo,
        curso={
            "codigo": codigo,
            "nombre": nombre,
            "desde": desde,
            "hasta": hasta,
            "dictado_conjunto": [],
            "comisiones": [],
        },
        listado={"periodo": periodo, "desde": desde, "hasta": hasta},
    )


def test_un_curso_anual_de_otro_periodo_se_incluye_recortado() -> None:
    """Caso real del 2026-09-12: 41.34 Desarrollo de Yacimientos (Anual) aparece en el
    listado de 2C rotulado «2026-1C»; se dicta todo el ano, asi que entra con las fechas
    recortadas al cuatrimestre."""
    propio = _registro(
        "30.28", periodo="2026-2C", desde="2026-07-26", hasta="2026-12-31"
    )
    anual = _registro(
        "41.34",
        periodo="2026-1C",
        desde="2026-03-01",
        hasta="2026-12-31",
        nombre="Desarrollo de Yacimientos (Anual)",
    )

    propios, anuales, fallidos = bajar.separar_anuales(
        [propio, anual], periodo="2026-2C"
    )

    assert [r.codigo for r in propios] == ["30.28"]
    assert [r.codigo for r in anuales] == ["41.34"]
    assert fallidos == []
    assert anuales[0].curso["desde"] == "2026-07-26"
    assert anuales[0].curso["hasta"] == "2026-12-31"


def test_un_curso_ajeno_que_no_se_solapa_va_a_fallidos_y_no_corta_la_corrida() -> None:
    propio = _registro(
        "30.28", periodo="2026-2C", desde="2026-07-26", hasta="2026-12-31"
    )
    ajeno = _registro(
        "41.34", periodo="2026-1C", desde="2026-03-01", hasta="2026-07-01"
    )

    propios, anuales, fallidos = bajar.separar_anuales(
        [propio, ajeno], periodo="2026-2C"
    )

    assert [r.codigo for r in propios] == ["30.28"]
    assert anuales == []
    assert [codigo for codigo, _nombre, _motivo in fallidos] == ["41.34"]
    assert "no se solapa" in fallidos[0][2]


def test_sin_ningun_curso_propio_el_filtro_no_se_aplico() -> None:
    ajeno = _registro(
        "41.34", periodo="2026-1C", desde="2026-03-01", hasta="2026-07-01"
    )
    with pytest.raises(parsers.EstructuraInesperada, match="filtro no se aplico"):
        bajar.separar_anuales([ajeno], periodo="2026-2C")


def test_un_registro_viejo_sin_listado_se_toma_como_propio() -> None:
    """Los checkpoints escritos antes de que existiera el bloque «listado» siguen cargando."""
    viejo = Registro(
        codigo="30.28",
        curso={"codigo": "30.28", "desde": "2026-07-26", "hasta": "2026-12-31"},
    )
    propios, anuales, fallidos = bajar.separar_anuales([viejo], periodo="2026-2C")
    assert [r.codigo for r in propios] == ["30.28"]
    assert (anuales, fallidos) == ([], [])


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


LISTADO = {"periodo": "2026-2C", "desde": "2026-07-26", "hasta": "2026-12-31"}


def test_el_checkpoint_guarda_una_linea_por_curso(tmp_path: Path) -> None:
    punto = Checkpoint(tmp_path / "2026-2C.jsonl", "2026-2C")
    punto.agregar("93.18", {"codigo": "93.18", "comisiones": []}, listado=LISTADO)
    punto.agregar("30.28", {"codigo": "30.28", "comisiones": []}, listado=LISTADO)

    assert punto.codigos() == {"93.18", "30.28"}
    assert list(punto.cargar()) == ["93.18", "30.28"]  # conserva el orden de escritura
    assert (
        len((tmp_path / "2026-2C.jsonl").read_text(encoding="utf-8").splitlines()) == 2
    )
    registros = punto.registros()
    assert [r.aparicion for r in registros] == [1, 1]
    assert registros[0].listado == LISTADO


def test_el_checkpoint_distingue_las_apariciones_de_un_mismo_codigo(
    tmp_path: Path,
) -> None:
    """El listado trae codigos repetidos: la segunda fila es un registro propio."""
    punto = Checkpoint(tmp_path / "2026-2C.jsonl", "2026-2C")
    punto.agregar("93.18", {"codigo": "93.18", "comisiones": ["A"]}, listado=LISTADO)
    punto.agregar(
        "93.18", {"codigo": "93.18", "comisiones": ["C"]}, listado=LISTADO, aparicion=2
    )

    assert punto.codigos() == {"93.18", "93.18#2"}
    assert punto.cargar()["93.18#2"]["comisiones"] == ["C"]
    assert [r.clave for r in punto.registros()] == ["93.18", "93.18#2"]


def test_el_checkpoint_carga_registros_viejos_sin_listado_ni_aparicion(
    tmp_path: Path,
) -> None:
    ruta = tmp_path / "2026-2C.jsonl"
    ruta.write_text(
        '{"codigo": "93.18", "curso": {"codigo": "93.18"}, "periodo": "2026-2C"}\n',
        encoding="utf-8",
    )
    registro = Checkpoint(ruta, "2026-2C").registros()[0]
    assert (registro.clave, registro.aparicion, registro.listado) == ("93.18", 1, {})
    assert registro.periodo_del_listado is None


def test_el_checkpoint_descarta_la_ultima_linea_truncada(tmp_path: Path) -> None:
    ruta = tmp_path / "2026-2C.jsonl"
    punto = Checkpoint(ruta, "2026-2C")
    punto.agregar("93.18", {"codigo": "93.18"}, listado=LISTADO)
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
    Checkpoint(ruta, "2026-1C").agregar("93.18", {"codigo": "93.18"}, listado=LISTADO)
    with pytest.raises(ErrorDeCheckpoint, match="2026-1C"):
        Checkpoint(ruta, "2026-2C").cargar()


def test_borrar_el_checkpoint(tmp_path: Path) -> None:
    punto = Checkpoint(tmp_path / "2026-2C.jsonl", "2026-2C")
    assert punto.borrar() is False
    punto.agregar("93.18", {"codigo": "93.18"}, listado=LISTADO)
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
    )

    assert codigo == 0
    assert not (tmp_path / "2026-2C.invalido.json").exists()
    assert _validador_de_node(raiz, salida) == 0

    datos = canon.cargar(salida)
    assert datos["contrato"] == "1.1.0"
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
    """Un aula mas larga de lo que admite el contrato (40) tiene que frenar la publicacion.

    El archivo rechazado va al directorio de cache y **no** queda en el arbol de datos: uno
    olvidado ahi rompe `cuatris indice actualizar` (dos archivos para el mismo periodo) y los
    gates de CI, que validan todos los JSON de `data/`.
    """
    # Un aula de mas de 40 caracteres: el contrato admite cualquier nombre, pero no uno
    # que no cabe en ningun listado.
    roto = html_algebra.replace(
        "001R #----&gt; Sede Rectorado",
        "001R-un-codigo-de-aula-larguisimo-que-no-entra-en-cuarenta-caracteres"
        " #----&gt; Sede Rectorado",
    )
    assert roto != html_algebra
    falso, _ = _sga_de_algebra(html_listado, roto)
    datos = tmp_path / "data" / "plan" / "horarios"
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
    salida = tmp_path / "data" / "plan" / "horarios" / "2026-2C.json"
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


def test_periodo_de_registros_cubre_los_periodos_cortos(html_listado: str) -> None:
    """15.09 va del 18/09 al 16/10: tiene que caer dentro del periodo, no ampliarlo."""
    filas = parsers.parsear_listado(html_listado).filas
    registros = [
        _registro(
            f.codigo, periodo=f.periodo or "", desde=f.desde or "", hasta=f.hasta or ""
        )
        for f in filas
    ]
    periodo = bajar.periodo_de_registros(registros, anio=2026, cuatrimestre="2C")
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
    falso = _sga_con_paginas(html_listado, [pagina])
    with falso.cliente() as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)
        barrido = bajar.Barrido(
            cliente, nivel="Grado", cuatrimestre_texto="Segundo Cuat.", anio=2026
        )
        barrido.abrir()
        filas = barrido.listado.filas

    assert cliente.ultima_respuesta is not None
    base = cliente.ultima_respuesta.url
    assert [f.codigo for f in filas] == ["30.28", "23.05"]
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


def test_dos_nombres_distintos_con_el_mismo_docente_y_bloque_se_vinculan() -> None:
    """Materias equivalentes entre carreras: misma clase, dos nombres, mismo docente."""
    bloque = {
        "dia": "martes",
        "desde": "08:00",
        "hasta": "10:00",
        "sede": "rectorado",
        "modalidad": "presencial",
        "aulas": ["002R"],
    }
    a = _curso_contrato("93.41", "Física I", "A", [dict(bloque)])
    b = _curso_contrato("93.44", "Física para Ingeniería", "A", [dict(bloque)])
    a["comisiones"][0]["docentes"] = ["Pérez, Ana"]
    b["comisiones"][0]["docentes"] = ["Pérez, Ana", "Gómez, Luis"]
    bajar.vincular_dictado_conjunto([a, b])
    assert a["dictado_conjunto"] == ["93.44"] and b["dictado_conjunto"] == ["93.41"]


# --------------------------------------------------------------------------------------
# Barrido intercalado, pagina por pagina (N0-24)
# --------------------------------------------------------------------------------------


def _detalle(html_algebra: str, codigo: str, nombre: str) -> str:
    """El detalle de 93.18 con otro codigo en la fila «Materia:», para simular otro curso."""
    if codigo == "93.18":
        return html_algebra
    cambiado = html_algebra.replace("93.18 - Álgebra Lineal", f"{codigo} - {nombre}", 1)
    assert cambiado != html_algebra, (
        "el corpus dejo de traer la fila «Materia:» esperada"
    )
    return cambiado


def _pagina_renovada(html: str) -> str:
    """La misma pagina del listado con otros enlaces, como la devuelve Wicket al reabrirla."""
    renovada = html.replace("/app2/fyBfZ9p6trM", "/app2/RENOVADA6trM")
    assert renovada != html, "el corpus dejo de traer los enlaces cifrados esperados"
    return renovada


def _sga_de_dos_paginas(html_listado: str, html_algebra: str) -> SGAFalso:
    """Listado de dos paginas: 30.28 y 23.05 en la primera, 93.18 en la segunda."""
    pagina1 = recortar(html_listado, {"30.28", "23.05"}, con_siguiente=True)
    pagina2 = recortar(html_listado, {"93.18"})
    falso = _sga_con_paginas(html_listado, [pagina1, pagina2])
    for codigo, nombre in (
        ("30.28", "Accionamientos Industriales"),
        ("23.05", "Acústica para Ingenieros"),
        ("93.18", "Álgebra Lineal"),
    ):
        fila = _fila(html_listado, codigo)
        falso.agregar(fila.enlace_detalle or "", _detalle(html_algebra, codigo, nombre))
    return falso


def test_los_detalles_de_la_primera_pagina_se_piden_antes_que_la_segunda(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
) -> None:
    """N0-24: leer las 24 paginas primero desalojaba del almacen de Wicket a las del listado.

    El orden de los pedidos es la prueba: los dos detalles de la pagina 1 tienen que salir
    **antes** del clic en «siguiente».
    """
    falso = _sga_de_dos_paginas(html_listado, html_algebra)
    siguiente = parsers.parsear_listado(html_listado).paginacion.enlace_siguiente

    codigo, _args = _correr(
        falso,
        monkeypatch,
        anio=2026,
        cuatrimestre="2C",
        salida=tmp_path / "2026-2C.json",
        cache=tmp_path / "cache",
    )

    assert codigo == 0
    for curso in ("30.28", "23.05"):
        detalle = _fila(html_listado, curso).enlace_detalle or ""
        assert falso.orden_de(detalle) < falso.orden_de(siguiente or ""), curso
    detalle_pagina2 = _fila(html_listado, "93.18").enlace_detalle or ""
    assert falso.orden_de(siguiente or "") < falso.orden_de(detalle_pagina2)
    assert {c["codigo"] for c in canon.cargar(tmp_path / "2026-2C.json")["cursos"]} == {
        "30.28",
        "23.05",
        "93.18",
    }


# --------------------------------------------------------------------------------------
# Pagina de error y recuperacion (N0-25)
# --------------------------------------------------------------------------------------


def test_un_detalle_vencido_reabre_el_listado_y_el_curso_termina_en_el_checkpoint(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """El enlace viejo da la pantalla de error; al reabrir, el listado trae uno que anda."""
    filtros = parsers.extraer_ids_filtro(html_listado)
    url_cursos = enlace_por_texto(html_listado, "Cursos")
    pagina = recortar(html_listado, {"93.18"})
    renovada = _pagina_renovada(pagina)
    falso = _sga_con_paginas(html_listado, [pagina])
    falso.agregar_secuencia(filtros.accion or "", [pagina, renovada])
    viejo = _fila(html_listado, "93.18").enlace_detalle or ""
    nuevo = _fila(renovada, "93.18").enlace_detalle or ""
    assert nuevo != viejo
    falso.vencer(viejo)
    falso.agregar(nuevo, html_algebra)

    caplog.set_level(logging.WARNING, logger="cuatris.sga")
    cache = tmp_path / "cache"
    codigo, _args = _correr(
        falso,
        monkeypatch,
        anio=2026,
        cuatrimestre="2C",
        salida=tmp_path / "2026-2C.json",
        cache=cache,
    )

    assert codigo == 0
    assert Checkpoint(cache / "2026-2C.jsonl", "2026-2C").codigos() == {"93.18"}
    assert any("dio por vencida" in r.getMessage() for r in caplog.records)
    # La re-navegacion es la de una persona: entrada, Cursos, filtro; recien despues el
    # detalle con el enlace nuevo.
    desde_el_error = falso.pedidos[falso.pedidos.index(viejo) + 1 :]
    assert desde_el_error == [
        "https://sga.itba.edu.ar/app2/",
        url_cursos,
        filtros.accion,
        nuevo,
    ]


def test_cinco_cursos_seguidos_irrecuperables_abortan_y_conservan_el_checkpoint(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
) -> None:
    """Lo que paso de verdad el 2026-09-12: el SGA contesta su error a todos los detalles."""
    codigos = ["30.28", "23.05", "93.18", "25.03", "25.66", "15.09"]
    pagina = recortar(html_listado, set(codigos))
    falso = _sga_con_paginas(html_listado, [pagina])
    filas = {c: _fila(html_listado, c) for c in codigos}
    # El primero sale bien (pone el contador en cero); los demas, error siempre.
    falso.agregar(
        filas["30.28"].enlace_detalle or "", _detalle(html_algebra, "30.28", "x")
    )
    for codigo in codigos[1:]:
        falso.vencer(filas[codigo].enlace_detalle or "", veces=99)

    cache = tmp_path / "cache"
    with pytest.raises(ErrorSGA, match="pagina de error"):
        _correr(
            falso,
            monkeypatch,
            anio=2026,
            cuatrimestre="2C",
            salida=tmp_path / "2026-2C.json",
            cache=cache,
        )

    assert Checkpoint(cache / "2026-2C.jsonl", "2026-2C").codigos() == {"30.28"}


def test_tras_un_relogin_la_pagina_vencida_se_recupera(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
) -> None:
    """Tras volver a entrar, las paginas de Wicket de la sesion anterior ya no existen.

    El cliente resuelve la sesion vencida (re-login) y el reintento del mismo enlace cae en
    la pantalla de error: eso lo levanta la recuperacion del barrido, no otro re-login.
    """
    filtros = parsers.extraer_ids_filtro(html_listado)
    pagina = recortar(html_listado, {"93.18"})
    renovada = _pagina_renovada(pagina)
    falso = _sga_con_paginas(html_listado, [pagina])
    falso.agregar_secuencia(filtros.accion or "", [pagina, renovada])
    viejo = _fila(html_listado, "93.18").enlace_detalle or ""
    nuevo = _fila(renovada, "93.18").enlace_detalle or ""
    falso.agregar(nuevo, html_algebra)

    original = falso.manejar
    pedidos_del_viejo = {"n": 0}

    def manejar(peticion: httpx.Request) -> httpx.Response:
        if str(peticion.url) != viejo:
            return original(peticion)
        falso.pedidos.append(viejo)
        pedidos_del_viejo["n"] += 1
        if pedidos_del_viejo["n"] == 1:
            # La sesion vence justo en este pedido: el SGA responde la pantalla de login.
            falso.sesion_viva = False
            return httpx.Response(200, html=LOGIN)
        # Ya con la sesion nueva, la pagina de Wicket de la sesion vieja no existe mas.
        return httpx.Response(200, html=ERROR_SGA)

    monkeypatch.setattr(falso, "manejar", manejar)
    cache = tmp_path / "cache"
    codigo, _args = _correr(
        falso,
        monkeypatch,
        anio=2026,
        cuatrimestre="2C",
        salida=tmp_path / "2026-2C.json",
        cache=cache,
    )

    assert codigo == 0
    assert pedidos_del_viejo["n"] == 2, "el re-login reintenta el mismo enlace una vez"
    assert falso.pedidos.count(URL_LOGIN) == 2, "hubo un re-login"
    assert falso.pidio(nuevo), "el curso se bajo con el enlace de la pagina reabierta"
    assert Checkpoint(cache / "2026-2C.jsonl", "2026-2C").codigos() == {"93.18"}


# --------------------------------------------------------------------------------------
# Log a archivo (N0-26)
# --------------------------------------------------------------------------------------


def test_la_corrida_deja_un_log_en_el_cache_sin_el_identificador_de_sesion(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Diez minutos de barrido no caben en la terminal: quedan en `<cache>/<periodo>.log`."""
    falso, _ = _sga_de_algebra(html_listado, html_algebra)
    cache = tmp_path / "cache"
    codigo, _args = _correr(
        falso,
        monkeypatch,
        anio=2026,
        cuatrimestre="2C",
        salida=tmp_path / "2026-2C.json",
        cache=cache,
    )
    assert codigo == 0
    # El resumen sigue saliendo por la salida estandar, ademas del archivo.
    assert "93.18" in capsys.readouterr().out

    log = cache / "2026-2C.log"
    assert log.is_file()
    texto = log.read_text(encoding="utf-8")
    assert texto.startswith("=== corrida ")
    assert " DEBUG " in texto, (
        "las peticiones se registran en DEBUG aunque la consola este en INFO"
    )
    assert "GET https://sga.itba.edu.ar/app2/" in texto
    assert "Resumen:" in texto
    assert "NODO1" not in texto
    assert re.search(r";jsessionid=(?!…)", texto) is None, (
        "ninguna URL puede quedar con el identificador de sesion sin tapar"
    )


def test_el_log_se_agrega_y_no_se_duplica_al_correr_dos_veces(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
) -> None:
    """`configurar_registro` es idempotente: dos corridas, dos corridas en el archivo."""
    cache = tmp_path / "cache"
    comunes: dict[str, Any] = {
        "anio": 2026,
        "cuatrimestre": "2C",
        "salida": tmp_path / "2026-2C.json",
        "cache": cache,
    }
    for _ in range(2):
        falso, _ = _sga_de_algebra(html_listado, html_algebra)
        assert _correr(falso, monkeypatch, **comunes)[0] == 0

    texto = (cache / "2026-2C.log").read_text(encoding="utf-8")
    assert texto.count("=== corrida ") == 2
    lineas = [linea for linea in texto.splitlines() if "Sesion iniciada" in linea]
    assert len(lineas) == 2, "un mensaje por corrida, no uno por handler instalado"


# --------------------------------------------------------------------------------------
# Codigos repetidos en el listado (N0-27)
# --------------------------------------------------------------------------------------


def _sin_comisiones(curso: dict[str, Any], dejar: set[str]) -> dict[str, Any]:
    """Una copia del curso con solo las comisiones pedidas."""
    copia = dict(curso)
    copia["comisiones"] = [c for c in curso["comisiones"] if c["id"] in dejar]
    return copia


def _curso_con_comisiones(codigo: str, ids: list[str]) -> dict[str, Any]:
    return {
        "codigo": codigo,
        "nombre": "Álgebra Lineal",
        "desde": "2026-07-26",
        "hasta": "2026-12-31",
        "dictado_conjunto": [],
        "comisiones": [{"id": i, "docentes": [], "bloques": []} for i in ids],
    }


PERIODO = parsers.Periodo("2026-2C", 2026, "2C", "2026-07-26", "2026-12-31")


def test_dos_apariciones_identicas_quedan_en_un_solo_curso() -> None:
    curso = _curso_con_comisiones("93.18", ["A", "B"])
    documento, fallidos = bajar.armar_documento(
        [dict(curso), dict(curso)], PERIODO, "2026-09-12"
    )
    assert fallidos == []
    assert [c["codigo"] for c in documento["cursos"]] == ["93.18"]
    assert [c["id"] for c in documento["cursos"][0]["comisiones"]] == ["A", "B"]


def test_dos_apariciones_con_comisiones_disjuntas_se_unen_con_aviso(
    caplog: pytest.LogCaptureFixture,
) -> None:
    primera = _curso_con_comisiones("93.18", ["A", "B"])
    segunda = _curso_con_comisiones("93.18", ["C", "D"])
    segunda["desde"] = "2026-08-01"
    segunda["hasta"] = "2027-01-05"

    caplog.set_level(logging.WARNING, logger="cuatris.sga")
    documento, fallidos = bajar.armar_documento(
        [primera, segunda], PERIODO, "2026-09-12"
    )

    assert fallidos == []
    curso = documento["cursos"][0]
    assert [c["id"] for c in curso["comisiones"]] == ["A", "B", "C", "D"]
    assert (curso["desde"], curso["hasta"]) == ("2026-07-26", "2027-01-05")
    aviso = next(r.getMessage() for r in caplog.records if "aparece" in r.getMessage())
    assert (
        "93.18 aparece 2 veces en el listado: se unen sus comisiones (A, B | C, D)."
        == aviso
    )


def test_una_comision_con_contenido_distinto_manda_ese_codigo_a_fallidos() -> None:
    primera = _curso_con_comisiones("93.18", ["A"])
    segunda = _curso_con_comisiones("93.18", ["A"])
    segunda["comisiones"][0]["bloques"] = [
        {
            "dia": "lunes",
            "desde": "08:00",
            "hasta": "10:00",
            "sede": "rectorado",
            "modalidad": "presencial",
            "aulas": ["001R"],
        }
    ]
    otro = _curso_con_comisiones("30.28", ["A"])

    documento, fallidos = bajar.armar_documento(
        [primera, segunda, otro], PERIODO, "2026-09-12"
    )

    assert [c["codigo"] for c in documento["cursos"]] == ["30.28"], (
        "el resto del archivo se escribe igual"
    )
    assert [codigo for codigo, _nombre, _motivo in fallidos] == ["93.18"]
    assert "«A»" in fallidos[0][2]


def _con_fila_repetida(html: str, codigo: str) -> str:
    """Duplica la fila de `codigo` en el listado, con otro enlace al detalle.

    Es el caso real del 2026-09-12: 472 filas y 461 codigos distintos.
    """
    sopa = BeautifulSoup(html, "html.parser")
    for fila in sopa.select("tbody tr"):
        if _codigo_de_fila(fila) != codigo:
            continue
        copia = copy.copy(fila)
        for enlace in copia.find_all("a", href=True):
            enlace["href"] = enlace["href"] + "-BIS"
        fila.insert_after(copia)
        return str(sopa)
    raise AssertionError(f"el corpus no trae la fila de {codigo}")


def test_la_segunda_aparicion_de_un_codigo_se_baja_y_se_guarda_aparte(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
    caplog: pytest.LogCaptureFixture,
) -> None:
    pagina = _con_fila_repetida(recortar(html_listado, {"93.18"}), "93.18")
    falso = _sga_con_paginas(html_listado, [pagina])
    filas = parsers.parsear_listado(pagina).filas
    assert [f.codigo for f in filas] == ["93.18", "93.18"]
    for fila in filas:
        falso.agregar(fila.enlace_detalle or "", html_algebra)

    caplog.set_level(logging.WARNING, logger="cuatris.sga")
    cache = tmp_path / "cache"
    codigo, _args = _correr(
        falso,
        monkeypatch,
        anio=2026,
        cuatrimestre="2C",
        salida=tmp_path / "2026-2C.json",
        cache=cache,
    )

    assert codigo == 0
    punto = Checkpoint(cache / "2026-2C.jsonl", "2026-2C")
    assert punto.codigos() == {"93.18", "93.18#2"}
    assert [r.aparicion for r in punto.registros()] == [1, 2]
    assert any("aparece por 2a vez" in r.getMessage() for r in caplog.records)
    # Las dos filas son el mismo curso: en el archivo queda uno solo.
    assert [c["codigo"] for c in canon.cargar(tmp_path / "2026-2C.json")["cursos"]] == [
        "93.18"
    ]


# --------------------------------------------------------------------------------------
# Resumen final y archivo parcial
# --------------------------------------------------------------------------------------


def test_un_curso_que_no_parsea_va_a_fallidos_y_el_resto_se_escribe_aparte(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Un valor que el mapeo no conoce no frena a los demas: se informa al final."""
    roto = _detalle(html_algebra, "30.28", "Accionamientos Industriales").replace(
        "Presencial", "Holográfica"
    )
    pagina = recortar(html_listado, {"30.28", "93.18"})
    falso = _sga_con_paginas(html_listado, [pagina])
    falso.agregar(_fila(html_listado, "30.28").enlace_detalle or "", roto)
    falso.agregar(_fila(html_listado, "93.18").enlace_detalle or "", html_algebra)

    cache = tmp_path / "cache"
    salida = tmp_path / "2026-2C.json"
    codigo, _args = _correr(
        falso,
        monkeypatch,
        anio=2026,
        cuatrimestre="2C",
        salida=salida,
        cache=cache,
    )

    assert codigo == 1
    assert not salida.exists()
    parcial = cache / "2026-2C.parcial.json"
    assert [c["codigo"] for c in canon.cargar(parcial)["cursos"]] == ["93.18"]

    texto = capsys.readouterr().out
    assert "2 filas del listado, 2 codigos distintos (0 repetidos)" in texto
    assert "1 cursos bajados en esta corrida" in texto
    assert "0 ya estaban en el checkpoint, 1 fallidos" in texto
    assert "Holográfica" in texto
    assert str(parcial) in texto


def test_si_ningun_curso_se_pudo_bajar_se_informa_en_vez_de_fechar_el_periodo(
    tmp_path: Path,
    raiz: Path,
    html_listado: str,
    html_algebra: str,
    monkeypatch: pytest.MonkeyPatch,
    entorno_con_credenciales: None,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Sin ningun curso en el checkpoint no hay intervalo del cuatrimestre que calcular."""
    roto = _detalle(html_algebra, "30.28", "Accionamientos Industriales").replace(
        "Presencial", "Holográfica"
    )
    pagina = recortar(html_listado, {"30.28"})
    falso = _sga_con_paginas(html_listado, [pagina])
    falso.agregar(_fila(html_listado, "30.28").enlace_detalle or "", roto)

    codigo, _args = _correr(
        falso,
        monkeypatch,
        anio=2026,
        cuatrimestre="2C",
        salida=tmp_path / "2026-2C.json",
        cache=tmp_path / "cache",
    )

    assert codigo == 1
    assert not (tmp_path / "2026-2C.json").exists()
    assert "Ningun curso quedo en el checkpoint" in capsys.readouterr().out


# --------------------------------------------------------------------------------------
# Corrida real del 2026-09-13: anuales por duracion, ediciones, cohortes, ids y nombres
# --------------------------------------------------------------------------------------


def test_una_cohorte_anual_rotulada_con_el_periodo_propio_no_estira_el_cuatrimestre() -> (
    None
):
    """10.01 y 72.45 aparecen rotulados «2026-2C» con dictado hasta julio de 2027: son
    anuales por duracion, entran recortados y el periodo sale de los cuatrimestrales."""
    propio = _registro(
        "30.28", periodo="2026-2C", desde="2026-07-26", hasta="2026-12-31"
    )
    cohorte = _registro(
        "72.45", periodo="2026-2C", desde="2026-07-26", hasta="2027-06-27"
    )

    propios, anuales, fallidos = bajar.separar_anuales(
        [propio, cohorte], periodo="2026-2C"
    )
    periodo = bajar.periodo_de_registros(propios, anio=2026, cuatrimestre="2C")

    assert [r.codigo for r in propios] == ["30.28"]
    assert [r.codigo for r in anuales] == ["72.45"]
    assert fallidos == []
    assert (periodo.desde, periodo.hasta) == ("2026-07-26", "2026-12-31")
    assert (anuales[0].curso["desde"], anuales[0].curso["hasta"]) == (
        "2026-07-26",
        "2026-12-31",
    )


def test_es_anual_separa_un_cuatrimestre_largo_de_una_cohorte_corta() -> None:
    assert not bajar.es_anual("2026-07-26", "2026-12-31")  # 158 dias: un cuatrimestre
    assert bajar.es_anual(
        "2026-03-01", "2026-12-31"
    )  # 305 dias: la cohorte mas corta vista


def _con_comision(
    curso: dict,
    identificador: str,
    *,
    docentes: list[str] | None = None,
    inscriptos: int = 1,
) -> dict:
    copia = copy.deepcopy(curso)
    copia["comisiones"][0]["id"] = identificador
    copia["comisiones"][0]["docentes"] = docentes or []
    copia["comisiones"][0]["ocupacion"] = {"inscriptos": inscriptos, "al": "2026-09-13"}
    return copia


_BLOQUE_SABADO = {
    "dia": "sabado",
    "desde": "20:00",
    "hasta": "21:00",
    "sede": None,
    "modalidad": "virtual",
    "aulas": [],
}


def test_dos_ediciones_del_mismo_codigo_quedan_como_a_y_a_punto_2_con_sus_fechas() -> (
    None
):
    """81.73 Introduccion a la IOT: dos filas «comision A», del 03/08 al 11/09 y del 14/09
    al 23/10. Las dos valen; la segunda pasa a `A.2` y cada una lleva sus fechas."""
    primera = _curso_contrato(
        "81.73", "Introducción a la IOT", "A", [dict(_BLOQUE_SABADO)]
    )
    primera["desde"], primera["hasta"] = "2026-08-03", "2026-09-11"
    segunda = copy.deepcopy(primera)
    segunda["desde"], segunda["hasta"] = "2026-09-14", "2026-10-23"

    fusionado, motivo = bajar._fusionar_apariciones(
        [segunda, primera], periodo="2026-2C"
    )

    assert motivo == ""
    assert fusionado is not None
    assert (fusionado["desde"], fusionado["hasta"]) == ("2026-08-03", "2026-10-23")
    assert [(c["id"], c["desde"], c["hasta"]) for c in fusionado["comisiones"]] == [
        ("A", "2026-08-03", "2026-09-11"),
        ("A.2", "2026-09-14", "2026-10-23"),
    ]


def test_dos_cohortes_con_el_mismo_horario_quedan_como_una_con_los_docentes_unidos() -> (
    None
):
    """72.45 Proyecto Final: la cohorte de marzo («2026-1C») y la de ahora («2026-2C»)
    coinciden en horario tras el recorte; difieren en docentes y ocupacion. Queda la de la
    corrida, con la union de los docentes."""
    bloque = {**_BLOQUE_SABADO, "dia": "domingo", "desde": "15:00", "hasta": "16:00"}
    base = _curso_contrato("72.45", "Proyecto Final", "S", [dict(bloque)])
    marzo = _con_comision(
        base, "S", docentes=["Leivi, Alejo", "Bolo, Mario"], inscriptos=35
    )
    marzo["_periodo_del_listado"] = "2026-1C"
    ahora = _con_comision(
        base, "S", docentes=["Bolo, Mario", "Huerta, Jorge"], inscriptos=60
    )
    ahora["_periodo_del_listado"] = "2026-2C"

    fusionado, motivo = bajar._fusionar_apariciones([marzo, ahora], periodo="2026-2C")

    assert motivo == ""
    assert fusionado is not None
    (comision,) = fusionado["comisiones"]
    assert comision["id"] == "S"
    assert comision["ocupacion"]["inscriptos"] == 60
    assert comision["docentes"] == ["Bolo, Mario", "Huerta, Jorge", "Leivi, Alejo"]
    assert "_periodo_del_listado" not in fusionado
    assert "desde" not in comision


def test_mismas_fechas_con_horarios_distintos_sigue_siendo_un_conflicto() -> None:
    base = _curso_contrato("93.18", "Álgebra Lineal", "A", [dict(_BLOQUE_SABADO)])
    otra = copy.deepcopy(base)
    otra["comisiones"][0]["bloques"][0]["desde"] = "18:00"

    fusionado, motivo = bajar._fusionar_apariciones([base, otra], periodo="2026-2C")

    assert fusionado is None
    assert "horarios distintos en las mismas fechas" in motivo


def test_la_misma_clase_bajo_dos_codigos_con_ids_distintos_es_dictado_conjunto() -> (
    None
):
    """12.84 com. Q y 17.15 com. A: mismo nombre, martes 13-16 en 604F (2026-09-13)."""
    bloque = {
        "dia": "martes",
        "desde": "13:00",
        "hasta": "16:00",
        "sede": "sdf",
        "modalidad": "presencial",
        "aulas": ["604F"],
    }
    uno = _curso_contrato(
        "12.84", "Introducción a la Ingeniería Ambiental", "Q", [dict(bloque)]
    )
    otro = _curso_contrato(
        "17.15", "Introducción a la Ingeniería Ambiental", "A", [dict(bloque)]
    )

    bajar.vincular_dictado_conjunto([uno, otro])

    assert uno["dictado_conjunto"] == ["17.15"]
    assert otro["dictado_conjunto"] == ["12.84"]


def test_armar_documento_limpia_la_anotacion_de_fechas_de_los_nombres_viejos() -> None:
    curso = _curso_contrato(
        "81.73", "Introducción a la IOT (Seminario - 03/08/2026 - 11/09/2026)", "A", []
    )
    periodo = parsers.Periodo("2026-2C", 2026, "2C", "2026-07-26", "2026-12-31")

    documento, fallidos = bajar.armar_documento([curso], periodo, "2026-09-13")

    assert fallidos == []
    assert documento["cursos"][0]["nombre"] == "Introducción a la IOT"


def test_el_archivo_con_laboratorio_sin_aula_y_dos_ediciones_pasa_el_validador(
    raiz: Path,
) -> None:
    """El fixture sale de las paginas reales de 93.41, 17.06 y 81.73 (corrida del 2026-09-13)."""
    fixtures = raiz / "scripts" / "datos" / "test" / "fixtures" / "horarios"
    archivo = fixtures / "deben-pasar" / "laboratorio-ediciones.json"
    assert _validador_de_node(raiz, archivo) == 0
