"""Tests del parser de YAML propio y de los guardarrailes de los workflows.

Los workflows buenos y malos se escriben en `tmp_path`: un fixture en disco quedaria
desactualizado respecto de las reglas, y lo que importa probar es la regla, no el archivo.
El ultimo bloque corre las reglas sobre los workflows de verdad del repositorio.
"""

from __future__ import annotations

import argparse
import subprocess
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
SHA_GITHUB_SCRIPT = "60a0d83039c74a4aee543508d2ffcb1c3799cdea"

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
        'version: "3.12"\n'
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
    documento = cargar_yaml(
        "branches: [main, 'otra']\npermissions: {}\ncon: {a: 1, b: dos}\n"
    )
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
def test_run_que_interpola_lo_que_escribe_el_autor_del_pr(
    tmp_path: Path, expresion: str
):
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


def test_interpolacion_en_el_with_de_una_accion(tmp_path: Path):
    """`with.script` de `actions/github-script` es JavaScript que se ejecuta tal cual.

    Antes solo se miraba `run:`, asi que un titulo de PR con un acento grave cerraba la
    plantilla y ejecutaba codigo con el token del job sin que el guardarrail dijera nada.
    """
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
        f"      - uses: actions/github-script@{SHA_GITHUB_SCRIPT}  # v7.0.1\n"
        "        with:\n"
        "          script: core.setOutput('t', `${{ github.event.pull_request.title }}`)\n",
    )
    hallazgos = revisar_archivo(ruta)
    assert _reglas(hallazgos) == ["interpolacion-peligrosa"]
    assert "`with.script:`" in hallazgos[0].mensaje
    assert ":11" in hallazgos[0].archivo


def test_interpolacion_en_el_if_de_un_paso(tmp_path: Path):
    ruta = _escribir(
        tmp_path,
        "malo.yml",
        "on: push\n"
        "jobs:\n"
        "  uno:\n"
        "    permissions: {}\n"
        "    runs-on: ubuntu-24.04\n"
        "    steps:\n"
        "      - if: contains(github.head_ref, 'x') || ${{ github.head_ref }} == 'y'\n"
        "        run: echo hola\n",
    )
    hallazgos = revisar_archivo(ruta)
    assert _reglas(hallazgos) == ["interpolacion-peligrosa"]
    assert "`if:`" in hallazgos[0].mensaje


def test_una_entrada_de_with_que_es_dato_no_es_una_interpolacion_peligrosa(
    tmp_path: Path,
):
    """`ref:` llega a la accion como `INPUT_REF` y no la evalua nadie.

    Interpolar el SHA del head en el `ref:` de `actions/checkout` es la forma correcta de traer
    el PR; marcarla seria el falso positivo cronico que la amenaza A10 obliga a evitar. Lo que
    se marca es la entrada que va a un interprete, y por eso hay una tabla y no «todo `with:`».
    """
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
        "          ref: ${{ github.event.pull_request.head.sha }}\n"
        "          path: ${{ github.head_ref }}\n",
    )
    assert revisar_archivo(ruta) == []


def test_el_env_del_paso_sigue_siendo_el_remedio_y_no_un_hallazgo(tmp_path: Path):
    """Pasar el dato por `env:` y usarlo entre comillas es lo que hay que hacer, no un error."""
    ruta = _escribir(
        tmp_path,
        "bueno.yml",
        "on: push\n"
        "jobs:\n"
        "  uno:\n"
        "    permissions: {}\n"
        "    runs-on: ubuntu-24.04\n"
        "    steps:\n"
        "      - env:\n"
        "          TITULO: ${{ github.event.pull_request.title }}\n"
        '        run: echo "$TITULO"\n',
    )
    assert revisar_archivo(ruta) == []


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


