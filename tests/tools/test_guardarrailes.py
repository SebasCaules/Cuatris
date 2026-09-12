"""Tests del parser de YAML propio y de los guardarrailes de los workflows.

Los workflows buenos y malos se escriben en `tmp_path`: un fixture en disco quedaria
desactualizado respecto de las reglas, y lo que importa probar es la regla, no el archivo.
El ultimo bloque corre las reglas sobre los workflows de verdad del repositorio.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pytest
from cuatris.validar.guardarrailes import (
    ErrorYaml,
    cargar_yaml,
    configurar,
    ejecutar,
    revisar_archivo,
    revisar_ruta,
)

SHA_CHECKOUT = "3d3c42e5aac5ba805825da76410c181273ba90b1"
SHA_SETUP_PYTHON = "5fda3b95a4ea91299a34e894583c3862153e4b97"

WORKFLOW_BUENO = f"""\
name: Bueno
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  calidad:
    name: calidad
    runs-on: ubuntu-24.04
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@{SHA_CHECKOUT}  # v7.0.1
        with:
          persist-credentials: false
      - name: Instalar Python
        uses: actions/setup-python@{SHA_SETUP_PYTHON}  # v7.0.0
        with:
          python-version: "3.12"
      - name: Titulo del PR, sin interpolarlo
        env:
          TITULO: ${{{{ github.event.pull_request.title }}}}
        run: |
          echo "$TITULO"
          echo "listo"
