"""Clasificacion de un PR por ruta y por modo de git (`cuatris pr triage --base … --head …`).

Es la capa C1 del plan de la Fase 4 aplicada al **diff**, no al contenido: antes de abrir un
solo byte del PR hay que saber si el PR es «datos» o «cualquier otra cosa». Solo dos clases:

`DATOS`
    **Todos** los archivos que toca el PR caen en el allowlist de rutas de datos, todos son
    archivos regulares y nada raro aparece en el diff. Es la unica clase que mas adelante
    (Sprint 3) puede habilitar auto-merge.
`necesita-humano`
    Cualquier otra cosa. No es un veredicto de «malo»: es «esto lo mira una persona».

Se rechaza por modo de git, no solo por ruta, porque el modo es el camino conocido para
escaparse de un allowlist (amenaza A12 del plan): un symlink que apunta a `/etc/passwd`
sigue llamandose `data/v1/horarios/2026-2C.json`, un submodulo trae codigo entero en un
puntero de 40 caracteres, un puntero LFS convierte el archivo en una descarga en tiempo de
uso, `.gitattributes` reescribe el contenido al hacer checkout, y dos rutas que solo difieren
en mayusculas son un solo archivo en macOS y en Windows.

El diff se toma desde la **base de fusion** (`git merge-base`), que es lo que muestra GitHub
en un PR; si las dos refs no tienen ancestro comun se compara directamente contra `--base`.

    cuatris pr triage --base origin/main --head pr-123
    echo $?   # 0 = DATOS, 1 = necesita-humano, 2 = no se pudo leer el repositorio

La salida es un JSON canonico con `clase`, `archivos` (rutas ordenadas) y `motivos` (una
linea por hallazgo, con la ruta adentro).
"""

from __future__ import annotations

import argparse
import fnmatch
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from cuatris import canon

AYUDA = "Clasifica el diff de un PR por ruta y por modo de git."

RUTAS_DE_DATOS = (
    "data/v1/horarios/*.json",
    "data/v1/catalogo/*.json",
    "data/v1/abreviaciones.json",
    "data/v1/vocabulario.json",
    "data/index.json",
)
"""Allowlist exacto: un PR de clase `DATOS` no toca nada fuera de esto (ni `data/v1/planes/`).

`data/v1/catalogo/*.json` todavia no existe en el arbol: el contrato lo deja para el
Sprint 2 (`CONTRATO-v1.md`, §7 «Lo que queda para la Ola 2 y siguientes»). Esta en el
allowlist desde ahora a proposito, para que el dia que aparezca no haya que tocar el gate;
un patron que no matchea ningun archivo no clasifica nada de mas."""

DATOS = "DATOS"
NECESITA_HUMANO = "necesita-humano"

MODO_AUSENTE = "000000"
MODO_ARCHIVO = "100644"
MODO_EJECUTABLE = "100755"
MODO_SYMLINK = "120000"
MODO_SUBMODULO = "160000"

MODOS_ADMITIDOS = (MODO_AUSENTE, MODO_ARCHIVO)
"""Un archivo de datos es un archivo regular no ejecutable, o no esta."""

NOMBRES_DE_MODO = {
    MODO_EJECUTABLE: "un archivo ejecutable",
    MODO_SYMLINK: "un enlace simbolico",
    MODO_SUBMODULO: "un submodulo",
}
"""Como se nombra cada modo en el motivo; lo que no este aca se nombra por su numero."""

ARCHIVOS_DE_GIT = (".gitattributes", ".gitmodules")
"""Cambiarlos altera como git materializa el resto del arbol; nunca son «datos»."""

PREFIJO_LFS = b"version https://git-lfs.github.com/spec/v1"
"""Primera linea de un puntero de Git LFS: el contenido real vive fuera del repositorio."""

BYTES_DE_SONDEO = 256
"""Alcanza para reconocer un puntero LFS sin traer el blob entero a memoria."""

OK = 0
HAY_ERRORES = 1
NO_SE_PUDO_ABRIR = 2

__all__ = [
    "AYUDA",
    "DATOS",
    "NECESITA_HUMANO",
    "Clasificacion",
    "ErrorTriage",
    "clasificar",
    "configurar",
    "ejecutar",
    "es_ruta_de_datos",
    "main",
]


class ErrorTriage(Exception):
    """No se pudo leer el diff: no es un repositorio git, o alguna ref no existe."""


@dataclass
class Clasificacion:
    """Resultado del triage: la clase, las rutas tocadas y por que no es `DATOS`."""

    clase: str = DATOS
    archivos: list[str] = field(default_factory=list)
    motivos: list[str] = field(default_factory=list)

    def rechazar(self, motivo: str) -> None:
        """Marca el PR como `necesita-humano` y anota el motivo (sin repetirlo)."""
        self.clase = NECESITA_HUMANO
        if motivo not in self.motivos:
            self.motivos.append(motivo)

    def como_json(self) -> dict[str, object]:
        """Forma serializable del resultado."""
        return {"clase": self.clase, "archivos": self.archivos, "motivos": self.motivos}

    def codigo_de_salida(self) -> int:
        """0 si el PR es `DATOS`, 1 si necesita a una persona."""
        return OK if self.clase == DATOS else HAY_ERRORES


