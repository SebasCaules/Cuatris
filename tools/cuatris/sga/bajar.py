"""`cuatris sga bajar`: barrido de los horarios de un cuatrimestre del SGA.

Corre **local, en la maquina del autor**, con la sesion del SGA: nunca en CI (ver
`docs/scraping-sga.md`). El recorrido es el de `material-raw/02-sga/HALLAZGOS.md`:

    /app2/ → login → Académica → Cursos → filtrar por nivel, periodo y ano
           → paginar de a 20 → por cada curso: lupa → pestana Comisiones

Cada curso terminado se guarda en el checkpoint apenas se parsea, asi que un corte de red o
un vencimiento de sesion no obliga a empezar de nuevo. Al final se arma el JSON del contrato
con `parsers.a_contrato`, se escribe en forma canonica (`canon.serializar`) y se corre el
validador (`cuatris.validar`): si hay errores el archivo se mueve al directorio de cache
con el sufijo `.invalido.json` y el comando sale con 1, para que un archivo que no valida no
se pueda confundir con uno publicable ni quede dentro de `data/`, donde lo levantarian
`cuatris indice actualizar` y los gates de CI.

Ningun id de componente de Wicket esta escrito en este modulo: los nombres de los campos de
filtro salen de `parsers.extraer_ids_filtro` y los valores de los desplegables, del texto
visible de cada `<option>`.
"""

from __future__ import annotations

import argparse
import dataclasses
import getpass
import logging
import os
import shutil
from collections.abc import Callable, Iterable, Iterator, Mapping
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from cuatris import canon
from cuatris import validar as validacion

from . import normalizar, parsers
from .checkpoint import CACHE, Checkpoint
from .cliente import REGISTRO, ClienteSGA, enlace_de_pestana, enlace_por_texto

__all__ = ["AYUDA", "configurar", "configurar_registro", "ejecutar"]

AYUDA = "Baja del SGA los horarios de un cuatrimestre (corrida local, con sesion del autor)."

OK = 0
HAY_ERRORES = 1

#: Texto del enlace del menu «Académica» que abre el listado de cursos.
ENLACE_CURSOS = "Cursos"
#: Pestana del detalle que publica los horarios; es la unica fuente que los trae.
PESTANA_COMISIONES = "Comisiones"
#: Nivel por defecto del filtro del listado: la carrera de grado.
NIVEL = "Grado"
#: Titulos visibles de las columnas del listado que se usan como filtro.
COLUMNA_NIVEL = "Nivel"
COLUMNA_PERIODO = "Período"
COLUMNA_ANIO = "Año"

#: Variables de entorno de las credenciales. La contrasena no se escribe en ningun archivo.
VAR_USUARIO = "SGA_USUARIO"
VAR_CLAVE = "SGA_CLAVE"

#: Tope de paginas del listado, por si el «siguiente» del SGA quedara en un ciclo.
MAXIMO_PAGINAS = 200


# --------------------------------------------------------------------------------------
# Credenciales
# --------------------------------------------------------------------------------------


def credenciales(
    entorno: Mapping[str, str] | None = None,
    *,
    preguntar_usuario: Callable[[str], str] = input,
    preguntar_clave: Callable[[str], str] = getpass.getpass,
) -> tuple[str, str]:
    """Usuario y contrasena del SGA: variables de entorno o, si faltan, prompt.

    La contrasena se pide con `getpass`, que no la muestra en la terminal, y viaja solo en
    memoria hasta el POST de login. No se guarda, no se registra en el log y no aparece en
    ningun mensaje de error.
    """
    variables = os.environ if entorno is None else entorno
    usuario = (variables.get(VAR_USUARIO) or "").strip()
    clave = variables.get(VAR_CLAVE) or ""
    if not usuario:
        usuario = preguntar_usuario(f"Usuario del SGA ({VAR_USUARIO} no esta definida): ").strip()
    if not clave:
        clave = preguntar_clave(f"Contrasena del SGA ({VAR_CLAVE} no esta definida): ")
    if not usuario or not clave:
        raise SystemExit("Se necesitan usuario y contrasena del SGA para bajar los horarios.")
    return usuario, clave


# --------------------------------------------------------------------------------------
# Navegacion del listado
# --------------------------------------------------------------------------------------


