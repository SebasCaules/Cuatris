#!/usr/bin/env python3
"""Baja del SGA el listado de carreras de grado y el plan de estudios de cada una.

Recorre lo mismo que haría una persona: `/app2/` → login → Académica → Carreras
(Nivel = Grado) → «Ver detalles» de cada carrera, y guarda cada pantalla en
`data/plan/sga-carreras/` (`carreras.html` y `<CODIGO>-plan.html`), anonimizada
(el nombre del usuario de la barra superior se reemplaza por `APELLIDO, NOMBRE`).
Al final corre `scripts/build-carreras-data.mjs`, que convierte esos HTML en
`data/plan/carreras.json` y `data/plan/carreras/<CODIGO>.json`.

Reutiliza el cliente del scraper de horarios (`tools/cuatris/sga`): sesión, cookies,
ritmo, reintentos y re-login. Necesita `httpx` y `beautifulsoup4` (ver `tools/README.md`).

Uso, desde la raíz del repositorio:

    python3 data/plan/bajar-carreras.py                 # pide usuario y contraseña
    SGA_USUARIO=... python3 data/plan/bajar-carreras.py # solo pide la contraseña
    python3 data/plan/bajar-carreras.py --solo S I K    # algunas carreras

Las credenciales viven en memoria durante la corrida: no se guardan ni se registran.
"""

from __future__ import annotations

import argparse
import getpass
import logging
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urljoin

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "tools"))

from bs4 import BeautifulSoup  # noqa: E402

from cuatris.sga import normalizar  # noqa: E402
from cuatris.sga.cliente import (  # noqa: E402
    ENTRADA,
    REGISTRO,
    ClienteSGA,
    PaginaVencida,
    enlace_por_texto,
)

SALIDA = RAIZ / "data" / "plan" / "sga-carreras"
IMPORTADOR = RAIZ / "scripts" / "build-carreras-data.mjs"

ENLACE_CARRERAS = "Carreras"
NIVEL = "Grado"
ACCION_DETALLES = "Ver detalles"
#: La pantalla del plan de estudios se reconoce por este título.
ANCLA_PLAN = "Detalle de Planes de estudio"
#: «Ver detalles» de una carrera abre primero esta pantalla: la tabla de sus planes de
#: estudio (`Nombre · Version · Activo desde · Activo hasta · Acciones`), uno por fila,
#: cada uno con su propio «Ver detalles». Se guarda como `<CODIGO>-planes.html` y se
#: baja el plan más nuevo (mayor «Activo desde»).
ANCLA_PLANES = "Listado de Planes de estudio"
#: Pantallas intermedias, para diagnosticar (queda fuera de git).
DEBUG = SALIDA / "debug"
#: Carreras que no son una carrera (no tienen plan de estudios).
EXCLUIDAS = {"X"}
ANONIMO = "APELLIDO, NOMBRE"
VAR_USUARIO = "SGA_USUARIO"
VAR_CLAVE = "SGA_CLAVE"


def credenciales() -> tuple[str, str]:
    """Usuario y contraseña del SGA: variables de entorno o, si faltan, prompt (getpass)."""
    usuario = (os.environ.get(VAR_USUARIO) or "").strip()
    clave = os.environ.get(VAR_CLAVE) or ""
    if not usuario:
        usuario = input(f"Usuario del SGA ({VAR_USUARIO} no está definida): ").strip()
    if not clave:
        clave = getpass.getpass(f"Contraseña del SGA ({VAR_CLAVE} no está definida): ")
    if not usuario or not clave:
        raise SystemExit("Se necesitan usuario y contraseña del SGA.")
    return usuario, clave