@dataclass(frozen=True)
class _Cambio:
    """Una entrada del `git diff --raw`: modos, blobs, estado y ruta."""

    modo_origen: str
    modo_destino: str
    blob_origen: str
    blob_destino: str
    estado: str
    ruta: str


def _coincide(ruta: str, patron: str) -> bool:
    """Compara segmento por segmento: `*` nunca cruza una barra, como en `.gitignore`.

    `fnmatch` suelto diria que `data/v1/horarios/sub/x.json` coincide con
    `data/v1/horarios/*.json`, porque su `*` se come las barras. Un allowlist que acepta
    subdirectorios no es un allowlist.
    """
    partes_ruta = ruta.split("/")
    partes_patron = patron.split("/")
    if len(partes_ruta) != len(partes_patron):
        return False
    return all(
        fnmatch.fnmatchcase(parte, molde)
        for parte, molde in zip(partes_ruta, partes_patron, strict=True)
    )


def es_ruta_de_datos(ruta: str) -> bool:
    """Indica si la ruta cae en el allowlist de datos, tal cual, sin normalizar nada."""
    if not ruta or ruta.startswith("/") or "\\" in ruta:
        return False
    if any(parte in ("", ".", "..") for parte in ruta.split("/")):
        return False
    return any(_coincide(ruta, patron) for patron in RUTAS_DE_DATOS)


def _git(repo: Path, *argumentos: str, binario: bool = False):
    """Corre git dentro de `repo` y devuelve su salida; cualquier fallo es `ErrorTriage`."""
    orden = ["git", "-C", str(repo), *argumentos]
    try:
        resultado = subprocess.run(orden, capture_output=True, check=False)
    except OSError as exc:
        raise ErrorTriage(f"no se pudo ejecutar git: {exc}") from exc
    if resultado.returncode != 0:
        detalle = resultado.stderr.decode("utf-8", "replace").strip()
        raise ErrorTriage(f"«{' '.join(orden)}» fallo: {detalle or 'sin detalle'}")
    return resultado.stdout if binario else resultado.stdout.decode("utf-8", "replace")


def _resolver(repo: Path, ref: str) -> str:
    """Devuelve el SHA del commit al que apunta la ref, o falla nombrandola."""
    try:
        return _git(repo, "rev-parse", "--verify", f"{ref}^{{commit}}").strip()
    except ErrorTriage as exc:
        raise ErrorTriage(f"no se pudo resolver la ref «{ref}»: {exc}") from exc


def _izquierda(repo: Path, base: str, head: str) -> str:
    """Base de fusion entre las dos refs; si no hay ancestro comun, la propia `base`."""
    orden = ["git", "-C", str(repo), "merge-base", base, head]
    resultado = subprocess.run(orden, capture_output=True, text=True, check=False)
    if resultado.returncode == 0 and resultado.stdout.strip():
        return resultado.stdout.strip()
    return base


def _cambios(repo: Path, izquierda: str, head: str) -> list[_Cambio]:
    """Lee `git diff --raw` entre las dos refs; `--no-renames` deja alta y baja separadas."""
    crudo = _git(repo, "diff", "--raw", "-z", "--no-renames", izquierda, head)
    piezas = [pieza for pieza in crudo.split("\0") if pieza != ""]
    cambios: list[_Cambio] = []
    indice = 0
    while indice < len(piezas):
        cabecera = piezas[indice]
        if not cabecera.startswith(":"):
            raise ErrorTriage(f"no entiendo la entrada «{cabecera}» del diff de git")
        campos = cabecera[1:].split()
        if len(campos) != 5:
            raise ErrorTriage(f"no entiendo la entrada «{cabecera}» del diff de git")
        if indice + 1 >= len(piezas):
            raise ErrorTriage(f"falta la ruta de la entrada «{cabecera}» del diff de git")
        modo_origen, modo_destino, blob_origen, blob_destino, estado = campos
        cambios.append(
            _Cambio(
                modo_origen=modo_origen,
                modo_destino=modo_destino,
                blob_origen=blob_origen,
                blob_destino=blob_destino,
                estado=estado,
                ruta=piezas[indice + 1],
            )
        )
        indice += 2
    return cambios


def _es_puntero_lfs(repo: Path, blob: str) -> bool:
    """Mira los primeros bytes del blob: un puntero LFS empieza por una linea fija."""
    if set(blob) == {"0"}:
        return False
    try:
        contenido = _git(repo, "cat-file", "blob", blob, binario=True)
    except ErrorTriage:
        return False
    return contenido[:BYTES_DE_SONDEO].startswith(PREFIJO_LFS)


def _rutas_del_arbol(repo: Path, ref: str) -> list[str]:
    """Todas las rutas del arbol de esa ref, para detectar colisiones en minusculas."""
    crudo = _git(repo, "ls-tree", "-r", "--name-only", "-z", ref)
    return [ruta for ruta in crudo.split("\0") if ruta]


