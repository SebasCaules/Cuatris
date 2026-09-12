/**
 * La pestaña «Plan» de R1, montada con el plan real de `data/v1/planes/`.
 *
 * Lo que se comprueba acá es lo que el autor pidió ver funcionando: los cinco
 * años con sus dos cuatrimestres, el marcado por materia y por grupo, las
 * electivas con su búsqueda, y —la regla permanente— que en la pantalla no
 * quede ni un control nativo con aspecto por defecto.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import type { Materia, PlanUsuario } from "../../contrato/tipos";
import { ProveedorPlanUsuario } from "../../estado/contexto";
import { usePlanUsuario } from "../../estado/contexto";
import { ABREVIACIONES, PLAN } from "../../motor/fixtures/reales";
import { PlanDeEstudiosConDatos } from "./PaginaPlanDeEstudios";

/** Los nueve códigos del año 1, en el orden del archivo del plan. */
const ANIO_1 = [
  "31.08",
  "72.03",
  "93.26",
  "93.58",
  "94.24",
  "72.31",
  "93.28",
  "93.41",
  "93.59",
];

/** Deja a la vista el plan del usuario sin tener que leer `localStorage`. */
function Sonda({ ver }: { ver: (plan: PlanUsuario) => void }) {
  const { plan } = usePlanUsuario();
  ver(plan);
  return null;
}

interface Montado {
  /** El plan del usuario tal como quedó en el último render. */
  actual: () => PlanUsuario;
}

function montar(inicial?: PlanUsuario): Montado {
  let ultimo: PlanUsuario | null = null;
  render(
    <ProveedorPlanUsuario
      lecturaInicial={
        inicial === undefined
          ? { estado: "vacio" }
          : { estado: "listo", plan: inicial }
      }
      retardoGuardadoMs={0}
    >
      <Sonda
        ver={(plan) => {
          ultimo = plan;
        }}
      />
      <PlanDeEstudiosConDatos plan={PLAN} abreviaciones={ABREVIACIONES} />
    </ProveedorPlanUsuario>,
  );
  return {
    actual: () => {
      if (ultimo === null) {
        throw new Error("la sonda no llegó a ver ningún plan");
      }
      return ultimo;
    },
  };
}

function anio(titulo: string): HTMLElement {
  return screen.getByRole("region", { name: titulo });
}

/** La marca de una materia, buscada por su nombre accesible. */
function marca(codigo: string, dentro: HTMLElement = document.body) {
  return within(dentro).getByRole("button", {
    name: new RegExp(`^${codigo.replace(".", "\\.")} `),
  });
}

function nombreDe(codigo: string): string {
  const materia = PLAN.materias.find(
    (candidata) => candidata.codigo === codigo,
  );
  if (materia === undefined) {
    throw new Error(`${codigo} no está en el plan real`);
  }
  return materia.nombre;
}

afterEach(() => {
  window.localStorage.clear();
});

describe("PaginaPlanDeEstudios · estructura", () => {
  it("lista los cinco años y la sección de electivas", () => {
    montar();
    for (const titulo of ["Año 1", "Año 2", "Año 3", "Año 4", "Año 5"]) {
      expect(anio(titulo)).toBeInTheDocument();
    }
    expect(screen.getByRole("region", { name: "Electivas" })).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Año 6" }),
    ).not.toBeInTheDocument();
  });

  it("el año 1 tiene 5 + 4 materias, en el orden del plan", () => {
    montar();
    const columnas = within(anio("Año 1")).getAllByRole("group");
    expect(columnas).toHaveLength(2);
    const codigos = (columna: HTMLElement) =>
      within(columna)
        .getAllByRole("listitem")
        .map(
          (fila) =>
            fila.querySelector(".fila-materia-plan__codigo")?.textContent,
        );
    expect(codigos(columnas[0] as HTMLElement)).toEqual(ANIO_1.slice(0, 5));
    expect(codigos(columnas[1] as HTMLElement)).toEqual(ANIO_1.slice(5));
  });

  it("rotula el ciclo y los cuatrimestres como la captura", () => {
    montar();
    const primero = anio("Año 1");
    expect(primero).toHaveTextContent("CICLO BÁSICO");
    expect(
      within(primero).getByText("1.º CUATRIMESTRE"),
    ).toBeInTheDocument();
    expect(
      within(primero).getByText("2.º CUATRIMESTRE"),
    ).toBeInTheDocument();
  });

  it("los ítems de cero créditos se escriben «0 cr»", () => {
    montar();
    const ingles = PLAN.materias.find(
      (materia) => materia.creditos === 0 && materia.ciclo !== "electiva",
    ) as Materia;
    const fila = screen
      .getByRole("button", { name: new RegExp(`^${ingles.codigo} `) })
      .closest("li") as HTMLElement;
    expect(within(fila).getByText("0 cr")).toBeInTheDocument();
  });

  it("el nombre enlaza a la ficha de la materia", () => {
    montar();
    expect(screen.getByRole("link", { name: nombreDe("93.58") })).toHaveAttribute(
      "href",
      "#/materia/93.58",
    );
  });

  /** La regla del autor, fijada en un test para que no se pueda perder. */
  it("no dibuja ni una casilla, ni un select, ni un `<progress>`", () => {
    montar();
    expect(
      document.querySelectorAll('input[type="checkbox"], select, progress'),
    ).toHaveLength(0);
    // Y la barra de progreso sí existe: es propia.
    expect(
      screen.getAllByRole("progressbar").length,
    ).toBeGreaterThanOrEqual(6);
  });
});

