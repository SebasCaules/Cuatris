/**
 * 13b de punta a punta, con el plan real y la fixture de casos raros.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProveedorPlanUsuario } from "../../estado/contexto";
import { HORARIOS_RAROS, planVacio } from "../../motor/fixtures/reales";
import type { PropsCursadaConDatos } from "./PaginaCursada";
import { CursadaConDatos, reglaDeResaltado } from "./PaginaCursada";
import { DATOS, DATOS_SIN_HORARIOS, planDePrueba } from "./escenario";
import type { Horarios, PlanUsuario } from "../../contrato/tipos";
import type { DatosCargados } from "../../datos/useDatos";

type PropsDePrueba = Omit<PropsCursadaConDatos, "datos"> & {
  datos?: DatosCargados;
};

function dibujar(
  { datos = DATOS, ...props }: PropsDePrueba = {},
  plan: PlanUsuario = planDePrueba(),
) {
  return render(
    <ProveedorPlanUsuario lecturaInicial={{ estado: "listo", plan }}>
      <CursadaConDatos datos={datos} {...props} />
    </ProveedorPlanUsuario>,
  );
}

/**
 * Los horarios reales de casos raros con **un solo dato movido**: el bloque de
 * 72.44 com. S pasa del lunes 15:00–18:00 al miércoles 16:00–19:00, pegado al
 * miércoles 14:00–16:00 de 93.18 com. A. Es el mismo recurso que
 * `motor/fixtures/sedes-consecutivas.ts` (en el material real no hay dos
 * bloques pegados en sedes distintas) y acá hace falta en **miércoles**: es el
 * día cuyo nombre se escribe con acento en la grilla, que es donde el resaltado
 * de «Ver» fallaba en silencio. Códigos, sedes y aulas quedan como están.
 */
function horariosConCambioDeSedeElMiercoles(): Horarios {
  const copia = structuredClone(HORARIOS_RAROS);
  const curso = copia.cursos.find((candidato) => candidato.codigo === "72.44");
  const bloque = curso?.comisiones.find((candidata) => candidata.id === "S")
    ?.bloques[0];
  if (bloque === undefined) {
    throw new Error("72.44 com. S ya no trae su bloque: revisá este derivado.");
  }
  bloque.dia = "miercoles";
  bloque.desde = "16:00";
  bloque.hasta = "19:00";
  return copia;
}

/** Los selectores de la regla que la página inyecta para resaltar bloques. */
function selectoresResaltados(): string | null {
  const estilo = document.querySelector(".cursada style");
  const regla = estilo?.textContent ?? "";
  const llave = regla.indexOf("{");
  return llave === -1 ? null : regla.slice(0, llave);
}

function carrusel(): HTMLElement {
  const elemento = document.querySelector(".carrusel");
  if (!(elemento instanceof HTMLElement)) {
    throw new Error("La página no dibujó el carrusel.");
  }
  return elemento;
}

describe("PaginaCursada · el cuatrimestre en curso", () => {
  it("avisa del único choque del corpus y lo nombra en singular", () => {
    dibujar();
    const banner = screen.getByRole("region", {
      name: "Conflictos sin resolver",
    });
    expect(banner).toHaveTextContent("1 conflicto sin resolver en 2.º 2026");
  });

  it("lista el conflicto en la tarjeta, con la abreviación de la materia", () => {
    dibujar();
    const lista = screen.getByRole("region", { name: "Conflictos: 1" });
    expect(lista).toHaveTextContent("Lun 15–16");
    expect(lista).toHaveTextContent("93.18");
    expect(lista).toHaveTextContent("72.44");
    // 72.44 tiene abreviación aprobada; 93.18 no es materia del plan y se
    // queda con el nombre que publican los horarios.
    expect(lista).toHaveTextContent("Cripto");
    expect(lista).toHaveTextContent("Álgebra Lineal");
  });

  it("resume el cuatrimestre con las materias, los créditos y el ▲", () => {
    dibujar();
    const tarjeta = screen.getByRole("region", {
      name: "2.º cuatrimestre 2026",
    });
    expect(within(tarjeta).getByText("3 materias · 6 cr · ▲ 1")).toBeVisible();
  });

  it("baja al pie la materia que se ofrece sin comisiones publicadas", () => {
    dibujar();
    expect(
      screen.getByText(/15\.09 Agile, Lean y Lean Six Sigma/),
    ).toBeVisible();
  });

  it("«Resolver» avisa con el período y las dos materias del par", async () => {
    const alResolver = vi.fn();
    dibujar({ alResolver });
    const lista = screen.getByRole("region", { name: "Conflictos: 1" });
    await userEvent.click(within(lista).getByRole("button", { name: "Resolver" }));
    expect(alResolver).toHaveBeenCalledWith("2026-2C", "72.44", "93.18");
  });

  it("«Resolver de a uno» del banner dispara el primer choque", async () => {
    const alResolver = vi.fn();
    dibujar({ alResolver });
    await userEvent.click(
      screen.getByRole("button", { name: "Resolver de a uno" }),
    );
    expect(alResolver).toHaveBeenCalledWith("2026-2C", "72.44", "93.18");
  });

  it("un clic en un bloque de la grilla navega a la ficha de la materia", async () => {
    dibujar();
    await userEvent.click(
      screen.getByRole("button", { name: /^72\.44 Criptografía y Seguridad/ }),
    );
    expect(window.location.hash).toBe("#/materia/72.44");
  });
});

