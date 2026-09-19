"""`cuatris sga bajar`: barrido de los horarios de un cuatrimestre del SGA.

Corre **local, en la maquina de quien tenga cuenta del SGA**: nunca en CI (ver
`tools/README.md`). El recorrido es el de `material-raw/02-sga/HALLAZGOS.md`:

    /app2/ → login → Académica → Cursos → filtrar por nivel, periodo y ano
           → pagina 1 → sus 20 cursos (lupa → pestana Comisiones) → pagina 2 → …

El orden importa: los detalles de una pagina se visitan **antes** de pedir la siguiente.
Wicket guarda las paginas con estado en un almacen por sesion de tamano acotado, y leer las
24 paginas del listado de un tiron —lo que hacia este modulo hasta el 2026-09-12— hace que
las paginas de detalle que se abren despues desalojen a las del listado: desde la fila 41 en
adelante, cada enlace daba la pantalla de error del SGA. Navegar como una persona (una
pagina, sus veinte cursos, la siguiente) mantiene los enlaces frescos.

Cada curso terminado se guarda en el checkpoint apenas se parsea, asi que un corte de red o
un vencimiento de sesion no obliga a empezar de nuevo. Al final se arma el JSON del contrato
con `parsers.a_contrato`, se escribe en forma canonica (`canon.serializar`) y se corre el
validador del repositorio (`node scripts/datos/validar.mjs`, el mismo que usa el gate de
los PR): si hay errores el archivo se mueve al directorio de cache con el sufijo
`.invalido.json` y el comando sale con 1, para que un archivo que no valida no se pueda
confundir con uno publicable ni quede dentro de `data/plan/`.

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
import subprocess
import sys
from collections.abc import Callable, Iterable, Mapping, Sequence
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from cuatris import canon

from . import normalizar, parsers
from .checkpoint import CACHE, Checkpoint, Registro, clave_de_curso
from .cliente import (
    ENTRADA,
    REGISTRO,
    ClienteSGA,
    ErrorSGA,
    PaginaVencida,
    enlace_de_pestana,
    enlace_por_texto,
)

__all__ = ["AYUDA", "Barrido", "configurar", "configurar_registro", "ejecutar"]

AYUDA = "Baja del SGA los horarios de un cuatrimestre (corrida local, con sesion del autor)."

OK = 0
HAY_ERRORES = 1

#: Texto del enlace del menu «Académica» que abre el listado de cursos.
ENLACE_CURSOS = "Cursos"
#: Pestana del detalle que publica los horarios; es la unica fuente que los trae.
PESTANA_COMISIONES = "Comisiones"
#: Nivel por defecto del filtro del listado: la carrera de grado.
#: Raiz del repositorio: tools/cuatris/sga/bajar.py -> tres niveles arriba de tools/.
RAIZ_DEL_REPOSITORIO = Path(__file__).resolve().parents[3]

SALIDA_POR_DEFECTO = RAIZ_DEL_REPOSITORIO / "data" / "plan" / "horarios"
"""Donde va el archivo si no se pasa --salida: el lugar que el gate de los PR reconoce."""

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

#: Cursos irrecuperables **seguidos** que se toleran antes de abortar la corrida. Cinco
#: alcanzan para distinguir un curso que falla de un SGA que responde su pantalla de error a
#: todo; seguir seria gastar 470 peticiones para juntar 470 fallas iguales.
MAXIMO_IRRECUPERABLES = 5


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


class Barrido:
    """Recorre el listado filtrado, pagina por pagina, con enlaces siempre frescos.

    El objeto guarda **una** pagina: la actual. Los detalles de sus filas se visitan antes de
    pedir la siguiente, que es lo que mantiene viva la pagina del listado en el almacen de
    Wicket (ver el encabezado del modulo). Cuando el SGA da por vencida una pagina,
    `reabrir()` vuelve a navegar desde `/app2/` hasta la misma pagina y `fila()` devuelve la
    fila con el enlace nuevo.
    """

    def __init__(
        self, cliente: ClienteSGA, *, nivel: str, cuatrimestre_texto: str, anio: int
    ) -> None:
        self.cliente = cliente
        self.nivel = nivel
        self.cuatrimestre_texto = cuatrimestre_texto
        self.anio = anio
        #: Numero de la pagina actual, desde 1; 0 mientras el listado no se abrio.
        self.pagina = 0
        self._listado: parsers.Listado | None = None
        self._siguientes: set[str] = set()

    @property
    def listado(self) -> parsers.Listado:
        """La pagina actual, con los enlaces ya absolutos."""
        if self._listado is None:
            raise parsers.EstructuraInesperada("El barrido todavia no abrio el listado.")
        return self._listado

    def abrir(self) -> None:
        """`/app2/` → «Cursos» → filtros → pagina 1, todo con la sesion ya iniciada."""
        inicio = self.cliente.obtener(ENTRADA)
        listado = self.cliente.obtener(enlace_por_texto(inicio, ENLACE_CURSOS))
        html = filtrar_listado(
            self.cliente,
            listado,
            nivel=self.nivel,
            cuatrimestre_texto=self.cuatrimestre_texto,
            anio=self.anio,
        )
        self._siguientes = set()
        self.pagina = 1
        self._listado = self._absolutizar(parsers.parsear_listado(html))

    def siguiente(self) -> bool:
        """Clic en el «siguiente» de la pagina actual. `False` si no hay siguiente."""
        paginacion = self.listado.paginacion
        enlace = paginacion.enlace_siguiente
        if not paginacion.hay_siguiente or not enlace:
            return False
        if enlace in self._siguientes:
            raise parsers.EstructuraInesperada(
                "El navegador del listado repite el enlace «siguiente»; se corta el barrido "
                "para no quedar en un ciclo.",
                enlace,
            )
        if self.pagina >= MAXIMO_PAGINAS:
            raise parsers.EstructuraInesperada(
                f"El listado supero las {MAXIMO_PAGINAS} paginas; algo anda mal con la "
                "paginacion."
            )
        self._siguientes.add(enlace)
        html = self.cliente.obtener(enlace)
        self.pagina += 1
        self._listado = self._absolutizar(parsers.parsear_listado(html))
        REGISTRO.info("Listado: pagina %d de %s.", self.pagina, paginacion.total_paginas)
        return True

    def reabrir(self) -> None:
        """Vuelve a abrir el listado desde `/app2/` y pagina hasta la pagina actual."""
        objetivo = max(self.pagina, 1)
        self.abrir()
        while self.pagina < objetivo:
            if not self.siguiente():
                raise parsers.EstructuraInesperada(
                    f"Al reabrir el listado se llego hasta la pagina {self.pagina} y se "
                    f"esperaba la {objetivo}; el listado cambio debajo del barrido."
                )

    def fila(self, codigo: str, aparicion: int = 1) -> parsers.FilaListado:
        """La fila fresca de `codigo` en la **pagina actual**.

        `aparicion` cuenta dentro de esta pagina, no en todo el listado: es lo unico que se
        puede resolver mirando una sola pagina, y el barrido solo reabre para volver a la
        pagina donde estaba la fila que fallo.
        """
        vistas = 0
        for fila in self.listado.filas:
            if fila.codigo != codigo:
                continue
            vistas += 1
            if vistas == aparicion:
                return fila
        raise parsers.EstructuraInesperada(
            f"La pagina {self.pagina} del listado ya no trae la aparicion {aparicion} de "
            f"{codigo}; el listado cambio debajo del barrido.",
            [f.codigo for f in self.listado.filas],
        )

    def _absolutizar(self, listado: parsers.Listado) -> parsers.Listado:
        """Vuelve absolutos los `href` de la pagina, contra la URL de la pagina misma.

        Los `href` del SGA son relativos a la pagina en la que aparecen. Se resuelven ahora y
        no al usarlos: cuando el barrido los use, la ultima respuesta recibida sera el detalle
        de otro curso, con otra profundidad, y `../../..` saldria de `/app2/` (paso en la
        corrida real del 2026-09-12).
        """
        base = self.cliente.ultima_respuesta.url if self.cliente.ultima_respuesta else None
        filas: list[parsers.FilaListado] = []
        for fila in listado.filas:
            if fila.enlace_detalle is None:
                raise parsers.EstructuraInesperada(
                    f"La fila del curso {fila.codigo} no trae el enlace al detalle (la lupa).",
                    fila.nombre,
                )
            if base:
                fila = dataclasses.replace(fila, enlace_detalle=urljoin(base, fila.enlace_detalle))
            filas.append(fila)
        paginacion = listado.paginacion
        if base and paginacion.enlace_siguiente:
            paginacion = dataclasses.replace(
                paginacion, enlace_siguiente=urljoin(base, paginacion.enlace_siguiente)
            )
        return dataclasses.replace(listado, filas=tuple(filas), paginacion=paginacion)


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


#: Un curso que no se pudo publicar: codigo (con `#2` si es una fila repetida), nombre y
#: motivo. Es lo que el resumen final imprime y lo que hace salir con `HAY_ERRORES`.
Fallido = tuple[str, str, str]


#: Dias de dictado a partir de los cuales un curso es anual, sea cual sea el periodo con
#: que lo rotule el listado. Un cuatrimestre dura unos 160 dias (26/07–31/12: 158); las
#: cohortes anuales vistas el 2026-09-13 duran 305, 336 y 363. El umbral queda a mitad de
#: camino para que ni un cuatrimestre largo ni una cohorte corta lo crucen.
ANUAL_DESDE_DIAS = 240


def es_anual(desde: str, hasta: str) -> bool:
    """¿Un dictado de `desde` a `hasta` dura mas que un cuatrimestre?"""
    return (date.fromisoformat(hasta) - date.fromisoformat(desde)).days >= ANUAL_DESDE_DIAS


def separar_anuales(
    registros: Iterable[Registro], *, periodo: str
) -> tuple[list[Registro], list[Registro], list[Fallido]]:
    """Divide los registros del checkpoint en propios del cuatrimestre y anuales.

    El listado filtrado por «Segundo Cuat.» trae tambien los cursos **anuales**: los que el
    SGA rotula con el periodo en que empiezan («Primer Cuat.», caso real del 2026-09-12: 41.34
    Desarrollo de Yacimientos) y tambien las cohortes que empiezan en este cuatrimestre y
    terminan el ano que viene (10.01 y 72.45 el 2026-09-13, rotuladas «2026-2C» con dictado
    hasta julio de 2027). Son legitimos: se dictan durante el cuatrimestre pedido. La regla
    no mira el nombre sino las fechas: es anual todo curso cuyo dictado dura mas que un
    cuatrimestre (`es_anual`), venga con el periodo que venga. El intervalo del cuatrimestre
    sale **solo de los propios no anuales**, para que una cohorte anual no lo estire hasta el
    ano siguiente; los anuales entran con las fechas recortadas a ese intervalo, porque este
    archivo describe el cuatrimestre y no el ano.

    Un curso de otro periodo que no se solapa con el cuatrimestre **no** corta la corrida: se
    anota como fallido y el resto se escribe igual, que es lo mismo que se hace con un curso
    que no parsea. Si no hay ningun propio, el filtro no se aplico y se corta.

    Un registro sin `listado` (los que escribieron versiones anteriores) se trata como propio
    del periodo: es lo unico que se puede afirmar de el.
    """
    propios: list[Registro] = []
    largos: list[Registro] = []
    ajenos: list[Registro] = []
    for registro in registros:
        curso = registro.curso
        if registro.periodo_del_listado not in (None, periodo):
            ajenos.append(registro)
        elif es_anual(curso["desde"], curso["hasta"]):
            largos.append(registro)
        else:
            propios.append(registro)
    if not propios:
        ejemplo = (ajenos or largos or [None])[0]
        raise parsers.EstructuraInesperada(
            f"Ningun curso del listado es un curso cuatrimestral del periodo «{periodo}»; "
            "el filtro no se aplico.",
            f"{ejemplo.codigo} ({ejemplo.periodo_del_listado})" if ejemplo else None,
        )
    desde = min(r.curso["desde"] for r in propios)
    hasta = max(r.curso["hasta"] for r in propios)
    anuales: list[Registro] = []
    fallidos: list[Fallido] = []
    for registro in largos + ajenos:
        curso = registro.curso
        if curso["hasta"] < desde or curso["desde"] > hasta:
            fallidos.append(
                (
                    registro.clave,
                    curso.get("nombre", ""),
                    f"el listado lo trae en el periodo «{registro.periodo_del_listado}» "
                    f"cuando se pidio «{periodo}», y su dictado ({curso['desde']}–"
                    f"{curso['hasta']}) no se solapa con el cuatrimestre ({desde}–{hasta}); "
                    "el filtro no se aplico a esa fila",
                )
            )
            continue
        recortado = dataclasses.replace(
            registro,
            curso={
                **curso,
                "desde": max(curso["desde"], desde),
                "hasta": min(curso["hasta"], hasta),
            },
        )
        REGISTRO.warning(
            "%s %s se dicta del %s al %s (%s): se incluye como anual, con las fechas "
            "recortadas al cuatrimestre (%s–%s).",
            registro.codigo,
            curso.get("nombre", ""),
            curso["desde"],
            curso["hasta"],
            registro.periodo_del_listado or periodo,
            recortado.curso["desde"],
            recortado.curso["hasta"],
        )
        anuales.append(recortado)
    return propios, anuales, fallidos


def periodo_de_registros(
    registros: Iterable[Registro], *, anio: int, cuatrimestre: str
) -> parsers.Periodo:
    """Cabecera `periodo` a partir de las fechas de los cursos propios del cuatrimestre.

    El SGA no publica en ningun lado las fechas del cuatrimestre: lo unico que hay son las
    columnas «Comienzo» y «Fin» de cada curso. El periodo se toma entonces como el intervalo
    que cubre a todos los cursos propios, que es lo que hace que los periodos cortos (15.09,
    del 18/09 al 16/10) caigan dentro. Con `--limite` el intervalo sale de los pocos cursos
    mirados y por eso esa corrida es una prueba, no un archivo publicable.
    """
    desde = [r.curso["desde"] for r in registros if r.curso.get("desde")]
    hasta = [r.curso["hasta"] for r in registros if r.curso.get("hasta")]
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


def _lo_estable(comision: Mapping[str, Any]) -> dict[str, Any]:
    """La comision sin lo volatil ni el plantel: lo que define si es «la misma clase».

    `cupo` y `ocupacion` cambian entre filas por definicion. Los `docentes` tambien: las dos
    cohortes de 10.01 traen 23 y 13 nombres, y las de 72.45 los mismos siete en otro orden;
    es la misma clase, con el plantel que cada cohorte declara.
    """
    return {k: v for k, v in comision.items() if k not in ("cupo", "ocupacion", "docentes")}


def _unir_docentes(primeros: Sequence[str], otros: Sequence[str]) -> list[str]:
    """Union en orden: los de la comision que queda y despues los que solo trae la otra."""
    vistos = {normalizar.clave(d) for d in primeros}
    unidos = list(primeros)
    for docente in otros:
        if normalizar.clave(docente) not in vistos:
            vistos.add(normalizar.clave(docente))
            unidos.append(docente)
    return unidos


def _fechas_de(comision: Mapping[str, Any], curso: Mapping[str, Any]) -> tuple[str, str]:
    return (comision.get("desde") or curso["desde"], comision.get("hasta") or curso["hasta"])


def _id_libre(base: str, usados: set[str]) -> str:
    """`A` → `A.2`, `A.3`… hasta encontrar un id que no este en uso."""
    numero = 2
    while f"{base}.{numero}" in usados:
        numero += 1
    return f"{base}.{numero}"


def _fusionar_apariciones(
    cursos: Sequence[dict[str, Any]], *, periodo: str
) -> tuple[dict[str, Any] | None, str]:
    """Une las apariciones de un mismo codigo. Devuelve `(curso, motivo del descarte)`.

    El listado trae codigos repetidos (472 filas, 461 codigos distintos el 2026-09-12) y el
    contrato los quiere unicos por archivo. Las apariciones se recorren en orden de `desde` y
    sus comisiones se van sumando; cuando un id ya esta tomado:

    - **Misma comision, mismas fechas** (bloques iguales; `cupo`, `ocupacion` y `docentes`
      pueden diferir): es la misma clase vista desde dos filas. Caso real: las dos cohortes
      de un curso anual (10.01, 72.45: la que empezo en marzo y la que empieza ahora), que
      recortadas al cuatrimestre coinciden en horario y aula. Queda la de la fila rotulada
      con el periodo de la corrida —la que se puede cursar ahora—, o la primera si ninguna lo
      esta, con la union de los docentes de las dos.
    - **Fechas distintas**: son dos ediciones del curso dentro del cuatrimestre (81.73
      Introduccion a la IOT, 03/08–11/09 y 14/09–23/10, las dos «A» en el SGA). Se conservan
      las dos, cada una con sus `desde`/`hasta` propios (contrato 1.1.0) y la segunda con el
      id `A.2` (`.3`…), que es la unica invencion: el SGA distingue las ediciones por las
      fechas que agrega al nombre, no por el id.
    - **Mismas fechas, contenido distinto**: no hay forma de elegir; el codigo se descarta
      con el motivo y el resto del archivo se escribe igual.

    El curso fusionado va del `desde` minimo al `hasta` maximo de sus apariciones; el nombre y
    el departamento son los de la primera.
    """
    limpios = [{k: v for k, v in curso.items() if not k.startswith("_")} for curso in cursos]
    if all(curso == limpios[0] for curso in limpios[1:]):
        return limpios[0], ""
    ordenados = sorted(
        enumerate(cursos), key=lambda par: (par[1]["desde"], par[1]["hasta"], par[0])
    )
    primero = ordenados[0][1]
    desde = min(curso["desde"] for curso in cursos)
    hasta = max(curso["hasta"] for curso in cursos)
    comisiones: dict[str, dict[str, Any]] = {}
    origen: dict[str, str | None] = {}
    renombradas: list[str] = []
    for _indice, curso in ordenados:
        rotulo = curso.get("_periodo_del_listado")
        for comision in curso.get("comisiones", []):
            identificador = comision["id"]
            nueva = dict(comision)
            fechas = _fechas_de(comision, curso)
            if fechas != (desde, hasta):
                nueva["desde"], nueva["hasta"] = fechas
            else:
                nueva.pop("desde", None)
                nueva.pop("hasta", None)
            previa = comisiones.get(identificador)
            if previa is None:
                comisiones[identificador] = nueva
                origen[identificador] = rotulo
                continue
            if _fechas_de(previa, {"desde": desde, "hasta": hasta}) != fechas:
                libre = _id_libre(identificador, set(comisiones))
                nueva["id"] = libre
                comisiones[libre] = nueva
                origen[libre] = rotulo
                renombradas.append(f"{identificador}→{libre} ({fechas[0]}–{fechas[1]})")
                continue
            if _lo_estable(previa) != _lo_estable(nueva):
                return None, (
                    f"aparece {len(cursos)} veces en el listado y la comision "
                    f"«{identificador}» viene con horarios distintos en las mismas fechas "
                    f"({len(previa.get('bloques', []))} bloques contra "
                    f"{len(nueva.get('bloques', []))}); no hay forma de elegir una"
                )
            if origen.get(identificador) != periodo and rotulo == periodo:
                nueva["docentes"] = _unir_docentes(
                    nueva.get("docentes", []), previa.get("docentes", [])
                )
                comisiones[identificador] = nueva
                origen[identificador] = rotulo
            else:
                previa["docentes"] = _unir_docentes(
                    previa.get("docentes", []), nueva.get("docentes", [])
                )

    fusionado = {k: v for k, v in primero.items() if not k.startswith("_")}
    fusionado["comisiones"] = [comisiones[i] for i in sorted(comisiones)]
    fusionado["desde"] = desde
    fusionado["hasta"] = hasta
    juntas = " | ".join(
        ", ".join(c["id"] for c in curso.get("comisiones", [])) for _i, curso in ordenados
    )
    REGISTRO.warning(
        "%s aparece %d veces en el listado: se unen sus comisiones (%s)%s.",
        primero["codigo"],
        len(cursos),
        juntas,
        "; ediciones con fechas propias: " + ", ".join(renombradas) if renombradas else "",
    )
    return fusionado, ""


def armar_documento(
    cursos: Iterable[dict[str, Any]], periodo: parsers.Periodo, capturado: str
) -> tuple[dict[str, Any], list[Fallido]]:
    """Envoltorio del archivo de horarios con los cursos ya convertidos.

    Devuelve tambien los codigos que hubo que descartar al fusionar las filas repetidas, para
    que el que llama los sume a su lista de fallidos y el resto del archivo se escriba igual.

    El envoltorio (`contrato`, `periodo`, `fuente`) lo arma `parsers.a_contrato` con la lista
    vacia, para que exista una sola definicion de esa forma.
    """
    documento = parsers.a_contrato((), periodo, capturado)
    por_codigo: dict[str, list[dict[str, Any]]] = {}
    for curso in cursos:
        # Los checkpoints escritos antes del 2026-09-13 traen el nombre con la anotacion
        # de fechas del detalle; limpiarla aqui es idempotente y evita rebajar 443 cursos.
        curso = {**curso, "nombre": parsers.nombre_sin_fechas(curso["nombre"])}
        por_codigo.setdefault(curso["codigo"], []).append(curso)

    unicos: list[dict[str, Any]] = []
    fallidos: list[Fallido] = []
    for codigo in sorted(por_codigo):
        apariciones = por_codigo[codigo]
        fusionado, motivo = _fusionar_apariciones(apariciones, periodo=periodo.id)
        if fusionado is None:
            fallidos.append((codigo, apariciones[0].get("nombre", ""), motivo))
            continue
        unicos.append(fusionado)

    vincular_dictado_conjunto(unicos)
    documento["cursos"] = unicos
    return documento, fallidos


def _huella_de_bloque(bloque: Mapping[str, Any]) -> tuple[Any, ...]:
    return (
        bloque.get("dia"),
        bloque.get("desde"),
        bloque.get("hasta"),
        bloque.get("sede"),
        tuple(bloque.get("aulas") or ()),
    )


def vincular_dictado_conjunto(cursos: list[dict[str, Any]]) -> None:
    """Marca como `dictado_conjunto` a los cursos homonimos que comparten aula y horario.

    El SGA publica una misma materia bajo dos codigos (uno por carrera): mismo nombre, misma
    comision, misma aula a la misma hora (caso real de la corrida del 2026-09-12: 23.05 y
    25.66 «Acustica para Ingenieros», comision K, jueves 16-19 en 604F). Sin la marca, C3 lo
    lee como una colision de aula y rechaza el archivo. La regla es estricta a proposito:
    mismo nombre normalizado **y** al menos un bloque identico (misma aula, sede, dia y
    hora), sin mirar el id de comision, que puede diferir entre los dos codigos.
    Dos cursos con nombres distintos en la misma aula siguen siendo una colision que revisa
    una persona… salvo que compartan ademas un docente en esa misma comision: entonces es la
    misma clase con dos nombres (materias equivalentes entre carreras) y tambien se vincula.
    """
    huellas: dict[str, set[tuple[Any, ...]]] = {}
    docentes: dict[str, set[str]] = {}
    for curso in cursos:
        conjunto: set[tuple[Any, ...]] = set()
        plantel: set[str] = set()
        for comision in curso.get("comisiones", []):
            plantel.update(normalizar.clave(d) for d in comision.get("docentes", []))
            for bloque in comision.get("bloques", []):
                # Sin el id de comision: la misma clase se publica bajo dos codigos con ids
                # distintos (12.84 com. Q y 17.15 com. A, martes 13-16 en 604F; 30.19 com. M
                # y 30.38 com. A, corrida del 2026-09-13). Lo que la identifica es el aula, el
                # dia y la hora, mas el nombre o el docente en comun.
                conjunto.add(_huella_de_bloque(bloque))
        huellas[curso["codigo"]] = conjunto
        docentes[curso["codigo"]] = plantel
    for indice, uno in enumerate(cursos):
        for otro in cursos[indice + 1 :]:
            if not huellas[uno["codigo"]] & huellas[otro["codigo"]]:
                continue
            mismo_nombre = normalizar.clave(uno["nombre"]) == normalizar.clave(otro["nombre"])
            mismo_docente = bool(docentes[uno["codigo"]] & docentes[otro["codigo"]])
            if not (mismo_nombre or mismo_docente):
                continue
            for curso, par in ((uno, otro), (otro, uno)):
                vinculados = set(curso.get("dictado_conjunto", []))
                vinculados.add(par["codigo"])
                curso["dictado_conjunto"] = sorted(vinculados)
            REGISTRO.info(
                "%s y %s se dictan juntos (mismo nombre, misma aula y horario): dictado_conjunto.",
                uno["codigo"],
                otro["codigo"],
            )


def ruta_invalida(salida: Path, cache: Path | None = None) -> Path:
    """`2026-2C.json` → `<cache>/2026-2C.invalido.json`, **fuera del arbol de datos**.

    El archivo rechazado no puede quedar al lado de la salida: la salida normal apunta a
    `data/plan/horarios/`, y un `.invalido.json` olvidado ahi entraria a un PR. Por eso va al
    directorio de cache, que esta en `.gitignore`.
    """
    carpeta = Path(cache) if cache else Path(CACHE)
    return carpeta / f"{salida.stem}.invalido{salida.suffix}"


def escribir(documento: dict[str, Any], salida: Path) -> None:
    """Escribe el JSON en forma canonica (UTF-8 sin BOM, LF, claves ordenadas)."""
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(canon.serializar(documento), encoding="utf-8", newline="\n")


def validar(salida: Path) -> tuple[list[str], bool]:
    """Corre el validador del repositorio (Node) sobre el archivo escrito.

    Devuelve las lineas que imprimio y si hubo errores. Si la salida esta en
    `<dir>/horarios/<periodo>.json`, se valida con `--dir <dir>`, que es lo que hace el gate
    (y lo que da el contexto de los planes de estudio para los avisos cruzados); si esta en
    otro lado, se copia a un directorio temporal con esa forma. Sin `node` instalado no se
    puede validar: se avisa y se deja el archivo, porque el gate del PR lo va a validar igual.
    """
    salida = Path(salida).resolve()
    if salida.parent.name == "horarios":
        directorio = salida.parent.parent
        archivo = salida
        temporal = None
    else:
        import tempfile

        temporal = Path(tempfile.mkdtemp(prefix="cuatris-validar-"))
        (temporal / "horarios").mkdir()
        archivo = temporal / "horarios" / salida.name
        shutil.copy(salida, archivo)
        directorio = temporal
    validador = RAIZ_DEL_REPOSITORIO / "scripts" / "datos" / "validar.mjs"
    orden = ["node", str(validador), "--dir", str(directorio), str(archivo)]
    try:
        resultado = subprocess.run(orden, capture_output=True, text=True, check=False)
    except OSError as exc:
        return [f"No se pudo correr el validador ({exc}); corra a mano: {' '.join(orden)}"], False
    finally:
        if temporal is not None:
            shutil.rmtree(temporal, ignore_errors=True)
    salida_del_validador = resultado.stdout + resultado.stderr
    lineas = [linea for linea in salida_del_validador.splitlines() if linea.strip()]
    return lineas, resultado.returncode != 0


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
        default=None,
        help="Archivo JSON de horarios a escribir (por defecto data/plan/horarios/<periodo>.json).",
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
        "con tools/tests/corpus/sga/.",
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


class _ASalidaEstandar(logging.StreamHandler):
    """`StreamHandler` que resuelve `sys.stdout` en cada emision.

    El resumen del barrido tiene que salir por la salida estandar (es lo que lee quien corre
    el comando, y lo que leen los tests). Resolver el flujo en cada emision y no al instalar
    el handler evita quedarse escribiendo en un `sys.stdout` que ya no es el vigente.
    """

    def __init__(self) -> None:
        super().__init__(sys.stdout)

    @property
    def stream(self):  # type: ignore[override]
        return sys.stdout

    @stream.setter
    def stream(self, _valor: object) -> None:
        """Se ignora a proposito: el flujo siempre sale de `sys.stdout`."""


#: Marca de los handlers que instala este modulo, para poder quitarlos antes de reinstalar.
_MARCA_HANDLER = "_de_cuatris"

#: Logger raiz del paquete: `cliente`, `checkpoint`, `normalizar` y este modulo escriben
#: todos bajo `cuatris.sga`, asi que alcanza con configurar el padre.
_RAIZ = logging.getLogger("cuatris")


def configurar_registro(verboso: bool = False, archivo: Path | None = None) -> None:
    """Consola en INFO (DEBUG con `--verboso`) y, si se pide, un archivo de log en DEBUG.

    El archivo (`<cache>/<periodo>.log`) se abre en modo **append** y lleva fecha, nivel y
    mensaje: es lo que queda para mirar despues de un barrido de diez minutos, donde la
    terminal ya no alcanza. Cada corrida empieza con una linea `=== corrida … ===` para poder
    separarlas.

    El logger de `httpx` emite en INFO una linea «HTTP Request: …» con la URL entera, y las
    URL del SGA llevan el identificador de sesion (`;jsessionid=<token>`): en INFO, un barrido
    escribiria ~500 veces el token vivo en la terminal y en el archivo. Todo lo que el scraper
    muestra por su cuenta pasa antes por `cliente._sin_sesion()`.

    Es idempotente: los handlers que instala quedan marcados y se quitan antes de volver a
    instalarlos, asi que llamarla varias veces en el mismo proceso —los tests lo hacen— no
    duplica lineas ni deja archivos abiertos.
    """
    for handler in list(_RAIZ.handlers):
        if getattr(handler, _MARCA_HANDLER, False):
            _RAIZ.removeHandler(handler)
            handler.close()

    _RAIZ.setLevel(logging.DEBUG)
    consola = _ASalidaEstandar()
    consola.setLevel(logging.DEBUG if verboso else logging.INFO)
    consola.setFormatter(logging.Formatter("%(message)s"))
    setattr(consola, _MARCA_HANDLER, True)
    _RAIZ.addHandler(consola)

    if archivo is not None:
        archivo = Path(archivo)
        archivo.parent.mkdir(parents=True, exist_ok=True)
        a_disco = logging.FileHandler(archivo, mode="a", encoding="utf-8")
        a_disco.setLevel(logging.DEBUG)
        a_disco.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        setattr(a_disco, _MARCA_HANDLER, True)
        _RAIZ.addHandler(a_disco)
        # La linea de apertura se escribe sin pasar por el formato: es un separador entre
        # corridas, no un mensaje del scraper.
        a_disco.stream.write(f"=== corrida {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===\n")
        a_disco.flush()

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


@dataclasses.dataclass
class Resumen:
    """Lo que hay que poder contar al final de un barrido de diez minutos."""

    filas: int = 0
    codigos: set[str] = dataclasses.field(default_factory=set)
    repetidos: set[str] = dataclasses.field(default_factory=set)
    bajados: int = 0
    ya_estaban: int = 0


def _controlar_filtro(listado: parsers.Listado, periodo: str) -> None:
    """Corta en la **pagina 1** si ninguna fila es del periodo pedido.

    Es el mismo control de siempre, adelantado: con el barrido perezoso, esperar al final
    significaria descubrir a los dieciseis minutos que el filtro no se aplico.
    """
    if any(fila.periodo == periodo for fila in listado.filas):
        return
    ejemplo = listado.filas[0] if listado.filas else None
    raise parsers.EstructuraInesperada(
        f"Ninguna fila de la primera pagina del listado es del periodo «{periodo}»; el "
        "filtro no se aplico.",
        f"{ejemplo.codigo} {ejemplo.nombre} ({ejemplo.periodo})" if ejemplo else None,
    )


def _avisar_repetido(
    primera: parsers.FilaListado, otra: parsers.FilaListado, aparicion: int
) -> None:
    """Avisa que un codigo vuelve a aparecer en el listado, con las dos filas al lado."""
    REGISTRO.warning(
        "%s aparece por %da vez en el listado: 1a «%s» %s %s–%s (%s / %s), %da «%s» %s "
        "%s–%s (%s / %s). Se baja tambien y se guarda aparte.",
        otra.codigo,
        aparicion,
        primera.nombre,
        primera.periodo,
        primera.desde,
        primera.hasta,
        primera.nivel,
        primera.departamento,
        aparicion,
        otra.nombre,
        otra.periodo,
        otra.desde,
        otra.hasta,
        otra.nivel,
        otra.departamento,
    )


def _bajar_con_recuperacion(
    cliente: ClienteSGA, barrido: Barrido, fila: parsers.FilaListado, *, en_la_pagina: int
) -> parsers.Curso:
    """Baja un curso; ante `PaginaVencida` reabre el listado y reintenta **una** vez."""
    try:
        return bajar_curso(cliente, fila)
    except PaginaVencida as exc:
        REGISTRO.warning(
            "El SGA dio por vencida la pagina del listado al abrir %s; se reabre y se vuelve "
            "a la pagina %d. Detalle: %s",
            fila.codigo,
            barrido.pagina,
            exc,
        )
        barrido.reabrir()
        return bajar_curso(cliente, barrido.fila(fila.codigo, en_la_pagina))


def _siguiente_con_recuperacion(barrido: Barrido) -> bool:
    """Pide la pagina siguiente; ante `PaginaVencida` reabre el listado y reintenta una vez."""
    try:
        return barrido.siguiente()
    except PaginaVencida as exc:
        REGISTRO.warning(
            "El SGA dio por vencida la pagina %d del listado al pedir la siguiente; se "
            "reabre y se vuelve a la pagina %d. Detalle: %s",
            barrido.pagina,
            barrido.pagina,
            exc,
        )
        barrido.reabrir()
        return barrido.siguiente()


def _recorrer(
    cliente: ClienteSGA,
    barrido: Barrido,
    punto: Checkpoint,
    hechos: dict[str, dict[str, Any]],
    *,
    args: argparse.Namespace,
    periodo_id: str,
    capturado: str,
    cache: Path,
    fallidos: list[Fallido],
    resumen: Resumen,
) -> None:
    """Barrido pagina por pagina: los detalles de cada pagina, y recien despues la siguiente.

    Las filas se recorren **por posicion** y no sobre una copia, porque una recuperacion
    reemplaza la pagina actual por una recien abierta: seguir con los enlaces viejos seria
    volver a chocar con la pantalla de error en cada fila.
    """
    barrido.abrir()
    _controlar_filtro(barrido.listado, periodo_id)
    apariciones: dict[str, int] = {}
    primeras: dict[str, parsers.FilaListado] = {}
    irrecuperables = 0

    while True:
        en_pagina: dict[str, int] = {}
        indice = 0
        while indice < len(barrido.listado.filas):
            if args.limite is not None and resumen.filas >= args.limite:
                return
            fila = barrido.listado.filas[indice]
            indice += 1
            resumen.filas += 1
            resumen.codigos.add(fila.codigo)
            apariciones[fila.codigo] = apariciones.get(fila.codigo, 0) + 1
            en_pagina[fila.codigo] = en_pagina.get(fila.codigo, 0) + 1
            aparicion = apariciones[fila.codigo]
            if aparicion == 1:
                primeras[fila.codigo] = fila
            else:
                resumen.repetidos.add(fila.codigo)
                _avisar_repetido(primeras[fila.codigo], fila, aparicion)

            clave = clave_de_curso(fila.codigo, aparicion)
            total = barrido.listado.paginacion.total_filas or "?"
            if clave in hechos:
                resumen.ya_estaban += 1
                continue
            try:
                curso = _bajar_con_recuperacion(
                    cliente, barrido, fila, en_la_pagina=en_pagina[fila.codigo]
                )
                datos = parsers.curso_a_dict(curso, capturado)
            except PaginaVencida as exc:
                # El SGA sigue dando su pantalla de error despues de reabrir el listado: el
                # curso queda pendiente para la proxima corrida. Si pasa cinco veces seguidas
                # no es este curso, es el SGA, y seguir seria gastar 470 peticiones en vano.
                fallidos.append((clave, fila.nombre, str(exc)))
                REGISTRO.info(
                    "[%d/%s] %s %s: ERROR %s", resumen.filas, total, clave, fila.nombre, exc
                )
                if args.guardar_html:
                    cliente.volcar_html(cache, f"{periodo_id}-{fila.codigo}")
                irrecuperables += 1
                if irrecuperables >= MAXIMO_IRRECUPERABLES:
                    raise ErrorSGA(
                        f"{MAXIMO_IRRECUPERABLES} cursos seguidos terminaron en la pantalla "
                        "de error del SGA: el SGA responde su pagina de error a todo. Espere "
                        "unos minutos y vuelva a correr el mismo comando: el checkpoint "
                        "conserva lo bajado."
                    ) from exc
                continue
            except (parsers.EstructuraInesperada, normalizar.ValorDesconocido) as exc:
                # Un curso que no se entiende no frena a los otros 471: se anota, se sigue, y
                # al final se informan todos juntos. No entra al checkpoint, asi que la
                # proxima corrida lo vuelve a intentar con el mapeo corregido.
                fallidos.append((clave, fila.nombre, str(exc)))
                REGISTRO.info(
                    "[%d/%s] %s %s: ERROR %s", resumen.filas, total, clave, fila.nombre, exc
                )
                if args.guardar_html:
                    cliente.volcar_html(cache, f"{periodo_id}-{fila.codigo}")
                continue

            punto.agregar(
                fila.codigo,
                datos,
                listado={"periodo": fila.periodo, "desde": fila.desde, "hasta": fila.hasta},
                aparicion=aparicion,
            )
            hechos[clave] = datos
            resumen.bajados += 1
            irrecuperables = 0
            REGISTRO.info("[%d/%s] %s %s", resumen.filas, total, clave, fila.nombre)

        if args.limite is not None and resumen.filas >= args.limite:
            return
        if not _siguiente_con_recuperacion(barrido):
            return


def _informar(resumen: Resumen, fallidos: Sequence[Fallido], parcial: Path | None) -> None:
    """Resumen final, el mismo por consola y en el archivo de log."""
    REGISTRO.info(
        "\nResumen: %d filas del listado, %d codigos distintos (%d repetidos); %d cursos "
        "bajados en esta corrida, %d ya estaban en el checkpoint, %d fallidos.",
        resumen.filas,
        len(resumen.codigos),
        len(resumen.repetidos),
        resumen.bajados,
        resumen.ya_estaban,
        len(fallidos),
    )
    if resumen.repetidos:
        REGISTRO.info("Codigos repetidos en el listado: %s.", ", ".join(sorted(resumen.repetidos)))
    for codigo, nombre, motivo in fallidos:
        REGISTRO.info("  - %s %s: %s", codigo, nombre, motivo)
    if parcial is not None:
        REGISTRO.info(
            "Lo que si se pudo armar quedo en %s (fuera de data/). Corrija los mapeos o el "
            "parser y vuelva a correr: solo se repiten los fallidos.",
            parcial,
        )


def ejecutar(args: argparse.Namespace) -> int:
    """Corre el barrido completo. Devuelve el codigo de salida del proceso."""
    periodo_id = f"{args.anio}-{args.cuatrimestre}"
    if getattr(args, "salida", None) is None:
        args.salida = SALIDA_POR_DEFECTO / f"{periodo_id}.json"
    cache = Path(args.cache) if args.cache else Path(CACHE)
    configurar_registro(bool(getattr(args, "verboso", False)), cache / f"{periodo_id}.log")
    punto = Checkpoint(cache / f"{periodo_id}.jsonl", periodo_id)
    if args.desde_cero and punto.borrar():
        REGISTRO.info("Checkpoint borrado; se vuelve a bajar %s completo.", periodo_id)

    usuario, clave = credenciales()
    capturado = hoy()
    hechos = punto.cargar()
    if hechos:
        REGISTRO.info(
            "El checkpoint ya tiene %d cursos de %s; se saltean.", len(hechos), periodo_id
        )

    fallidos: list[Fallido] = []
    resumen = Resumen()
    with ClienteSGA(ritmo=args.ritmo) as cliente:
        try:
            cliente.iniciar_sesion(usuario, clave)
            del clave
            barrido = Barrido(
                cliente,
                nivel=args.nivel,
                cuatrimestre_texto=_cuatrimestre_texto(args.cuatrimestre),
                anio=args.anio,
            )
            _recorrer(
                cliente,
                barrido,
                punto,
                hechos,
                args=args,
                periodo_id=periodo_id,
                capturado=capturado,
                cache=cache,
                fallidos=fallidos,
                resumen=resumen,
            )
        except Exception:
            if args.guardar_html:
                cliente.volcar_html(cache, f"{periodo_id}-error")
            raise

    # El periodo y los cursos anuales se resuelven recien ahora, sobre el checkpoint: con el
    # barrido pagina por pagina, el intervalo del cuatrimestre no se conoce hasta el final.
    registros = punto.registros()
    if not registros:
        if fallidos:
            _informar(resumen, fallidos, None)
            REGISTRO.info(
                "Ningun curso quedo en el checkpoint: no hay archivo que escribir. Corrija "
                "lo que se informa arriba y vuelva a correr el mismo comando."
            )
            return HAY_ERRORES
        raise parsers.EstructuraInesperada(
            f"El barrido no dejo ningun curso de {periodo_id} en el checkpoint; sin cursos "
            "no se puede fechar el periodo ni escribir el archivo."
        )
    propios, anuales, ajenos = separar_anuales(registros, periodo=periodo_id)
    fallidos.extend(ajenos)
    periodo = periodo_de_registros(propios, anio=args.anio, cuatrimestre=args.cuatrimestre)
    documento, conflictos = armar_documento(
        [
            {**registro.curso, "_periodo_del_listado": registro.periodo_del_listado or periodo_id}
            for registro in propios + anuales
        ],
        periodo,
        capturado,
    )
    fallidos.extend(conflictos)

    if fallidos:
        parcial = cache / f"{periodo_id}.parcial.json"
        escribir(documento, parcial)
        _informar(resumen, fallidos, parcial)
        return HAY_ERRORES

    escribir(documento, args.salida)
    lineas, con_errores = validar(args.salida)
    for linea in lineas:
        REGISTRO.info("%s", linea)
    if con_errores:
        invalido = ruta_invalida(args.salida, cache)
        invalido.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(args.salida), str(invalido))
        _informar(resumen, fallidos, None)
        REGISTRO.info(
            "El archivo no valida; quedo en %s, fuera de data/, para que lo revise. "
            "Es un descarte: borrelo cuando termine de mirarlo.",
            invalido,
        )
        return HAY_ERRORES

    _informar(resumen, fallidos, None)
    REGISTRO.info("%d cursos escritos en %s.", len(documento["cursos"]), args.salida)
    if args.limite is not None:
        REGISTRO.info(
            "Corrida con --limite: las fechas del periodo salen solo de esos cursos, asi que "
            "el archivo sirve para probar, no para publicar."
        )
    return OK
