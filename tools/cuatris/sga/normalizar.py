"""Normalizacion de los textos del SGA a los valores del contrato v1.

Cada mapeo tiene como clave el texto **tal como lo muestra el SGA** (o el Excel de
electivas, cuando el contrato lo documenta asi) y como valor el identificador del contrato.
Un texto que ningun mapeo reconoce levanta `ValorDesconocido` con el original: el scraper
nunca debe escribir un campo vacio en silencio.

La busqueda es tolerante a mayusculas, a los acentos y a los espacios repetidos, porque son
lo unico que el SGA cambia sin avisar entre despliegues. Cualquier otra diferencia (una
palabra nueva, una abreviatura distinta) es un valor desconocido y hay que agregarlo aqui a
mano, despues de verlo en el material.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from datetime import date

__all__ = [
    "CUATRIMESTRES",
    "DIAS",
    "MODALIDADES",
    "SEDES",
    "SUFIJOS_AVISADOS",
    "ValorDesconocido",
    "clave",
    "cuatrimestre",
    "dia",
    "fecha",
    "hora",
    "modalidad",
    "periodo",
    "sede",
]

REGISTRO = logging.getLogger("cuatris.sga")


class ValorDesconocido(ValueError):
    """El SGA trajo un valor que ningun mapeo reconoce."""

    def __init__(self, campo: str, valor: object) -> None:
        self.campo = campo
        self.valor = valor
        super().__init__(
            f"Valor de {campo} no reconocido en el SGA: {valor!r}. "
            "Si es legitimo, agregue el mapeo en tools/cuatris/sga/normalizar.py."
        )


#: Dias de la semana. `Domingo` aparece de verdad en el SGA (61.27 en la corrida del
#: 2026-09-12: una hora asincronica los domingos) y el contrato 1.1.0 lo admite.
DIAS: dict[str, str] = {
    "Lunes": "lunes",
    "Martes": "martes",
    "Miércoles": "miercoles",
    "Jueves": "jueves",
    "Viernes": "viernes",
    "Sábado": "sabado",
    "Domingo": "domingo",
}

#: Modalidades. La etiqueta del SGA dice «Aula externa» pero el valor es la modalidad.
#: `Virtual sincrónico` es la forma vista en el HTML del SGA (72.44 comision S);
#: `Virtual Sinc.` y `Virtual Asinc.` son las formas que documenta el contrato para el
#: Excel de electivas.
MODALIDADES: dict[str, str] = {
    "Presencial": "presencial",
    "Virtual Sinc.": "virtual_sincronica",
    "Virtual sincrónico": "virtual_sincronica",
    "Virtual Asinc.": "virtual_asincronica",
    # Vistos en la corrida real del 2026-09-12: el detalle usa el adjetivo completo, en
    # masculino y en femenino segun el curso.
    "Virtual asincrónico": "virtual_asincronica",
    "Virtual asincrónica": "virtual_asincronica",
    "Virtual sincrónica": "virtual_sincronica",
    # Vista en la corrida real del 2026-09-12 (25.20 comision K): el SGA dice «Virtual» a
    # secas y **no aclara si es sincronica**. No se asume: el contrato 1.1.0 tiene el valor
    # `virtual` justamente para esto.
    "Virtual": "virtual",
    "Blended": "blended",
}

_MODALIDAD_CON_SUFIJO = re.compile(r"^(?P<base>.+?)\s+-\s+(?P<sufijo>.+)$")

SUFIJOS_AVISADOS: set[str] = set()
"""Textos de modalidad con sufijo que ya se avisaron en esta corrida.

