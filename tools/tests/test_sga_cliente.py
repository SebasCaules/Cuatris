"""Tests del cliente HTTP del SGA (`cuatris.sga.cliente`).

**Ningun test hace red.** Todo pasa por `httpx.MockTransport`, que responde desde el corpus
anonimizado de `tests/corpus/sga/` y desde el formulario de login que documenta
`material-raw/02-sga/HALLAZGOS.md` («Formulario de login»): esa es la unica forma del HTML de
login que hay en el material, porque la pantalla no se guardo en el corpus (habria que
loguearse para capturarla).

La contrasena que usan los tests es inventada y no vale en ningun lado.
"""

from __future__ import annotations

import logging
from pathlib import Path

import httpx
import pytest

from cuatris.sga import cliente as modulo
from cuatris.sga.cliente import (
    ClienteSGA,
    ErrorDeRed,
    ErrorDeSesion,
    PaginaVencida,
    enlace_de_pestana,
    enlace_por_texto,
    esta_autenticada,
    pagina_de_error,
    sesion_vencida,
)
from cuatris.sga.parsers import EstructuraInesperada

USUARIO = "usuario.de.prueba"
CLAVE = "contrasena-de-prueba-461"

#: Formulario de login tal como lo documenta HALLAZGOS.md: `action` relativo con
#: `;jsessionid=`, un campo oculto con id rotativo, `user`, `password` y el boton `login`.
LOGIN = """<html><head><title>Sistema de Gestión Académica</title></head><body>
<form id="id1" method="post" action="../../../c1f7ad4/login;jsessionid=NODO1">
  <input type="hidden" name="id1_hf_0" id="id1_hf_0" value="" />
  <input type="text" maxlength="20" name="user" />
  <input type="password" maxlength="20" name="password" />
  <input type="hidden" id="js" value="0" name="js" />
  <input type="submit" name="login" value="Ingresar" />
</form></body></html>"""

COOKIES = [
    ("set-cookie", "JSESSIONID=abc; Path=/"),
    ("set-cookie", "AWSALB=def; Path=/"),
    ("set-cookie", "AWSALBCORS=ghi; Path=/"),
]


@pytest.fixture(scope="session")
def corpus_sga(corpus: Path) -> Path:
    return corpus / "sga"


@pytest.fixture(scope="session")
def html_listado(corpus_sga: Path) -> str:
    """Listado de cursos: pantalla ya autenticada (trae el enlace «[Salir]»)."""
    return (corpus_sga / "oferta-materias.html").read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def html_detalle(corpus_sga: Path) -> str:
    """Detalle de un curso con la pestana «Plantel Docente» abierta."""
    return (corpus_sga / "horarios-materia-detalle.html").read_text(encoding="utf-8")


class Reloj:
    """Reloj y `sleep` simulados: `dormir` adelanta el tiempo en vez de esperarlo."""

    def __init__(self) -> None:
        self.ahora = 0.0
        self.esperas: list[float] = []

    def __call__(self) -> float:
        return self.ahora

    def dormir(self, segundos: float) -> None:
        self.esperas.append(segundos)
        self.ahora += segundos


def _cliente(manejador, reloj: Reloj | None = None, **extra) -> ClienteSGA:
    reloj = reloj or Reloj()
    return ClienteSGA(
        transporte=httpx.MockTransport(manejador),
        reloj=reloj,
        dormir=reloj.dormir,
        **extra,
    )


def _sga(html_autenticado: str, pedidos: list[httpx.Request]):
    """Servidor simulado: `/app2/` devuelve el login y el POST devuelve la pantalla pedida."""

    def manejar(peticion: httpx.Request) -> httpx.Response:
        pedidos.append(peticion)
        if peticion.url.path == "/app2/":
            return httpx.Response(200, html=LOGIN, headers=COOKIES)
        if peticion.method == "POST":
            return httpx.Response(200, html=html_autenticado)
        return httpx.Response(200, html=html_autenticado)

    return manejar


# --------------------------------------------------------------------------------------
# Login
# --------------------------------------------------------------------------------------


