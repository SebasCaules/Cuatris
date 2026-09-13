"""Tests del triage de PR contra un repositorio git temporal.

No hay fixtures en disco: cada caso construye el repositorio que necesita. Los casos raros
—symlink, submodulo, puntero LFS, `.gitattributes`, colision en minusculas— se arman con las
ordenes de fontaneria de git, porque varios de ellos no se pueden representar en el arbol de
trabajo de macOS (dos rutas que solo difieren en mayusculas son un solo archivo).
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import pytest
from cuatris.validar import triage_pr
from cuatris.validar.triage_pr import (
    DATOS,
    NECESITA_HUMANO,
    ErrorTriage,
    clasificar,
    configurar,
    ejecutar,
    es_ruta_de_datos,
)

HORARIOS = "data/v1/horarios/2026-2C.json"
PLANES = "data/v1/planes/S10-Rev23.json"


def _git(repo: Path, *argumentos: str) -> str:
    """Corre git dentro del repositorio de prueba y devuelve su salida."""
    resultado = subprocess.run(
        ["git", "-C", str(repo), *argumentos],
        capture_output=True,
        text=True,
        check=True,
    )
    return resultado.stdout


def _escribir(repo: Path, ruta: str, contenido: str) -> None:
    destino = repo / ruta
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(contenido, encoding="utf-8", newline="\n")


def _commit(repo: Path, mensaje: str) -> str:
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", mensaje)
    return _git(repo, "rev-parse", "HEAD").strip()


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """Repositorio con `main` y una rama `pr` ya creada, listos para el diff."""
    camino = tmp_path / "repo"
    camino.mkdir()
    _git(camino, "init", "-q", "-b", "main")
    _git(camino, "config", "user.email", "prueba@ejemplo.invalido")
    _git(camino, "config", "user.name", "Prueba")
    _git(camino, "config", "commit.gpgsign", "false")
    _escribir(camino, HORARIOS, '{"cursos": []}\n')
    _escribir(camino, "README.md", "hola\n")
    _commit(camino, "base")
    _git(camino, "checkout", "-q", "-b", "pr")
    return camino


# ---------------------------------------------------------------------------------------
# Allowlist de rutas
# ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "ruta",
    [
        "data/v1/horarios/2026-2C.json",
        "data/v1/catalogo/93.18.json",
        "data/v1/abreviaciones.json",
        "data/v1/vocabulario.json",
        "data/index.json",
    ],
)
def test_rutas_de_datos_admitidas(ruta: str):
    assert es_ruta_de_datos(ruta)


@pytest.mark.parametrize(
    "ruta",
    [
        PLANES,
        "data/v1/horarios/2026-2C.JSON",
        "data/v1/horarios/sub/2026-2C.json",
        "data/v1/horarios/2026-2C.json.bak",
        "data/v2/horarios/2026-2C.json",
        "data/CHANGELOG.jsonl",
        "tools/cuatris/cli.py",
        ".github/workflows/pr-datos.yml",
    ],
)
def test_rutas_que_no_son_datos(ruta: str):
    assert not es_ruta_de_datos(ruta)


@pytest.mark.parametrize(
    "ruta",
    [
        # Con barra invertida: `_coincide` parte solo por `/`, asi que sin este guardia la
        # ruta entera seria un unico segmento y `fnmatch` la aceptaria contra `*.json`.
        "data/v1/horarios/..\\..\\.github\\workflows\\x.json",
        "data/v1/horarios/../../x.json",
        "/data/index.json",
        "data//index.json",
        "data/v1/horarios/./2026-2C.json",
    ],
)
def test_rutas_que_se_escapan_del_allowlist(ruta: str):
    """Los tres guardias de `es_ruta_de_datos`: barra inicial, `\\`, y segmento vacio, `.` o `..`.

    Es el vector A12 escrito como ruta en vez de como modo de git: una ruta que se ve como un
    archivo de datos y apunta a otro lado. El de la barra invertida es el que sostiene la regla
    con el allowlist de hoy: `_coincide` parte solo por `/`, asi que sin el
    `data/v1/horarios/..\\..\\.github\\workflows\\x.json` seria un unico segmento y `fnmatch` lo
    aceptaria contra `*.json`.
    """
    assert not es_ruta_de_datos(ruta)


@pytest.mark.parametrize(
    "ruta",
    [
        "data/v1/../index.json",
        "data/v1/./index.json",
        "data/v1//index.json",
    ],
)
def test_un_patron_con_comodin_de_directorio_no_admite_ni_punto_ni_vacio(
    monkeypatch: pytest.MonkeyPatch, ruta: str
):
    """Por que el guardia de `.`, `..` y el segmento vacio no es decoracion.

    Con el allowlist de hoy ninguno de esos segmentos llega a coincidir: los patrones tienen
    `*` solo en el nombre del archivo, y `..` no cumple `*.json`. En cuanto un patron traiga un
    comodin de **directorio** —`data/v1/*/*.json` es el candidato obvio cuando aparezca
    `catalogo/` u otra familia— `fnmatch("..", "*")` da verdadero y el guardia pasa a ser lo
    unico que impide salir del directorio de datos. Se fija ahora, no cuando duela.
    """
    monkeypatch.setattr(triage_pr, "RUTAS_DE_DATOS", ("data/v1/*/*.json",))
    assert triage_pr.es_ruta_de_datos("data/v1/horarios/2026-2C.json")
    assert not triage_pr.es_ruta_de_datos(ruta)


# ---------------------------------------------------------------------------------------
# Clasificacion
# ---------------------------------------------------------------------------------------


def test_pr_de_datos_puro(repo: Path):
    _escribir(repo, HORARIOS, '{"cursos": [1]}\n')
    _escribir(repo, "data/v1/catalogo/93.18.json", "{}\n")
    _escribir(repo, "data/index.json", "{}\n")
    _commit(repo, "datos")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == DATOS
    assert resultado.motivos == []
    assert resultado.archivos == [
        "data/index.json",
        "data/v1/catalogo/93.18.json",
        HORARIOS,
    ]
    assert resultado.codigo_de_salida() == 0


def test_el_plan_de_estudios_nunca_es_datos(repo: Path):
    _escribir(repo, PLANES, "{}\n")
    _commit(repo, "plan")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert any(PLANES in motivo for motivo in resultado.motivos)


def test_un_solo_archivo_de_codigo_arrastra_todo_el_pr(repo: Path):
    _escribir(repo, HORARIOS, '{"cursos": [1]}\n')
    _escribir(repo, "tools/cuatris/cli.py", "# hola\n")
    _commit(repo, "datos y codigo")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert len(resultado.motivos) == 1
    assert "tools/cuatris/cli.py" in resultado.motivos[0]


def test_borrar_un_archivo_de_datos_necesita_humano(repo: Path):
    """Decision N0: hasta que exista C4 (Sprint 2), toda baja dentro de `data/` la mira alguien.

    Antes de esto, un PR que borraba `data/v1/horarios/2026-2C.json` y dejaba `"horarios": []`
    en el indice salia `DATOS` con `motivos: []` y los dos checks requeridos en verde, y el
    deploy publicaba despues un indice vacio: el cuatrimestre entero despublicado sin que
    ninguna persona lo mirara.
    """
    (repo / HORARIOS).unlink()
    _escribir(repo, "data/index.json", '{"horarios": []}\n')
    _commit(repo, "baja")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert resultado.archivos == ["data/index.json", HORARIOS]
    assert any("toda baja dentro de data/" in motivo for motivo in resultado.motivos)
    assert resultado.codigo_de_salida() == 1


def test_una_baja_fuera_de_datos_no_agrega_el_motivo_de_la_baja(repo: Path):
    """La regla habla de `data/`: un archivo de codigo borrado se rechaza por el allowlist."""
    (repo / "README.md").unlink()
    _commit(repo, "baja de codigo")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert not any(
        "toda baja dentro de data/" in motivo for motivo in resultado.motivos
    )
    assert any("allowlist" in motivo for motivo in resultado.motivos)


def test_modificar_un_archivo_de_datos_sigue_siendo_datos(repo: Path):
    """La regla de bajas no alcanza a un alta ni a una modificacion."""
    _escribir(repo, HORARIOS, '{"cursos": [1]}\n')
    _commit(repo, "modificacion")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == DATOS
    assert resultado.motivos == []


def test_diff_vacio_necesita_humano(repo: Path):
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert "no toca ningun archivo" in resultado.motivos[0]


# ---------------------------------------------------------------------------------------
# Modos de git: el allowlist de rutas no alcanza (amenaza A12)
# ---------------------------------------------------------------------------------------


def test_symlink_con_nombre_de_archivo_de_datos(repo: Path):
    destino = repo / "data" / "v1" / "horarios" / "robado.json"
    destino.symlink_to("/etc/passwd")
    _commit(repo, "symlink")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert any("enlace simbolico" in motivo for motivo in resultado.motivos)


def test_archivo_de_datos_ejecutable(repo: Path):
    _escribir(repo, HORARIOS, '{"cursos": [1]}\n')
    (repo / HORARIOS).chmod(0o755)
    _commit(repo, "ejecutable")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert any("ejecutable" in motivo for motivo in resultado.motivos)


def test_submodulo(repo: Path):
    sha = "0" * 39 + "1"
    _git(
        repo,
        "update-index",
        "--add",
        "--cacheinfo",
        f"160000,{sha},data/v1/horarios/mod",
    )
    _git(repo, "commit", "-q", "-m", "submodulo")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert any("submodulo" in motivo for motivo in resultado.motivos)


def test_puntero_de_git_lfs(repo: Path):
    _escribir(
        repo,
        HORARIOS,
        "version https://git-lfs.github.com/spec/v1\n"
        "oid sha256:0123456789abcdef\n"
        "size 12345\n",
    )
    _commit(repo, "lfs")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert any("Git LFS" in motivo for motivo in resultado.motivos)


MOTIVO_DE_ARCHIVOS_DE_GIT = "cambia como git materializa el arbol"
"""Fragmento exacto del motivo de `ARCHIVOS_DE_GIT`.

