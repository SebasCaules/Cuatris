"""Hallazgos de validacion y su presentacion en texto plano.

Un hallazgo es una linea del reporte: `ERROR|WARNING archivo: mensaje`. La `regla` no se
imprime, pero es lo que usan los tests y los workflows para identificar el motivo exacto.
"""

from __future__ import annotations

from dataclasses import dataclass

ERROR = "ERROR"
WARNING = "WARNING"

__all__ = ["ERROR", "WARNING", "Hallazgo", "formatear", "hay_errores"]


@dataclass(frozen=True)
class Hallazgo:
    """Un problema encontrado en un archivo de datos."""

    nivel: str
    """`ERROR` (bloquea) o `WARNING` (solo informa)."""

    regla: str
    """Identificador estable de la regla incumplida, por ejemplo `clave-duplicada`."""

    archivo: str
    """Ruta del archivo tal como la escribio quien invoco la herramienta."""

    mensaje: str
    """Explicacion en una linea, en espanol neutro, con el fragmento problematico."""

    def linea(self) -> str:
        """Devuelve la linea del reporte para este hallazgo."""
        return f"{self.nivel} {self.archivo}: {self.mensaje}"


def formatear(hallazgos: list[Hallazgo]) -> str:
    """Arma el reporte completo: una linea por hallazgo, en el orden en que se encontraron."""
    return "\n".join(hallazgo.linea() for hallazgo in hallazgos)


def hay_errores(hallazgos: list[Hallazgo]) -> bool:
    """Indica si algun hallazgo es de nivel `ERROR`."""
    return any(hallazgo.nivel == ERROR for hallazgo in hallazgos)