def test_pull_request_target_que_trae_el_head_por_sha_en_una_variable(tmp_path: Path):
    """Traer el head por SHA no nombra `refs/pull/` ni usa `actions/checkout`: A1/A3 exacto.

    El paso hace `git fetch` del SHA que le llega por `env:` y despues `npm ci`: ejecuta el
    codigo del PR con un token de escritura. Antes el guardarrail lo aprobaba.
    """
    ruta = _escribir(
        tmp_path,
        "malo.yml",
        "on:\n"
        "  pull_request_target:\n"
        "jobs:\n"
        "  uno:\n"
        "    permissions:\n"
        "      contents: write\n"
        "      pull-requests: write\n"
        "    runs-on: ubuntu-24.04\n"
        "    steps:\n"
        f"      - uses: actions/checkout@{SHA_CHECKOUT}  # v7.0.1\n"
        "      - env:\n"
        "          SHA: ${{ github.event.pull_request.head.sha }}\n"
        "        run: |\n"
        '          git fetch origin "$SHA" && git checkout FETCH_HEAD\n'
        "          npm ci\n",
    )
    assert _reglas(revisar_archivo(ruta)) == ["pull-request-target-con-permisos"]


def test_pull_request_target_que_trae_el_head_interpolado_en_el_run(tmp_path: Path):
    """La otra mitad de la regla: el `run:` interpola el head, sin pasar por `env:`."""
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
        "      - run: gh pr checkout ${{ github.event.pull_request.head.ref }}\n",
    )
    assert _reglas(revisar_archivo(ruta)) == [
        "interpolacion-peligrosa",
        "pull-request-target-con-permisos",
    ]


def test_pull_request_target_que_trae_el_pr_por_numero_con_gh(tmp_path: Path):
    """`gh pr checkout <numero>` es la forma idiomatica de traer el PR, y no nombra su head.

    Reproduccion del hallazgo: el numero llega por `env:` como
    `${{ github.event.pull_request.number }}` y despues corre `npm ci`, o sea ejecuta el arbol
    del PR con un token de escritura. Antes el guardarrail decia «sin hallazgos».
    """
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
        "      - env:\n"
        "          NUMERO: ${{ github.event.pull_request.number }}\n"
        "        run: |\n"
        '          gh pr checkout "$NUMERO"\n'
        "          npm ci\n",
    )
    assert _reglas(revisar_archivo(ruta)) == ["pull-request-target-con-permisos"]


def test_pull_request_target_que_trae_el_pr_por_el_namespace_pull(tmp_path: Path):
    """`git fetch origin pull/<n>/head` es sintaxis valida de git y no dice `refs/pull/`.

    Reproduccion del hallazgo, con el numero por `${{ github.event.number }}` en `env:`. Las
    dos mitades tienen que alcanzar por separado: el numero en la variable y el namespace
    `pull/` en la propia orden.
    """
    for entorno, orden in (
        (
            "          N: ${{ github.event.number }}\n",
            'git fetch origin "pull/$N/head"',
        ),
        ("          N: sin-relacion\n", "git fetch origin pull/123/head"),
    ):
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
            "      - env:\n" + entorno + "        run: |\n"
            f"          {orden}\n"
            "          git checkout FETCH_HEAD\n"
            "          npm ci\n",
        )
        assert _reglas(revisar_archivo(ruta)) == ["pull-request-target-con-permisos"], (
            orden
        )


def test_git_fetch_de_la_rama_base_no_es_traer_codigo_del_pr(tmp_path: Path):
    """Un `git fetch` que no toca el head del PR no convierte al job en sospechoso."""
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
        "      - run: git fetch --no-tags origin main\n",
    )
    assert revisar_archivo(ruta) == []


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


ACCION_LOCAL_MALA = """\
name: Acción propia
description: Trae lo que el PR escriba.
runs:
  using: composite
  steps:
    - run: echo "${{ github.event.pull_request.title }}"
      shell: bash
    - uses: actions/checkout@v4
"""


