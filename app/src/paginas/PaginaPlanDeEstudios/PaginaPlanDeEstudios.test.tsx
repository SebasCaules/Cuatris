/**
 * La pestaña «Plan», montada con el plan real de `data/v1/planes/`.
 *
 * Lo que se comprueba acá es lo que el autor pidió ver funcionando: los cinco
 * años con sus dos cuatrimestres, el marcado por materia y por casilla de
 * grupo, el plegado del año terminado, las electivas con su búsqueda, y —las
 * reglas permanentes— que en la pantalla no quede ni un control nativo ni un
 * `title=`, y que cada estado tenga su tooltip propio.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { act, render, screen, waitFor, within } from "@testing-library/react";
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

/**
 * La cuenta de la cabecera («9/9»). No sirve `getByText`: el numerador va en su
 * propio `<span>` para llevar otro peso, así que el texto está partido en dos
 * nodos y hay que leer el elemento entero.
 */
function cuenta(region: HTMLElement, clase: string): string {
  return region.querySelector(clase)?.textContent ?? "";
}

function casillaDelAnio(titulo: string): HTMLElement {
  return screen.getByRole("checkbox", {
    name: `Todo ${titulo} aprobado con final`,
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

/** El plan del usuario con las nueve del año 1 aprobadas con final. */
function conAnio1Aprobado(): PlanUsuario {
  return {
    version: 1,
    plan: "S10-Rev23",
    historia: Object.fromEntries(
      ANIO_1.map((codigo) => [codigo, { estado: "aprobada" as const }]),
    ),
    periodos: {},
    colores: {},
    sugerencias: [],
    preferencias: { visibles: 2 },
  };
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

  it("rotula el ciclo y los cuatrimestres como la referencia", () => {
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

  /** La leyenda reemplaza a la nota de instrucciones de R1. */
  it("arriba va la leyenda de las cuatro marcas y el atajo del SGA", () => {
    montar();
    const leyenda = screen.getByRole("list", {
      name: "Qué quiere decir cada marca",
    });
    expect(within(leyenda).getAllByRole("listitem")).toHaveLength(4);
    expect(leyenda).toHaveTextContent("Pendiente");
    expect(leyenda).toHaveTextContent("Cursando");
    expect(leyenda).toHaveTextContent("Cursada aprobada, falta el final");
    expect(leyenda).toHaveTextContent("Aprobada con final");
    expect(
      screen.getByRole("link", { name: "Pegar historia académica del SGA" }),
    ).toHaveAttribute("href", "#/inicio");
    // Y ya no hay texto de instrucciones.
    expect(
      screen.queryByText(/Marcá lo que ya aprobaste/),
    ).not.toBeInTheDocument();
  });

  /** La regla del autor, fijada en un test para que no se pueda perder. */
  it("no dibuja ni un control nativo ni un `title=`", () => {
    montar();
    expect(
      document.querySelectorAll("input, select, progress, [title]"),
    ).toHaveLength(0);
    // Y la barra de progreso sí existe: es propia.
    expect(
      screen.getAllByRole("progressbar").length,
    ).toBeGreaterThanOrEqual(6);
  });

  /**
   * Las medidas de la referencia viven en el CSS, y jsdom no aplica hojas de
   * estilo: lo que se fija acá es la declaración, que es lo que el navegador
   * después mide. La comprobación en el navegador va aparte.
   */
  it("la fila mide 36 px y la marca 22 px", () => {
    const leer = (ruta: string) =>
      readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), "utf8");
    expect(
      leer("../../componentes/FilaMateriaPlan/FilaMateriaPlan.css"),
    ).toContain("height: 36px;");
    expect(
      leer("../../componentes/MarcaMateria/MarcaMateria.css"),
    ).toContain("width: var(--marca-lado, 22px);");
  });
});

describe("PaginaPlanDeEstudios · marcado", () => {
  it("el control cicla pendiente → cursando → cursada → final → pendiente", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar();
    const codigo = "31.08";
    const nombre = nombreDe(codigo);

    expect(marca(codigo)).toHaveAccessibleName(
      `${codigo} ${nombre}: pendiente`,
    );

    await usuario.click(marca(codigo));
    expect(actual().historia[codigo]).toEqual({ estado: "cursando" });
    expect(marca(codigo)).toHaveAccessibleName(`${codigo} ${nombre}: cursando`);

    await usuario.click(marca(codigo));
    expect(actual().historia[codigo]).toEqual({ estado: "regular" });
    expect(marca(codigo)).toHaveAccessibleName(
      `${codigo} ${nombre}: cursada aprobada, falta el final`,
    );

    await usuario.click(marca(codigo));
    expect(actual().historia[codigo]).toEqual({ estado: "aprobada" });
    expect(marca(codigo)).toHaveAccessibleName(
      `${codigo} ${nombre}: aprobada con final`,
    );

    await usuario.click(marca(codigo));
    expect(actual().historia[codigo]).toBeUndefined();
    expect(marca(codigo)).toHaveAccessibleName(
      `${codigo} ${nombre}: pendiente`,
    );
  });

  it("llegar al final desde pendiente son exactamente tres clics", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar();
    for (let clic = 0; clic < 3; clic += 1) {
      await usuario.click(marca("31.08"));
    }
    expect(actual().historia["31.08"]).toEqual({ estado: "aprobada" });
  });

  it("la casilla del año deja las 9 aprobadas y queda marcada", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar();
    const primero = anio("Año 1");

    expect(cuenta(primero, ".tarjeta-anio__cuenta")).toBe("0/9");
    expect(casillaDelAnio("Año 1")).toHaveAttribute("aria-checked", "false");

    await usuario.click(casillaDelAnio("Año 1"));

    for (const codigo of ANIO_1) {
      expect(actual().historia[codigo]).toEqual({ estado: "aprobada" });
    }
    expect(Object.keys(actual().historia)).toHaveLength(ANIO_1.length);
    expect(cuenta(primero, ".tarjeta-anio__cuenta")).toBe("9/9");
    expect(casillaDelAnio("Año 1")).toHaveAttribute("aria-checked", "true");
    const barra = within(primero).getAllByRole("progressbar")[0];
    expect(barra).toHaveAttribute("aria-valuenow", "9");
    expect(barra).toHaveAttribute("aria-valuemax", "9");
  });

  it("con una sola en cursada la casilla del año queda mixta", async () => {
    const usuario = userEvent.setup();
    montar();
    // Dos clics: pendiente → cursando → cursada.
    await usuario.click(marca("31.08"));
    await usuario.click(marca("31.08"));
    expect(casillaDelAnio("Año 1")).toHaveAttribute("aria-checked", "mixed");
  });

  it("el clic sobre la casilla marcada borra las entradas del año", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar(conAnio1Aprobado());

    expect(casillaDelAnio("Año 1")).toHaveAttribute("aria-checked", "true");
    await usuario.click(casillaDelAnio("Año 1"));
    expect(actual().historia).toEqual({});
    expect(cuenta(anio("Año 1"), ".tarjeta-anio__cuenta")).toBe("0/9");
  });

  it("la casilla del cuatrimestre toca solo su columna", async () => {
    const usuario = userEvent.setup();
    const { actual } = montar();
    const primero = anio("Año 1");

    await usuario.click(
      screen.getByRole("checkbox", {
        name: "Todo el 1.º cuatrimestre de Año 1 aprobado con final",
      }),
    );
    expect(Object.keys(actual().historia).sort()).toEqual(
      [...ANIO_1.slice(0, 5)].sort(),
    );
    expect(cuenta(primero, ".tarjeta-anio__cuenta")).toBe("5/9");
    const columnas = within(primero).getAllByRole("group");
    expect(
      within(columnas[0] as HTMLElement).getByText("5/5"),
    ).toBeInTheDocument();
    expect(
      within(columnas[1] as HTMLElement).getByText("0/4"),
    ).toBeInTheDocument();
  });

  /**
   * N0-19 sigue vigente: aprobar con final saca la materia de los períodos
   * planificados. Lo que cambió con el ciclo cronológico (R2) es que ya no se
   * dispara de paso al buscar «cursando» o «cursada»: el final es el último
   * escalón, no el primero (cierra S-24).
   */
  it("el final quita la materia de la cursada planificada; cursando no", async () => {
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
    expect(actual().historia["31.08"]).toEqual({ estado: "cursando" });
    expect(actual().periodos["2026-2C"]).toEqual([
      { codigo: "31.08" },
      { codigo: "72.03" },
    ]);

    await usuario.click(marca("31.08"));
    expect(actual().historia["31.08"]).toEqual({ estado: "regular" });
    expect(actual().periodos["2026-2C"]).toEqual([
      { codigo: "31.08" },
      { codigo: "72.03" },
    ]);

    await usuario.click(marca("31.08"));
    expect(actual().historia["31.08"]).toEqual({ estado: "aprobada" });
    expect(actual().periodos["2026-2C"]).toEqual([{ codigo: "72.03" }]);
  });
});