def test_login_postea_el_action_y_los_campos_ocultos_del_html(
    html_listado: str,
) -> None:
    pedidos: list[httpx.Request] = []
    with _cliente(_sga(html_listado, pedidos)) as cliente:
        resultado = cliente.iniciar_sesion(USUARIO, CLAVE)

    assert esta_autenticada(resultado)
    entrada, envio = pedidos
    assert str(entrada.url) == "https://sga.itba.edu.ar/app2/"
    # El `action` es relativo y se resuelve contra la pagina, no contra `base_url`.
    assert str(envio.url) == "https://sga.itba.edu.ar/c1f7ad4/login;jsessionid=NODO1"
    cuerpo = envio.content.decode()
    assert "user=usuario.de.prueba" in cuerpo
    assert "login=Ingresar" in cuerpo
    assert "id1_hf_0=" in cuerpo  # campo oculto leido del HTML, no escrito a mano
    # El HTML trae js=0, pero el scraper manda js=1 como el navegador: con 0 el SGA loopea.
    assert "js=1" in cuerpo
    assert "js=0" not in cuerpo


def test_login_manda_las_tres_cookies_de_sesion(html_listado: str) -> None:
    pedidos: list[httpx.Request] = []
    with _cliente(_sga(html_listado, pedidos)) as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)
        assert set(cliente.cookies_de_sesion()) == {
            "JSESSIONID",
            "AWSALB",
            "AWSALBCORS",
        }

    galletas = pedidos[1].headers.get("cookie", "")
    assert "JSESSIONID=abc" in galletas
    assert "AWSALB=def" in galletas
    assert "AWSALBCORS=ghi" in galletas


def test_el_user_agent_identifica_a_cuatris(html_listado: str) -> None:
    pedidos: list[httpx.Request] = []
    with _cliente(_sga(html_listado, pedidos)) as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)
    assert pedidos[0].headers["user-agent"] == modulo.AGENTE
    assert "github.com/SebasCaules/Cuatris" in modulo.AGENTE


def test_login_rechazado_no_filtra_la_clave_ni_en_la_excepcion_ni_en_el_log(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """El SGA devuelve una pantalla que **contiene la contrasena**; el error no la repite."""

    eco = f"<html><body><p>Datos recibidos: {CLAVE}</p>{LOGIN}</body></html>"

    def manejar(peticion: httpx.Request) -> httpx.Response:
        if peticion.url.path == "/app2/":
            return httpx.Response(200, html=LOGIN, headers=COOKIES)
        return httpx.Response(200, html=eco)

    caplog.set_level(logging.DEBUG, logger="cuatris.sga")
    with _cliente(manejar) as cliente, pytest.raises(ErrorDeSesion) as fallo:
        cliente.iniciar_sesion(USUARIO, CLAVE)

    assert CLAVE not in str(fallo.value)
    assert CLAVE not in repr(fallo.value)
    assert CLAVE not in caplog.text
    assert USUARIO in caplog.text  # el usuario si se registra: sirve para diagnosticar


def test_login_sin_credenciales_falla_antes_de_pedir_nada() -> None:
    pedidos: list[httpx.Request] = []

    def manejar(peticion: httpx.Request) -> httpx.Response:
        pedidos.append(peticion)
        return httpx.Response(200, html=LOGIN)

    with _cliente(manejar) as cliente, pytest.raises(ErrorDeSesion):
        cliente.iniciar_sesion(USUARIO, "")
    assert pedidos == []


# --------------------------------------------------------------------------------------
# Sesion vencida y re-login
# --------------------------------------------------------------------------------------


def test_sesion_vencida_dispara_un_relogin_transparente(html_listado: str) -> None:
    """Una URL que devuelve el login se reintenta una vez, ya con la sesion nueva."""
    estado = {"vencidas": 1}
    pedidos: list[str] = []

    def manejar(peticion: httpx.Request) -> httpx.Response:
        pedidos.append(f"{peticion.method} {peticion.url.path}")
        if peticion.url.path == "/app2/":
            return httpx.Response(200, html=LOGIN, headers=COOKIES)
        if peticion.method == "POST":
            return httpx.Response(200, html=html_listado)
        if estado["vencidas"]:
            estado["vencidas"] -= 1
            return httpx.Response(200, html=LOGIN)
        return httpx.Response(200, html=html_listado)

    with _cliente(manejar) as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)
        html = cliente.obtener("https://sga.itba.edu.ar/app2/cursos")

    assert esta_autenticada(html)
    # La peticion original, la entrada de nuevo, el POST del login y el reintento.
    assert pedidos == [
        "GET /app2/",
        "POST /c1f7ad4/login;jsessionid=NODO1",
        "GET /app2/cursos",
        "GET /app2/",
        "POST /c1f7ad4/login;jsessionid=NODO1",
        "GET /app2/cursos",
    ]