def test_revisar_ruta_alcanza_las_acciones_locales_de_los_subdirectorios(
    tmp_path: Path,
):
    """`cuatris guardarrailes .github` tiene que llegar a `.github/actions/*/action.yml`.

    El `uses: ./…` del workflow que la invoca se saltea en la regla de SHA —no hay SHA que
    fijar—, asi que sin recorrer subdirectorios nadie mira nunca lo que la accion hace, aunque
    corra con los permisos del job que la llama.
    """
    _escribir(tmp_path / "workflows", "ci.yml", WORKFLOW_BUENO)
    _escribir(tmp_path / "actions" / "propia", "action.yml", ACCION_LOCAL_MALA)
    hallazgos = revisar_ruta(tmp_path)
    assert _reglas(hallazgos) == ["interpolacion-peligrosa", "accion-sin-sha"]
    assert all("la accion local «Acción propia»" in h.mensaje for h in hallazgos)


def test_una_accion_local_no_tiene_que_declarar_ni_on_ni_permissions(tmp_path: Path):
    """Una accion corre dentro del job que la invoca: no tiene disparador ni permisos propios."""
    ruta = _escribir(
        tmp_path / "actions" / "propia",
        "action.yml",
        "name: Propia\n"
        "runs:\n"
        "  using: composite\n"
        "  steps:\n"
        "    - run: echo hola\n"
        "      shell: bash\n",
    )
    assert revisar_archivo(ruta) == []


def test_un_yaml_que_no_es_workflow_ni_accion_se_saltea_al_recorrer(tmp_path: Path):
    """`.github/ISSUE_TEMPLATE/config.yml` no lo ejecuta la plataforma: no tiene pasos que revisar."""
    _escribir(tmp_path / "workflows", "ci.yml", WORKFLOW_BUENO)
    config = _escribir(
        tmp_path / "ISSUE_TEMPLATE",
        "config.yml",
        "blank_issues_enabled: true\ncontact_links:\n  - name: Docs\n    url: https://x\n",
    )
    assert revisar_ruta(tmp_path) == []
    # Nombrado explicitamente si se lo revisa como workflow: quien lo nombro dijo que lo era.
    assert _reglas(revisar_archivo(config)) == ["sin-disparador", "sin-jobs"]


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


def test_el_github_entero_del_repositorio_pasa_los_guardarrailes(raiz: Path):
    """Es lo que corre el CI: `.github` entero, subdirectorios incluidos."""
    hallazgos = revisar_ruta(raiz / ".github")
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


def test_el_ci_corre_los_guardarrailes_sobre_github_entero(raiz: Path):
    """Con `.github/workflows` a secas, un `action.yml` local no lo revisaba nadie."""
    documento = cargar_yaml(
        (raiz / ".github" / "workflows" / "ci-codigo.yml").read_text("utf-8")
    )
    ordenes = [
        str(paso["run"]).strip()
        for paso in documento["jobs"]["python"]["steps"]
        if isinstance(paso.get("run"), str) and "guardarrailes" in str(paso["run"])
    ]
    assert ordenes == ["cuatris guardarrailes .github"]


# ---------------------------------------------------------------------------------------
# Los pasos de shell del gate de datos, corridos de verdad
#
# El `run:` que se prueba se **extrae del workflow**, no se copia: un test que repitiera el
# texto del paso probaria su propia copia y seguiria en verde con el paso roto.
# ---------------------------------------------------------------------------------------


def _paso_de(raiz: Path, workflow: str, job: str, nombre: str) -> str:
    """El `run:` del paso que se llama asi, tal cual esta en el workflow."""
    documento = cargar_yaml(
        (raiz / ".github" / "workflows" / workflow).read_text("utf-8")
    )
    for paso in documento["jobs"][job]["steps"]:
        if str(paso.get("name", "")) == nombre:
            return str(paso["run"])
    raise AssertionError(f"«{workflow}» no tiene un paso llamado «{nombre}»")


def _correr_shell(orden: str, directorio: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", "-e", "-c", orden],
        cwd=directorio,
        capture_output=True,
        text=True,
        check=False,
    )