describe("PaginaCursada · los cuatrimestres futuros", () => {
  it("muestra cinco cuatrimestres: los planificados y dos vacíos al final", () => {
    dibujar();
    expect(screen.getByText("2 de 5 visibles")).toBeVisible();
  });

  it("el cuatrimestre sin horarios dice cuándo salen y lista sus materias", () => {
    dibujar();
    const tarjeta = screen.getByRole("region", {
      name: "1.º cuatrimestre 2027",
    });
    expect(tarjeta).toHaveTextContent("salen en noviembre de 2026");
    expect(within(tarjeta).getByText("BD2")).toBeVisible();
  });

  it("anuncia el destrabe de Proyecto Final donde la simulación lo alcanza", () => {
    dibujar();
    const tarjeta = screen.getByRole("region", {
      name: "2.º cuatrimestre 2027",
    });
    expect(
      within(tarjeta).getByText("72.45 Proyecto Final se destraba con 160 cr ✓"),
    ).toBeVisible();
  });

  it("«Agregar materia» queda deshabilitado hasta que alguien lo conecte", () => {
    dibujar();
    expect(screen.getByRole("button", { name: "Agregar materia" })).toBeDisabled();
  });

  it("y con `alAgregar` avisa del cuatrimestre que está a la vista", async () => {
    const alAgregar = vi.fn();
    dibujar({ alAgregar });
    await userEvent.click(
      screen.getByRole("button", { name: "Agregar materia" }),
    );
    expect(alAgregar).toHaveBeenCalledWith("2026-2C");
  });
});

describe("PaginaCursada · cuántas tarjetas se ven", () => {
  it("el control 1/2/3 cambia el ancho de las tarjetas y guarda la preferencia", async () => {
    dibujar();
    expect(carrusel().style.getPropertyValue("--carrusel-visibles")).toBe("2");

    const grupo = screen.getByRole("group", { name: "Cuatrimestres visibles" });
    await userEvent.click(within(grupo).getByRole("button", { name: "3" }));

    expect(carrusel().style.getPropertyValue("--carrusel-visibles")).toBe("3");
    expect(screen.getByText("3 de 5 visibles")).toBeVisible();
  });

  /**
   * F4.6: 13c conserva sus dos tarjetas al lado del panel de 330 px («2 de 5
   * visibles» en el artboard). Antes el panel forzaba una sola y además dejaba
   * el selector 1/2/3 apagado.
   */
  it("con el panel de agregar abierto conserva las tarjetas de 13c", () => {
    dibujar({ panelAbierto: true });
    expect(carrusel().style.getPropertyValue("--carrusel-visibles")).toBe("2");
    expect(screen.getByText("2 de 5 visibles")).toBeVisible();
    const grupo = screen.getByRole("group", { name: "Cuatrimestres visibles" });
    expect(within(grupo).getByRole("button", { name: "2" })).not.toBeDisabled();
  });
});

describe("PaginaCursada · cambio de sede en un día con acento", () => {
  function conCambioDeSede() {
    return dibujar({
      datos: { ...DATOS, horarios: horariosConCambioDeSedeElMiercoles() },
    });
  }

  it("«Ver» resalta los dos bloques que la grilla dibujó", async () => {
    conCambioDeSede();
    await userEvent.click(screen.getByRole("button", { name: "Ver" }));

    const selectores = selectoresResaltados();
    expect(selectores).not.toBeNull();
    // El nombre accesible dice «miércoles»; el motor dice «miercoles». Si la
    // página no traduce, esto da cero y el usuario no ve nada.
    expect(document.querySelectorAll(selectores ?? "")).toHaveLength(2);
  });

  it("y un segundo «Ver» lo apaga", async () => {
    conCambioDeSede();
    const ver = screen.getByRole("button", { name: "Ver" });
    await userEvent.click(ver);
    expect(document.querySelector(".cursada--resaltando")).not.toBeNull();
    await userEvent.click(ver);
    expect(document.querySelector(".cursada--resaltando")).toBeNull();
    expect(selectoresResaltados()).toBeNull();
  });

  it("sin choques no hay banner ni el hueco que deja su contenedor", () => {
    // Con 72.44 movido al miércoles ya no se pisa con 93.18: cero choques.
    conCambioDeSede();
    expect(
      screen.queryByRole("region", { name: "Conflictos sin resolver" }),
    ).toBeNull();
    expect(document.querySelector(".cursada__banner")).toBeNull();
  });
});

