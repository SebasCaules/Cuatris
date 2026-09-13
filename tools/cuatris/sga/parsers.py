"""Parsers offline del HTML del SGA.

Ninguna funcion de este modulo hace red: todas reciben el HTML ya descargado. Los anclajes
estan documentados en `docs/scraping-sga.md`; la regla es anclar siempre en texto visible o
en nombres de campo, **nunca en un id numerico de Wicket**, porque esos ids rotan entre
despliegues.

Cuando el HTML no tiene la forma esperada se levanta `EstructuraInesperada` con el fragmento
problematico. Un valor que existe pero no se sabe traducir levanta
`normalizar.ValorDesconocido`. En ningun caso se devuelve un campo vacio en silencio.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any

from bs4 import BeautifulSoup, Tag

from . import normalizar

__all__ = [
    "Bloque",
    "Comision",
    "Cupo",
    "Curso",
    "EstructuraInesperada",
    "FilaListado",
    "FiltrosListado",
    "Listado",
    "Ocupacion",
    "Paginacion",
    "Periodo",
    "a_contrato",
    "extraer_formulario_login",
    "extraer_ids_filtro",
    "parsear_comisiones",
    "parsear_curso",
    "parsear_listado",
]

CONTRATO = "1.0.0"

ETIQUETA_AULA = "Aula ITBA:"
#: La etiqueta dice «Aula externa» pero el valor es la modalidad (ver HALLAZGOS.md).
ETIQUETA_MODALIDAD = "Aula externa:"
#: Id de la modalidad presencial. CONTRATO-v1.md §1 solo admite `sede: null` cuando la
#: modalidad no es presencial, asi que un bloque presencial sin sede es un error de lectura.
PRESENCIAL = normalizar.MODALIDADES["Presencial"]

_CODIGO = re.compile(r"^\d{2}\.\d{2}$")
#: `002R #----> Sede Rectorado`. La cantidad de guiones no se fija.
_AULA_SEDE = re.compile(r"^(?P<aula>.+?)\s*#-*>\s*(?P<sede>.+)$")
#: `Página 1 a 20 de 472` (con o sin acento).
_ETIQUETA_PAGINA = re.compile(
    r"P[áa]gina\s+(?P<desde>\d+)\s+a\s+(?P<hasta>\d+)\s+de\s+(?P<total>\d+)", re.IGNORECASE
)
#: `results:topToolbars:toolbars:3366:filters:1:filter:filter`; el 3366 rota.
_CAMPO_FILTRO = re.compile(
    r"^(?P<prefijo>results:topToolbars:toolbars:\d+):filters:(?P<indice>\d+):filter:filter$"
)
_CAMPO_GO = re.compile(r"^results:topToolbars:toolbars:\d+:filters:\d+:filter:go$")


class EstructuraInesperada(ValueError):
    """El HTML del SGA no tiene la forma que este parser sabe leer."""

    def __init__(self, detalle: str, fragmento: object = None) -> None:
        self.detalle = detalle
        self.fragmento = fragmento
        mensaje = detalle
        if fragmento is not None:
            recorte = str(fragmento)
            if len(recorte) > 400:
                recorte = recorte[:400] + "…"
            mensaje = f"{detalle} Fragmento: {recorte!r}"
        super().__init__(mensaje)


# --------------------------------------------------------------------------------------
# Formas de datos
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Bloque:
    """Un bloque horario de una comision, ya normalizado al vocabulario del contrato.

    `aulas` es una lista: dos aulas simultaneas producen dos elementos. `extra` guarda el
    texto de los `<span>` ocultos del SGA cuando traen contenido (en el material estan
    siempre vacios); `a_contrato` se niega a serializar un bloque con `extra`, para que un
    dato nuevo no se pierda en silencio.
    """

    dia: str
    desde: str
    hasta: str
    sede: str | None
    modalidad: str
    aulas: tuple[str, ...] = ()
    extra: str | None = None

    @property
    def clave_fusion(self) -> tuple[str, str, str, str | None, str]:
        return (self.dia, self.desde, self.hasta, self.sede, self.modalidad)


@dataclass(frozen=True)
class Cupo:
    capacidad: int


@dataclass(frozen=True)
class Ocupacion:
    inscriptos: int
    #: Fecha a la que corresponde el numero. El HTML de la pestana Comisiones **no trae
    #: fecha**, asi que queda en `None` y `a_contrato` usa la fecha de captura del scraper.
    al: str | None = None


@dataclass(frozen=True)
class Comision:
    """Una comision de la pestana Comisiones.

    `bloques` es la forma del contrato: los renglones del SGA que coinciden en dia, horario,
    sede y modalidad se fusionan en un bloque con varias aulas. `bloques_crudos` conserva un
    elemento por cada `<div>` del HTML (una sola aula cada uno), que es lo que hay que contar
    para comparar contra HALLAZGOS.md.
    """

    id: str
    cupo: Cupo | None
    ocupacion: Ocupacion | None
    docentes: tuple[str, ...]
    bloques: tuple[Bloque, ...]
    bloques_crudos: tuple[Bloque, ...]


@dataclass(frozen=True)
class Curso:
    codigo: str
    nombre: str
    departamento: str | None
    #: Fechas del dictado. El detalle del curso **no las publica**: vienen del listado.
    desde: str | None
    hasta: str | None
    cuatrimestre: str | None
    anio: int | None
    comisiones: tuple[Comision, ...]


@dataclass(frozen=True)
class FilaListado:
    """Una fila del listado de cursos, con lo que el scraper necesita para navegar."""

    codigo: str
    nombre: str
    departamento: str | None
    nivel: str | None
    periodo: str | None
    cuatrimestre_texto: str | None
    anio: int | None
    desde: str | None
    hasta: str | None
    activo: bool | None
    alumnos: int | None
    #: `href` del boton «Ver Detalles» de la fila; `None` si la fila no lo trae.
    enlace_detalle: str | None
    #: `id` de ese enlace, cuando el HTML se lo pone.
    id_detalle: str | None


@dataclass(frozen=True)
class Paginacion:
    """Datos del navegador del listado, tal como aparecen en el HTML."""

    pagina: int | None
    total_paginas: int | None
    total_filas: int | None
    primera_fila: int | None
    ultima_fila: int | None
    tamano_pagina: int | None
    hay_siguiente: bool
    enlace_siguiente: str | None
    id_siguiente: str | None
    enlace_ultima: str | None
    etiqueta: str | None


@dataclass(frozen=True)
class Listado:
    filas: tuple[FilaListado, ...]
    paginacion: Paginacion
    columnas: tuple[str, ...]


@dataclass(frozen=True)
class FiltrosListado:
    """Nombres de campo del formulario de filtros del listado (los ids rotan)."""

    id_formulario: str | None
    accion: str | None
    prefijo: str
    campo_oculto: str | None
    campo_go: str | None
    #: Titulo visible de la columna -> nombre del campo de filtro.
    campos: dict[str, str] = field(default_factory=dict)
    #: Indice del filtro dentro de la toolbar -> nombre del campo.
    por_indice: dict[int, str] = field(default_factory=dict)


@dataclass(frozen=True)
class Periodo:
    """Cabecera `periodo` del JSON de horarios."""

    id: str
    anio: int
    cuatrimestre: str
    desde: str
    hasta: str

    def a_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "anio": self.anio,
            "cuatrimestre": self.cuatrimestre,
            "desde": self.desde,
            "hasta": self.hasta,
        }


# --------------------------------------------------------------------------------------
# Utilidades de HTML
# --------------------------------------------------------------------------------------


def _sopa(html: str | BeautifulSoup) -> BeautifulSoup:
    if isinstance(html, BeautifulSoup):
        return html
    if not isinstance(html, str):
        raise EstructuraInesperada("Se esperaba el HTML como texto.", type(html).__name__)
    return BeautifulSoup(html, "html.parser")


def _texto(nodo: Tag | None) -> str:
    if nodo is None:
        return ""
    return re.sub(r"\s+", " ", nodo.get_text(" ", strip=True)).strip()


def _texto_propio(nodo: Tag) -> str:
    """Texto de los nodos de texto directos, sin el de los hijos."""
    return re.sub(r"\s+", " ", "".join(nodo.find_all(string=True, recursive=False))).strip()


def _clave(texto: str) -> str:
    return normalizar.clave(texto)


def _o_none(texto: str) -> str | None:
    return texto or None


def _entero(texto: str, campo: str) -> int | None:
    texto = texto.strip()
    if not texto:
        return None
    if not re.fullmatch(r"\d+", texto):
        raise EstructuraInesperada(f"Se esperaba un entero en {campo}.", texto)
    return int(texto)


def _celdas(fila: Tag) -> list[Tag]:
    return fila.find_all(["td", "th"], recursive=False)


def _tabla_con_encabezados(sopa: BeautifulSoup, requeridos: Sequence[str]) -> tuple[Tag, list[str]]:
    """Primera tabla cuya fila de encabezados contiene todos los titulos pedidos.

    Devuelve la tabla y los titulos en el orden en que aparecen, para que las columnas se
    ubiquen por nombre y no por posicion fija.
    """
    buscados = [_clave(t) for t in requeridos]
    for tabla in sopa.find_all("table"):
        for fila in tabla.find_all("tr"):
            titulos = [_texto(c) for c in _celdas(fila)]
            claves = [_clave(t) for t in titulos]
            if all(b in claves for b in buscados):
                return tabla, titulos
    raise EstructuraInesperada(
        "No se encontro la tabla con los encabezados " + ", ".join(requeridos) + ".",
        _texto(sopa.find("body"))[:200] if sopa.find("body") else None,
    )


def _indice_columnas(titulos: Sequence[str]) -> dict[str, int]:
    indice: dict[str, int] = {}
    for posicion, titulo in enumerate(titulos):
        clave = _clave(titulo)
        if clave and clave not in indice:
            indice[clave] = posicion
    return indice


def _columna(celdas: Sequence[Tag], indice: dict[str, int], titulo: str) -> Tag | None:
    posicion = indice.get(_clave(titulo))
    if posicion is None or posicion >= len(celdas):
        return None
    return celdas[posicion]


# --------------------------------------------------------------------------------------
# Pestana Comisiones
# --------------------------------------------------------------------------------------


def _parsear_bloque(div: Tag) -> Bloque:
    spans = div.find_all("span", recursive=False)
    if len(spans) < 4:
        raise EstructuraInesperada(
            "Un bloque horario no tiene los cuatro <span> esperados "
            "(dia, desde, hasta y el grupo de aula/modalidad).",
            div,
        )
    dia = normalizar.dia(_texto(spans[0]))
    desde = normalizar.hora(_texto(spans[1]))
    hasta = normalizar.hora(_texto(spans[2]))
    grupo = spans[3]

    aulas: list[str] = []
    sedes: list[str] = []
    modalidades: list[str] = []
    valores: set[int] = set()
    for span in grupo.find_all("span"):
        etiqueta = _texto_propio(span)
        if etiqueta.startswith(ETIQUETA_AULA):
            interno = span.find("span")
            if interno is None:
                raise EstructuraInesperada("«Aula ITBA:» sin valor.", span)
            valores.add(id(interno))
            coincidencia = _AULA_SEDE.match(_texto(interno))
            if coincidencia is None:
                raise EstructuraInesperada(
                    "El aula no tiene la forma «<codigo> #----> <sede>».", _texto(interno)
                )
            aulas.append(coincidencia.group("aula").strip())
            sedes.append(normalizar.sede(coincidencia.group("sede").strip()))
        elif etiqueta.startswith(ETIQUETA_MODALIDAD):
            interno = span.find("span")
            if interno is None:
                raise EstructuraInesperada("«Aula externa:» sin valor.", span)
            valores.add(id(interno))
            modalidades.append(normalizar.modalidad(_texto(interno)))

    if not modalidades:
        raise EstructuraInesperada(
            f"El bloque no trae «{ETIQUETA_MODALIDAD}», que es de donde sale la modalidad.", div
        )
    if len(set(modalidades)) > 1:
        raise EstructuraInesperada("Un mismo bloque declara dos modalidades.", div)
    if len(set(sedes)) > 1:
        raise EstructuraInesperada("Un mismo bloque declara dos sedes.", div)
    if modalidades[0] == PRESENCIAL and not sedes:
        raise EstructuraInesperada(
            f"Un bloque presencial no trae «{ETIQUETA_AULA}», que es de donde sale la sede; "
            "el contrato no admite «sede: null» con modalidad presencial.",
            div,
        )

    sobrantes = [
        texto
        for span in grupo.find_all("span")
        if id(span) not in valores
        and span.find("span") is None
        and (texto := _texto(span))
        and not texto.startswith((ETIQUETA_AULA, ETIQUETA_MODALIDAD))
    ]

    return Bloque(
        dia=dia,
        desde=desde,
        hasta=hasta,
        sede=sedes[0] if sedes else None,
        modalidad=modalidades[0],
        aulas=tuple(aulas),
        extra=" | ".join(sobrantes) or None,
    )


def _fusionar_bloques(crudos: Sequence[Bloque]) -> tuple[Bloque, ...]:
    """Fusiona los renglones que son el mismo bloque en dos aulas simultaneas."""
    orden: list[tuple[str, str, str, str | None, str]] = []
    acumulado: dict[tuple[str, str, str, str | None, str], list[Bloque]] = {}
    for bloque in crudos:
        clave = bloque.clave_fusion
        if clave not in acumulado:
            acumulado[clave] = []
            orden.append(clave)
        acumulado[clave].append(bloque)

    fusionados: list[Bloque] = []
    for clave in orden:
        partes = acumulado[clave]
        aulas: list[str] = []
        for parte in partes:
            for aula in parte.aulas:
                if aula not in aulas:
                    aulas.append(aula)
        extras = [p.extra for p in partes if p.extra]
        fusionados.append(
            Bloque(
                dia=clave[0],
                desde=clave[1],
                hasta=clave[2],
                sede=clave[3],
                modalidad=clave[4],
                aulas=tuple(aulas),
                extra=" | ".join(extras) or None,
            )
        )
    return tuple(fusionados)


def _parsear_cupo(celda: Tag | None) -> tuple[Cupo | None, Ocupacion | None]:
    """`48 / 49` -> inscriptos 48, capacidad 49 (el SGA muestra inscriptos/capacidad)."""
    if celda is None:
        return None, None
    texto = _texto(celda)
    if not texto:
        return None, None
    partes = [p.strip() for p in texto.split("/")]
    if len(partes) != 2 or not all(re.fullmatch(r"\d+", p) for p in partes):
        raise EstructuraInesperada("El cupo no tiene la forma «inscriptos / capacidad».", texto)
    inscriptos, capacidad = int(partes[0]), int(partes[1])
    return Cupo(capacidad=capacidad), Ocupacion(inscriptos=inscriptos, al=None)


def parsear_comisiones(html: str | BeautifulSoup) -> list[Comision]:
    """Comisiones y bloques horarios de la pestana Comisiones de un curso."""
    sopa = _sopa(html)
    tabla, titulos = _tabla_con_encabezados(sopa, ("Comisión", "Horarios", "Profesores", "Cupo"))
    indice = _indice_columnas(titulos)

    cuerpo = tabla.find("tbody")
    filas = cuerpo.find_all("tr", recursive=False) if cuerpo else []
    comisiones: list[Comision] = []
    for fila in filas:
        celdas = _celdas(fila)
        if not celdas:
            continue
        identificador = _texto(_columna(celdas, indice, "Comisión"))
        if not identificador:
            raise EstructuraInesperada("Una fila de comisiones no trae identificador.", fila)

        celda_horarios = _columna(celdas, indice, "Horarios")
        crudos = [
            _parsear_bloque(div)
            for div in (celda_horarios.find_all("div", recursive=False) if celda_horarios else [])
        ]
        if not crudos and _texto(celda_horarios):
            # La celda tiene horario escrito pero el recorrido no extrajo ningun bloque:
            # el marcado cambio (Wicket) y callarlo produciria comisiones sin horarios.
            raise EstructuraInesperada(
                f"La celda «Horarios» de la comision {identificador} tiene texto pero no se "
                "pudo leer ningun bloque; el marcado no es el que este parser sabe leer.",
                celda_horarios,
            )

        celda_docentes = _columna(celdas, indice, "Profesores")
        docentes = [
            _texto(etiqueta)
            for etiqueta in (celda_docentes.find_all("label") if celda_docentes else [])
            if _texto(etiqueta)
        ]

        cupo, ocupacion = _parsear_cupo(_columna(celdas, indice, "Cupo"))
        comisiones.append(
            Comision(
                id=identificador,
                cupo=cupo,
                ocupacion=ocupacion,
                docentes=tuple(docentes),
                bloques=_fusionar_bloques(crudos),
                bloques_crudos=tuple(crudos),
            )
        )
    return comisiones


# --------------------------------------------------------------------------------------
# Detalle del curso
# --------------------------------------------------------------------------------------


def _valor_de_fila(sopa: BeautifulSoup, etiqueta: str) -> str | None:
    """Valor de una fila «<etiqueta>: <valor>» de la cabecera del detalle."""
    objetivo = _clave(etiqueta.rstrip(":") + ":")
    for marca in sopa.find_all("label"):
        if _clave(_texto(marca)) != objetivo:
            continue
        fila = marca.find_parent("div", class_="row") or marca.parent.parent
        if fila is None:
            continue
        completo = _texto(fila)
        sin_etiqueta = completo[len(_texto(marca)) :].strip() if completo else ""
        return _o_none(sin_etiqueta)
    return None


def _pestana_activa(sopa: BeautifulSoup) -> str | None:
    activa = sopa.select_one("div.tabpanel4 li.active")
    return _o_none(_texto(activa)) if activa else None


def parsear_curso(html_detalle: str | BeautifulSoup) -> Curso:
    """Detalle de un curso con la pestana Comisiones abierta."""
    sopa = _sopa(html_detalle)

    pestana = _pestana_activa(sopa)
    if pestana is not None and _clave(pestana) != _clave("Comisiones"):
        raise EstructuraInesperada(
            "El detalle no tiene abierta la pestana Comisiones, que es la unica que trae horarios.",
            pestana,
        )

    materia = _valor_de_fila(sopa, "Materia")
    if not materia:
        raise EstructuraInesperada("El detalle no trae la fila «Materia:».")
    partes = materia.split(" - ", 1)
    if len(partes) != 2:
        raise EstructuraInesperada("«Materia:» no tiene la forma «<codigo> - <nombre>».", materia)
    codigo, nombre = partes[0].strip(), partes[1].strip()
    if not _CODIGO.match(codigo):
        raise EstructuraInesperada("El codigo de materia no es «NN.NN».", codigo)

    cuatrimestre = _valor_de_fila(sopa, "Cuatrimestre")
    cuatrimestre_texto: str | None = None
    anio: int | None = None
    if cuatrimestre:
        coincidencia = re.match(r"^(?P<texto>.*?)\s*(?P<anio>\d{4})$", cuatrimestre)
        if coincidencia is None:
            raise EstructuraInesperada(
                "«Cuatrimestre:» no tiene la forma «<periodo> <anio>».", cuatrimestre
            )
        cuatrimestre_texto = coincidencia.group("texto").strip() or None
        anio = int(coincidencia.group("anio"))

    # El detalle del curso no publica las fechas de dictado; salen del listado.
    desde = _valor_de_fila(sopa, "Comienzo")
    hasta = _valor_de_fila(sopa, "Fin")

    return Curso(
        codigo=codigo,
        nombre=nombre,
        departamento=_valor_de_fila(sopa, "Departamento"),
        desde=normalizar.fecha(desde) if desde else None,
        hasta=normalizar.fecha(hasta) if hasta else None,
        cuatrimestre=cuatrimestre_texto,
        anio=anio,
        comisiones=tuple(parsear_comisiones(sopa)),
    )


# --------------------------------------------------------------------------------------
# Listado de cursos
# --------------------------------------------------------------------------------------


def _parsear_paginacion(sopa: BeautifulSoup) -> Paginacion:
    etiqueta_nodo = sopa.select_one("div.navigatorLabel")
    etiqueta = _texto(etiqueta_nodo) if etiqueta_nodo else ""
    desde = hasta = total = None
    coincidencia = _ETIQUETA_PAGINA.search(etiqueta) if etiqueta else None
    if coincidencia:
        desde = int(coincidencia.group("desde"))
        hasta = int(coincidencia.group("hasta"))
        total = int(coincidencia.group("total"))

    tamano = hasta - desde + 1 if desde is not None and hasta is not None else None
    total_paginas = math.ceil(total / tamano) if total is not None and tamano else None

    pagina: int | None = None
    for actual in sopa.select("div.navigator span.goto"):
        if actual.find("a") is None:
            texto = _texto(actual)
            if re.fullmatch(r"\d+", texto):
                pagina = int(texto)
            break
    if pagina is None and desde is not None and tamano:
        pagina = math.ceil(desde / tamano)

    siguiente = sopa.select_one("div.navigator a.next")
    ultima = sopa.select_one("div.navigator a.last")
    return Paginacion(
        pagina=pagina,
        total_paginas=total_paginas,
        total_filas=total,
        primera_fila=desde,
        ultima_fila=hasta,
        tamano_pagina=tamano,
        hay_siguiente=siguiente is not None,
        enlace_siguiente=siguiente.get("href") if siguiente else None,
        id_siguiente=siguiente.get("id") if siguiente else None,
        enlace_ultima=ultima.get("href") if ultima else None,
        etiqueta=_o_none(etiqueta),
    )


def parsear_listado(html: str | BeautifulSoup) -> Listado:
    """Filas del listado de cursos, con el enlace al detalle y los datos de paginacion."""
    sopa = _sopa(html)
    tabla, titulos = _tabla_con_encabezados(sopa, ("Cód.", "Materia", "Período", "Año"))
    indice = _indice_columnas(titulos)

    cuerpo = tabla.find("tbody")
    crudas = cuerpo.find_all("tr", recursive=False) if cuerpo else []
    filas: list[FilaListado] = []
    for cruda in crudas:
        celdas = _celdas(cruda)
        if not celdas:
            continue
        codigo = _texto(_columna(celdas, indice, "Cód."))
        if not codigo:
            raise EstructuraInesperada("Una fila del listado no trae codigo.", cruda)
        if not _CODIGO.match(codigo):
            raise EstructuraInesperada("El codigo del listado no es «NN.NN».", codigo)

        cuatrimestre_texto = _o_none(_texto(_columna(celdas, indice, "Período")))
        anio = _entero(_texto(_columna(celdas, indice, "Año")), "Año")
        periodo_id = (
            normalizar.periodo(cuatrimestre_texto, anio)
            if cuatrimestre_texto and anio is not None
            else None
        )
        comienzo = _texto(_columna(celdas, indice, "Comienzo"))
        fin = _texto(_columna(celdas, indice, "Fin"))

        celda_activo = _columna(celdas, indice, "Activo")
        casilla = celda_activo.find("input", attrs={"type": "checkbox"}) if celda_activo else None

        enlace = None
        for candidato in cruda.find_all("a"):
            imagen = candidato.find("img")
            if imagen is None:
                continue
            marcas = f"{imagen.get('alt', '')} {imagen.get('title', '')}"
            if "detalle" in _clave(marcas):
                enlace = candidato
                break

        filas.append(
            FilaListado(
                codigo=codigo,
                nombre=_texto(_columna(celdas, indice, "Materia")),
                departamento=_o_none(_texto(_columna(celdas, indice, "Departamento"))),
                nivel=_o_none(_texto(_columna(celdas, indice, "Nivel"))),
                periodo=periodo_id,
                cuatrimestre_texto=cuatrimestre_texto,
                anio=anio,
                desde=normalizar.fecha(comienzo) if comienzo else None,
                hasta=normalizar.fecha(fin) if fin else None,
                activo=casilla.has_attr("checked") if casilla is not None else None,
                alumnos=_entero(_texto(_columna(celdas, indice, "Alumnos")), "Alumnos"),
                enlace_detalle=enlace.get("href") if enlace else None,
                id_detalle=enlace.get("id") if enlace else None,
            )
        )

    return Listado(
        filas=tuple(filas),
        paginacion=_parsear_paginacion(sopa),
        columnas=tuple(t for t in titulos if t),
    )


# --------------------------------------------------------------------------------------
# Extractores de Wicket para el scraper en vivo
# --------------------------------------------------------------------------------------


def extraer_formulario_login(html: str | BeautifulSoup) -> tuple[str, dict[str, str]]:
    """`action` y campos ocultos del formulario de login.

    Se ancla en el campo `password`, que es lo unico estable: el `action` es relativo y
    cambia en cada carga, y los ids (`id1`, `id1_hf_0`) rotan.
    """
    sopa = _sopa(html)
    clave = sopa.find("input", attrs={"type": "password"})
    if clave is None:
        raise EstructuraInesperada("El HTML no tiene un campo de contrasena.")
    formulario = clave.find_parent("form")
    if formulario is None:
        raise EstructuraInesperada("El campo de contrasena no esta dentro de un <form>.")
    accion = formulario.get("action")
    if not accion:
        raise EstructuraInesperada("El formulario de login no trae «action».", formulario)

    ocultos: dict[str, str] = {}
    for campo in formulario.find_all("input", attrs={"type": "hidden"}):
        nombre = campo.get("name")
        if nombre:
            ocultos[nombre] = campo.get("value") or ""
    return accion, ocultos


def extraer_ids_filtro(html: str | BeautifulSoup) -> FiltrosListado:
    """Nombres de los campos de filtro del listado (`results:topToolbars:…`).

    Se ancla en el patron del atributo `name` y en los titulos visibles de las columnas.
    El numero de toolbar (`3366` hoy) es un id de componente de Wicket y rota entre
    despliegues: nunca se fija.
    """
    sopa = _sopa(html)
    campos_por_indice: dict[int, str] = {}
    prefijos: set[str] = set()
    nodos: list[Tag] = []
    for nodo in sopa.find_all(["input", "select", "textarea"]):
        nombre = nodo.get("name") or ""
        coincidencia = _CAMPO_FILTRO.match(nombre)
        if coincidencia is None:
            continue
        prefijos.add(coincidencia.group("prefijo"))
        campos_por_indice[int(coincidencia.group("indice"))] = nombre
        nodos.append(nodo)
    if not nodos:
        raise EstructuraInesperada("El HTML no trae campos «results:topToolbars:…:filter:filter».")
    if len(prefijos) > 1:
        raise EstructuraInesperada("Hay mas de una toolbar de filtros.", sorted(prefijos))
    prefijo = prefijos.pop()

    fila_filtros = nodos[0].find_parent("tr")
    tabla = nodos[0].find_parent("table")
    campos_por_titulo: dict[str, str] = {}
    if fila_filtros is not None and tabla is not None:
        _, titulos = _tabla_con_encabezados(_sopa(str(tabla)), ("Cód.", "Materia"))
        celdas = _celdas(fila_filtros)
        for posicion, celda in enumerate(celdas):
            if posicion >= len(titulos) or not titulos[posicion]:
                continue
            interno = celda.find(["input", "select", "textarea"])
            nombre = interno.get("name") if interno is not None else None
            if nombre and _CAMPO_FILTRO.match(nombre):
                campos_por_titulo[titulos[posicion]] = nombre

    campo_go = None
    for nodo in sopa.find_all(["input", "button"]):
        nombre = nodo.get("name") or ""
        if _CAMPO_GO.match(nombre):
            campo_go = nombre
            break
    if campo_go is None:
        coincidencia = re.search(
            r"results:topToolbars:toolbars:\d+:filters:\d+:filter:go", str(sopa)
        )
        campo_go = coincidencia.group(0) if coincidencia else None

    formulario = nodos[0].find_parent("form")
    id_formulario = formulario.get("id") if formulario is not None else None
    campo_oculto = None
    if formulario is not None:
        for oculto in formulario.find_all("input", attrs={"type": "hidden"}):
            nombre = oculto.get("name") or oculto.get("id")
            if nombre and (id_formulario is None or nombre.startswith(id_formulario)):
                campo_oculto = nombre
                break

    return FiltrosListado(
        id_formulario=id_formulario,
        accion=formulario.get("action") if formulario is not None else None,
        prefijo=prefijo,
        campo_oculto=campo_oculto,
        campo_go=campo_go,
        campos=campos_por_titulo,
        por_indice=dict(sorted(campos_por_indice.items())),
    )


# --------------------------------------------------------------------------------------
# Salida en la forma del contrato
# --------------------------------------------------------------------------------------


def _bloque_a_contrato(bloque: Bloque, curso: Curso, comision: Comision) -> dict[str, Any]:
    if bloque.extra:
        raise EstructuraInesperada(
            f"El bloque de {curso.codigo} comision {comision.id} trae contenido que este "
            "parser no sabe interpretar; revise el HTML antes de publicar los datos.",
            bloque.extra,
        )
    if bloque.modalidad == PRESENCIAL and bloque.sede is None:
        raise EstructuraInesperada(
            f"El bloque de {curso.codigo} comision {comision.id} es presencial y no tiene "
            "sede; CONTRATO-v1.md §1 solo admite «sede: null» cuando la modalidad no es "
            "presencial.",
            f"{bloque.dia} {bloque.desde}-{bloque.hasta} aulas={list(bloque.aulas)}",
        )
    return {
        "dia": bloque.dia,
        "desde": bloque.desde,
        "hasta": bloque.hasta,
        "sede": bloque.sede,
        "modalidad": bloque.modalidad,
        "aulas": list(bloque.aulas),
    }


def _comision_a_contrato(comision: Comision, curso: Curso, capturado: str) -> dict[str, Any]:
    salida: dict[str, Any] = {
        "id": comision.id,
        "docentes": list(comision.docentes),
        "bloques": [_bloque_a_contrato(b, curso, comision) for b in comision.bloques],
    }
    if comision.cupo is not None:
        salida["cupo"] = {"capacidad": comision.cupo.capacidad}
    if comision.ocupacion is not None:
        salida["ocupacion"] = {
            "inscriptos": comision.ocupacion.inscriptos,
            "al": comision.ocupacion.al or capturado,
        }
    return salida


def a_contrato(cursos: Iterable[Curso], periodo: Periodo, capturado: str) -> dict[str, Any]:
    """Arma el JSON de `data/v1/horarios/<periodo>.json` (CONTRATO-v1.md §1).

    No escribe ni valida: eso es de la CLI. `capturado` es la fecha de la corrida del
    scraper y es la que se usa como `ocupacion.al`, porque la pestana Comisiones no publica
    ninguna fecha junto al numero de inscriptos.
    """
    if not isinstance(periodo, Periodo):
        raise EstructuraInesperada("«periodo» tiene que ser un Periodo.", type(periodo).__name__)
    salida_cursos: list[dict[str, Any]] = []
    for curso in cursos:
        if curso.desde is None or curso.hasta is None:
            raise EstructuraInesperada(
                f"El curso {curso.codigo} no tiene fechas de dictado; se toman del listado "
                "de cursos, que es donde el SGA las publica.",
                curso.codigo,
            )
        datos: dict[str, Any] = {
            "codigo": curso.codigo,
            "nombre": curso.nombre,
            "desde": curso.desde,
            "hasta": curso.hasta,
            "dictado_conjunto": [],
            "comisiones": [_comision_a_contrato(c, curso, capturado) for c in curso.comisiones],
        }
        if curso.departamento:
            datos["departamento"] = curso.departamento
        salida_cursos.append(datos)

    return {
        "contrato": CONTRATO,
        "periodo": periodo.a_dict(),
        "fuente": {"sistema": "sga", "capturado": capturado},
        "cursos": salida_cursos,
    }