def _repo_de_pr(tmp_path: Path, con_gitattributes: bool) -> Path:
    """Repositorio con `refs/cuatris/pr`, como lo deja el paso «Traer los bytes del PR»."""
    camino = tmp_path / "repo"
    (camino / "data" / "v1").mkdir(parents=True)
    subprocess.run(["git", "-C", str(camino), "init", "-q", "-b", "main"], check=True)
    for clave, valor in (
        ("user.email", "prueba@ejemplo.invalido"),
        ("user.name", "Prueba"),
        ("commit.gpgsign", "false"),
    ):
        subprocess.run(["git", "-C", str(camino), "config", clave, valor], check=True)
    (camino / "data" / "v1" / "vocabulario.json").write_text(
        '{"id": "rectorado"}\n', "utf-8"
    )
    if con_gitattributes:
        # `export-subst` hace que `git archive` expanda `$Format:…$` al extraer: los bytes de
        # `.cuarentena` dejan de ser los del PR.
        (camino / ".gitattributes").write_text(
            "data/v1/vocabulario.json export-subst\n", "utf-8"
        )
        (camino / "data" / "v1" / "vocabulario.json").write_text(
            '{"id": "$Format:%x72ectorado$"}\n', "utf-8"
        )
    subprocess.run(["git", "-C", str(camino), "add", "-A"], check=True)
    subprocess.run(["git", "-C", str(camino), "commit", "-qm", "pr"], check=True)
    subprocess.run(
        ["git", "-C", str(camino), "update-ref", "refs/cuatris/pr", "HEAD"], check=True
    )
    return camino


def test_la_cuarentena_aborta_si_el_pr_trae_un_gitattributes(
    raiz: Path, tmp_path: Path
):
    """Sin este freno, el gate validaba un arbol distinto del que se mergea.

    Reproduccion del hallazgo: con `data/v1/vocabulario.json export-subst` en el
    `.gitattributes` del PR, `git archive` entrega `{"id": "rectorado"}` mientras el archivo
    que se mergearia dice `{"id": "$Format:%x72ectorado$"}`. Con `export-ignore` el archivo ni
    siquiera llega a `.cuarentena` y no se valida nunca.
    """
    orden = _paso_de(
        raiz, "pr-datos.yml", "validar_datos", "Copiar los datos del PR a .cuarentena/"
    )
    repo = _repo_de_pr(tmp_path, con_gitattributes=True)
    resultado = _correr_shell(orden, repo)
    assert resultado.returncode != 0
    assert ".gitattributes" in resultado.stdout + resultado.stderr
    assert not (repo / ".cuarentena" / "data").exists()


def test_la_cuarentena_copia_los_datos_cuando_el_pr_no_trae_gitattributes(
    raiz: Path, tmp_path: Path
):
    orden = _paso_de(
        raiz, "pr-datos.yml", "validar_datos", "Copiar los datos del PR a .cuarentena/"
    )
    repo = _repo_de_pr(tmp_path, con_gitattributes=False)
    resultado = _correr_shell(orden, repo)
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr
    copiado = repo / ".cuarentena" / "data" / "v1" / "vocabulario.json"
    assert copiado.read_text(encoding="utf-8") == '{"id": "rectorado"}\n'


@pytest.mark.parametrize(
    ("workflow", "job", "nombre"),
    [
        ("pr-datos.yml", "validar_datos", "Validar los datos del PR en cuarentena"),
        ("deploy.yml", "desplegar", "Revalidar data/ completo"),
    ],
)
def test_lo_que_no_es_json_dentro_de_data_hace_fallar(
    raiz: Path, tmp_path: Path, workflow: str, job: str, nombre: str
):
    """Ni C1, ni C2, ni C3 abren un archivo que no sea `*.json`, y el deploy publica `data/` entero.

    Reproduccion del hallazgo: `data/v1/horarios/nota.html` con un `<script>` no aparece en
    `find data -type f -name '*.json'`, asi que ningun validador lo abre, y despues queda
    servido en el mismo origen que la SPA y su `localStorage` (amenaza A5).
    """
    orden = _paso_de(raiz, workflow, job, nombre)
    trabajo = tmp_path / "trabajo"
    (trabajo / "data" / "v1" / "horarios").mkdir(parents=True)
    (trabajo / "data" / "v1" / "horarios" / "nota.html").write_text(
        "<script>x</script>\n", "utf-8"
    )
    resultado = _correr_shell(orden, trabajo)
    assert resultado.returncode != 0
    salida = resultado.stdout + resultado.stderr
    assert "no son .json" in salida or "no .json" in salida
    assert "nota.html" in salida


