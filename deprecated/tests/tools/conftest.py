"""Fixtures compartidas de los tests de la CLI."""

from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def raiz() -> Path:
    """Raíz del repositorio."""
    return RAIZ


@pytest.fixture(scope="session")
def corpus(raiz: Path) -> Path:
    return raiz / "tests" / "corpus"


@pytest.fixture(scope="session")
def fixtures(raiz: Path) -> Path:
    return raiz / "tests" / "fixtures"
