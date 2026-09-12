#!/usr/bin/env python3
"""Vendoriza en `vendor/` los wheels puro-Python de las dependencias de `tools/pyproject.toml`.

Por que existe
--------------
El job que valida un PR de datos no puede tener red: instalar paquetes desde PyPI dentro del
gate es exactamente el vector que el plan de la Fase 4 quiere cerrar. La solucion elegida (una
sola herramienta, un solo lenguaje) es guardar los wheels en el repositorio y que el CI instale
con `--no-index`:

    pip install --no-index --find-links vendor -r vendor/requisitos.txt
    pip install --no-index --no-build-isolation --no-deps -e tools

Se vendorizan las dependencias de tiempo de ejecucion, `pytest` con sus dependencias
transitivas y los paquetes de construccion (`setuptools`, `wheel`) que hacen falta para instalar
`tools/` sin red. **`ruff` no se vendoriza**: publica binarios por plataforma, no un wheel
`py3-none-any`; el CI lo instala desde PyPI con la version fijada en `tools/pyproject.toml`.

Todo wheel tiene que ser `none-any` (puro Python, sin ABI ni plataforma). Si alguno no lo es,
el script falla y nombra el archivo: es la senal de que una dependencia trae extension
compilada y hay que cambiarla (gap G-05).

Uso
---
    python tools/vendorizar.py                # descarga y reescribe vendor/requisitos.txt
    python tools/vendorizar.py --verificar    # sin red: comprueba vendor/ contra requisitos.txt

Solo usa la biblioteca estandar y `pip`; no depende del paquete `cuatris`.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import subprocess
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
"""Raiz del repositorio: `tools/` cuelga de ella y `vendor/` es su hermana."""

PYPROJECT = RAIZ / "tools" / "pyproject.toml"
VENDOR = RAIZ / "vendor"
REQUISITOS = VENDOR / "requisitos.txt"

NO_SE_VENDORIZA = ("ruff",)
"""Paquetes de `dev` que quedan fuera: traen binarios por plataforma, no un wheel puro."""

DE_DESARROLLO = ("pytest",)
"""Paquetes de `dev` que si se vendorizan, con sus dependencias transitivas."""

DE_CONSTRUCCION = ("setuptools>=68", "wheel")
"""Necesarios para instalar `tools/` sin red; `build-system.requires` pide `setuptools`."""

AVISO_TAMANO = 15 * 1024 * 1024
"""Por encima de esto conviene avisar: el historial de git es inmutable."""

SUFIJO_PURO = "-none-any.whl"
"""Un wheel puro-Python termina asi: ABI `none` y plataforma `any` (`py3-` o `py2.py3-`)."""

NOMBRE_WHEEL = re.compile(r"^(?P<nombre>[^-]+)-(?P<version>[^-]+)-(?P<etiquetas>.+)\.whl$")

ENCABEZADO = """\
# Generado por `python tools/vendorizar.py`. No editar a mano.
#
# Instalacion reproducible y sin red:
#     pip install --no-index --find-links vendor -r vendor/requisitos.txt
#     pip install --no-index --no-build-isolation --no-deps -e tools
#
# `ruff` no figura aca a proposito: es un binario por plataforma y el CI lo instala
# desde PyPI con la version fijada en tools/pyproject.toml.
"""

OK = 0
HAY_ERRORES = 1

__all__ = ["Wheel", "leer_requerimientos", "main", "recolectar", "verificar"]


class ErrorVendor(Exception):
    """La vendorizacion no se pudo completar de forma reproducible."""


@dataclass(frozen=True)
class Wheel:
    """Un wheel ya descargado en `vendor/`."""

    archivo: Path
    nombre: str
    version: str
    sha256: str

    @property
    def tamano(self) -> int:
        return self.archivo.stat().st_size

    def linea(self) -> str:
        """Linea de `requisitos.txt` para este wheel, con su hash."""
        return f"{self.nombre}=={self.version} \\\n    --hash=sha256:{self.sha256}"


def normalizar(nombre: str) -> str:
    """Nombre de distribucion normalizado (PEP 503): minusculas y guiones."""
    return re.sub(r"[-_.]+", "-", nombre).lower()


def sha256(archivo: Path) -> str:
    """Hash SHA-256 del archivo, en hexadecimal."""
    digestor = hashlib.sha256()
    with archivo.open("rb") as flujo:
        for bloque in iter(lambda: flujo.read(1 << 20), b""):
            digestor.update(bloque)
    return digestor.hexdigest()


def leer_requerimientos(pyproject: Path = PYPROJECT) -> list[str]:
    """Requerimientos a vendorizar: runtime + `pytest` + construccion, sin `ruff`."""
    try:
        datos = tomllib.loads(pyproject.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ErrorVendor(f"no se pudo leer «{pyproject}»: {exc.strerror or exc}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise ErrorVendor(f"«{pyproject}» no es TOML valido: {exc}") from exc

    proyecto = datos.get("project")
    if not isinstance(proyecto, dict):
        raise ErrorVendor(f"«{pyproject}» no declara la tabla [project]")
    runtime = proyecto.get("dependencies") or []
    if not isinstance(runtime, list) or not all(isinstance(item, str) for item in runtime):
        raise ErrorVendor("project.dependencies debe ser una lista de cadenas")
    dev = (proyecto.get("optional-dependencies") or {}).get("dev") or []
    if not isinstance(dev, list) or not all(isinstance(item, str) for item in dev):
        raise ErrorVendor("project.optional-dependencies.dev debe ser una lista de cadenas")

    elegidos = list(runtime)
    conocidos = set(NO_SE_VENDORIZA) | set(DE_DESARROLLO)
    for requerimiento in dev:
        base = normalizar(re.split(r"[<>=!~\[; ]", requerimiento, maxsplit=1)[0])
        if base in NO_SE_VENDORIZA:
            continue
        if base in DE_DESARROLLO:
            elegidos.append(requerimiento)
            continue
        raise ErrorVendor(
            f"la dependencia de desarrollo «{requerimiento}» no esta clasificada: agregala a "
            f"DE_DESARROLLO o a NO_SE_VENDORIZA en {Path(__file__).name} "
            f"(clasificadas: {', '.join(sorted(conocidos))})"
        )
    elegidos.extend(DE_CONSTRUCCION)
    return elegidos


def _descargar(requerimientos: list[str], destino: Path) -> None:
    """Corre `pip download` resolviendo las dependencias transitivas."""
    destino.mkdir(parents=True, exist_ok=True)
    orden = [
        sys.executable,
        "-m",
        "pip",
        "download",
        "--only-binary=:all:",
        "--dest",
        str(destino),
        *requerimientos,
    ]
    print("$ " + " ".join(orden))
    resultado = subprocess.run(orden, check=False)
    if resultado.returncode != OK:
        raise ErrorVendor(
            "`pip download` fallo; si el motivo es que un paquete no publica wheel, ese "
            "paquete no se puede vendorizar (ver gap G-05 en EXEC_STATE.md)"
        )


def recolectar(destino: Path = VENDOR) -> list[Wheel]:
    """Inventaria los wheels de `destino` y exige que todos sean `none-any`."""
    archivos = sorted(destino.glob("*.whl"))
    if not archivos:
        raise ErrorVendor(f"no hay ningun wheel en «{destino}»")
    impuros = [archivo.name for archivo in archivos if not archivo.name.endswith(SUFIJO_PURO)]
    if impuros:
        raise ErrorVendor(
            "estos wheels no son puro-Python (`none-any`) y no se pueden vendorizar: "
            + ", ".join(impuros)
            + "; cambia la dependencia por una de Python puro o sacala de la lista"
        )
    wheels: list[Wheel] = []
    for archivo in archivos:
        coincidencia = NOMBRE_WHEEL.match(archivo.name)
        if coincidencia is None:
            raise ErrorVendor(f"no se pudo leer el nombre del wheel «{archivo.name}»")
        wheels.append(
            Wheel(
                archivo=archivo,
                nombre=normalizar(coincidencia.group("nombre")),
                version=coincidencia.group("version"),
                sha256=sha256(archivo),
            )
        )
    repetidos = sorted(
        {wheel.nombre for wheel in wheels if [w.nombre for w in wheels].count(wheel.nombre) > 1}
    )
    if repetidos:
        raise ErrorVendor(
            "hay mas de una version vendorizada de: "
            + ", ".join(repetidos)
            + "; borra `vendor/` y vuelve a correr el script"
        )
    return sorted(wheels, key=lambda wheel: wheel.nombre)


def escribir_requisitos(wheels: list[Wheel], requisitos: Path = REQUISITOS) -> str:
    """Escribe `vendor/requisitos.txt` con version y hash de cada wheel."""
    cuerpo = ENCABEZADO + "\n" + "\n".join(wheel.linea() for wheel in wheels) + "\n"
    requisitos.parent.mkdir(parents=True, exist_ok=True)
    requisitos.write_text(cuerpo, encoding="utf-8", newline="\n")
    return cuerpo


def leer_requisitos(requisitos: Path = REQUISITOS) -> dict[str, tuple[str, str]]:
    """Lee `requisitos.txt` y devuelve `nombre -> (version, sha256)`."""
    try:
        texto = requisitos.read_text(encoding="utf-8")
    except OSError as exc:
        raise ErrorVendor(f"no se pudo leer «{requisitos}»: {exc.strerror or exc}") from exc
    plano = texto.replace("\\\n", " ")
    fijados: dict[str, tuple[str, str]] = {}
    for numero, linea in enumerate(plano.splitlines(), start=1):
        limpia = linea.split("#", 1)[0].strip()
        if not limpia:
            continue
        coincidencia = re.fullmatch(
            r"(?P<nombre>[A-Za-z0-9._-]+)==(?P<version>[^\s]+)\s+--hash=sha256:(?P<hash>[0-9a-f]{64})",
            limpia,
        )
        if coincidencia is None:
            raise ErrorVendor(f"{requisitos}:{numero}: no entiendo la linea «{limpia}»")
        fijados[normalizar(coincidencia.group("nombre"))] = (
            coincidencia.group("version"),
            coincidencia.group("hash"),
        )
    if not fijados:
        raise ErrorVendor(f"«{requisitos}» no fija ningun paquete")
    return fijados


def verificar(destino: Path = VENDOR, requisitos: Path = REQUISITOS) -> list[str]:
    """Compara los wheels de `destino` con `requisitos.txt`; devuelve las diferencias."""
    fijados = leer_requisitos(requisitos)
    wheels = {wheel.nombre: wheel for wheel in recolectar(destino)}
    problemas: list[str] = []
    for nombre, (version, esperado) in sorted(fijados.items()):
        wheel = wheels.get(nombre)
        if wheel is None:
            problemas.append(f"{nombre}=={version}: falta el wheel en «{destino}»")
            continue
        if wheel.version != version:
            problemas.append(
                f"{nombre}: `requisitos.txt` fija {version} y en «{destino}» esta {wheel.version}"
            )
        elif wheel.sha256 != esperado:
            problemas.append(
                f"{nombre}=={version}: el hash del wheel es {wheel.sha256} y "
                f"`requisitos.txt` declara {esperado}"
            )
    for nombre in sorted(set(wheels) - set(fijados)):
        problemas.append(f"{nombre}: el wheel esta en «{destino}» pero no figura en requisitos.txt")
    return problemas


def _informe(wheels: list[Wheel]) -> str:
    """Resumen legible: un renglon por wheel y el total."""
    lineas = [
        f"  {wheel.nombre}=={wheel.version}  ({wheel.tamano / 1024:.0f} KiB)" for wheel in wheels
    ]
    total = sum(wheel.tamano for wheel in wheels)
    lineas.append(f"  total: {len(wheels)} wheels, {total / 1024 / 1024:.2f} MiB")
    if total > AVISO_TAMANO:
        lineas.append(
            f"  AVISO: el total supera {AVISO_TAMANO / 1024 / 1024:.0f} MiB; el historial de "
            "git es inmutable, conviene revisar la lista antes de commitear"
        )
    return "\n".join(lineas)


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada del script; devuelve el codigo de salida."""
    parser = argparse.ArgumentParser(
        prog="vendorizar.py",
        description=(
            "Descarga a vendor/ los wheels puro-Python de las dependencias de tools/pyproject.toml."
        ),
    )
    parser.add_argument(
        "--verificar",
        action="store_true",
        help="No descarga nada: comprueba que vendor/ coincida con vendor/requisitos.txt.",
    )
    parser.add_argument(
        "--destino",
        type=Path,
        default=VENDOR,
        help=f"Directorio de wheels (por defecto {VENDOR}).",
    )
    args = parser.parse_args(argv)

    try:
        if args.verificar:
            problemas = verificar(args.destino, args.destino / REQUISITOS.name)
            for problema in problemas:
                print(f"ERROR {problema}")
            if problemas:
                return HAY_ERRORES
            print(_informe(recolectar(args.destino)))
            print("vendor/ coincide con requisitos.txt")
            return OK

        requerimientos = leer_requerimientos()
        print("Requerimientos a vendorizar: " + ", ".join(requerimientos))
        if args.destino.exists():
            shutil.rmtree(args.destino)
        _descargar(requerimientos, args.destino)
        wheels = recolectar(args.destino)
        escribir_requisitos(wheels, args.destino / REQUISITOS.name)
        print(_informe(wheels))
        print(f"escrito {args.destino / REQUISITOS.name}")
        return OK
    except ErrorVendor as exc:
        print(f"error: {exc}", file=sys.stderr)
        return HAY_ERRORES


if __name__ == "__main__":  # pragma: no cover - punto de entrada
    raise SystemExit(main())