def test_una_sesion_que_vuelve_a_vencer_no_reintenta_para_siempre(
    html_listado: str,
) -> None:
    intentos = {"cursos": 0}

    def manejar(peticion: httpx.Request) -> httpx.Response:
        if peticion.url.path == "/app2/":
            return httpx.Response(200, html=LOGIN, headers=COOKIES)
        if peticion.method == "POST":
            return httpx.Response(200, html=html_listado)
        intentos["cursos"] += 1
        return httpx.Response(200, html=LOGIN)

    with _cliente(manejar) as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)
        with pytest.raises(ErrorDeSesion, match="volvio a vencer"):
            cliente.obtener("https://sga.itba.edu.ar/app2/cursos")

    assert intentos["cursos"] == 2


def test_sesion_vencida_reconoce_la_pantalla_de_login(html_listado: str) -> None:
    assert sesion_vencida(LOGIN)
    assert not sesion_vencida(html_listado)
    assert esta_autenticada(html_listado)
    assert not esta_autenticada(LOGIN)


# --------------------------------------------------------------------------------------
# Ritmo y reintentos
# --------------------------------------------------------------------------------------


def test_el_ritmo_espera_entre_peticiones_con_reloj_simulado(html_listado: str) -> None:
    reloj = Reloj()
    pedidos: list[httpx.Request] = []
    with _cliente(_sga(html_listado, pedidos), reloj, ritmo=1.0) as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)  # dos peticiones
        cliente.obtener("https://sga.itba.edu.ar/app2/cursos")  # tercera

    assert cliente.peticiones == 3
    # La primera sale sin esperar; las otras dos, un segundo despues de la anterior.
    assert reloj.esperas == [1.0, 1.0]
    assert reloj.ahora == pytest.approx(2.0)


def test_el_ritmo_es_configurable(html_listado: str) -> None:
    reloj = Reloj()
    pedidos: list[httpx.Request] = []
    with _cliente(_sga(html_listado, pedidos), reloj, ritmo=4.0) as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)
    assert reloj.esperas == [0.25]


def test_un_ritmo_no_positivo_es_un_error() -> None:
    with pytest.raises(ValueError, match="ritmo"):
        ClienteSGA(ritmo=0)


def test_reintenta_ante_5xx_con_espera_creciente(html_listado: str) -> None:
    reloj = Reloj()
    estado = {"fallos": 2}

    def manejar(peticion: httpx.Request) -> httpx.Response:
        if estado["fallos"]:
            estado["fallos"] -= 1
            return httpx.Response(503, text="Service Unavailable")
        return httpx.Response(200, html=html_listado)

    with _cliente(manejar, reloj) as cliente:
        html = cliente.obtener("https://sga.itba.edu.ar/app2/cursos")

    assert esta_autenticada(html)
    assert reloj.esperas[:2] == [2.0, 4.0]  # 2 s y 4 s: espera creciente
    assert cliente.peticiones == 3