describe("PaginaCursada · sin período activo en el índice", () => {
  it("igual muestra carrusel para planificar desde el cuatrimestre de hoy", () => {
    // Es el `data/index.json` real de hoy: `horarios: []`, ningún activo. El
    // usuario cargó su historia y todavía no planificó nada.
    const plan = { ...planDePrueba(), periodos: {} };
    dibujar({ datos: DATOS_SIN_HORARIOS, hoy: "2026-09-12" }, plan);

    expect(document.querySelector(".carrusel")).not.toBeNull();
    expect(screen.getByText("2 de 3 visibles")).toBeVisible();
    expect(
      screen.getByRole("region", { name: "2.º cuatrimestre 2026" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "1.º cuatrimestre 2027" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Agregar materia" }),
    ).toBeInTheDocument();
  });
});

/**
 * R1: la pantalla vacía que tapaba 13b se fue. Sin nada aprobado el carrusel
 * se dibuja igual y arriba va la nota que manda a la pestaña «Plan».
 */
describe("PaginaCursada · sin nada marcado en el Plan", () => {
  it("dibuja el carrusel igual y avisa que lo aprobado se marca en el Plan", () => {
    dibujar({}, planVacio());
    expect(
      screen.getByText(
        /Todavía no marcaste nada en el Plan: los choques y correlativas se calculan sobre lo aprobado\./,
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Ir al plan" })).toHaveAttribute(
      "href",
      "#/plan",
    );
    expect(document.querySelector(".carrusel")).not.toBeNull();
  });

  it("con algo aprobado la nota no aparece", () => {
    dibujar({});
    expect(screen.queryByRole("link", { name: "Ir al plan" })).toBeNull();
  });
});

describe("reglaDeResaltado", () => {
  it("sin cambio de sede no hay regla", () => {
    expect(reglaDeResaltado(null)).toBeNull();
  });

  it("apunta a los dos bloques por su nombre accesible", () => {
    const regla = reglaDeResaltado({
      a: {
        codigo: "93.18",
        nombre: "Álgebra Lineal",
        comision: "A",
        vigencia: { desde: "2026-07-26", hasta: "2026-12-31" },
        bloque: {
          dia: "jueves",
          desde: "14:00",
          hasta: "16:00",
          sede: "rectorado",
          modalidad: "presencial",
          aulas: ["203R"],
        },
      },
      b: {
        codigo: "72.44",
        nombre: "Criptografía y Seguridad",
        comision: "S",
        vigencia: { desde: "2026-07-26", hasta: "2026-12-31" },
        bloque: {
          dia: "jueves",
          desde: "16:00",
          hasta: "19:00",
          sede: "sdt",
          modalidad: "presencial",
          aulas: ["002R"],
        },
      },
      dia: "jueves",
      hora: "16:00",
    });
    expect(regla).toContain('[aria-label^="93.18 "]');
    expect(regla).toContain('[aria-label*=" · jueves 16:00–19:00"]');
  });

  it("escribe el día como lo escribe la grilla, con acento", () => {
    // Bloques reales de 93.18 com. A: miércoles en SDT, jueves en Rectorado.
    const regla = reglaDeResaltado({
      a: {
        codigo: "93.18",
        nombre: "Álgebra Lineal",
        comision: "A",
        vigencia: { desde: "2026-07-26", hasta: "2026-12-31" },
        bloque: {
          dia: "miercoles",
          desde: "14:00",
          hasta: "16:00",
          sede: "sdt",
          modalidad: "presencial",
          aulas: ["201T"],
        },
      },
      b: {
        codigo: "30.28",
        nombre: "Accionamientos Industriales",
        comision: "A",
        vigencia: { desde: "2026-07-26", hasta: "2026-12-31" },
        bloque: {
          dia: "sabado",
          desde: "16:00",
          hasta: "19:00",
          sede: "rectorado",
          modalidad: "presencial",
          aulas: ["003T"],
        },
      },
      dia: "miercoles",
      hora: "16:00",
    });
    expect(regla).toContain('[aria-label*=" · miércoles 14:00–16:00"]');
    expect(regla).toContain('[aria-label*=" · sábado 16:00–19:00"]');
  });
});
