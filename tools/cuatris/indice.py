"""`cuatris indice actualizar`: reescribe `data/index.json` a partir de los archivos de datos.

`index.json` es la unica fuente de verdad sobre que archivos existen, con que hash y desde
cuando cada periodo esta activo: **publicar un archivo no lo activa**, lo activa su entrada en
el indice. Este comando es el unico que escribe esos hashes; C1 (`cuatris validar`) los
comprueba. Por eso el indice no se edita a mano.

    cuatris indice actualizar --data data
    cuatris indice actualizar --data data --publicado 2026-09-20

Que se recalcula y que se conserva:

- **Se recalcula** el `hash` de cada archivo referido y, para los horarios, el `periodo`, el
  `desde` y el `hasta`, que se leen del propio archivo: el archivo manda sobre el indice.
- **Se conserva** lo que este comando no puede deducir: el `publicado` de cada periodo que ya
  estaba en el indice, el mapa `horarios_esperados` (curado a mano) y el `contrato`.
- `actualizado` se conserva mientras el indice no cambie; cuando algo cambia pasa a ser la
  fecha de hoy o, si se paso, la de `--publicado`. Un indice que cambia sin cambiar su fecha
  miente sobre cuando se actualizo.
- Correr el comando dos veces seguidas no toca el archivo la segunda vez.

Falla ruidosamente —sin escribir nada— si falta el vocabulario, las abreviaciones o algun
archivo que el indice ya referia: un indice al que se le cae una entrada en silencio apaga
datos que la pagina estaba sirviendo. Tambien falla si sobra algo: un JSON dentro de `v1/`
que el comando no sabe indexar, o dos archivos de horarios que declaran el mismo periodo.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path
from typing import Any

from cuatris import canon

CONTRATO = "1.0.0"
"""Version del contrato que se escribe en un indice nuevo."""

NOMBRE_INDICE = "index.json"
"""Nombre del indice dentro del directorio de datos."""

RE_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
"""Fechas del contrato: `YYYY-MM-DD`, sin hora."""

AYUDA = "Recalcula data/index.json con los hashes de los archivos de datos."
"""Una linea de ayuda para `cuatris --help`."""

OK = 0
"""Codigo de salida cuando el indice quedo al dia."""

__all__ = ["ACCIONES", "AYUDA", "ErrorIndice", "actualizar", "configurar", "ejecutar"]


class ErrorIndice(Exception):
    """El directorio de datos no alcanza para construir un indice completo."""


def _fecha(valor: str, origen: str) -> str:
    """Comprueba que el texto sea una fecha `YYYY-MM-DD` real y la devuelve."""
    if not RE_FECHA.match(valor):
        raise ErrorIndice(f"{origen}: «{valor}» no tiene la forma YYYY-MM-DD")
    try:
        dt.date.fromisoformat(valor)
    except ValueError as exc:
        raise ErrorIndice(f"{origen}: «{valor}» no es una fecha valida ({exc})") from exc
    return valor


def _hoy() -> str:
    """La fecha de hoy en la forma del contrato."""
    return dt.date.today().isoformat()


def _leer(ruta: Path) -> Any:
    """Carga un archivo del contrato o explica por que no se pudo."""
    try:
        return canon.cargar(ruta)
    except OSError as exc:
        raise ErrorIndice(f"no se pudo abrir «{ruta}»: {exc.strerror or exc}") from exc
    except canon.ErrorCanonico as exc:
        raise ErrorIndice(f"«{ruta}» no se pudo leer: {exc}") from exc


def _hash(ruta: Path) -> str:
    """Hash canonico del archivo, con el mismo mensaje de error que el resto del comando."""
    try:
        return canon.hash_canonico(ruta)
    except OSError as exc:
        raise ErrorIndice(f"no se pudo abrir «{ruta}»: {exc.strerror or exc}") from exc
    except canon.ErrorCanonico as exc:
        raise ErrorIndice(f"«{ruta}» no se pudo leer: {exc}") from exc


def _relativa(base: Path, ruta: Path) -> str:
    """Ruta del archivo relativa al directorio de datos, siempre con barras normales."""
    return ruta.relative_to(base).as_posix()


def _archivo_unico(base: Path, relativa: str) -> dict[str, str]:
    """Entrada `{archivo, hash}` de un archivo que tiene que existir."""
    ruta = base / relativa
    if not ruta.is_file():
        raise ErrorIndice(f"falta «{relativa}»: el indice no puede quedar sin esa entrada")
    return {"archivo": relativa, "hash": _hash(ruta)}


def _entradas_de_planes(base: Path) -> list[dict[str, str]]:
    """Una entrada por archivo de `v1/planes/`, con el identificador que declara el archivo."""
    entradas = []
    for ruta in sorted((base / "v1" / "planes").glob("*.json")):
        datos = _leer(ruta)
        plan = datos.get("plan") if isinstance(datos, dict) else None
        if not isinstance(plan, str) or not plan:
            raise ErrorIndice(f"«{_relativa(base, ruta)}» no declara «plan»")
        entradas.append({"archivo": _relativa(base, ruta), "hash": _hash(ruta), "plan": plan})
    return entradas


def _publicados_previos(indice: dict[str, Any]) -> dict[str, str]:
    """Mapa `archivo -> publicado` del indice anterior; es el dato que no se puede deducir."""
    previos: dict[str, str] = {}
    for entrada in indice.get("horarios", []) if isinstance(indice, dict) else []:
        if not isinstance(entrada, dict):
            continue
        archivo = entrada.get("archivo")
        publicado = entrada.get("publicado")
        if isinstance(archivo, str) and isinstance(publicado, str):
            previos[archivo] = publicado
    return previos


def _entradas_de_horarios(base: Path, indice: dict[str, Any], fecha: str) -> list[dict[str, str]]:
    """Una entrada por archivo de `v1/horarios/`, leyendo `periodo` del propio archivo."""
    previos = _publicados_previos(indice)
    entradas = []
    vistos: dict[str, str] = {}
    for ruta in sorted((base / "v1" / "horarios").glob("*.json")):
        datos = _leer(ruta)
        periodo = datos.get("periodo") if isinstance(datos, dict) else None
        if not isinstance(periodo, dict):
            raise ErrorIndice(f"«{_relativa(base, ruta)}» no declara «periodo»")
        relativa = _relativa(base, ruta)
        faltantes = [clave for clave in ("id", "desde", "hasta") if not periodo.get(clave)]
        if faltantes:
            raise ErrorIndice(f"«{relativa}»: al periodo le faltan {', '.join(faltantes)}")
        identificador = str(periodo["id"])
        if identificador in vistos:
            raise ErrorIndice(
                f"el periodo «{identificador}» esta en dos archivos: "
                f"«{vistos[identificador]}» y «{relativa}»; la pagina sirve un solo archivo "
                "por periodo"
            )
        vistos[identificador] = relativa
        entradas.append(
            {
                "archivo": relativa,
                "desde": str(periodo["desde"]),
                "hash": _hash(ruta),
                "hasta": str(periodo["hasta"]),
                "periodo": str(periodo["id"]),
                "publicado": previos.get(relativa, fecha),
            }
        )
    return entradas


def _comprobar_referencias_previas(base: Path, indice: dict[str, Any]) -> None:
    """Ningun archivo que el indice ya referia puede haber desaparecido."""
    faltantes: list[str] = []
    for valor in indice.values():
        entradas = valor if isinstance(valor, list) else [valor]
        for entrada in entradas:
            if not isinstance(entrada, dict):
                continue
            archivo = entrada.get("archivo")
            if isinstance(archivo, str) and not (base / archivo).is_file():
                faltantes.append(archivo)
    if faltantes:
        raise ErrorIndice(
            "el indice refiere archivos que no existen: " + ", ".join(sorted(faltantes))
        )


def _archivos_referidos(indice: dict[str, Any]) -> set[str]:
    """Rutas relativas que el indice refiere, mire donde mire la entrada."""
    referidos: set[str] = set()
    for valor in indice.values():
        entradas = valor if isinstance(valor, list) else [valor]
        for entrada in entradas:
            if isinstance(entrada, dict) and isinstance(entrada.get("archivo"), str):
                referidos.add(entrada["archivo"])
    return referidos


def _comprobar_sobrantes(base: Path, nuevo: dict[str, Any]) -> None:
    """Ningun JSON de `v1/` puede quedar afuera del indice sin que nadie se entere.

    El indice es la unica lista de lo que la pagina sirve: un archivo que el comando no
    reconoce no se sirve, y si ademas se calla, nadie se entera de que esta ahi.
    """
    referidos = _archivos_referidos(nuevo)
    sobrantes = sorted(
        relativa
        for ruta in (base / "v1").rglob("*.json")
        if (relativa := _relativa(base, ruta)) not in referidos
    )
    if sobrantes:
        raise ErrorIndice(
            "hay archivos en «v1/» que el indice no sabe servir: "
            + ", ".join(sobrantes)
            + "; el indice solo reconoce «v1/abreviaciones.json», «v1/vocabulario.json», "
            "«v1/planes/*.json» y «v1/horarios/*.json»"
        )


def construir(base: Path, indice: dict[str, Any], fecha: str) -> dict[str, Any]:
    """Arma el indice nuevo a partir de los archivos de `base` y del indice anterior."""
    _comprobar_referencias_previas(base, indice)
    nuevo: dict[str, Any] = {
        "abreviaciones": _archivo_unico(base, "v1/abreviaciones.json"),
        "actualizado": indice.get("actualizado", fecha),
        "contrato": indice.get("contrato", CONTRATO),
        "horarios": _entradas_de_horarios(base, indice, fecha),
        "planes": _entradas_de_planes(base),
        "vocabulario": _archivo_unico(base, "v1/vocabulario.json"),
    }
    _comprobar_sobrantes(base, nuevo)
    esperados = indice.get("horarios_esperados")
    if isinstance(esperados, dict) and esperados:
        nuevo["horarios_esperados"] = esperados
    if nuevo != indice:
        nuevo["actualizado"] = fecha
    return nuevo


def actualizar(directorio: str | Path, publicado: str | None = None) -> tuple[Path, bool]:
    """Reescribe el indice del directorio de datos; devuelve `(ruta, si cambio)`."""
    base = Path(directorio)
    if not base.is_dir():
        raise ErrorIndice(f"«{base}» no es un directorio de datos")
    fecha = _fecha(publicado, "--publicado") if publicado is not None else _hoy()
    ruta = base / NOMBRE_INDICE
    anterior: dict[str, Any] = {}
    if ruta.is_file():
        cargado = _leer(ruta)
        if not isinstance(cargado, dict):
            raise ErrorIndice(f"«{ruta}» no es un objeto JSON")
        anterior = cargado
    nuevo = construir(base, anterior, fecha)
    if nuevo == anterior:
        return ruta, False
    ruta.write_text(canon.serializar(nuevo), encoding="utf-8", newline="\n")
    return ruta, True


def _comando_actualizar(args: argparse.Namespace) -> int:
    """Ejecuta `cuatris indice actualizar` e informa que paso."""
    ruta, cambio = actualizar(args.data, args.publicado)
    print(f"escrito {ruta}" if cambio else f"{ruta} ya estaba al dia")
    return OK


#: Acciones de `cuatris indice`, por si el parser se arma sin `set_defaults`.
ACCIONES = {"actualizar": _comando_actualizar}


def configurar(parser: argparse.ArgumentParser) -> None:
    """Argumentos de `cuatris indice`."""
    acciones = parser.add_subparsers(dest="accion", required=True, metavar="accion")
    actualizar_cmd = acciones.add_parser(
        "actualizar",
        help="Recalcula los hashes y las entradas de index.json.",
        description=AYUDA,
    )
    actualizar_cmd.add_argument(
        "--data",
        type=Path,
        default=Path("data"),
        help="Directorio de datos que contiene index.json y v1/. Por defecto «data».",
    )
    actualizar_cmd.add_argument(
        "--publicado",
        default=None,
        help=(
            "Fecha YYYY-MM-DD para las entradas nuevas y para «actualizado»; "
            "por defecto, la de hoy."
        ),
    )
    actualizar_cmd.set_defaults(funcion=_comando_actualizar, func=_comando_actualizar)


def ejecutar(args: argparse.Namespace) -> int:
    """Corre la accion elegida y devuelve el codigo de salida."""
    accion = getattr(args, "accion", None)
    if accion not in ACCIONES:
        raise ErrorIndice("falta la accion: la unica disponible es «actualizar»")
    return ACCIONES[accion](args)