describe("PaginaPlanDeEstudios · plegado del año completo", () => {
  it("un año ya terminado aparece plegado al abrir la página", () => {
    montar(conAnio1Aprobado());
    const primero = anio("Año 1");
    expect(
      within(primero).getByRole("button", { name: "Desplegar Año 1" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(primero.querySelector(".tarjeta-anio__cuerpo")).toHaveAttribute(
      "inert",
    );
    // Los años que faltan siguen abiertos.
    expect(
      within(anio("Año 2")).getByRole("button", { name: "Plegar Año 2" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("al completar el año con la casilla se pliega solo", async () => {
    const usuario = userEvent.setup();
    montar();
    await usuario.click(casillaDelAnio("Año 1"));

    await waitFor(() => {
      expect(
        within(anio("Año 1")).getByRole("button", { name: "Desplegar Año 1" }),
      ).toHaveAttribute("aria-expanded", "false");
    });
    expect(
      anio("Año 1").querySelector(".tarjeta-anio__cuerpo"),
    ).toHaveAttribute("inert");
  });

  it("al quitar una marca vuelve a desplegarse", async () => {
    const usuario = userEvent.setup();
    montar(conAnio1Aprobado());
    const cuerpo = () => anio("Año 1").querySelector(".tarjeta-anio__cuerpo");
    expect(cuerpo()).toHaveAttribute("inert");

    // Un clic sobre una marca en final la devuelve a pendiente.
    await usuario.click(marca("31.08", anio("Año 1")));
    expect(cuerpo()).not.toHaveAttribute("inert");
  });
});

describe("PaginaPlanDeEstudios · tooltips", () => {
  it("la marca explica el estado y el próximo clic al enfocarla", async () => {
    montar();
    const control = marca("31.08", anio("Año 1"));
    act(() => {
      control.focus();
    });
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Pendiente · clic: cursando",
      );
    });
    expect(control).toHaveAttribute(
      "aria-describedby",
      screen.getByRole("tooltip").id,
    );
  });

  it("la casilla del año explica qué hace, y cambia cuando ya está marcada", async () => {
    const usuario = userEvent.setup();
    montar();
    act(() => {
      casillaDelAnio("Año 1").focus();
    });
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Marcar todo el año como aprobado con final",
      );
    });

    await usuario.click(casillaDelAnio("Año 1"));
    act(() => {
      casillaDelAnio("Año 1").focus();
    });
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Quitar las marcas del año",
      );
    });
  });

  it("la casilla del cuatrimestre tiene su propio texto", async () => {
    montar();
    act(() => {
      screen
        .getByRole("checkbox", {
          name: "Todo el 1.º cuatrimestre de Año 1 aprobado con final",
        })
        .focus();
    });
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Marcar todo el cuatrimestre como aprobado con final",
      );
    });
  });

  it("el chevron explica si pliega o despliega", async () => {
    montar();
    act(() => {
      within(anio("Año 1"))
        .getByRole("button", { name: "Plegar Año 1" })
        .focus();
    });
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Plegar el año");
    });
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
  it("cuenta los créditos contra los 27 que exige el plan, y no lleva casilla", () => {
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
    expect(cuenta(tarjeta, ".tarjeta-electivas__cuenta")).toBe("3/27 cr");
    const barra = within(tarjeta).getByRole("progressbar");
    expect(barra).toHaveAttribute("aria-valuenow", "3");
    expect(barra).toHaveAttribute("aria-valuemax", "27");
    // Marcar «todas las electivas» no quiere decir nada: no hay casilla.
    expect(within(tarjeta).queryByRole("checkbox")).not.toBeInTheDocument();
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