Afirmar `".gitattributes" in motivo` no probaba nada: el motivo generico del allowlist tambien
nombra el archivo («`.gitattributes` no esta en el allowlist de rutas de datos…»), asi que el
test pasaba con `ARCHIVOS_DE_GIT = ()`. La regla especifica se distingue por su texto.
"""


@pytest.mark.parametrize("nombre", [".gitattributes", ".gitmodules"])
def test_archivos_que_cambian_como_git_materializa_el_arbol(repo: Path, nombre: str):
    _escribir(repo, nombre, "*.json text eol=crlf\n")
    _commit(repo, "archivo de git")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert any(MOTIVO_DE_ARCHIVOS_DE_GIT in motivo for motivo in resultado.motivos)
    assert any(nombre in motivo for motivo in resultado.motivos)


def test_gitattributes_en_un_subdirectorio_tambien_se_rechaza(repo: Path):
    """`git archive` aplica los atributos de cualquier `.gitattributes` del arbol, no solo el de la raiz."""
    _escribir(repo, "data/v1/horarios/.gitattributes", "*.json export-ignore\n")
    _commit(repo, "gitattributes escondido")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert any(MOTIVO_DE_ARCHIVOS_DE_GIT in motivo for motivo in resultado.motivos)


def test_colision_en_minusculas(repo: Path):
    """Dos rutas que solo difieren en mayusculas son un solo archivo en macOS y en Windows."""
    blob = subprocess.run(
        ["git", "-C", str(repo), "hash-object", "-w", "--stdin"],
        input='{"cursos": []}\n',
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    _git(
        repo,
        "update-index",
        "--add",
        "--cacheinfo",
        f"100644,{blob},data/v1/horarios/2026-2c.json",
    )
    _git(repo, "commit", "-q", "-m", "colision")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == NECESITA_HUMANO
    assert any("mismo archivo en macOS" in motivo for motivo in resultado.motivos)


# ---------------------------------------------------------------------------------------
# Refs y errores
# ---------------------------------------------------------------------------------------


def test_usa_la_base_de_fusion_y_no_ve_lo_que_avanzo_main(repo: Path):
    """Lo que se commitea en `main` despues de abrir el PR no es parte del diff del PR."""
    _escribir(repo, HORARIOS, '{"cursos": [1]}\n')
    _commit(repo, "datos del pr")
    _git(repo, "checkout", "-q", "main")
    _escribir(repo, "tools/cuatris/cli.py", "# cambio ajeno al PR\n")
    _commit(repo, "codigo en main")
    _git(repo, "checkout", "-q", "pr")
    resultado = clasificar(repo, "main", "pr")
    assert resultado.clase == DATOS
    assert resultado.archivos == [HORARIOS]


def test_ref_inexistente(repo: Path):
    with pytest.raises(ErrorTriage, match="no se pudo resolver la ref «no-existe»"):
        clasificar(repo, "main", "no-existe")


def test_directorio_que_no_es_repositorio(tmp_path: Path):
    with pytest.raises(ErrorTriage):
        clasificar(tmp_path, "main", "pr")


# ---------------------------------------------------------------------------------------
# Subcomando
# ---------------------------------------------------------------------------------------


def _correr(argumentos: list[str]) -> int:
    parser = argparse.ArgumentParser()
    configurar(parser)
    return ejecutar(parser.parse_args(argumentos))


def test_salida_json_y_codigos_de_salida(repo: Path, tmp_path: Path, capsys):
    _escribir(repo, HORARIOS, '{"cursos": [1]}\n')
    _commit(repo, "datos")
    salida = tmp_path / "triage.json"
    codigo = _correr(
        [
            "triage",
            "--repo",
            str(repo),
            "--base",
            "main",
            "--head",
            "pr",
            "--salida",
            str(salida),
        ]
    )
    assert codigo == 0
    impreso = json.loads(capsys.readouterr().out)
    assert impreso == {"clase": DATOS, "archivos": [HORARIOS], "motivos": []}
    assert json.loads(salida.read_text(encoding="utf-8")) == impreso
    # Forma canonica: claves ordenadas, dos espacios de sangria y salto final.
    assert salida.read_text(encoding="utf-8").startswith('{\n  "archivos"')
    assert salida.read_text(encoding="utf-8").endswith("\n")


def test_codigo_1_cuando_necesita_humano(repo: Path):
    _escribir(repo, "tools/cuatris/cli.py", "# hola\n")
    _commit(repo, "codigo")
    assert (
        _correr(["triage", "--repo", str(repo), "--base", "main", "--head", "pr"]) == 1
    )


def test_codigo_2_cuando_no_se_puede_leer_el_repositorio(tmp_path: Path, capsys):
    codigo = _correr(
        ["triage", "--repo", str(tmp_path), "--base", "main", "--head", "pr"]
    )
    assert codigo == 2
    assert "ERROR" in capsys.readouterr().out


def test_sin_accion_devuelve_error(capsys):
    parser = argparse.ArgumentParser()
    configurar(parser)
    assert ejecutar(parser.parse_args([])) == 1
    assert "triage" in capsys.readouterr().out