def sopa(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def anonimizar(html: str) -> str:
    """Reemplaza el nombre del usuario de la barra superior y borra los `;jsessionid=`."""
    html = re.sub(r";jsessionid=[^\"'/?&]*", "", html)
    return re.sub(
        r'(class="[^"]*loggedUser[^"]*">\s*<span>)([^<]*)(</span>)',
        lambda m: m.group(1) + ANONIMO + m.group(3),
        html,
        count=1,
    )


def guardar(nombre: str, html: str, carpeta: Path = SALIDA) -> Path:
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / nombre
    ruta.write_text(anonimizar(html), encoding="utf-8")
    return ruta


def absoluto(cliente: ClienteSGA, href: str) -> str:
    """Resuelve un `href` contra la página en la que apareció (la última respuesta), ahora.

    Los enlaces del SGA son relativos (`../../../…`) a la página que los trae; si se
    resolvieran al usarlos, la última respuesta sería otra pantalla con otra profundidad y
    `../../..` se saldría de `/app2/` (pasó en la corrida real del 2026-09-13).
    """
    base = cliente.ultima_respuesta.url if cliente.ultima_respuesta else None
    return urljoin(base, href) if base else href


def es_plan(html: str) -> bool:
    return ANCLA_PLAN in html


def cuatri_clave(texto: str) -> tuple[int, int]:
    """«Segundo Cuat. 2024» → (2024, 2), para ordenar; vacío → (0, 0)."""
    bajo = (texto or "").lower()
    anio = re.search(r"(\d{4})", bajo)
    cuat = 2 if "segundo" in bajo else 0 if "verano" in bajo else 1
    return (int(anio.group(1)), cuat) if anio else (0, 0)


def planes_de(cliente: ClienteSGA, html: str) -> list[dict[str, str]]:
    """Filas de «Listado de Planes de estudio»: nombre, versión, desde, hasta y enlace absoluto."""
    out: list[dict[str, str]] = []
    for fila in sopa(html).find_all("tr"):
        celdas = fila.find_all("td", recursive=False)
        if len(celdas) < 5:
            continue
        a = next(
            (a for a in celdas[4].find_all("a") if normalizar.clave(a.get("title") or "") == normalizar.clave(ACCION_DETALLES)),
            None,
        )
        nombre = celdas[0].get_text(" ", strip=True)
        if not a or not a.get("href") or not nombre:
            continue
        out.append(
            {
                "nombre": nombre,
                "version": celdas[1].get_text(" ", strip=True),
                "desde": celdas[2].get_text(" ", strip=True),
                "hasta": celdas[3].get_text(" ", strip=True),
                "enlace": absoluto(cliente, a["href"]),
            }
        )
    return out


# --------------------------------------------------------------------------------------
# Listado de carreras
# --------------------------------------------------------------------------------------


def nivel_seleccionado(html: str) -> str | None:
    """Texto de la opción elegida en el filtro Nivel del listado (el desplegable que ofrece «Grado»)."""
    for select in sopa(html).find_all("select"):
        opciones = select.find_all("option")
        textos = [o.get_text(" ", strip=True) for o in opciones]
        if NIVEL not in textos or "Seleccione uno" in textos:
            continue  # el segundo desplegable («Nivel informativo») arranca en «Seleccione uno»
        for o in opciones:
            if o.has_attr("selected"):
                return o.get_text(" ", strip=True)
        return None
    return None


def filtrar_por_nivel(cliente: ClienteSGA, html: str) -> str:
    """Envía el formulario de filtros con Nivel = Grado (solo si no está ya seleccionado)."""
    documento = sopa(html)
    campos: dict[str, str] = {}
    objetivo: str | None = None
    formulario = None
    for nodo in documento.find_all(["input", "select"]):
        nombre = nodo.get("name") or ""
        if ":filters:" not in nombre or not nombre.endswith(":filter:filter"):
            continue
        formulario = formulario or nodo.find_parent("form")
        if nodo.name == "select":
            textos = {o.get_text(" ", strip=True): o.get("value", "") for o in nodo.find_all("option")}
            if NIVEL in textos and "Seleccione uno" not in textos and objetivo is None:
                objetivo = nombre
                campos[nombre] = textos[NIVEL]
                continue
            elegido = next((o for o in nodo.find_all("option") if o.has_attr("selected")), None)
            campos[nombre] = elegido.get("value", "") if elegido else ""
        else:
            campos[nombre] = nodo.get("value") or ""
    if formulario is None or objetivo is None:
        raise SystemExit("El listado de carreras no trae el filtro de Nivel: cambió la pantalla del SGA.")
    for oculto in formulario.find_all("input", attrs={"type": "hidden"}):
        nombre = oculto.get("name") or oculto.get("id")
        if nombre:
            campos.setdefault(nombre, oculto.get("value") or "")
    go = re.search(r"results:topToolbars:toolbars:\d+:filters:\d+:filter:go", html)
    if go:
        campos[go.group(0)] = ""
    accion = formulario.get("action")
    if not accion:
        raise SystemExit("El formulario de filtros del listado de carreras no trae «action».")
    REGISTRO.info("Filtrando el listado de carreras por Nivel = %s.", NIVEL)
    return cliente.enviar(accion, campos)


def abrir_listado(cliente: ClienteSGA) -> str:
    """`/app2/` → «Carreras» → Nivel = Grado."""
    inicio = cliente.obtener(ENTRADA)
    html = cliente.obtener(enlace_por_texto(inicio, ENLACE_CARRERAS))
    if normalizar.clave(nivel_seleccionado(html) or "") != normalizar.clave(NIVEL):
        html = filtrar_por_nivel(cliente, html)
        if normalizar.clave(nivel_seleccionado(html) or "") != normalizar.clave(NIVEL):
            raise SystemExit("No se pudo dejar el listado de carreras en Nivel = Grado.")
    if sopa(html).select_one(".navigator a"):
        REGISTRO.warning("El listado de carreras tiene más de una página: solo se recorre la primera.")
    return html


def filas(cliente: ClienteSGA, html: str) -> list[tuple[str, str, str]]:
    """(código, nombre, enlace absoluto «Ver detalles») de cada carrera del listado."""
    out: list[tuple[str, str, str]] = []
    for fila in sopa(html).find_all("tr"):
        celdas = fila.find_all("td", recursive=False)
        if len(celdas) < 5:
            continue
        codigo = celdas[0].get_text(" ", strip=True)
        nombre = celdas[1].get_text(" ", strip=True)
        if not re.fullmatch(r"[A-Z]{1,5}", codigo) or not nombre:
            continue
        enlace = None
        for a in fila.find_all("a"):
            img = a.find("img")
            titulo = (img.get("title") if img else None) or a.get("title") or ""
            if normalizar.clave(titulo) == normalizar.clave(ACCION_DETALLES):
                enlace = a.get("href")
                break
        if enlace:
            out.append((codigo, nombre, absoluto(cliente, enlace)))
        else:
            REGISTRO.warning("La carrera %s no tiene enlace «%s».", codigo, ACCION_DETALLES)
    return out


# --------------------------------------------------------------------------------------
# Corrida
# --------------------------------------------------------------------------------------


def ejecutar(args: argparse.Namespace) -> int:
    logging.basicConfig(level=logging.DEBUG if args.verboso else logging.INFO, format="%(message)s")
    usuario, clave = credenciales()
    guardadas: list[str] = []
    fallidas: list[str] = []
    with ClienteSGA(ritmo=args.ritmo) as cliente:
        cliente.iniciar_sesion(usuario, clave)
        del clave
        listado = abrir_listado(cliente)
        guardar("carreras.html", listado)
        carreras = filas(cliente, listado)
        if not carreras:
            raise SystemExit("El listado de carreras no tiene filas: revise carreras.html.")
        elegidas = [c for c in carreras if c[0] not in EXCLUIDAS and (not args.solo or c[0] in args.solo)]
        REGISTRO.info("%d carreras en el listado; se bajan %d.", len(carreras), len(elegidas))
        for codigo, nombre, enlace in elegidas:
            for intento in (1, 2):
                try:
                    html = cliente.obtener(enlace)
                    break
                except PaginaVencida:
                    if intento == 2:
                        raise
                    # el listado salió del almacén de páginas de Wicket: se vuelve a abrir
                    REGISTRO.info("Listado vencido; se reabre para %s.", codigo)
                    listado = abrir_listado(cliente)
                    enlace = next((e for c, _, e in filas(cliente, listado) if c == codigo), enlace)
            if not es_plan(html) and ANCLA_PLANES not in html:
                guardar(f"{codigo}-detalles.html", html, DEBUG)
                REGISTRO.warning(
                    "%s %s: «Ver detalles» no es ni el plan ni el listado de planes; pantalla en %s",
                    codigo, nombre, (DEBUG / f"{codigo}-detalles.html").relative_to(RAIZ),
                )
                fallidas.append(codigo)
                continue
            if not es_plan(html):
                # listado de planes de estudio de la carrera → el más nuevo
                guardar(f"{codigo}-planes.html", html)
                planes = planes_de(cliente, html)
                if not planes:
                    REGISTRO.warning("%s %s: el listado de planes no tiene filas.", codigo, nombre)
                    fallidas.append(codigo)
                    continue
                planes.sort(key=lambda p: cuatri_clave(p["desde"]), reverse=True)
                elegido = planes[0]
                if len(planes) > 1:
                    REGISTRO.info(
                        "%s: %d planes (%s); se baja «%s» (activo desde %s).",
                        codigo, len(planes), ", ".join(p["nombre"] for p in planes), elegido["nombre"], elegido["desde"],
                    )
                html = cliente.obtener(elegido["enlace"])
                if not es_plan(html):
                    guardar(f"{codigo}-plan-detalles.html", html, DEBUG)
                    REGISTRO.warning("%s %s: «%s» no abrió el plan; pantalla en debug/.", codigo, nombre, elegido["nombre"])
                    fallidas.append(codigo)
                    continue
            ruta = guardar(f"{codigo}-plan.html", html)
            guardadas.append(codigo)
            REGISTRO.info("%s %s → %s", codigo, nombre, ruta.relative_to(RAIZ))
    REGISTRO.info("Guardadas: %s", " ".join(guardadas) or "—")
    if fallidas:
        REGISTRO.warning("Sin plan: %s", " ".join(fallidas))
    if not args.sin_importar:
        return subprocess.call(["node", str(IMPORTADOR)], cwd=RAIZ)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--solo", nargs="*", default=None, metavar="CODIGO", help="bajar solo estas carreras")
    parser.add_argument("--ritmo", type=float, default=1.0, help="peticiones por segundo (default 1)")
    parser.add_argument("--sin-importar", action="store_true", help="no correr el importador al final")
    parser.add_argument("--verboso", action="store_true")
    return ejecutar(parser.parse_args())


if __name__ == "__main__":
    sys.exit(main())
