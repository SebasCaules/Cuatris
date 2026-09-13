"""Cliente HTTP del SGA: sesion, cookies, ritmo y reintentos.

Este modulo es la unica pieza del proyecto que habla con `sga.itba.edu.ar`. No interpreta
HTML: para eso delega en `parsers`. Las reglas que fija el material
(`material-raw/02-sga/HALLAZGOS.md`) y que aca se implementan son:

- El **unico** punto de entrada estable es `https://sga.itba.edu.ar/app2/`. Cualquier otra
  URL esta cifrada por el `CryptoMapper` de Wicket y cambia con los despliegues, asi que se
  sigue siempre un `href` o un `<form action>` del HTML recibido y nunca una URL escrita a
  mano.
- Hacen falta las tres cookies (`JSESSIONID`, `AWSALB`, `AWSALBCORS`): `AWSALB` mantiene la
  afinidad con la instancia del balanceador y sin ella la sesion de Wicket se pierde. El
  `httpx.Client` las conserva solo; aca se comprueba que llegaron.
- El `action` del formulario de login es **relativo** y trae `;jsessionid=`: se resuelve
  contra la URL final de la pagina, no contra `base_url`.

Sobre las credenciales: el cliente las guarda **en memoria** mientras dura la corrida,
porque el re-login transparente ante una sesion vencida no puede volver a pedirlas. Nunca
se escriben en disco, ni se registran en el log, ni aparecen en el texto de una excepcion;
`cerrar()` las borra. Los mensajes de error jamas incluyen el cuerpo de la respuesta, que es
donde el SGA podria devolver lo que se le envio.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from . import normalizar, parsers

__all__ = [
    "AGENTE",
    "BASE",
    "ClienteSGA",
    "COOKIES_SESION",
    "ENTRADA",
    "ErrorDeRed",
    "ErrorDeSesion",
    "ErrorSGA",
    "REGISTRO",
    "Respuesta",
    "enlace_de_pestana",
    "enlace_por_texto",
    "esta_autenticada",
    "sesion_vencida",
]

#: Servidor del SGA. Es el unico host al que este modulo hace peticiones.
BASE = "https://sga.itba.edu.ar"
#: Punto de entrada estable (HALLAZGOS.md, «Punto de entrada»). Redirige dos veces.
ENTRADA = "/app2/"
#: `User-Agent` identificable: es el sistema de la universidad y tiene que poder rastrearse.
AGENTE = "Cuatris/0.1 (+https://github.com/SebasCaules/Cuatris)"
#: Cookies que el SGA necesita para sostener la sesion.
COOKIES_SESION = ("JSESSIONID", "AWSALB", "AWSALBCORS")

#: Peticiones por segundo por defecto: conservador a proposito (~500 peticiones por barrido).
RITMO = 1.0
#: Tiempo limite de cada peticion, en segundos.
TIEMPO_LIMITE = 30.0
#: Reintentos ante 5xx o timeout, sin contar el intento original.
REINTENTOS = 3
#: Espera del primer reintento, en segundos; se duplica en cada uno (2, 4, 8).
ESPERA_REINTENTO = 2.0

#: Nombres de los campos del formulario de login (HALLAZGOS.md, «Formulario de login»).
CAMPO_USUARIO = "user"
CAMPO_CLAVE = "password"
CAMPO_ENVIO = "login"
VALOR_ENVIO = "Ingresar"
CAMPO_JS = "js"
"""Campo oculto que el JavaScript de la pantalla de login pone en `1` al cargar.