describe("PaginaPlanDeEstudios · marcado", () => {
  it("el control cicla los cuatro estados y vuelve a pendiente", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar();
    const codigo = "31.08";
    const nombre = nombreDe(codigo);

    expect(marca(codigo)).toHaveAccessibleName(
      `${codigo} ${nombre}: pendiente`,
    );

    await usuario.click(marca(codigo));
    expect(actual().historia[codigo]).toEqual({ estado: "aprobada" });
    expect(marca(codigo)).toHaveAccessibleName(
      `${codigo} ${nombre}: aprobada con final`,
    );

    await usuario.click(marca(codigo));
    expect(actual().historia[codigo]).toEqual({ estado: "regular" });
    expect(marca(codigo)).toHaveAccessibleName(
      `${codigo} ${nombre}: cursada aprobada, falta el final`,
    );

    await usuario.click(marca(codigo));
    expect(actual().historia[codigo]).toEqual({ estado: "cursando" });
    expect(marca(codigo)).toHaveAccessibleName(`${codigo} ${nombre}: cursando`);

    await usuario.click(marca(codigo));
    expect(actual().historia[codigo]).toBeUndefined();
    expect(marca(codigo)).toHaveAccessibleName(
      `${codigo} ${nombre}: pendiente`,
    );
  });

  it("«Marcar año» deja las 9 del año 1 aprobadas y la barra dice «9/9»", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar();
    const primero = anio("Año 1");

    expect(within(primero).getByText("0/9")).toBeInTheDocument();

    await usuario.click(
      within(primero).getByRole("button", { name: "Marcar Año 1" }),
    );

    for (const codigo of ANIO_1) {
      expect(actual().historia[codigo]).toEqual({ estado: "aprobada" });
    }
    expect(Object.keys(actual().historia)).toHaveLength(ANIO_1.length);
    expect(within(primero).getByText("9/9")).toBeInTheDocument();
    const barra = within(primero).getAllByRole("progressbar")[0];
    expect(barra).toHaveAttribute("aria-valuenow", "9");
    expect(barra).toHaveAttribute("aria-valuemax", "9");
  });

  it("«Desmarcar» del año borra las entradas, no las pone en otro estado", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar();
    const primero = anio("Año 1");

    await usuario.click(
      within(primero).getByRole("button", { name: "Marcar Año 1" }),
    );
    await usuario.click(
      within(primero).getByRole("button", { name: "Desmarcar Año 1" }),
    );
    expect(actual().historia).toEqual({});
    expect(within(primero).getByText("0/9")).toBeInTheDocument();
  });

  it("«Marcar cuatrimestre» toca solo su columna", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar();
    const primero = anio("Año 1");

    await usuario.click(
      within(primero).getByRole("button", {
        name: "Marcar 1.º cuatrimestre de Año 1",
      }),
    );
    expect(Object.keys(actual().historia).sort()).toEqual(
      [...ANIO_1.slice(0, 5)].sort(),
    );
    expect(within(primero).getByText("5/9")).toBeInTheDocument();
    const columnas = within(primero).getAllByRole("group");
    expect(within(columnas[0] as HTMLElement).getByText("5/5")).toBeInTheDocument();
    expect(within(columnas[1] as HTMLElement).getByText("0/4")).toBeInTheDocument();
  });

  /** N0-19: aprobar una materia la saca de todos los períodos planificados. */
  it("aprobar una materia la quita de la cursada planificada", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar({
      version: 1,
      plan: "S10-Rev23",
      historia: {},
      periodos: { "2026-2C": [{ codigo: "31.08" }, { codigo: "72.03" }] },
      colores: {},
      sugerencias: [],
      preferencias: { visibles: 2 },
    });

    await usuario.click(marca("31.08"));
    expect(actual().periodos["2026-2C"]).toEqual([{ codigo: "72.03" }]);
  });

  /**
   * «Cursada» es la cursada aprobada con el final pendiente: se guarda como
   * `regular`. El período no vuelve solo: el ciclo pasa por «final» antes, y
   * ese paso ya la sacó de la cursada planificada (N0-19). Volver a ponerla es
   * una decisión del usuario en la pestaña «Cursada», no algo que la marca
   * deshaga por su cuenta.
   */
  it("dos clics dejan «regular», y el paso por «final» ya limpió el período", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar({
      version: 1,
      plan: "S10-Rev23",
      historia: {},
      periodos: { "2026-2C": [{ codigo: "31.08" }] },
      colores: {},
      sugerencias: [],
      preferencias: { visibles: 2 },
    });

    await usuario.click(marca("31.08"));
    await usuario.click(marca("31.08"));
    expect(actual().historia["31.08"]).toEqual({ estado: "regular" });
    expect(actual().periodos["2026-2C"]).toEqual([]);
  });

  /** Marcar «cursando» directo sobre una planificada no la saca del período. */
  it("«cursando» deja la materia donde estaba", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar({
      version: 1,
      plan: "S10-Rev23",
      historia: { "31.08": { estado: "regular" } },
      periodos: { "2026-2C": [{ codigo: "31.08" }] },
      colores: {},
      sugerencias: [],
      preferencias: { visibles: 2 },
    });

    await usuario.click(marca("31.08"));
    expect(actual().historia["31.08"]).toEqual({ estado: "cursando" });
    expect(actual().periodos["2026-2C"]).toEqual([{ codigo: "31.08" }]);
  });
});