def _sopa(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def valor_de_opcion(html: str, campo: str, texto: str) -> str:
    """`value` del `<option>` de `campo` cuyo texto visible es `texto`.

    Los desplegables del SGA numeran sus opciones (`0`, `1`, `2`…) y ese numero es un indice
    interno: se busca por el texto («Grado», «Segundo Cuat.») y se usa el `value` que trae el
    HTML de esta corrida.
    """
    select = _sopa(html).find("select", attrs={"name": campo})
    if select is None:
        raise parsers.EstructuraInesperada(f"El listado no trae el desplegable «{campo}».")
    objetivo = normalizar.clave(texto)
    opciones = select.find_all("option")
    for opcion in opciones:
        if normalizar.clave(opcion.get_text(" ", strip=True)) == objetivo:
            # Sin atributo `value`, el navegador envia el texto visible: se imita eso.
            valor = opcion.get("value")
            if valor is None:
                valor = opcion.get_text(" ", strip=True)
            if not str(valor).strip():
                raise parsers.EstructuraInesperada(
                    f"La opcion «{texto}» del desplegable «{campo}» no tiene valor."
                )
            return str(valor)
    raise parsers.EstructuraInesperada(
        f"El desplegable «{campo}» no tiene la opcion «{texto}».",
        [o.get_text(" ", strip=True) for o in opciones],
    )


def _valor_actual(html: str, campo: str) -> str:
    """Valor que ya tiene un campo de filtro, para no borrarlo al enviar el formulario."""
    sopa = _sopa(html)
    nodo = sopa.find(["input", "select", "textarea"], attrs={"name": campo})
    if nodo is None:
        return ""
    if nodo.name == "select":
        for opcion in nodo.find_all("option"):
            if opcion.has_attr("selected"):
                return opcion.get("value") or ""
        return ""
    if nodo.get("type") == "checkbox":
        return "on" if nodo.has_attr("checked") else ""
    return nodo.get("value") or ""


def filtrar_listado(
    cliente: ClienteSGA, html: str, *, nivel: str, cuatrimestre_texto: str, anio: int
) -> str:
    """Envia el formulario de filtros del listado y devuelve el HTML filtrado.

    Los nombres de los campos (`results:topToolbars:toolbars:<n>:filters:<i>:filter:filter`)
    salen de `extraer_ids_filtro` en cada corrida; el `<n>` es un id de Wicket y rota entre
    despliegues.
    """
    filtros = parsers.extraer_ids_filtro(html)
    faltan = [c for c in (COLUMNA_NIVEL, COLUMNA_PERIODO, COLUMNA_ANIO) if c not in filtros.campos]
    if faltan:
        raise parsers.EstructuraInesperada(
            "El listado de cursos no expone filtros para " + ", ".join(faltan) + ".",
            sorted(filtros.campos),
        )
    if not filtros.accion:
        raise parsers.EstructuraInesperada("El formulario del listado no trae «action».")

    datos: dict[str, str] = {
        campo: _valor_actual(html, campo) for campo in filtros.por_indice.values()
    }
    datos[filtros.campos[COLUMNA_NIVEL]] = valor_de_opcion(
        html, filtros.campos[COLUMNA_NIVEL], nivel
    )
    datos[filtros.campos[COLUMNA_PERIODO]] = valor_de_opcion(
        html, filtros.campos[COLUMNA_PERIODO], cuatrimestre_texto
    )
    datos[filtros.campos[COLUMNA_ANIO]] = str(anio)
    if filtros.campo_oculto:
        datos[filtros.campo_oculto] = ""
    if filtros.campo_go:
        datos[filtros.campo_go] = ""

    REGISTRO.info("Filtrando el listado por %s / %s / %s.", nivel, cuatrimestre_texto, anio)
    return cliente.enviar(filtros.accion, datos)


def recorrer_listado(
    cliente: ClienteSGA, html: str, *, periodo: str, limite: int | None = None
) -> Iterator[parsers.FilaListado]:
    """Filas del listado filtrado, pagina por pagina, hasta el final o hasta `limite`.

    Se sigue el enlace «siguiente» del navegador del SGA (`div.navigator a.next`); cuando no
    esta, el barrido termino. Una fila cuyo periodo no coincide con el pedido significa que
    el filtro no se aplico: se corta con un error en vez de mezclar cuatrimestres.
    """
    vistas = 0
    visitadas: set[str] = set()
    for pagina in range(1, MAXIMO_PAGINAS + 1):
        listado = parsers.parsear_listado(html)
        # Los `href` del SGA son relativos a la pagina en la que aparecen. Se vuelven
        # absolutos ahora, contra la URL del listado: cuando el barrido los use, la ultima
        # pagina recibida sera el detalle de otro curso, con otra profundidad, y `../../..`
        # resolveria fuera de `/app2/` (paso en la corrida real del 2026-09-12).
        base = cliente.ultima_respuesta.url if cliente.ultima_respuesta else None
        for fila in listado.filas:
            if base and fila.enlace_detalle:
                fila = dataclasses.replace(fila, enlace_detalle=urljoin(base, fila.enlace_detalle))
            if fila.periodo != periodo:
                raise parsers.EstructuraInesperada(
                    f"El listado trae el curso {fila.codigo} del periodo «{fila.periodo}» "
                    f"cuando se pidio «{periodo}»; el filtro no se aplico.",
                    fila.nombre,
                )
            if fila.enlace_detalle is None:
                raise parsers.EstructuraInesperada(
                    f"La fila del curso {fila.codigo} no trae el enlace al detalle (la lupa).",
                    fila.nombre,
                )
            yield fila
            vistas += 1
            if limite is not None and vistas >= limite:
                return
        siguiente = listado.paginacion.enlace_siguiente
        if siguiente and base:
            siguiente = urljoin(base, siguiente)
        if not listado.paginacion.hay_siguiente or not siguiente:
            return
        if siguiente in visitadas:
            raise parsers.EstructuraInesperada(
                "El navegador del listado repite el enlace «siguiente»; se corta el barrido "
                "para no quedar en un ciclo.",
                siguiente,
            )
        visitadas.add(siguiente)
        REGISTRO.info("Listado: pagina %d de %s.", pagina + 1, listado.paginacion.total_paginas)
        html = cliente.obtener(siguiente)
    raise parsers.EstructuraInesperada(
        f"El listado supero las {MAXIMO_PAGINAS} paginas; algo anda mal con la paginacion."
    )


def _pestana_activa(html: str) -> str | None:
    activa = _sopa(html).select_one("div.tabpanel4 li.active")
    return activa.get_text(" ", strip=True) if activa else None


def bajar_curso(cliente: ClienteSGA, fila: parsers.FilaListado) -> parsers.Curso:
    """Detalle + pestana Comisiones de un curso, con las fechas de dictado del listado.

    Las fechas (`desde`, `hasta`) **no estan en el detalle**: el SGA solo las publica en las
    columnas «Comienzo» y «Fin» del listado, asi que se copian de la fila.
    """
    html = cliente.obtener(fila.enlace_detalle or "")
    if normalizar.clave(_pestana_activa(html) or "") != normalizar.clave(PESTANA_COMISIONES):
        html = cliente.obtener(enlace_de_pestana(html, PESTANA_COMISIONES))
    curso = parsers.parsear_curso(html)
    if curso.codigo != fila.codigo:
        raise parsers.EstructuraInesperada(
            f"Se pidio el detalle de {fila.codigo} y el SGA devolvio {curso.codigo}.",
            fila.nombre,
        )
    return dataclasses.replace(curso, desde=fila.desde, hasta=fila.hasta)


# --------------------------------------------------------------------------------------
# Armado del archivo
# --------------------------------------------------------------------------------------


def hoy() -> str:
    """Fecha de la corrida, que es la que se usa como `fuente.capturado`."""
    return date.today().isoformat()


def periodo_de_filas(
    filas: Iterable[parsers.FilaListado], *, anio: int, cuatrimestre: str
) -> parsers.Periodo:
    """Cabecera `periodo` a partir de las fechas del listado.

    El SGA no publica en ningun lado las fechas del cuatrimestre: lo unico que hay son las
    columnas «Comienzo» y «Fin» de cada curso. El periodo se toma entonces como el intervalo
    que cubre a todos los cursos del listado, que es lo que hace que los periodos cortos
    (15.09, del 18/09 al 16/10) caigan dentro. Con `--limite` el intervalo sale de los pocos
    cursos mirados y por eso esa corrida es una prueba, no un archivo publicable.
    """
    desde = [f.desde for f in filas if f.desde]
    hasta = [f.hasta for f in filas if f.hasta]
    if not desde or not hasta:
        raise parsers.EstructuraInesperada(
            "Ningun curso del listado trae fechas de «Comienzo» y «Fin»; sin ellas no se "
            "puede fechar el periodo."
        )
    return parsers.Periodo(
        id=f"{anio}-{cuatrimestre}",
        anio=anio,
        cuatrimestre=cuatrimestre,
        desde=min(desde),
        hasta=max(hasta),
    )


def curso_a_contrato(
    curso: parsers.Curso, periodo: parsers.Periodo, capturado: str
) -> dict[str, Any]:
    """Un curso en la forma del contrato, reusando `parsers.a_contrato`."""
    return parsers.a_contrato([curso], periodo, capturado)["cursos"][0]


def armar_documento(
    cursos: Iterable[dict[str, Any]], periodo: parsers.Periodo, capturado: str
) -> dict[str, Any]:
    """Envoltorio del archivo de horarios con los cursos ya convertidos.

    El envoltorio (`contrato`, `periodo`, `fuente`) lo arma `parsers.a_contrato` con la lista
    vacia, para que exista una sola definicion de esa forma.
    """
    documento = parsers.a_contrato((), periodo, capturado)
    ordenados = sorted(cursos, key=lambda curso: curso["codigo"])
    codigos = [curso["codigo"] for curso in ordenados]
    repetidos = sorted({c for c in codigos if codigos.count(c) > 1})
    if repetidos:
        raise parsers.EstructuraInesperada(
            "El listado trae mas de un curso con el mismo codigo; el contrato los quiere "
            "unicos por archivo.",
            repetidos,
        )
    documento["cursos"] = ordenados
    return documento


def ruta_invalida(salida: Path, cache: Path | None = None) -> Path:
    """`2026-2C.json` → `<cache>/2026-2C.invalido.json`, **fuera del arbol de datos**.

    El archivo rechazado no puede quedar al lado de la salida: el `--salida` normal apunta a
    `data/v1/horarios/`, y ahi un `.invalido.json` olvidado rompe `cuatris indice actualizar`
    (dos archivos para el mismo periodo) y tumba los gates de CI, que validan todos los JSON
    de `data/`. Por eso va al directorio de cache, que esta en `.gitignore`.
    """
    carpeta = Path(cache) if cache else Path(CACHE)
    return carpeta / f"{salida.stem}.invalido{salida.suffix}"


def escribir(documento: dict[str, Any], salida: Path) -> None:
    """Escribe el JSON en forma canonica (UTF-8 sin BOM, LF, claves ordenadas)."""
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(canon.serializar(documento), encoding="utf-8", newline="\n")


def validar(salida: Path, datos: Path | None = None) -> tuple[list[Any], bool]:
    """Corre C1, C2 y C3 sobre el archivo escrito; devuelve los hallazgos y si hay errores.

    C3 necesita el plan y el vocabulario de sedes: se toman de `datos` (por defecto `data/`,
    si ese directorio existe), igual que hace `cuatris validar`. Sin ese contexto C3 corre
    igual, pero se saltea los chequeos que dependen de el.
    """
    directorio = Path(datos) if datos is not None else Path("data")
    contexto = validacion.contexto_de_datos(directorio) if directorio.is_dir() else None
    hallazgos = validacion.validar_archivo(salida, "horarios", contexto)
    return hallazgos, validacion.hay_errores(hallazgos)


# --------------------------------------------------------------------------------------
# Subcomando
# --------------------------------------------------------------------------------------


def configurar(parser: argparse.ArgumentParser) -> None:
    """Argumentos de `cuatris sga bajar`."""
    parser.add_argument(
        "--anio", type=int, required=True, help="Anio del cuatrimestre a bajar (por ejemplo 2026)."
    )
    parser.add_argument(
        "--cuatrimestre",
        required=True,
        choices=sorted(set(normalizar.CUATRIMESTRES.values())),
        help="Cuatrimestre a bajar.",
    )
    parser.add_argument(
        "--salida",
        type=Path,
        required=True,
        help="Archivo JSON de horarios a escribir (por ejemplo data/v1/horarios/2026-2C.json).",
    )
    parser.add_argument(
        "--limite",
        type=int,
        default=None,
        metavar="N",
        help="Baja solo los primeros N cursos; sirve para la primera prueba en vivo.",
    )
    parser.add_argument(
        "--desde-cero",
        action="store_true",
        help="Borra el checkpoint del periodo y vuelve a bajar todos los cursos.",
    )
    parser.add_argument(
        "--ritmo",
        type=float,
        default=1.0,
        metavar="PETICIONES_POR_SEGUNDO",
        help="Peticiones por segundo contra el SGA (por defecto 1.0).",
    )
    parser.add_argument(
        "--nivel",
        default=NIVEL,
        help=f"Nivel del filtro del listado (por defecto «{NIVEL}»).",
    )
    parser.add_argument(
        "--guardar-html",
        action="store_true",
        help=f"Ante un error, vuelca la respuesta problematica en {CACHE}/ para compararla "
        "con tests/corpus/sga/.",
    )
    parser.add_argument(
        "--data",
        type=Path,
        default=None,
        metavar="DIRECTORIO",
        help="Directorio de datos del que C3 toma el plan y el vocabulario (por defecto «data»).",
    )
    parser.add_argument(
        "--verboso",
        action="store_true",
        help="Muestra cada peticion y cada redireccion (con el identificador de sesion tapado).",
    )
    parser.add_argument(
        "--cache",
        type=Path,
        default=None,
        metavar="DIRECTORIO",
        help=f"Directorio del checkpoint y de los volcados (por defecto ./{CACHE}).",
    )
    parser.set_defaults(funcion_sga=ejecutar)


def _cuatrimestre_texto(cuatrimestre: str) -> str:
    """`2C` → `Segundo Cuat.`, el texto con el que el SGA rotula la opcion del filtro."""
    for texto, identificador in normalizar.CUATRIMESTRES.items():
        if identificador == cuatrimestre:
            return texto
    raise normalizar.ValorDesconocido("cuatrimestre", cuatrimestre)


def configurar_registro(verboso: bool = False) -> None:
    """Deja el log del scraper en INFO (o DEBUG con `--verboso`) y calla al de `httpx`.

    El logger de `httpx` emite en INFO una linea «HTTP Request: …» con la URL entera, y las
    URL del SGA llevan el identificador de sesion (`;jsessionid=<token>`): con el root logger
    en INFO, un barrido escribiria ~500 veces el token vivo en la terminal. Todo lo que el
    scraper muestra por su cuenta pasa antes por `cliente._sin_sesion()`.
    """
    logging.basicConfig(level=logging.DEBUG if verboso else logging.INFO, format="%(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def ejecutar(args: argparse.Namespace) -> int:
    """Corre el barrido completo. Devuelve el codigo de salida del proceso."""
    configurar_registro(bool(getattr(args, "verboso", False)))
    periodo_id = f"{args.anio}-{args.cuatrimestre}"
    cache = Path(args.cache) if args.cache else Path(CACHE)
    punto = Checkpoint(cache / f"{periodo_id}.jsonl", periodo_id)
    if args.desde_cero and punto.borrar():
        print(f"Checkpoint borrado; se vuelve a bajar {periodo_id} completo.")

    usuario, clave = credenciales()
    capturado = hoy()
    hechos = punto.cargar()
    if hechos:
        print(f"El checkpoint ya tiene {len(hechos)} cursos de {periodo_id}; se saltean.")

    with ClienteSGA(ritmo=args.ritmo) as cliente:
        try:
            inicio = cliente.iniciar_sesion(usuario, clave)
            del clave
            listado = cliente.obtener(enlace_por_texto(inicio, ENLACE_CURSOS))
            listado = filtrar_listado(
                cliente,
                listado,
                nivel=args.nivel,
                cuatrimestre_texto=_cuatrimestre_texto(args.cuatrimestre),
                anio=args.anio,
            )
            filas = list(recorrer_listado(cliente, listado, periodo=periodo_id, limite=args.limite))
            periodo = periodo_de_filas(filas, anio=args.anio, cuatrimestre=args.cuatrimestre)
            print(f"{len(filas)} cursos en el listado de {periodo_id}.")

            for numero, fila in enumerate(filas, start=1):
                if fila.codigo in hechos:
                    continue
                curso = bajar_curso(cliente, fila)
                datos = curso_a_contrato(curso, periodo, capturado)
                punto.agregar(fila.codigo, datos)
                hechos[fila.codigo] = datos
                print(f"[{numero}/{len(filas)}] {fila.codigo} {fila.nombre}")
        except Exception:
            if args.guardar_html:
                cliente.volcar_html(cache, f"{periodo_id}-error")
            raise

    documento = armar_documento((hechos[fila.codigo] for fila in filas), periodo, capturado)
    escribir(documento, args.salida)
    hallazgos, con_errores = validar(args.salida, args.data)
    for hallazgo in hallazgos:
        print(hallazgo.linea())
    if con_errores:
        invalido = ruta_invalida(args.salida, cache)
        invalido.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(args.salida), str(invalido))
        print(
            f"El archivo no valida; quedo en {invalido}, fuera de data/, para que lo revise. "
            "Es un descarte: borrelo cuando termine de mirarlo."
        )
        return HAY_ERRORES

    print(f"{len(documento['cursos'])} cursos escritos en {args.salida}.")
    if args.limite is not None:
        print(
            "Corrida con --limite: las fechas del periodo salen solo de esos cursos, asi que "
            "el archivo sirve para probar, no para publicar."
        )
    return OK
