"""C3 — invariantes: las reglas del contrato que ningun JSON Schema puede expresar.

C3 corre despues de C1 y C2, y solo sobre documentos que esas dos capas dejaron sin errores:
todo lo que hay aqui asume que el documento ya tiene la forma del schema. Las reglas que
miran otro archivo (el plan de estudios y el vocabulario de sedes) reciben esos datos en un
`Contexto`; sin contexto, C3 corre las reglas que se comprueban dentro del propio archivo y
calla las demas, porque «no pude comprobarlo» no es lo mismo que «esta mal».

Niveles, tal como los fija `CONTRATO-v1.md` y la Fase 4 del plan de backend:

- **ERROR** lo que rompe al planificador o describe algo imposible: identidades repetidas,
  franjas invertidas o fuera de rango, un curso fuera de su periodo, una sede que no existe,
  dos cursos distintos en la misma aula a la misma hora, correlativas inexistentes o ciclicas.
- **WARNING** lo que es raro pero real y no se puede rechazar sin producir falsos positivos:
  la colision de docente (homonimos y titulares nominales en varias comisiones existen), el
  sobrecupo (`inscriptos > capacidad`), y un codigo de horarios que no esta en el plan —
  los horarios traen todas las carreras; pasa a error en el Sprint 2, con `no-plan.json`.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Any

from cuatris import canon
from cuatris.validar.reporte import ERROR, WARNING, Hallazgo

HORA_MINIMA = "07:00"
"""Primera hora del dia en la que puede empezar un bloque."""

HORA_MAXIMA = "23:00"
"""Ultima hora del dia en la que puede terminar un bloque."""

DURACION_MAXIMA_MINUTOS = 8 * 60
"""Duracion maxima de un bloque; mas que esto es un error de carga, no una clase."""

MODALIDADES_CON_AULA = ("presencial", "blended")
"""Modalidades que ocupan fisicamente un aula: son las que pueden colisionar entre si."""

MODALIDAD_PRESENCIAL = "presencial"
"""Unica modalidad que exige una sede declarada."""

__all__ = [
    "DURACION_MAXIMA_MINUTOS",
    "HORA_MAXIMA",
    "HORA_MINIMA",
    "MODALIDADES_CON_AULA",
    "Contexto",
    "contexto_de_datos",
    "revisar",
]


@dataclass(frozen=True)
class Contexto:
    """Lo que C3 necesita de otros archivos para comprobar referencias cruzadas.

    Un campo en `None` significa «ese archivo no estaba»: las reglas que dependen de el no
    se comprueban. La ausencia de vocabulario se informa como advertencia; la del plan, no,
    porque en el Sprint 1 el plan solo aporta advertencias.
    """

    codigos: frozenset[str] | None = None
    """Codigos de materia de los planes cargados, o `None` si no se cargo ningun plan."""

    sedes: frozenset[str] | None = None
    """Identificadores de sede del vocabulario, o `None` si no se cargo el vocabulario."""


def contexto_de_datos(directorio: str | Path) -> Contexto:
    """Arma el contexto leyendo `v1/planes/*.json` y `v1/vocabulario.json` de un directorio.

    Falla ruidosamente si alguno de esos archivos existe pero no se puede leer: un contexto a
    medias convierte errores en silencios.
    """
    base = Path(directorio)
    codigos: set[str] = set()
    planes = sorted((base / "v1" / "planes").glob("*.json"))
    for ruta in planes:
        datos = canon.cargar(ruta)
        codigos.update(_codigos_de_materias(datos))
    ruta_vocabulario = base / "v1" / "vocabulario.json"
    sedes: frozenset[str] | None = None
    if ruta_vocabulario.is_file():
        vocabulario = canon.cargar(ruta_vocabulario)
        sedes = frozenset(_ids_de_sedes(vocabulario))
    return Contexto(frozenset(codigos) if planes else None, sedes)


def revisar(
    datos: Any, tipo: str, archivo: str, contexto: Contexto | None = None
) -> list[Hallazgo]:
    """Corre las invariantes que correspondan al tipo de archivo."""
    if tipo == "horarios":
        return _revisar_horarios(datos, archivo, contexto)
    if tipo == "planes":
        return _revisar_planes(datos, archivo)
    if tipo == "abreviaciones":
        return _revisar_abreviaciones(datos, archivo, contexto)
    return []


# --- utilidades --------------------------------------------------------------------------


def _texto(valor: Any) -> str | None:
    """Devuelve el valor si es un string; `None` si no lo es (C2 ya lo habria rechazado)."""
    return valor if isinstance(valor, str) else None


def _lista(valor: Any) -> list[Any]:
    """Devuelve la lista tal cual, o una vacia si el campo no es una lista."""
    return valor if isinstance(valor, list) else []


def _minutos(hora: str) -> int | None:
    """Convierte `HH:MM` a minutos desde la medianoche."""
    partes = hora.split(":")
    if len(partes) != 2 or not all(parte.isdigit() for parte in partes):
        return None
    return int(partes[0]) * 60 + int(partes[1])


def _se_solapan(desde_a: int, hasta_a: int, desde_b: int, hasta_b: int) -> bool:
    """Indica si dos intervalos se pisan; tocarse por el extremo no es solaparse."""
    return desde_a < hasta_b and desde_b < hasta_a


def _se_solapan_fechas(desde_a: str, hasta_a: str, desde_b: str, hasta_b: str) -> bool:
    """Indica si dos periodos de dictado comparten al menos un dia (fechas ISO, inclusivas)."""
    return desde_a <= hasta_b and desde_b <= hasta_a


def _codigos_de_materias(plan: Any) -> list[str]:
    """Codigos de las materias de un plan, en el orden del archivo."""
    if not isinstance(plan, dict):
        return []
    codigos = []
    for materia in _lista(plan.get("materias")):
        if isinstance(materia, dict):
            codigo = _texto(materia.get("codigo"))
            if codigo is not None:
                codigos.append(codigo)
    return codigos


def _ids_de_sedes(vocabulario: Any) -> list[str]:
    """Identificadores de sede del vocabulario, en el orden del archivo."""
    if not isinstance(vocabulario, dict):
        return []
    ids = []
    for sede in _lista(vocabulario.get("sedes")):
        if isinstance(sede, dict):
            identificador = _texto(sede.get("id"))
            if identificador is not None:
                ids.append(identificador)
    return ids


# --- horarios ----------------------------------------------------------------------------


@dataclass(frozen=True)
class _Bloque:
    """Un bloque horario con el curso y la comision a los que pertenece, ya aplanado."""

    codigo: str
    comision: str
    dia: str
    desde: int
    hasta: int
    texto_desde: str
    texto_hasta: str
    sede: str | None
    modalidad: str
    aulas: tuple[str, ...]
    docentes: tuple[str, ...]
    curso_desde: str
    curso_hasta: str

    @property
    def etiqueta(self) -> str:
        """Como se nombra este bloque en un mensaje: «93.18 com. A»."""
        return f"{self.codigo} com. {self.comision}"

    @property
    def franja(self) -> str:
        """La franja horaria tal como esta en el archivo."""
        return f"{self.texto_desde}-{self.texto_hasta}"


def _revisar_horarios(datos: Any, archivo: str, contexto: Contexto | None) -> list[Hallazgo]:
    """Invariantes de `data/v1/horarios/<periodo>.json`."""
    if not isinstance(datos, dict):
        return []
    hallazgos: list[Hallazgo] = []
    periodo = datos.get("periodo") if isinstance(datos.get("periodo"), dict) else {}
    cursos = [curso for curso in _lista(datos.get("cursos")) if isinstance(curso, dict)]

    hallazgos.extend(_revisar_periodo(periodo, archivo))
    hallazgos.extend(_revisar_identidades(cursos, archivo))
    hallazgos.extend(_revisar_fechas_de_cursos(cursos, periodo, archivo))
    hallazgos.extend(_revisar_dictado_conjunto(cursos, archivo))

    bloques: list[_Bloque] = []
    for curso in cursos:
        bloques.extend(_bloques_del_curso(curso))

    hallazgos.extend(_revisar_franjas(bloques, archivo))
    hallazgos.extend(_revisar_sedes(bloques, archivo, contexto))
    hallazgos.extend(_revisar_colisiones_de_aula(bloques, cursos, archivo))
    hallazgos.extend(_revisar_colisiones_de_docente(bloques, archivo))
    hallazgos.extend(_revisar_ocupacion(cursos, archivo))
    hallazgos.extend(_revisar_codigos_contra_el_plan(cursos, archivo, contexto))
    return hallazgos


def _bloques_del_curso(curso: dict[str, Any]) -> list[_Bloque]:
    """Aplana las comisiones y los bloques de un curso en registros comparables."""
    codigo = _texto(curso.get("codigo"))
    curso_desde = _texto(curso.get("desde"))
    curso_hasta = _texto(curso.get("hasta"))
    if codigo is None or curso_desde is None or curso_hasta is None:
        return []
    bloques: list[_Bloque] = []
    for comision in _lista(curso.get("comisiones")):
        if not isinstance(comision, dict):
            continue
        identificador = _texto(comision.get("id"))
        if identificador is None:
            continue
        docentes = tuple(
            docente for docente in _lista(comision.get("docentes")) if isinstance(docente, str)
        )
        for bloque in _lista(comision.get("bloques")):
            if not isinstance(bloque, dict):
                continue
            dia = _texto(bloque.get("dia"))
            texto_desde = _texto(bloque.get("desde"))
            texto_hasta = _texto(bloque.get("hasta"))
            modalidad = _texto(bloque.get("modalidad"))
            if dia is None or texto_desde is None or texto_hasta is None or modalidad is None:
                continue
            desde = _minutos(texto_desde)
            hasta = _minutos(texto_hasta)
            if desde is None or hasta is None:
                continue
            bloques.append(
                _Bloque(
                    codigo=codigo,
                    comision=identificador,
                    dia=dia,
                    desde=desde,
                    hasta=hasta,
                    texto_desde=texto_desde,
                    texto_hasta=texto_hasta,
                    sede=_texto(bloque.get("sede")),
                    modalidad=modalidad,
                    aulas=tuple(
                        aula for aula in _lista(bloque.get("aulas")) if isinstance(aula, str)
                    ),
                    docentes=docentes,
                    curso_desde=curso_desde,
                    curso_hasta=curso_hasta,
                )
            )
    return bloques


def _revisar_periodo(periodo: dict[str, Any], archivo: str) -> list[Hallazgo]:
    """`periodo.id` es exactamente `<anio>-<cuatrimestre>`.

    Los tres campos tienen patrones independientes en el schema, que no puede relacionarlos:
    un archivo con `id: "2026-2C"`, `anio: 2019` y `cuatrimestre: "1C"` cumple los tres y no
    describe ningun cuatrimestre.
    """
    identificador = _texto(periodo.get("id"))
    cuatrimestre = _texto(periodo.get("cuatrimestre"))
    anio = periodo.get("anio")
    if identificador is None or cuatrimestre is None or not isinstance(anio, int):
        return []
    esperado = f"{anio}-{cuatrimestre}"
    if identificador == esperado:
        return []
    return [
        Hallazgo(
            ERROR,
            "periodo-incoherente",
            archivo,
            f"el periodo declara «id: {identificador}» con «anio: {anio}» y «cuatrimestre: "
            f"{cuatrimestre}»; el id de ese cuatrimestre es «{esperado}»",
        )
    ]


def _revisar_dictado_conjunto(cursos: list[dict[str, Any]], archivo: str) -> list[Hallazgo]:
    """Todo codigo de `dictado_conjunto` es un curso del mismo archivo.

    Es advertencia por la misma razon que `codigo-fuera-del-plan` (S-02): los horarios traen
    todas las carreras y el par exento podria estar en otro archivo. Pero conviene decirlo,
    porque `dictado_conjunto` es la unica lista blanca de `colision-de-aula`: un codigo mal
    tipeado ahi apaga la deteccion del par que se queria eximir y nadie se entera.
    """
    presentes = {codigo for curso in cursos if (codigo := _texto(curso.get("codigo"))) is not None}
    hallazgos: list[Hallazgo] = []
    vistos: set[tuple[str, str]] = set()
    for curso in cursos:
        codigo = _texto(curso.get("codigo")) or "?"
        for otro in _lista(curso.get("dictado_conjunto")):
            if not isinstance(otro, str) or otro in presentes or (codigo, otro) in vistos:
                continue
            vistos.add((codigo, otro))
            hallazgos.append(
                Hallazgo(
                    WARNING,
                    "dictado-conjunto-inexistente",
                    archivo,
                    f"el curso «{codigo}» se dicta en conjunto con «{otro}», que no es un "
                    "curso de este archivo; «colision-de-aula» no revisa ese par",
                )
            )
    return hallazgos


def _revisar_identidades(cursos: list[dict[str, Any]], archivo: str) -> list[Hallazgo]:
    """`codigo` unico en el archivo y `id` de comision unico dentro de cada curso."""
    hallazgos: list[Hallazgo] = []
    vistos: set[str] = set()
    for curso in cursos:
        codigo = _texto(curso.get("codigo"))
        if codigo is None:
            continue
        if codigo in vistos:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "codigo-duplicado",
                    archivo,
                    f"el codigo «{codigo}» aparece en mas de un curso; la identidad de un "
                    "curso es su codigo, nunca su nombre",
                )
            )
        vistos.add(codigo)
        comisiones: set[str] = set()
        for comision in _lista(curso.get("comisiones")):
            if not isinstance(comision, dict):
                continue
            identificador = _texto(comision.get("id"))
            if identificador is None:
                continue
            if identificador in comisiones:
                hallazgos.append(
                    Hallazgo(
                        ERROR,
                        "comision-duplicada",
                        archivo,
                        f"el curso «{codigo}» repite la comision «{identificador}»",
                    )
                )
            comisiones.add(identificador)
    return hallazgos


def _revisar_fechas_de_cursos(
    cursos: list[dict[str, Any]], periodo: dict[str, Any], archivo: str
) -> list[Hallazgo]:
    """`desde`/`hasta` de cada curso, dentro del periodo del archivo; los cortos son validos."""
    hallazgos: list[Hallazgo] = []
    periodo_desde = _texto(periodo.get("desde"))
    periodo_hasta = _texto(periodo.get("hasta"))
    for curso in cursos:
        codigo = _texto(curso.get("codigo")) or "?"
        desde = _texto(curso.get("desde"))
        hasta = _texto(curso.get("hasta"))
        if desde is None or hasta is None:
            continue
        if desde > hasta:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "curso-invertido",
                    archivo,
                    f"el curso «{codigo}» empieza el {desde} y termina el {hasta}",
                )
            )
            continue
        if periodo_desde is None or periodo_hasta is None:
            continue
        if desde < periodo_desde or hasta > periodo_hasta:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "curso-fuera-del-periodo",
                    archivo,
                    f"el curso «{codigo}» va del {desde} al {hasta} y el periodo va del "
                    f"{periodo_desde} al {periodo_hasta}",
                )
            )
    return hallazgos


def _revisar_franjas(bloques: list[_Bloque], archivo: str) -> list[Hallazgo]:
    """`desde < hasta`, ambos dentro del rango horario, y duracion razonable."""
    hallazgos: list[Hallazgo] = []
    minimo = _minutos(HORA_MINIMA) or 0
    maximo = _minutos(HORA_MAXIMA) or 0
    for bloque in bloques:
        if bloque.desde >= bloque.hasta:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "bloque-invertido",
                    archivo,
                    f"{bloque.etiqueta}: el bloque del {bloque.dia} va de {bloque.texto_desde} "
                    f"a {bloque.texto_hasta}",
                )
            )
            continue
        if bloque.desde < minimo or bloque.hasta > maximo:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "franja-fuera-de-rango",
                    archivo,
                    f"{bloque.etiqueta}: el bloque del {bloque.dia} ({bloque.franja}) cae fuera "
                    f"de {HORA_MINIMA}-{HORA_MAXIMA}",
                )
            )
            continue
        if bloque.hasta - bloque.desde > DURACION_MAXIMA_MINUTOS:
            horas = (bloque.hasta - bloque.desde) / 60
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "bloque-demasiado-largo",
                    archivo,
                    f"{bloque.etiqueta}: el bloque del {bloque.dia} ({bloque.franja}) dura "
                    f"{horas:g} h y el maximo es {DURACION_MAXIMA_MINUTOS // 60} h",
                )
            )
    return hallazgos


def _revisar_sedes(
    bloques: list[_Bloque], archivo: str, contexto: Contexto | None
) -> list[Hallazgo]:
    """La sede existe en el vocabulario y solo es `null` si la modalidad no es presencial."""
    hallazgos: list[Hallazgo] = []
    for bloque in bloques:
        if bloque.sede is None and bloque.modalidad == MODALIDAD_PRESENCIAL:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "sede-nula-presencial",
                    archivo,
                    f"{bloque.etiqueta}: el bloque del {bloque.dia} ({bloque.franja}) es "
                    "presencial y no declara sede",
                )
            )
    declaradas = [bloque for bloque in bloques if bloque.sede is not None]
    if contexto is None or not declaradas:
        return hallazgos
    if contexto.sedes is None:
        hallazgos.append(
            Hallazgo(
                WARNING,
                "sin-vocabulario",
                archivo,
                "no se encontro «v1/vocabulario.json»: las sedes quedan sin comprobar",
            )
        )
        return hallazgos
    desconocidas: list[str] = []
    for bloque in declaradas:
        if bloque.sede not in contexto.sedes and bloque.sede not in desconocidas:
            desconocidas.append(bloque.sede)
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "sede-desconocida",
                    archivo,
                    f"{bloque.etiqueta}: la sede «{bloque.sede}» no existe en "
                    "«v1/vocabulario.json»",
                )
            )
    return hallazgos


def _dictado_conjunto(cursos: list[dict[str, Any]]) -> dict[str, set[str]]:
    """Mapa `codigo -> codigos con los que se dicta en conjunto`, simetrico."""
    conjunto: dict[str, set[str]] = {}
    for curso in cursos:
        codigo = _texto(curso.get("codigo"))
        if codigo is None:
            continue
        companeros = {
            otro for otro in _lista(curso.get("dictado_conjunto")) if isinstance(otro, str)
        }
        conjunto.setdefault(codigo, set()).update(companeros)
        for otro in companeros:
            conjunto.setdefault(otro, set()).add(codigo)
    return conjunto


def _revisar_colisiones_de_aula(
    bloques: list[_Bloque], cursos: list[dict[str, Any]], archivo: str
) -> list[Hallazgo]:
    """Dos cursos distintos no pueden ocupar la misma aula el mismo dia a la misma hora.

    Quedan fuera los bloques que no ocupan aula (virtuales o con `aulas: []`), los pares
    declarados en `dictado_conjunto` de cualquiera de los dos cursos, los cursos cuyos
    periodos de dictado no se pisan, y el mismo curso consigo mismo: una comision en dos
    aulas simultaneas es un caso real y valido.
    """
    conjunto = _dictado_conjunto(cursos)
    por_aula: dict[tuple[str, str, str], list[_Bloque]] = {}
    for bloque in bloques:
        if bloque.modalidad not in MODALIDADES_CON_AULA or bloque.sede is None:
            continue
        for aula in bloque.aulas:
            por_aula.setdefault((bloque.sede, aula, bloque.dia), []).append(bloque)
    hallazgos: list[Hallazgo] = []
    for (sede, aula, dia), lista in sorted(por_aula.items()):
        ordenados = sorted(lista, key=lambda b: (b.codigo, b.comision, b.desde, b.hasta))
        for uno, otro in combinations(ordenados, 2):
            if uno.codigo == otro.codigo:
                continue
            if otro.codigo in conjunto.get(uno.codigo, set()):
                continue
            if not _se_solapan(uno.desde, uno.hasta, otro.desde, otro.hasta):
                continue
            if not _se_solapan_fechas(
                uno.curso_desde, uno.curso_hasta, otro.curso_desde, otro.curso_hasta
            ):
                continue
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "colision-de-aula",
                    archivo,
                    f"{uno.etiqueta} ({uno.franja}) y {otro.etiqueta} ({otro.franja}) ocupan "
                    f"el aula «{aula}» de «{sede}» el mismo {dia}",
                )
            )
    return hallazgos


def _revisar_colisiones_de_docente(bloques: list[_Bloque], archivo: str) -> list[Hallazgo]:
    """Un docente en dos cursos distintos a la misma hora: advertencia, nunca error.

    Los homonimos y los titulares nominales de varias comisiones son reales; rechazarlos
    convierte el validador en una fuente de falsos positivos.
    """
    por_docente: dict[tuple[str, str], list[_Bloque]] = {}
    for bloque in bloques:
        for docente in bloque.docentes:
            por_docente.setdefault((docente, bloque.dia), []).append(bloque)
    hallazgos: list[Hallazgo] = []
    for (docente, dia), lista in sorted(por_docente.items()):
        ordenados = sorted(lista, key=lambda b: (b.codigo, b.comision, b.desde, b.hasta))
        for uno, otro in combinations(ordenados, 2):
            if uno.codigo == otro.codigo:
                continue
            if not _se_solapan(uno.desde, uno.hasta, otro.desde, otro.hasta):
                continue
            if not _se_solapan_fechas(
                uno.curso_desde, uno.curso_hasta, otro.curso_desde, otro.curso_hasta
            ):
                continue
            hallazgos.append(
                Hallazgo(
                    WARNING,
                    "colision-de-docente",
                    archivo,
                    f"«{docente}» figura el {dia} en {uno.etiqueta} ({uno.franja}) y en "
                    f"{otro.etiqueta} ({otro.franja})",
                )
            )
    return hallazgos


def _revisar_ocupacion(cursos: list[dict[str, Any]], archivo: str) -> list[Hallazgo]:
    """`inscriptos > capacidad` es advertencia: el sobrecupo existe.

    `inscriptos == capacidad` es el caso normal de una comision llena (93.18 com. A, 48/48).
    """
    hallazgos: list[Hallazgo] = []
    for curso in cursos:
        codigo = _texto(curso.get("codigo")) or "?"
        for comision in _lista(curso.get("comisiones")):
            if not isinstance(comision, dict):
                continue
            cupo = comision.get("cupo")
            ocupacion = comision.get("ocupacion")
            if not isinstance(cupo, dict) or not isinstance(ocupacion, dict):
                continue
            capacidad = cupo.get("capacidad")
            inscriptos = ocupacion.get("inscriptos")
            if not isinstance(capacidad, int) or not isinstance(inscriptos, int):
                continue
            if inscriptos > capacidad:
                identificador = _texto(comision.get("id")) or "?"
                hallazgos.append(
                    Hallazgo(
                        WARNING,
                        "sobrecupo",
                        archivo,
                        f"{codigo} com. {identificador}: {inscriptos} inscriptos para una "
                        f"capacidad de {capacidad}",
                    )
                )
    return hallazgos


def _revisar_codigos_contra_el_plan(
    cursos: list[dict[str, Any]], archivo: str, contexto: Contexto | None
) -> list[Hallazgo]:
    """Un codigo de horarios que no esta en el plan es advertencia en el Sprint 1 (S-02)."""
    if contexto is None or contexto.codigos is None:
        return []
    hallazgos: list[Hallazgo] = []
    for curso in cursos:
        codigo = _texto(curso.get("codigo"))
        if codigo is None or codigo in contexto.codigos:
            continue
        hallazgos.append(
            Hallazgo(
                WARNING,
                "codigo-fuera-del-plan",
                archivo,
                f"el codigo «{codigo}» no figura en el plan de estudios; los horarios traen "
                "todas las carreras",
            )
        )
    return hallazgos


# --- planes ------------------------------------------------------------------------------


def _revisar_planes(datos: Any, archivo: str) -> list[Hallazgo]:
    """Invariantes de `data/v1/planes/<plan>.json`."""
    if not isinstance(datos, dict):
        return []
    materias = [materia for materia in _lista(datos.get("materias")) if isinstance(materia, dict)]
    hallazgos: list[Hallazgo] = []
    hallazgos.extend(_revisar_codigos_del_plan(materias, archivo))
    hallazgos.extend(_revisar_correlativas(materias, archivo))
    hallazgos.extend(_revisar_cuatrimestres(materias, archivo))
    hallazgos.extend(_revisar_minors(datos, materias, archivo))
    hallazgos.extend(_revisar_creditos(datos, materias, archivo))
    hallazgos.extend(_revisar_titulos(datos, archivo))
    return hallazgos


def _revisar_codigos_del_plan(materias: list[dict[str, Any]], archivo: str) -> list[Hallazgo]:
    """El codigo identifica a la materia: no puede repetirse, aunque el nombre si."""
    hallazgos: list[Hallazgo] = []
    vistos: set[str] = set()
    for materia in materias:
        codigo = _texto(materia.get("codigo"))
        if codigo is None:
            continue
        if codigo in vistos:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "materia-duplicada",
                    archivo,
                    f"el codigo «{codigo}» aparece en mas de una materia del plan",
                )
            )
        vistos.add(codigo)
    return hallazgos


def _revisar_correlativas(materias: list[dict[str, Any]], archivo: str) -> list[Hallazgo]:
    """Toda correlativa existe en el plan y el grafo es aciclico.

    Un ciclo cuelga al planificador: es «tirar todo abajo» en su forma literal.
    """
    grafo: dict[str, list[str]] = {}
    for materia in materias:
        codigo = _texto(materia.get("codigo"))
        if codigo is None:
            continue
        grafo.setdefault(codigo, [])
        grafo[codigo].extend(
            correlativa
            for correlativa in _lista(materia.get("correlativas"))
            if isinstance(correlativa, str)
        )
    hallazgos: list[Hallazgo] = []
    for codigo, correlativas in grafo.items():
        for correlativa in correlativas:
            if correlativa not in grafo:
                hallazgos.append(
                    Hallazgo(
                        ERROR,
                        "correlativa-inexistente",
                        archivo,
                        f"la materia «{codigo}» declara la correlativa «{correlativa}», que no "
                        "existe en el plan",
                    )
                )
    ciclo = _ciclo_de_correlativas(grafo)
    if ciclo is not None:
        hallazgos.append(
            Hallazgo(
                ERROR,
                "correlativas-ciclicas",
                archivo,
                "el grafo de correlativas tiene un ciclo: " + " -> ".join(ciclo),
            )
        )
    return hallazgos


def _ciclo_de_correlativas(grafo: dict[str, list[str]]) -> list[str] | None:
    """Devuelve el primer ciclo encontrado, como camino cerrado, o `None` si no hay ninguno.

    Recorrido en profundidad iterativo: un plan con miles de materias no puede depender del
    limite de recursion del interprete.
    """
    estado: dict[str, int] = {}
    padre: dict[str, str] = {}
    for raiz in grafo:
        if estado.get(raiz, 0) != 0:
            continue
        estado[raiz] = 1
        pila: list[tuple[str, Any]] = [(raiz, iter(grafo[raiz]))]
        while pila:
            nodo, hijos = pila[-1]
            for hijo in hijos:
                if hijo not in grafo:
                    continue
                color = estado.get(hijo, 0)
                if color == 1:
                    camino = [nodo]
                    actual = nodo
                    while actual != hijo:
                        actual = padre[actual]
                        camino.append(actual)
                    camino.reverse()
                    camino.append(hijo)
                    return camino
                if color == 0:
                    estado[hijo] = 1
                    padre[hijo] = nodo
                    pila.append((hijo, iter(grafo[hijo])))
                    break
            else:
                estado[nodo] = 2
                pila.pop()
    return None


def _revisar_cuatrimestres(materias: list[dict[str, Any]], archivo: str) -> list[Hallazgo]:
    """`cuatrimestre_sugerido` es nulo si y solo si la materia es electiva."""
    hallazgos: list[Hallazgo] = []
    for materia in materias:
        codigo = _texto(materia.get("codigo")) or "?"
        ciclo = _texto(materia.get("ciclo"))
        if ciclo is None:
            continue
        sugerido = materia.get("cuatrimestre_sugerido")
        if ciclo == "electiva" and sugerido is not None:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "cuatrimestre-incoherente",
                    archivo,
                    f"la materia «{codigo}» es electiva y declara «cuatrimestre_sugerido»: "
                    f"{sugerido}",
                )
            )
        elif ciclo != "electiva" and sugerido is None:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "cuatrimestre-incoherente",
                    archivo,
                    f"la materia «{codigo}» es del ciclo «{ciclo}» y no declara "
                    "«cuatrimestre_sugerido»",
                )
            )
    return hallazgos


def _revisar_minors(
    datos: dict[str, Any], materias: list[dict[str, Any]], archivo: str
) -> list[Hallazgo]:
    """Toda sigla de minor esta declarada en `minors[]`, y solo las electivas declaran alguna.

    Un minor se arma con electivas: `minors` vacio en las obligatorias es lo que fija el
    contrato. Una obligatoria con siglas aparece con chips de minor en la pantalla del plan y
    suma a los creditos de ese minor, que es una carrera distinta de la que el estudiante ve.
    """
    siglas = {
        sigla
        for minor in _lista(datos.get("minors"))
        if isinstance(minor, dict) and (sigla := _texto(minor.get("sigla"))) is not None
    }
    hallazgos: list[Hallazgo] = []
    for materia in materias:
        codigo = _texto(materia.get("codigo")) or "?"
        declaradas = [sigla for sigla in _lista(materia.get("minors")) if isinstance(sigla, str)]
        for sigla in declaradas:
            if sigla not in siglas:
                hallazgos.append(
                    Hallazgo(
                        ERROR,
                        "minor-inexistente",
                        archivo,
                        f"la materia «{codigo}» declara el minor «{sigla}», que no esta en "
                        "«minors»",
                    )
                )
        ciclo = _texto(materia.get("ciclo"))
        if declaradas and ciclo is not None and ciclo != "electiva":
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "minor-en-obligatoria",
                    archivo,
                    f"la materia «{codigo}» es del ciclo «{ciclo}» y declara los minors "
                    f"{', '.join(declaradas)}; solo las electivas cuentan para un minor",
                )
            )
    return hallazgos


def _creditos_del_plan(datos: dict[str, Any], materias: list[dict[str, Any]]) -> int:
    """Creditos que ofrece el plan entero: el techo contra el que se miden los requisitos.

    Son los que suman las materias listadas, y nunca menos que los que exige el titulo mas
    alto del plan: un plan que declara un titulo de N creditos ofrece al menos N. Esa segunda
    mitad es la que evita el falso positivo con un archivo que lista solo una parte de sus
    materias —como el plan de ejemplo de `CONTRATO-v1.md` §4, que trae una sola—: ahi la regla
    saltaria por lo que falta, no por lo que esta mal.
    """
    total = sum(
        materia["creditos"] for materia in materias if isinstance(materia.get("creditos"), int)
    )
    titulos = [
        titulo["creditos"]
        for titulo in _lista(datos.get("titulos"))
        if isinstance(titulo, dict) and isinstance(titulo.get("creditos"), int)
    ]
    return max([total, *titulos])


def _revisar_creditos(
    datos: dict[str, Any], materias: list[dict[str, Any]], archivo: str
) -> list[Hallazgo]:
    """Ningun `creditos_requeridos` puede pedir mas creditos que los que ofrece el plan."""
    total = _creditos_del_plan(datos, materias)
    hallazgos: list[Hallazgo] = []
    electivas = datos.get("electivas")
    if isinstance(electivas, dict) and isinstance(electivas.get("creditos_requeridos"), int):
        requeridos = electivas["creditos_requeridos"]
        if requeridos > total:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "creditos-requeridos-excesivos",
                    archivo,
                    f"«electivas» exige {requeridos} creditos y el plan entero ofrece {total}",
                )
            )
    for materia in materias:
        requeridos = materia.get("creditos_requeridos")
        if not isinstance(requeridos, int) or requeridos <= total:
            continue
        codigo = _texto(materia.get("codigo")) or "?"
        hallazgos.append(
            Hallazgo(
                ERROR,
                "creditos-requeridos-excesivos",
                archivo,
                f"la materia «{codigo}» exige {requeridos} creditos aprobados y el plan "
                f"entero ofrece {total}",
            )
        )
    return hallazgos


def _revisar_titulos(datos: dict[str, Any], archivo: str) -> list[Hallazgo]:
    """Ningun titulo intermedio exige mas creditos que el principal; si los exige, advertencia.

    La comparacion sale del campo `tipo`, no del orden del arreglo: un plan que liste primero
    el titulo principal es raro pero valido, y no puede producir una advertencia falsa.
    """
    titulos = [
        titulo
        for titulo in _lista(datos.get("titulos"))
        if isinstance(titulo, dict) and isinstance(titulo.get("creditos"), int)
    ]
    principales = [titulo for titulo in titulos if _texto(titulo.get("tipo")) == "principal"]
    if not principales:
        return []
    principal = principales[0]
    id_principal = _texto(principal.get("id")) or "?"
    creditos_principal = principal["creditos"]
    hallazgos: list[Hallazgo] = []
    for titulo in titulos:
        if _texto(titulo.get("tipo")) != "intermedio":
            continue
        creditos = titulo["creditos"]
        if creditos <= creditos_principal:
            continue
        identificador = _texto(titulo.get("id")) or "?"
        hallazgos.append(
            Hallazgo(
                WARNING,
                "titulos-creditos-decrecientes",
                archivo,
                f"el titulo intermedio «{identificador}» exige {creditos} creditos, mas que "
                f"el principal «{id_principal}», que exige {creditos_principal}",
            )
        )
    return hallazgos


# --- abreviaciones -----------------------------------------------------------------------


def _revisar_abreviaciones(datos: Any, archivo: str, contexto: Contexto | None) -> list[Hallazgo]:
    """Invariantes de `data/v1/abreviaciones.json`."""
    if not isinstance(datos, dict):
        return []
    abreviaciones = datos.get("abreviaciones")
    if not isinstance(abreviaciones, dict):
        return []
    hallazgos: list[Hallazgo] = []
    por_valor: dict[str, str] = {}
    for codigo, valor in abreviaciones.items():
        if not isinstance(valor, str):
            continue
        if valor in por_valor:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "abreviacion-duplicada",
                    archivo,
                    f"la abreviacion «{valor}» esta en «{por_valor[valor]}» y en «{codigo}»; "
                    "las abreviaciones son unicas",
                )
            )
        else:
            por_valor[valor] = codigo
    if contexto is None or contexto.codigos is None:
        return hallazgos
    for codigo in abreviaciones:
        if codigo not in contexto.codigos:
            hallazgos.append(
                Hallazgo(
                    ERROR,
                    "abreviacion-sin-materia",
                    archivo,
                    f"el codigo «{codigo}» tiene abreviacion pero no existe en el plan",
                )
            )
    for codigo in sorted(contexto.codigos):
        if codigo not in abreviaciones:
            hallazgos.append(
                Hallazgo(
                    WARNING,
                    "materia-sin-abreviacion",
                    archivo,
                    f"la materia «{codigo}» del plan no tiene abreviacion",
                )
            )
    return hallazgos