def test_el_aviso_de_reintento_no_filtra_el_identificador_de_sesion(
    caplog: pytest.LogCaptureFixture, html_listado: str
) -> None:
    """El WARNING del reintento pasa la URL por `_sin_sesion()`, como el resto del modulo.

    Las URL de Wicket llevan `;jsessionid=<token>`: ese token es la sesion viva del SGA y no
    puede terminar en la terminal ni en un archivo de log.
    """
    reloj = Reloj()
    estado = {"fallos": 1}
    url = "https://sga.itba.edu.ar/app2/;jsessionid=ABC123SECRETO?0-1.-login"

    def manejar(peticion: httpx.Request) -> httpx.Response:
        if estado["fallos"]:
            estado["fallos"] -= 1
            return httpx.Response(503, text="Service Unavailable")
        return httpx.Response(200, html=html_listado)

    caplog.set_level(logging.DEBUG, logger="cuatris.sga")
    with _cliente(manejar, reloj) as cliente:
        cliente.obtener(url)

    avisos = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any("Reintento 1" in mensaje for mensaje in avisos)
    assert "ABC123SECRETO" not in caplog.text
    assert ";jsessionid=…" in caplog.text


def test_reintenta_ante_timeout_y_se_rinde_tras_tres_intentos() -> None:
    reloj = Reloj()
    intentos = {"n": 0}

    def manejar(peticion: httpx.Request) -> httpx.Response:
        intentos["n"] += 1
        raise httpx.ReadTimeout("se acabo el tiempo", request=peticion)

    with (
        _cliente(manejar, reloj) as cliente,
        pytest.raises(ErrorDeRed, match="reintentos"),
    ):
        cliente.obtener("https://sga.itba.edu.ar/app2/cursos")

    assert intentos["n"] == 4  # el intento original mas tres reintentos
    assert reloj.esperas == [2.0, 4.0, 8.0]


def test_un_4xx_no_se_reintenta() -> None:
    intentos = {"n": 0}

    def manejar(peticion: httpx.Request) -> httpx.Response:
        intentos["n"] += 1
        return httpx.Response(404, text="No encontrado")

    with _cliente(manejar) as cliente, pytest.raises(ErrorDeRed, match="404"):
        cliente.obtener("https://sga.itba.edu.ar/app2/cursos")
    assert intentos["n"] == 1


# --------------------------------------------------------------------------------------
# Navegacion por texto visible
# --------------------------------------------------------------------------------------


def test_enlace_por_texto_encuentra_cursos_en_el_menu(html_listado: str) -> None:
    destino = enlace_por_texto(html_listado, "Cursos")
    assert destino.startswith("https://sga.itba.edu.ar/app2/")


def test_enlace_por_texto_falla_con_el_titulo_de_la_pantalla(html_listado: str) -> None:
    with pytest.raises(EstructuraInesperada, match="Inscripciones"):
        enlace_por_texto(html_listado, "Inscripciones")


def test_enlace_de_pestana_encuentra_comisiones(html_detalle: str) -> None:
    destino = enlace_de_pestana(html_detalle, "Comisiones")
    assert destino.startswith("https://sga.itba.edu.ar/app2/")


def test_enlace_de_pestana_lista_las_pestanas_cuando_no_encuentra_la_pedida(
    html_detalle: str,
) -> None:
    with pytest.raises(EstructuraInesperada, match="Contenidos"):
        enlace_de_pestana(html_detalle, "Horarios")


def test_enlace_de_pestana_avisa_si_la_pestana_no_trae_href() -> None:
    panel = '<div class="tabpanel4"><ul><li class="active"><a>Comisiones</a></li></ul></div>'
    with pytest.raises(EstructuraInesperada, match="no trae «href»"):
        enlace_de_pestana(panel, "Comisiones")


def test_enlace_de_pestana_falla_sin_panel_de_pestanas(html_listado: str) -> None:
    with pytest.raises(EstructuraInesperada, match="tabpanel4"):
        enlace_de_pestana(html_listado, "Comisiones")


# --------------------------------------------------------------------------------------
# Diagnostico
# --------------------------------------------------------------------------------------


def test_volcar_html_guarda_la_ultima_respuesta(
    tmp_path: Path, html_listado: str
) -> None:
    pedidos: list[httpx.Request] = []
    with _cliente(_sga(html_listado, pedidos)) as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)
        ruta = cliente.volcar_html(tmp_path, "2026-2C-error")

    assert ruta == tmp_path / "2026-2C-error.html"
    assert ruta.read_text(encoding="utf-8") == html_listado


