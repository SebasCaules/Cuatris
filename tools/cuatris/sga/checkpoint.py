"""Checkpoint del scraper: un archivo JSONL por periodo con lo que ya se bajo.

Un barrido completo del SGA son ~500 peticiones a un ritmo de una por segundo: entre ocho y
diez minutos en los que se puede cortar la red, vencer la sesion o cerrarse la terminal. Para
que eso no obligue a empezar de nuevo, cada curso terminado se agrega **en el momento** a
`.cuatris-cache/<periodo>.jsonl` y el archivo se cierra en cada escritura.

Formato: una linea por curso, con un objeto JSON en una sola linea y las claves ordenadas.

```
{"codigo": "30.28", "curso": {…}, "periodo": "2026-2C"}
```

`curso` es el objeto tal como va a quedar en `cursos[]` de
`data/v1/horarios/<periodo>.json`, o sea la salida de `parsers.a_contrato` para ese curso:
al reanudar no hay que volver a interpretar HTML, solo leer el archivo.

El directorio `.cuatris-cache/` esta en `.gitignore`: es cache local, no material del
repositorio, y los volcados de `--guardar-html` que conviven ahi llevan el nombre del usuario
en la barra superior del SGA.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Any

__all__ = ["CACHE", "Checkpoint", "ErrorDeCheckpoint"]

#: Directorio de cache, relativo a la raiz del repositorio.
CACHE = ".cuatris-cache"

REGISTRO = logging.getLogger("cuatris.sga")


class ErrorDeCheckpoint(ValueError):
    """El archivo de checkpoint no se puede leer y hay que decidir a mano que hacer."""


class Checkpoint:
    """Estado por curso de una corrida del scraper.

    No mantiene el archivo abierto entre escrituras a proposito: cada `agregar` abre, escribe
    y cierra, de modo que un corte brusco pierde como mucho el ultimo curso.
    """

    def __init__(self, ruta: str | Path, periodo: str) -> None:
        self.ruta = Path(ruta)
        self.periodo = periodo

    @classmethod
    def para_periodo(cls, periodo: str, raiz: str | Path = ".") -> Checkpoint:
        """Checkpoint de `<raiz>/.cuatris-cache/<periodo>.jsonl`."""
        return cls(Path(raiz) / CACHE / f"{periodo}.jsonl", periodo)

    # -- lectura -------------------------------------------------------------------------

    def existe(self) -> bool:
        return self.ruta.is_file()

    def borrar(self) -> bool:
        """Borra el archivo (`--desde-cero`). Devuelve si habia algo que borrar."""
        if not self.ruta.is_file():
            return False
        self.ruta.unlink()
        REGISTRO.info("Checkpoint borrado: %s.", self.ruta)
        return True

    def cargar(self) -> dict[str, dict[str, Any]]:
        """Cursos ya bajados, indexados por codigo y en el orden en que se escribieron.

        Una ultima linea truncada —el corte de luz a mitad de un `write`— se descarta con un
        aviso: descartar ese curso cuesta una peticion, mientras que rechazar el archivo
        entero costaria la corrida completa, que es justo lo que el checkpoint evita. Una
        linea rota que **no** sea la ultima si es un error: ahi el archivo esta corrupto de
        una forma que este modulo no sabe explicar.
        """
        if not self.ruta.is_file():
            return {}
        cursos: dict[str, dict[str, Any]] = {}
        crudas = self.ruta.read_text(encoding="utf-8").splitlines()
        for numero, linea in enumerate(crudas, start=1):
            if not linea.strip():
                continue
            try:
                registro = json.loads(linea)
            except json.JSONDecodeError as exc:
                if numero == len(crudas):
                    REGISTRO.warning(
                        "La ultima linea de %s quedo a medias (corte durante la escritura); "
                        "ese curso se vuelve a bajar.",
                        self.ruta,
                    )
                    break
                raise ErrorDeCheckpoint(
                    f"{self.ruta}:{numero}: la linea no es JSON valido ({exc.msg}). "
                    "Revise el archivo o vuelva a correr con --desde-cero."
                ) from exc
            cursos[self._codigo(registro, numero)] = self._curso(registro, numero)
        return cursos

    def codigos(self) -> set[str]:
        """Codigos ya bajados."""
        return set(self.cargar())

    def cursos(self) -> Iterator[dict[str, Any]]:
        """Los objetos de curso, en el orden en que se escribieron."""
        yield from self.cargar().values()

    def __len__(self) -> int:
        return len(self.cargar())

    def _codigo(self, registro: Any, numero: int) -> str:
        if not isinstance(registro, dict):
            raise ErrorDeCheckpoint(f"{self.ruta}:{numero}: se esperaba un objeto JSON.")
        codigo = registro.get("codigo")
        if not isinstance(codigo, str) or not codigo:
            raise ErrorDeCheckpoint(f"{self.ruta}:{numero}: la linea no trae «codigo».")
        periodo = registro.get("periodo")
        if periodo is not None and periodo != self.periodo:
            raise ErrorDeCheckpoint(
                f"{self.ruta}:{numero}: la linea es del periodo «{periodo}» y esta corrida "
                f"es de «{self.periodo}». Use --desde-cero o borre el archivo."
            )
        return codigo

    def _curso(self, registro: dict[str, Any], numero: int) -> dict[str, Any]:
        curso = registro.get("curso")
        if not isinstance(curso, dict):
            raise ErrorDeCheckpoint(f"{self.ruta}:{numero}: la linea no trae el objeto «curso».")
        return curso

    # -- escritura -----------------------------------------------------------------------

    def agregar(self, codigo: str, curso: dict[str, Any]) -> None:
        """Agrega un curso terminado. Abre y cierra el archivo en cada llamada."""
        self.ruta.parent.mkdir(parents=True, exist_ok=True)
        linea = json.dumps(
            {"codigo": codigo, "curso": curso, "periodo": self.periodo},
            ensure_ascii=False,
            sort_keys=True,
        )
        with self.ruta.open("a", encoding="utf-8", newline="\n") as archivo:
            archivo.write(linea + "\n")