@pytest.mark.parametrize(
    ("workflow", "job", "nombre"),
    [
        ("pr-datos.yml", "validar_datos", "Validar los datos del PR en cuarentena"),
        ("deploy.yml", "desplegar", "Revalidar data/ completo"),
    ],
)
def test_un_symlink_dentro_de_data_hace_fallar(
    raiz: Path, tmp_path: Path, workflow: str, job: str, nombre: str
):
    """`find data -type f` no lista symlinks: sin guardia propia no los valida nadie.

    La revalidacion del deploy tenia la guardia de `*.json` pero no esta, asi que un symlink
    dentro de `data/` se colaba sin validar y `cp -R data app/dist/data` lo publicaba.
    """
    orden = _paso_de(raiz, workflow, job, nombre)
    trabajo = tmp_path / "trabajo"
    (trabajo / "data" / "v1" / "horarios").mkdir(parents=True)
    (trabajo / "data" / "v1" / "horarios" / "2026-2C.json").symlink_to("/etc/passwd")
    resultado = _correr_shell(orden, trabajo)
    assert resultado.returncode != 0
    assert "simb" in resultado.stdout + resultado.stderr


def test_decidir_publica_la_clase_mas_restrictiva_de_las_dos(raiz: Path):
    """El recalculo por rutas no ve modos, LFS, bajas ni colisiones: no puede aflojar la clase."""
    documento = cargar_yaml(
        (raiz / ".github" / "workflows" / "pr-datos.yml").read_text("utf-8")
    )
    validar = documento["jobs"]["validar_datos"]
    assert validar["outputs"]["clase"] == "${{ steps.triage.outputs.clase }}"
    paso = next(
        paso
        for paso in documento["jobs"]["decidir"]["steps"]
        if isinstance(paso.get("run"), str) and "archivos-api.txt" in str(paso["run"])
    )
    assert paso["env"]["CLASE_TRIAGE"] == "${{ needs.validar_datos.outputs.clase }}"
    orden = str(paso["run"])
    assert 'os.environ.get("CLASE_TRIAGE"' in orden
    assert "por_ruta == DATOS and del_triage == DATOS" in orden


def _workflow_prt(cuerpo_del_job: str, env_raiz: str = "") -> str:
    return (
        "name: x\n"
        "on: pull_request_target\n" + env_raiz + "jobs:\n"
        "  j:\n"
        "    runs-on: ubuntu-latest\n"
        "    permissions:\n"
        "      contents: write\n"
        "    steps:\n" + cuerpo_del_job
    )


def test_env_del_documento_raiz_tambien_trae_el_pr(tmp_path):
    """El `env:` a nivel de workflow llega a todos los pasos: cuenta igual que el del paso."""
    from cuatris.validar import guardarrailes

    ruta = tmp_path / "w.yml"
    ruta.write_text(
        _workflow_prt(
            '      - run: git fetch origin "$SHA" && git checkout FETCH_HEAD && npm ci\n',
            env_raiz="env:\n  SHA: ${{ github.event.pull_request.head.sha }}\n",
        ),
        encoding="utf-8",
    )
    hallazgos = guardarrailes.revisar_ruta(ruta)
    assert any(h.regla == "pull-request-target-con-permisos" for h in hallazgos), (
        hallazgos
    )


def test_checkout_con_ref_refs_pull_trae_el_pr(tmp_path):
    """`actions/checkout` con `ref: refs/pull/<n>/merge` trae el PR aunque no diga «head»."""
    from cuatris.validar import guardarrailes

    ruta = tmp_path / "w.yml"
    ruta.write_text(
        _workflow_prt(
            "      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2\n"
            "        with:\n"
            "          ref: refs/pull/${{ github.event.pull_request.number }}/merge\n"
            "      - run: npm ci\n",
        ),
        encoding="utf-8",
    )
    hallazgos = guardarrailes.revisar_ruta(ruta)
    assert any(h.regla == "pull-request-target-con-permisos" for h in hallazgos), (
        hallazgos
    )