def test_cerrar_borra_las_credenciales_de_memoria(html_listado: str) -> None:
    pedidos: list[httpx.Request] = []
    cliente = _cliente(_sga(html_listado, pedidos))
    cliente.iniciar_sesion(USUARIO, CLAVE)
    cliente.cerrar()
    assert CLAVE not in repr(vars(cliente))


# --------------------------------------------------------------------------------------
# Pantalla de error del SGA (pagina de Wicket desalojada)
# --------------------------------------------------------------------------------------


@pytest.fixture(scope="session")
def html_error(corpus_sga: Path) -> str:
    """La pantalla que el SGA devolvio a las filas 41 a 472 el 2026-09-12."""
    return (corpus_sga / "error-inesperado.html").read_text(encoding="utf-8")


def test_la_pantalla_de_error_se_reconoce_por_sus_dos_anclas(
    html_error: str, html_listado: str
) -> None:
    assert pagina_de_error(html_error)
    assert not pagina_de_error(html_listado)
    assert not pagina_de_error(LOGIN)


def test_cada_ancla_de_la_pantalla_de_error_alcanza_por_si_sola(html_error: str) -> None:
    """Se anclan las dos porque cada una se rompe distinto; con una sola ya se reconoce."""
    sin_titulo = html_error.replace(
        "<h3>El sistema halló un error inesperado.</h3>", "<h3>Vaya</h3>"
    )
    sin_aviso = html_error.replace('id="notifications"', 'id="otra-cosa"')
    assert sin_titulo != html_error and sin_aviso != html_error
    assert pagina_de_error(sin_titulo), "queda el <h4> de div#notifications"
    assert pagina_de_error(sin_aviso), "queda el <h3> del titulo"


def test_la_pantalla_de_error_no_lleva_el_nombre_del_usuario(html_error: str) -> None:
    """El volcado real llega con la barra superior vacia; el corpus tiene que quedar igual."""
    assert "CAULES" not in html_error.upper()
    assert "loggedUser" not in html_error


def test_una_pagina_de_error_sale_como_pagina_vencida_sin_el_cuerpo(
    html_listado: str, html_error: str
) -> None:
    url = "https://sga.itba.edu.ar/app2/detalle;jsessionid=ABC123SECRETO?0-1.-lupa"

    def manejar(peticion: httpx.Request) -> httpx.Response:
        if peticion.url.path == "/app2/":
            return httpx.Response(200, html=LOGIN, headers=COOKIES)
        if peticion.method == "POST":
            return httpx.Response(200, html=html_listado)
        return httpx.Response(200, html=html_error)

    with _cliente(manejar) as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)
        with pytest.raises(PaginaVencida) as fallo:
            cliente.obtener(url)

    mensaje = str(fallo.value)
    assert "GET" in mensaje
    assert ";jsessionid=…" in mensaje and "ABC123SECRETO" not in mensaje
    assert "ya no existe en la sesion" in mensaje
    assert "error inesperado" not in mensaje, "el cuerpo de la respuesta no se repite"


def test_una_pagina_de_error_no_dispara_el_relogin(
    html_listado: str, html_error: str
) -> None:
    """No es una sesion vencida: volver a entrar no arregla una pagina desalojada."""
    entradas = {"n": 0}

    def manejar(peticion: httpx.Request) -> httpx.Response:
        if peticion.url.path == "/app2/":
            entradas["n"] += 1
            return httpx.Response(200, html=LOGIN, headers=COOKIES)
        if peticion.method == "POST":
            return httpx.Response(200, html=html_listado)
        return httpx.Response(200, html=html_error)

    with _cliente(manejar) as cliente:
        cliente.iniciar_sesion(USUARIO, CLAVE)
        with pytest.raises(PaginaVencida):
            cliente.obtener("https://sga.itba.edu.ar/app2/detalle")

    assert entradas["n"] == 1, "solo la entrada del login inicial"
