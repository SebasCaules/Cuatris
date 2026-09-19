"""Fixtures compartidas de los tests del scraper."""

from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def raiz() -> Path:
    """Raíz del repositorio (tools/tests/conftest.py → dos niveles arriba de tools/)."""
    return RAIZ


@pytest.fixture(scope="session")
def corpus() -> Path:
    """HTML reales del SGA, anonimizados, contra los que corren los parsers."""
    return RAIZ / "tools" / "tests" / "corpus"


@pytest.fixture(scope="session")
def fixtures() -> Path:
    """Fixtures del validador de datos (las comparte con scripts/datos/test)."""
    return RAIZ / "scripts" / "datos" / "test" / "fixtures"