def _colisiones(rutas: list[str], tocadas: set[str]) -> list[str]:
    """Grupos de rutas que solo difieren en mayusculas y que este PR toca."""
    por_minuscula: dict[str, set[str]] = {}
    for ruta in rutas:
        por_minuscula.setdefault(ruta.lower(), set()).add(ruta)
    problemas: list[str] = []
    for _, grupo in sorted(por_minuscula.items()):
        if len(grupo) < 2 or not (grupo & tocadas):
            continue
        problemas.append(
            "estas rutas son el mismo archivo en macOS y en Windows: " + ", ".join(sorted(grupo))
        )
    return problemas


def clasificar(repo: str | Path, base: str, head: str) -> Clasificacion:
    """Clasifica el diff entre `base` y `head` dentro del repositorio `repo`."""
    camino = Path(repo)
    _resolver(camino, base)
    sha_head = _resolver(camino, head)
    izquierda = _izquierda(camino, base, head)
    cambios = _cambios(camino, izquierda, sha_head)

    resultado = Clasificacion()
    resultado.archivos = sorted({cambio.ruta for cambio in cambios})
    if not cambios:
        resultado.rechazar(
            "el diff no toca ningun archivo: no hay nada que validar ni que publicar"
        )
        return resultado

    for cambio in sorted(cambios, key=lambda cambio: cambio.ruta):
        ruta = cambio.ruta
        nombre = ruta.rsplit("/", 1)[-1]
        if nombre in ARCHIVOS_DE_GIT:
            resultado.rechazar(
                f"«{ruta}» cambia como git materializa el arbol; eso nunca es un cambio de datos"
            )
        modos = (
            (cambio.modo_destino, "el PR lo deja como"),
            (cambio.modo_origen, "en la rama base es"),
        )
        for modo, donde in modos:
            if modo in MODOS_ADMITIDOS:
                continue
            explicacion = NOMBRES_DE_MODO.get(modo, f"un objeto con el modo de git {modo}")
            resultado.rechazar(
                f"«{ruta}»: {donde} {explicacion}; un archivo de datos es un archivo "
                "regular no ejecutable"
            )
        if cambio.modo_destino == MODO_ARCHIVO and _es_puntero_lfs(camino, cambio.blob_destino):
            resultado.rechazar(
                f"«{ruta}» es un puntero de Git LFS: el contenido real no esta en el repositorio"
            )
        if not es_ruta_de_datos(ruta):
            resultado.rechazar(
                f"«{ruta}» no esta en el allowlist de rutas de datos "
                f"({', '.join(RUTAS_DE_DATOS)})"
            )

    for problema in _colisiones(_rutas_del_arbol(camino, sha_head), set(resultado.archivos)):
        resultado.rechazar(problema)

    return resultado


# --------------------------------------------------------------------------------------
# Subcomando de la CLI
# --------------------------------------------------------------------------------------


def configurar(parser: argparse.ArgumentParser) -> None:
    """Argumentos de `cuatris pr`: por ahora una sola accion, `triage`."""
    acciones = parser.add_subparsers(dest="accion", metavar="accion")
    triage = acciones.add_parser(
        "triage",
        help="Clasifica el diff entre dos refs.",
        description="Clasifica el diff entre dos refs por ruta y por modo de git.",
    )
    triage.add_argument("--base", required=True, help="Ref de la rama base (por ejemplo, main).")
    triage.add_argument("--head", required=True, help="Ref con los cambios del PR.")
    triage.add_argument(
        "--repo", type=Path, default=Path("."), help="Repositorio git (por defecto, el actual)."
    )
    triage.add_argument(
        "--salida",
        type=Path,
        default=None,
        help="Escribe el JSON en este archivo ademas de imprimirlo.",
    )
    triage.set_defaults(funcion=ejecutar)
    parser.set_defaults(funcion=ejecutar)


def ejecutar(args: argparse.Namespace) -> int:
    """Imprime el JSON del triage y devuelve el codigo de salida."""
    if getattr(args, "accion", None) is None:
        print("error: falta la accion; la unica disponible es «triage»")
        return HAY_ERRORES
    try:
        resultado = clasificar(args.repo, args.base, args.head)
    except ErrorTriage as exc:
        print(f"ERROR {args.repo}: {exc}")
        return NO_SE_PUDO_ABRIR
    texto = canon.serializar(resultado.como_json())
    print(texto, end="")
    if args.salida is not None:
        Path(args.salida).parent.mkdir(parents=True, exist_ok=True)
        Path(args.salida).write_text(texto, encoding="utf-8", newline="\n")
    return resultado.codigo_de_salida()


def main(argv: list[str] | None = None) -> int:
    """Permite correrlo sin pasar por `cuatris`, mientras se registra en `cli.py`.

        python -m cuatris.validar.triage_pr triage --base main --head pr-123
    """
    parser = argparse.ArgumentParser(prog="cuatris pr", description=AYUDA)
    configurar(parser)
    return ejecutar(parser.parse_args(argv))


if __name__ == "__main__":  # pragma: no cover - punto de entrada
    raise SystemExit(main())