"""


def _escribir(directorio: Path, nombre: str, contenido: str) -> Path:
    ruta = directorio / nombre
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(contenido, encoding="utf-8", newline="\n")
    return ruta


def _reglas(hallazgos) -> list[str]:
    return [hallazgo.regla for hallazgo in hallazgos]


# ---------------------------------------------------------------------------------------
# Parser de YAML
# ---------------------------------------------------------------------------------------


def test_parser_mapeos_secuencias_y_tipos():
    documento = cargar_yaml(
        "name: Bueno\n"
        "numero: 12\n"
        "decimal: 1.5\n"
        "cierto: true\n"
        "falso: false\n"
        "nada: null\n"
        "encendido: on\n"
        "version: \"3.12\"\n"
        "lista:\n"
        "  - uno\n"
        "  - dos\n"
    )
    assert documento["name"] == "Bueno"
    assert documento["numero"] == 12
    assert documento["decimal"] == 1.5
    assert documento["cierto"] is True
    assert documento["falso"] is False
    assert documento["nada"] is None
    # `on` es texto: en GitHub Actions es la clave del disparador, no el booleano de YAML 1.1.
    assert documento["encendido"] == "on"
    assert documento["version"] == "3.12"
    assert documento["lista"] == ["uno", "dos"]


def test_parser_flujo_y_mapeo_vacio():
    documento = cargar_yaml("branches: [main, 'otra']\npermissions: {}\ncon: {a: 1, b: dos}\n")
    assert documento["branches"] == ["main", "otra"]
    assert documento["permissions"] == {}
    assert documento["con"] == {"a": 1, "b": "dos"}


def test_parser_bloques_literales_y_plegados():
    documento = cargar_yaml(
        "literal: |\n"
        "  una\n"
        "  dos\n"
        "recortado: |-\n"
        "  sin salto final\n"
        "plegado: >-\n"
        "  una\n"
        "  dos\n"
    )
    assert documento["literal"] == "una\ndos\n"
    assert documento["recortado"] == "sin salto final"
    assert documento["plegado"] == "una dos"


def test_parser_comentarios_y_almohadillas_entre_comillas():
    documento = cargar_yaml(
        "# comentario suelto\n"
        'texto: "a # no es comentario"  # esto si lo es\n'
        "otro: valor  # comentario\n"
    )
    assert documento["texto"] == "a # no es comentario"
    assert documento["otro"] == "valor"
    assert documento["otro"].comentario == "comentario"


def test_parser_recuerda_lineas_y_comentario_del_uses():
    documento = cargar_yaml(WORKFLOW_BUENO)
    paso = documento["jobs"]["calidad"]["steps"][0]
    assert paso["uses"].comentario == "v7.0.1"
    assert documento["jobs"].linea_de("calidad") == 11
    assert documento["jobs"]["calidad"]["steps"][2]["run"].linea > 0


def test_parser_secuencia_de_mapeos_en_la_misma_linea_del_guion():
    documento = cargar_yaml(
        "steps:\n"
        "  - name: uno\n"
        "    run: echo uno\n"
        "  - name: dos\n"
        "    with:\n"
        "      clave: valor\n"
    )
    assert documento["steps"] == [
        {"name": "uno", "run": "echo uno"},
        {"name": "dos", "with": {"clave": "valor"}},
    ]


def test_parser_secuencia_al_mismo_nivel_que_su_clave():
    documento = cargar_yaml("jobs:\n- uno\n- dos\n")
    assert documento["jobs"] == ["uno", "dos"]


@pytest.mark.parametrize(
    ("texto", "fragmento"),
    [
        ("a: 1\na: 2\n", "repetida"),
        ("a: &ancla 1\n", "anclas"),
        ("a: *ancla\n", "alias"),
        ("a: !!str 1\n", "etiquetas"),
        ("a: 1\n\ttab: 2\n", "tabuladores"),
        ("a: 1\n---\nb: 2\n", "un solo documento"),
        ("a: 1\n  b: 2\n", "sangria inesperada"),
        ("suelto\n", "se esperaba"),
        ("a: [1, 2\n", "falta «]»"),
    ],
)
def test_parser_rechaza_lo_que_no_entiende(texto: str, fragmento: str):
    with pytest.raises(ErrorYaml) as error:
        cargar_yaml(texto)
    assert fragmento in str(error.value)


def test_parser_rechaza_bom_y_crlf():
    with pytest.raises(ErrorYaml, match="BOM"):
        cargar_yaml("﻿a: 1\n")
    with pytest.raises(ErrorYaml, match="retornos de carro"):
        cargar_yaml("a: 1\r\n")


# ---------------------------------------------------------------------------------------
# Reglas
# ---------------------------------------------------------------------------------------


def test_workflow_bueno_no_tiene_hallazgos(tmp_path: Path):
    ruta = _escribir(tmp_path, "bueno.yml", WORKFLOW_BUENO)
    assert revisar_archivo(ruta) == []


def test_job_sin_permisos(tmp_path: Path):
    ruta = _escribir(
        tmp_path,
        "malo.yml",
        "on: push\njobs:\n  uno:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo\n",
    )
    hallazgos = revisar_archivo(ruta)
    assert _reglas(hallazgos) == ["permisos-faltantes"]
    assert "uno" in hallazgos[0].mensaje


@pytest.mark.parametrize(
    "expresion",
    ["${{ github.event.pull_request.title }}", "${{ github.head_ref }}"],
)
def test_run_que_interpola_lo_que_escribe_el_autor_del_pr(tmp_path: Path, expresion: str):
    ruta = _escribir(
        tmp_path,
        "malo.yml",
        "on: push\n"
        "jobs:\n"
        "  uno:\n"
        "    permissions: {}\n"
        "    runs-on: ubuntu-24.04\n"
        "    steps:\n"
        f'      - run: echo "{expresion}"\n',
    )
    hallazgos = revisar_archivo(ruta)
    assert _reglas(hallazgos) == ["interpolacion-peligrosa"]
    assert ":7" in hallazgos[0].archivo


def test_accion_sin_sha_y_accion_sin_version(tmp_path: Path):
    ruta = _escribir(
        tmp_path,
        "malo.yml",
        "on: push\n"
        "jobs:\n"
        "  uno:\n"
        "    permissions: {}\n"
        "    runs-on: ubuntu-24.04\n"
        "    steps:\n"
        "      - uses: actions/checkout@v4\n"
        f"      - uses: actions/checkout@{SHA_CHECKOUT}\n"
        "      - uses: ./.github/acciones/propia\n"
        "      - uses: docker://alpine:3.20\n",
    )
    assert _reglas(revisar_archivo(ruta)) == ["accion-sin-sha", "accion-sin-version"]


def test_secreto_distinto_de_github_token(tmp_path: Path):
    ruta = _escribir(
        tmp_path,
        "malo.yml",
        "on: push\n"
        "jobs:\n"
        "  uno:\n"
        "    permissions: {}\n"
        "    runs-on: ubuntu-24.04\n"
        "    steps:\n"
        "      - env:\n"
        "          BIEN: ${{ secrets.GITHUB_TOKEN }}\n"
        "          MAL: ${{ secrets.TOKEN_PERSONAL }}\n"
        "        run: echo\n",
    )
    hallazgos = revisar_archivo(ruta)
    assert _reglas(hallazgos) == ["secreto-prohibido"]
    assert "TOKEN_PERSONAL" in hallazgos[0].mensaje


def test_pull_request_target_con_checkout_del_head_y_permisos(tmp_path: Path):
    ruta = _escribir(
        tmp_path,
        "malo.yml",
        "on:\n"
        "  pull_request_target:\n"
        "jobs:\n"
        "  uno:\n"
        "    permissions:\n"
        "      contents: write\n"
        "    runs-on: ubuntu-24.04\n"
        "    steps:\n"
        f"      - uses: actions/checkout@{SHA_CHECKOUT}  # v7.0.1\n"
        "        with:\n"
        "          ref: ${{ github.event.pull_request.head.sha }}\n",
    )
    assert _reglas(revisar_archivo(ruta)) == ["pull-request-target-con-permisos"]


def test_pull_request_target_con_fetch_del_head_y_permisos(tmp_path: Path):
    ruta = _escribir(
        tmp_path,
        "malo.yml",
        "on:\n"
        "  pull_request_target:\n"
        "jobs:\n"
        "  uno:\n"
        "    permissions:\n"
        "      pull-requests: write\n"
        "    runs-on: ubuntu-24.04\n"
        "    steps:\n"
        "      - run: git fetch origin refs/pull/1/head\n",
    )
    assert _reglas(revisar_archivo(ruta)) == ["pull-request-target-con-permisos"]


def test_pull_request_target_con_checkout_de_la_base_no_molesta(tmp_path: Path):
    """Sin `ref:`, `pull_request_target` trae la rama base: eso no es codigo del PR."""
    ruta = _escribir(
        tmp_path,
        "bueno.yml",
        "on:\n"
        "  pull_request_target:\n"
        "jobs:\n"
        "  uno:\n"
        "    permissions:\n"
        "      pull-requests: write\n"
        "    runs-on: ubuntu-24.04\n"
        "    steps:\n"
        f"      - uses: actions/checkout@{SHA_CHECKOUT}  # v7.0.1\n"
        "        with:\n"
        "          persist-credentials: false\n",
    )
    assert revisar_archivo(ruta) == []


def test_pull_request_target_con_permisos_vacios_esta_bien(tmp_path: Path):
    ruta = _escribir(
        tmp_path,
        "bueno.yml",
        "on:\n"
        "  pull_request_target:\n"
        "jobs:\n"
        "  uno:\n"
        "    permissions: {}\n"
        "    runs-on: ubuntu-24.04\n"
        "    steps:\n"
        f"      - uses: actions/checkout@{SHA_CHECKOUT}  # v7.0.1\n"
        "        with:\n"
        "          ref: ${{ github.event.pull_request.head.sha }}\n",
    )
    assert revisar_archivo(ruta) == []


def test_workflow_sin_disparador_ni_jobs(tmp_path: Path):
    ruta = _escribir(tmp_path, "malo.yml", "name: nada\n")
    assert _reglas(revisar_archivo(ruta)) == ["sin-disparador", "sin-jobs"]


def test_yaml_invalido_es_un_hallazgo_y_no_una_excepcion(tmp_path: Path):
    ruta = _escribir(tmp_path, "roto.yml", "jobs:\n  uno: 1\n    dos: 2\n")
    hallazgos = revisar_archivo(ruta)
    assert _reglas(hallazgos) == ["yaml-invalido"]


def test_archivo_que_no_es_un_mapeo(tmp_path: Path):
    ruta = _escribir(tmp_path, "lista.yml", "- uno\n- dos\n")
    assert _reglas(revisar_archivo(ruta)) == ["yaml-invalido"]


def test_revisar_ruta_recorre_el_directorio(tmp_path: Path):
    _escribir(tmp_path, "bueno.yml", WORKFLOW_BUENO)
    _escribir(
        tmp_path,
        "malo.yaml",
        "on: push\njobs:\n  uno:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo\n",
    )
    _escribir(tmp_path, "no-es-workflow.txt", "cualquier cosa")
    assert _reglas(revisar_ruta(tmp_path)) == ["permisos-faltantes"]


def test_directorio_sin_workflows_avisa_pero_no_es_error(tmp_path: Path):
    hallazgos = revisar_ruta(tmp_path)
    assert _reglas(hallazgos) == ["sin-workflows"]
    assert hallazgos[0].nivel == "WARNING"


def test_archivo_que_no_se_puede_abrir(tmp_path: Path):
    with pytest.raises(OSError, match="no se pudo abrir"):
        revisar_archivo(tmp_path / "no-existe.yml")


# ---------------------------------------------------------------------------------------
# Subcomando
# ---------------------------------------------------------------------------------------


def _correr(rutas: list[Path]) -> int:
    parser = argparse.ArgumentParser()
    configurar(parser)
    return ejecutar(parser.parse_args([str(ruta) for ruta in rutas]))


def test_codigos_de_salida(tmp_path: Path, capsys):
    bueno = _escribir(tmp_path / "bien", "bueno.yml", WORKFLOW_BUENO)
    assert _correr([bueno]) == 0
    malo = _escribir(
        tmp_path / "mal",
        "malo.yml",
        "on: push\njobs:\n  uno:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: echo\n",
    )
    assert _correr([malo]) == 1
    assert "permissions" in capsys.readouterr().out
    assert _correr([tmp_path / "no-existe.yml"]) == 2


# ---------------------------------------------------------------------------------------
# Los workflows de verdad del repositorio
# ---------------------------------------------------------------------------------------


def test_los_workflows_del_repositorio_pasan_los_guardarrailes(raiz: Path):
    workflows = raiz / ".github" / "workflows"
    hallazgos = revisar_ruta(workflows)
    assert hallazgos == [], "\n".join(hallazgo.linea() for hallazgo in hallazgos)


def test_los_workflows_del_repositorio_son_los_tres_esperados(raiz: Path):
    workflows = raiz / ".github" / "workflows"
    nombres = sorted(ruta.name for ruta in workflows.glob("*.yml"))
    assert nombres == ["ci-codigo.yml", "deploy.yml", "pr-datos.yml"]


def test_los_workflows_del_repositorio_parsean(raiz: Path):
    for ruta in sorted((raiz / ".github" / "workflows").glob("*.yml")):
        documento = cargar_yaml(ruta.read_text(encoding="utf-8"))
        assert isinstance(documento, dict)
        assert "on" in documento and documento["jobs"]