Un barrido son ~472 cursos y el mismo texto («Presencial - SDR») aparece en decenas: el
aviso sirve una vez, quinientas veces es ruido que tapa todo lo demas. Los tests que
comprueban el aviso vacian este conjunto antes de correr.
"""

#: Sedes. Los ids son los de `data/v1/vocabulario.json`.
SEDES: dict[str, str] = {
    "Sede Rectorado": "rectorado",
    "Rectorado": "rectorado",
    "SDT": "sdt",
    "SDF": "sdf",
    # Nombres completos: el detalle de un curso los muestra asi (corrida real del 2026-09-12).
    "Sede Distrito Tecnologico": "sdt",
    "Sede Distrito Financiero": "sdf",
}

#: Cuatrimestres del filtro «Período» del listado de cursos. `Verano` y `Especial`
#: aparecen en el desplegable del SGA pero el contrato no los representa: son
#: `ValorDesconocido` a proposito.
CUATRIMESTRES: dict[str, str] = {
    "Primer Cuat.": "1C",
    "Segundo Cuat.": "2C",
}

_HORA = re.compile(r"^(\d{1,2})(?::(\d{2}))?$")
_FECHA = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")


def clave(texto: str) -> str:
    """Clave de busqueda: sin acentos, sin mayusculas y con los espacios colapsados."""
    sin_acentos = "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"\s+", " ", sin_acentos).strip().casefold()


def _buscar(mapa: dict[str, str], campo: str, texto: object) -> str:
    if not isinstance(texto, str):
        raise ValorDesconocido(campo, texto)
    indice = {clave(origen): destino for origen, destino in mapa.items()}
    try:
        return indice[clave(texto)]
    except KeyError:
        raise ValorDesconocido(campo, texto) from None


def dia(texto: str) -> str:
    """`Lunes` -> `lunes`, `Miércoles` -> `miercoles`."""
    return _buscar(DIAS, "dia", texto)


def modalidad(texto: str) -> str:
    """`Presencial` -> `presencial`, `Virtual sincrónico` -> `virtual_sincronica`.

    El SGA agrega a veces un sufijo a una modalidad conocida para decir donde se dicta
    («Presencial - SDR», visto en 73.67 el 2026-09-12). Ese sufijo **no es parte de la
    modalidad** —la sede sale de «Aula ITBA:»— y el contrato no lo representa: se devuelve la
    modalidad conocida y se avisa una vez por texto distinto, para que quien mantenga el
    scraper vea el valor nuevo sin que la corrida se caiga por el. Cualquier otro texto sigue
    siendo `ValorDesconocido`: no se adivina.
    """
    if isinstance(texto, str):
        indice = {clave(origen): destino for origen, destino in MODALIDADES.items()}
        if clave(texto) not in indice:
            coincidencia = _MODALIDAD_CON_SUFIJO.match(texto.strip())
            base = clave(coincidencia.group("base")) if coincidencia else None
            if coincidencia and base in indice:
                if clave(texto) not in SUFIJOS_AVISADOS:
                    SUFIJOS_AVISADOS.add(clave(texto))
                    REGISTRO.warning(
                        "La modalidad «%s» del SGA se lee como «%s»: el sufijo «%s» se "
                        "ignora porque el contrato no lo representa. Si significa algo, "
                        "agregue el mapeo en tools/cuatris/sga/normalizar.py.",
                        texto.strip(),
                        indice[base],
                        coincidencia.group("sufijo").strip(),
                    )
                return indice[base]
    return _buscar(MODALIDADES, "modalidad", texto)


def sede(texto: str) -> str:
    """`Sede Rectorado` -> `rectorado`, `SDT` -> `sdt`."""
    return _buscar(SEDES, "sede", texto)


def cuatrimestre(texto: str) -> str:
    """`Segundo Cuat.` -> `2C`."""
    return _buscar(CUATRIMESTRES, "cuatrimestre", texto)


def hora(texto: str) -> str:
    """`14:00` o `14` -> `14:00`."""
    if not isinstance(texto, str):
        raise ValorDesconocido("hora", texto)
    coincidencia = _HORA.match(texto.strip())
    if coincidencia is None:
        raise ValorDesconocido("hora", texto)
    horas = int(coincidencia.group(1))
    minutos = int(coincidencia.group(2) or 0)
    if horas > 23 or minutos > 59:
        raise ValorDesconocido("hora", texto)
    return f"{horas:02d}:{minutos:02d}"


def fecha(texto: str) -> str:
    """`26/07/2026` -> `2026-07-26`."""
    if not isinstance(texto, str):
        raise ValorDesconocido("fecha", texto)
    coincidencia = _FECHA.match(texto.strip())
    if coincidencia is None:
        raise ValorDesconocido("fecha", texto)
    dias, meses, anios = (int(g) for g in coincidencia.groups())
    try:
        return date(anios, meses, dias).isoformat()
    except ValueError:
        raise ValorDesconocido("fecha", texto) from None


def periodo(texto_cuatrimestre: str, anio: int | str) -> str:
    """(`Segundo Cuat.`, 2026) -> `2026-2C`, el id de periodo del contrato."""
    if isinstance(anio, str):
        anio = anio.strip()
        if not re.fullmatch(r"\d{4}", anio):
            raise ValorDesconocido("anio", anio)
        anio = int(anio)
    if not isinstance(anio, int) or isinstance(anio, bool) or not 1000 <= anio <= 9999:
        raise ValorDesconocido("anio", anio)
    return f"{anio}-{cuatrimestre(texto_cuatrimestre)}"