El HTML lo trae en `0`. Si se envia en `0`, el SGA entra en un bucle de redirecciones
(verificado el 2026-09-12 contra el sistema real: con `1` responde la pantalla siguiente o el
mensaje «Usuario o contrasena invalido»). El scraper imita al navegador y manda `1`.
"""
VALOR_JS = "1"

#: Texto del enlace que solo aparece con la sesion iniciada. Es el ancla de autenticacion:
#: esta en la barra superior de todas las pantallas del SGA y no depende de ningun id.
ANCLA_AUTENTICADA = "Salir"

REGISTRO = logging.getLogger("cuatris.sga")
"""Log del scraper. Solo se registran metodo, URL y codigo de estado: nunca el cuerpo."""


class ErrorSGA(RuntimeError):
    """Falla al hablar con el SGA."""


class ErrorDeSesion(ErrorSGA):
    """El login fallo o la sesion vencio y no se pudo recuperar."""


class ErrorDeRed(ErrorSGA):
    """Se agotaron los reintentos ante errores 5xx o vencimientos de tiempo."""


@dataclass(frozen=True)
class Respuesta:
    """Ultima respuesta recibida, para diagnosticar y para resolver URLs relativas."""

    url: str
    html: str
    estado: int


# --------------------------------------------------------------------------------------
# Lectura de anclas (texto visible, nunca ids de Wicket)
# --------------------------------------------------------------------------------------


def _sopa(html: str) -> BeautifulSoup:
    return html if isinstance(html, BeautifulSoup) else BeautifulSoup(html, "html.parser")


def esta_autenticada(html: str) -> bool:
    """¿El HTML corresponde a una pantalla con la sesion iniciada?

    Ancla: el enlace «[Salir]» de la barra superior, presente en todas las pantallas del
    SGA una vez iniciada la sesion, y la ausencia del campo de contrasena del login. Se usan
    los dos juntos porque cada uno por separado se rompe de una forma distinta: si el ITBA
    renombra el enlace, el campo de contrasena sigue delatando la pantalla de login.
    """
    sopa = _sopa(html)
    if sopa.find("input", attrs={"type": "password"}) is not None:
        return False
    objetivo = normalizar.clave(ANCLA_AUTENTICADA)
    return any(
        objetivo in normalizar.clave(enlace.get_text(" ", strip=True))
        for enlace in sopa.find_all("a")
    )


def sesion_vencida(html: str) -> bool:
    """¿El SGA devolvio la pantalla de login en vez de lo que se le pidio?

    Ancla: el campo `<input type="password">`. Cuando la sesion de Wicket caduca, el SGA
    responde con el formulario de login a cualquier URL, incluso a una cifrada que antes
    funcionaba; ese campo no aparece en ninguna otra pantalla.
    """
    return _sopa(html).find("input", attrs={"type": "password"}) is not None


def enlace_por_texto(html: str, texto: str) -> str:
    """`href` del primer `<a>` cuyo texto visible es `texto` (sin acentos ni mayusculas).

    Es como se navega el menu: «Académica → Cursos» es buscar el enlace que dice `Cursos`.
    Ningun id de Wicket interviene.
    """
    sopa = _sopa(html)
    objetivo = normalizar.clave(texto)
    for enlace in sopa.find_all("a"):
        if normalizar.clave(enlace.get_text(" ", strip=True)) != objetivo:
            continue
        destino = enlace.get("href")
        if destino:
            return destino
    raise parsers.EstructuraInesperada(
        f"No hay ningun enlace que diga «{texto}» en esta pantalla.",
        sopa.title.get_text(strip=True) if sopa.title else None,
    )


def enlace_de_pestana(html: str, texto: str) -> str:
    """`href` de una pestana del detalle de un curso (`div.tabpanel4`).

    Se busca dentro del panel de pestanas para no confundirse con un enlace homonimo del
    menu. En el material la pestana activa tambien trae su `href`, asi que pedir la pestana
    ya abierta devuelve una URL valida; si algun dia no lo trajera, se avisa en vez de
    devolver una cadena vacia.
    """
    sopa = _sopa(html)
    panel = sopa.select_one("div.tabpanel4")
    if panel is None:
        raise parsers.EstructuraInesperada(
            "El detalle del curso no trae el panel de pestanas «div.tabpanel4»."
        )
    objetivo = normalizar.clave(texto)
    for elemento in panel.find_all("li"):
        enlace = elemento.find("a")
        etiqueta = elemento.get_text(" ", strip=True)
        if normalizar.clave(etiqueta) != objetivo:
            continue
        if enlace is None or not enlace.get("href"):
            raise parsers.EstructuraInesperada(f"La pestana «{texto}» no trae «href».", etiqueta)
        return enlace["href"]
    raise parsers.EstructuraInesperada(
        f"El detalle del curso no tiene la pestana «{texto}».",
        [e.get_text(" ", strip=True) for e in panel.find_all("li")][:6],
    )


# --------------------------------------------------------------------------------------
# Cliente
# --------------------------------------------------------------------------------------


class ClienteSGA:
    """Sesion contra el SGA con ritmo, reintentos y re-login transparente.

    `reloj` y `dormir` se inyectan para poder probar el ritmo sin esperar de verdad;
    `transporte` se inyecta para probar todo el flujo con `httpx.MockTransport`, que es como
    corren los tests: **ningun test hace una peticion real**.
    """

    def __init__(
        self,
        *,
        base_url: str = BASE,
        ritmo: float = RITMO,
        reintentos: int = REINTENTOS,
        tiempo_limite: float = TIEMPO_LIMITE,
        espera_reintento: float = ESPERA_REINTENTO,
        transporte: httpx.BaseTransport | None = None,
        reloj: Callable[[], float] = time.monotonic,
        dormir: Callable[[float], None] = time.sleep,
    ) -> None:
        if ritmo <= 0:
            raise ValueError("El ritmo tiene que ser mayor que cero (peticiones por segundo).")
        if reintentos < 0:
            raise ValueError("Los reintentos no pueden ser negativos.")
        self.ritmo = ritmo
        self.reintentos = reintentos
        self.espera_reintento = espera_reintento
        self._reloj = reloj
        self._dormir = dormir
        self._ultimo_pedido: float | None = None
        self._credenciales: tuple[str, str] | None = None
        self._relogueando = False
        self.ultima_respuesta: Respuesta | None = None
        self.peticiones = 0
        self._http = httpx.Client(
            base_url=base_url,
            headers={"User-Agent": AGENTE},
            timeout=tiempo_limite,
            follow_redirects=True,
            transport=transporte,
        )

    # -- ciclo de vida ------------------------------------------------------------------

    def __enter__(self) -> ClienteSGA:
        return self

    def __exit__(self, *_excepcion: object) -> None:
        self.cerrar()

    def cerrar(self) -> None:
        """Cierra la conexion y borra las credenciales de memoria."""
        self._credenciales = None
        self._http.close()

    def __repr__(self) -> str:  # pragma: no cover - ayuda al depurar, no se prueba
        sesion = "con sesion" if self._credenciales else "sin sesion"
        return f"<ClienteSGA {sesion}, {self.peticiones} peticiones>"

    # -- ritmo y reintentos -------------------------------------------------------------

    @property
    def intervalo(self) -> float:
        """Segundos que tienen que pasar entre dos peticiones."""
        return 1.0 / self.ritmo

    def _esperar_turno(self) -> None:
        ahora = self._reloj()
        if self._ultimo_pedido is not None:
            falta = self._ultimo_pedido + self.intervalo - ahora
            if falta > 0:
                self._dormir(falta)
                ahora = ahora + falta
        self._ultimo_pedido = ahora

    def _pedir(self, metodo: str, url: str, datos: Mapping[str, str] | None = None) -> str:
        """Una peticion, con ritmo y reintentos. Devuelve el HTML."""
        ultimo_fallo: Exception | None = None
        for intento in range(self.reintentos + 1):
            if intento:
                espera = self.espera_reintento * (2 ** (intento - 1))
                REGISTRO.warning(
                    "Reintento %d de %d dentro de %.1f s (%s %s).",
                    intento,
                    self.reintentos,
                    espera,
                    metodo,
                    _sin_sesion(url),
                )
                self._dormir(espera)
            self._esperar_turno()
            self.peticiones += 1
            try:
                respuesta = self._http.request(metodo, url, data=dict(datos) if datos else None)
            except httpx.TimeoutException as exc:
                ultimo_fallo = exc
                continue
            except httpx.TransportError as exc:
                ultimo_fallo = exc
                continue
            REGISTRO.debug("%s %s -> %d", metodo, _sin_sesion(respuesta.url), respuesta.status_code)
            if respuesta.status_code >= 500:
                ultimo_fallo = httpx.HTTPStatusError(
                    f"el SGA respondio {respuesta.status_code}",
                    request=respuesta.request,
                    response=respuesta,
                )
                continue
            if respuesta.status_code >= 400:
                raise ErrorDeRed(
                    f"El SGA respondio {respuesta.status_code} a {metodo} "
                    f"{_sin_sesion(respuesta.url)}."
                )
            self.ultima_respuesta = Respuesta(
                url=str(respuesta.url), html=respuesta.text, estado=respuesta.status_code
            )
            return respuesta.text
        raise ErrorDeRed(
            f"No se pudo completar {metodo} {_sin_sesion(url)} tras {self.reintentos} "
            f"reintentos: {ultimo_fallo}"
        )

    # -- sesion -------------------------------------------------------------------------

    def cookies_de_sesion(self) -> dict[str, str]:
        """Las cookies de `COOKIES_SESION` que el SGA ya entrego."""
        return {
            nombre: valor
            for nombre, valor in self._http.cookies.items()
            if nombre in COOKIES_SESION
        }

    def abrir_entrada(self) -> str:
        """GET a `/app2/`: deja la pantalla de login y las cookies de sesion."""
        html = self._pedir("GET", ENTRADA)
        faltantes = [c for c in COOKIES_SESION if c not in self._http.cookies]
        if faltantes:
            # No es fatal (el balanceador puede cambiar), pero sin `AWSALB` la sesion se
            # pierde a mitad del barrido y conviene que quede dicho en el log.
            REGISTRO.warning("El SGA no entrego las cookies %s.", ", ".join(faltantes))
        return html

    def iniciar_sesion(self, usuario: str, clave: str) -> str:
        """Inicia sesion y devuelve el HTML de la pantalla siguiente.

        Lee el `action` y los campos ocultos del HTML recibido (`extraer_formulario_login`)
        y postea `user`, `password` y `login`. Si el resultado no tiene el ancla de sesion
        iniciada, levanta `ErrorDeSesion` **sin volcar la respuesta**: ahi es donde podria
        aparecer lo que se envio.
        """
        if not usuario or not clave:
            raise ErrorDeSesion("Faltan el usuario o la contrasena del SGA.")
        html = self.abrir_entrada()
        accion, ocultos = parsers.extraer_formulario_login(html)
        pagina = self.ultima_respuesta.url if self.ultima_respuesta else str(self._http.base_url)
        destino = urljoin(pagina, accion)

        datos = dict(ocultos)
        datos[CAMPO_JS] = VALOR_JS
        datos[CAMPO_USUARIO] = usuario
        datos[CAMPO_CLAVE] = clave
        datos[CAMPO_ENVIO] = VALOR_ENVIO
        REGISTRO.info("Iniciando sesion en el SGA como %s.", usuario)
        resultado = self._pedir("POST", destino, datos)

        if not esta_autenticada(resultado):
            raise ErrorDeSesion(
                "El SGA no acepto el login: la respuesta no trae el enlace «"
                f"{ANCLA_AUTENTICADA}» de la barra superior. Revise el usuario y la "
                "contrasena; si son correctos, vuelva a correr con --guardar-html y compare "
                "la pantalla con tests/corpus/sga/."
            )
        self._credenciales = (usuario, clave)
        REGISTRO.info("Sesion iniciada; cookies: %s.", ", ".join(sorted(self.cookies_de_sesion())))
        return resultado

    def _con_sesion(self, metodo: str, url: str, datos: Mapping[str, str] | None) -> str:
        """Hace la peticion y, si la sesion vencio, vuelve a entrar **una sola vez**."""
        html = self._pedir(metodo, url, datos)
        if not sesion_vencida(html):
            return html
        if self._relogueando:
            raise ErrorDeSesion("La sesion vencio mientras se volvia a iniciar sesion.")
        if self._credenciales is None:
            raise ErrorDeSesion(
                "La sesion del SGA vencio y no hay credenciales en memoria para volver a "
                "entrar; vuelva a correr el comando."
            )
        REGISTRO.warning("La sesion del SGA vencio; volviendo a iniciar sesion.")
        self._relogueando = True
        try:
            self.iniciar_sesion(*self._credenciales)
            html = self._pedir(metodo, url, datos)
        finally:
            self._relogueando = False
        if sesion_vencida(html):
            raise ErrorDeSesion(
                "La sesion volvio a vencer inmediatamente despues de reiniciarla. Si la "
                "corrida venia avanzada, el checkpoint conserva lo bajado: vuelva a correr "
                "el mismo comando sin --desde-cero."
            )
        return html

    def obtener(self, url: str) -> str:
        """GET a una URL del SGA (absoluta o relativa a la pagina actual)."""
        return self._con_sesion("GET", self._resolver(url), None)

    def enviar(self, url: str, datos: Mapping[str, str]) -> str:
        """POST de un formulario del SGA."""
        return self._con_sesion("POST", self._resolver(url), datos)

    def _resolver(self, url: str) -> str:
        """Resuelve una URL relativa contra la ultima pagina recibida."""
        if url.startswith(("http://", "https://", "/")):
            return url
        base = self.ultima_respuesta.url if self.ultima_respuesta else str(self._http.base_url)
        return urljoin(base, url)

    # -- diagnostico --------------------------------------------------------------------

    def volcar_html(self, directorio: str | Path, etiqueta: str) -> Path | None:
        """Guarda la ultima respuesta en `<directorio>/<etiqueta>.html` para diagnosticar.

        Es lo que hace `--guardar-html`. El archivo queda en `.cuatris-cache/`, que esta en
        `.gitignore`: **lleva el nombre del usuario en la barra superior**, asi que hay que
        anonimizarlo antes de compartirlo o de sumarlo a `tests/corpus/sga/`.
        """
        if self.ultima_respuesta is None:
            return None
        carpeta = Path(directorio)
        carpeta.mkdir(parents=True, exist_ok=True)
        seguro = "".join(c if c.isalnum() or c in "-_." else "-" for c in etiqueta)
        ruta = carpeta / f"{seguro}.html"
        ruta.write_text(self.ultima_respuesta.html, encoding="utf-8")
        REGISTRO.warning(
            "Respuesta guardada en %s (%s).", ruta, _sin_sesion(self.ultima_respuesta.url)
        )
        return ruta


def _sin_sesion(url: object) -> str:
    """La URL sin el identificador de sesion que Wicket incrusta (`;jsessionid=…`)."""
    return re.sub(r";jsessionid=[^?#/]*", ";jsessionid=…", str(url), flags=re.IGNORECASE)
