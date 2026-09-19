"""Checkpoint del scraper: un archivo JSONL por periodo con lo que ya se bajo.

Un barrido completo del SGA son ~500 peticiones a un ritmo de una por segundo: entre ocho y
diez minutos en los que se puede cortar la red, vencer la sesion o cerrarse la terminal. Para
que eso no obligue a empezar de nuevo, cada curso terminado se agrega **en el momento** a
`.cuatris-cache/<periodo>.jsonl` y el archivo se cierra en cada escritura.

Formato: una linea por curso, con un objeto JSON en una sola linea y las claves ordenadas.

```
{"aparicion": 1, "codigo": "30.28", "curso": {…}, "listado": {…}, "periodo": "2026-2C"}
```

`curso` es el objeto tal como va a quedar en `cursos[]` de
`data/v1/horarios/<periodo>.json`, o sea la salida de `parsers.curso_a_dict` para ese curso:
al reanudar no hay que volver a interpretar HTML, solo leer el archivo.

`listado` guarda lo que la fila del listado decia de ese curso —`periodo`, `desde` y `hasta`
**sin recortar**—, porque el barrido va pagina por pagina y el intervalo del cuatrimestre no
se conoce hasta el final: los cursos anuales se separan y se recortan cuando termina el
barrido, leyendo estos registros. `aparicion` distingue las filas repetidas: el listado trae
codigos que aparecen dos veces (472 filas, 461 codigos distintos en la corrida del
2026-09-12) y cada una es una fila propia.

Los registros escritos por versiones anteriores no traen `listado` ni `aparicion`: se cargan
igual, como cursos propios del periodo y aparicion 1.

El directorio `.cuatris-cache/` esta en `.gitignore`: es cache local, no material del
repositorio, y los volcados de `--guardar-html` que conviven ahi llevan el nombre del usuario
en la barra superior del SGA.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

__all__ = ["CACHE", "Checkpoint", "ErrorDeCheckpoint", "Registro", "clave_de_curso"]

#: Directorio de cache, relativo a la raiz del repositorio.
CACHE = ".cuatris-cache"

REGISTRO = logging.getLogger("cuatris.sga")


class ErrorDeCheckpoint(ValueError):
    """El archivo de checkpoint no se puede leer y hay que decidir a mano que hacer."""


def clave_de_curso(codigo: str, aparicion: int = 1) -> str:
    """`93.18` para la primera aparicion del codigo; `93.18#2`, `93.18#3`… para las demas."""
    return codigo if aparicion <= 1 else f"{codigo}#{aparicion}"


@dataclass(frozen=True)
class Registro:
    """Una linea del checkpoint, ya leida.

    `listado` es lo que decia la fila del listado (`periodo`, `desde`, `hasta`); en los
    registros viejos viene vacio y se trata como «propio del periodo de la corrida».
    """

    codigo: str
    curso: dict[str, Any]
    aparicion: int = 1
    listado: dict[str, Any] = field(default_factory=dict)

    @property
    def clave(self) -> str:
        return clave_de_curso(self.codigo, self.aparicion)

    @property
    def periodo_del_listado(self) -> str | None:
        """Periodo que el listado le puso a la fila, o `None` si el registro no lo trae."""
        periodo = self.listado.get("periodo")
        return periodo if isinstance(periodo, str) and periodo else None


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

    def registros(self) -> list[Registro]:
        """Los registros completos, en el orden en que se escribieron.

        Una ultima linea truncada —el corte de luz a mitad de un `write`— se descarta con un
        aviso: descartar ese curso cuesta una peticion, mientras que rechazar el archivo
        entero costaria la corrida completa, que es justo lo que el checkpoint evita. Una
        linea rota que **no** sea la ultima si es un error: ahi el archivo esta corrupto de
        una forma que este modulo no sabe explicar.
        """
        if not self.ruta.is_file():
            return []
        leidos: list[Registro] = []
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
            leidos.append(
                Registro(
                    codigo=self._codigo(registro, numero),
                    curso=self._curso(registro, numero),
                    aparicion=self._aparicion(registro, numero),
                    listado=self._listado(registro, numero),
                )
            )
        return leidos

    def cargar(self) -> dict[str, dict[str, Any]]:
        """Cursos ya bajados, por clave (`codigo` o `codigo#2`) y en orden de escritura."""
        return {registro.clave: registro.curso for registro in self.registros()}

    def codigos(self) -> set[str]:
        """Claves ya bajadas (`codigo`, o `codigo#2` para una fila repetida)."""
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

    def _aparicion(self, registro: dict[str, Any], numero: int) -> int:
        aparicion = registro.get("aparicion", 1)
        if isinstance(aparicion, bool) or not isinstance(aparicion, int) or aparicion < 1:
            raise ErrorDeCheckpoint(
                f"{self.ruta}:{numero}: «aparicion» tiene que ser un entero mayor que cero."
            )
        return aparicion

    def _listado(self, registro: dict[str, Any], numero: int) -> dict[str, Any]:
        listado = registro.get("listado", {})
        if not isinstance(listado, dict):
            raise ErrorDeCheckpoint(
                f"{self.ruta}:{numero}: «listado» tiene que ser un objeto JSON."
            )
        return listado

    # -- escritura -----------------------------------------------------------------------

    def agregar(
        self,
        codigo: str,
        curso: dict[str, Any],
        *,
        listado: dict[str, Any],
        aparicion: int = 1,
    ) -> None:
        """Agrega un curso terminado. Abre y cierra el archivo en cada llamada.

        `listado` es lo que decia la fila (`periodo`, `desde`, `hasta`, sin recortar) y
        `aparicion` distingue la segunda fila de un mismo codigo.
        """
        self.ruta.parent.mkdir(parents=True, exist_ok=True)
        linea = json.dumps(
            {
                "codigo": codigo,
                "aparicion": aparicion,
                "curso": curso,
                "listado": dict(listado),
                "periodo": self.periodo,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
        with self.ruta.open("a", encoding="utf-8", newline="\n") as archivo:
            archivo.write(linea + "\n")