describe("PaginaPlanDeEstudios · materias no vigentes", () => {
  const noVigente = PLAN.materias.find(
    (materia) => materia.ciclo === "electiva" && !materia.vigente,
  ) as Materia;

  it("una no vigente no se lista", () => {
    montar();
    expect(
      screen.queryByRole("button", {
        name: new RegExp(`^${noVigente.codigo.replace(".", "\\.")} `),
      }),
    ).not.toBeInTheDocument();
  });

  it("una no vigente marcada sí se lista", () => {
    montar({
      version: 1,
      plan: "S10-Rev23",
      historia: { [noVigente.codigo]: { estado: "aprobada" } },
      periodos: {},
      colores: {},
      sugerencias: [],
      preferencias: { visibles: 2 },
    });
    expect(marca(noVigente.codigo)).toHaveAccessibleName(
      `${noVigente.codigo} ${noVigente.nombre}: aprobada con final`,
    );
  });
});

describe("PaginaPlanDeEstudios · electivas", () => {
  it("cuenta los créditos contra los 27 que exige el plan", () => {
    montar({
      version: 1,
      plan: "S10-Rev23",
      // 22.48 Procesamiento de Imágenes: 3 créditos.
      historia: { "22.48": { estado: "aprobada" } },
      periodos: {},
      colores: {},
      sugerencias: [],
      preferencias: { visibles: 2 },
    });
    const tarjeta = screen.getByRole("region", { name: "Electivas" });
    expect(within(tarjeta).getByText("27 CR REQUERIDOS")).toBeInTheDocument();
    expect(within(tarjeta).getByText("3/27 cr")).toBeInTheDocument();
    const barra = within(tarjeta).getByRole("progressbar");
    expect(barra).toHaveAttribute("aria-valuenow", "3");
    expect(barra).toHaveAttribute("aria-valuemax", "27");
  });

  it("la búsqueda filtra por abreviación", async () => {
    const usuario = userEvent.setup();
    montar();
    const tarjeta = screen.getByRole("region", { name: "Electivas" });
    const campo = within(tarjeta).getByLabelText(
      "Buscar electiva por nombre, código o abreviación",
    );

    // «PDI» no está en «Procesamiento de Imágenes»: solo lo sabe la abreviación.
    await usuario.type(campo, "pdi");
    const filas = within(tarjeta).getAllByRole("listitem");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toHaveTextContent("Procesamiento de Imágenes");
  });

  it("la búsqueda también filtra por nombre, y dice cuándo no encontró nada", async () => {
    const usuario = userEvent.setup();
    montar();
    const tarjeta = screen.getByRole("region", { name: "Electivas" });
    const campo = within(tarjeta).getByLabelText(
      "Buscar electiva por nombre, código o abreviación",
    );

    await usuario.type(campo, "cripto");
    expect(within(tarjeta).getAllByRole("listitem")).toHaveLength(1);
    expect(within(tarjeta).getByRole("listitem")).toHaveTextContent(
      "Introducción a Blockchain y Criptomonedas",
    );

    await usuario.clear(campo);
    await usuario.type(campo, "zzzz");
    expect(within(tarjeta).queryAllByRole("listitem")).toHaveLength(0);
    expect(
      within(tarjeta).getByText("Ninguna electiva coincide con «zzzz»."),
    ).toBeInTheDocument();
  });

  it("las electivas traen los chips de sus minors", () => {
    montar();
    const fila = marca("23.15").closest("li") as HTMLElement;
    // 23.15 Realidad Virtual pertenece a los minors IA e IRV.
    expect(within(fila).getByText("IA")).toBeInTheDocument();
    expect(within(fila).getByText("IRV")).toBeInTheDocument();
  });
});

describe("PaginaPlanDeEstudios · estado vacío", () => {
  it("con la historia vacía agrega la nota, sin tapar el plan", () => {
    montar();
    expect(
      screen.getByText(/Marcá lo que ya aprobaste\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pegar historia" })).toHaveAttribute(
      "href",
      "#/inicio",
    );
    // El plan se ve igual: la nota no reemplaza a nada.
    expect(anio("Año 1")).toBeInTheDocument();
  });

  it("con algo marcado la nota desaparece", async () => {
    const usuario = userEvent.setup();
    montar();
    await usuario.click(marca("31.08"));
    expect(
      screen.queryByText(/Marcá lo que ya aprobaste\./),
    ).not.toBeInTheDocument();
  });
});
