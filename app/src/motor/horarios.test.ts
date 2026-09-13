import { describe, expect, it } from "vitest";

import type { BloqueUbicado } from "./horarios";
import {
  bloquesDelPeriodo,
  cambiosDeSede,
  choques,
  cupoLleno,
  cursoDe,
  DIAS,
  ordenarComisiones,
  paresQueChocan,
  seOfrece, HorariosDeOtroPeriodo } from "./horarios";
import {
  HORARIOS_DOMINGO_VIRTUAL,
  HORARIOS_RAROS,
  PERIODO_RARO,
  planCon,
} from "./fixtures/reales";
import {
  horariosConSedeRepetida,
  horariosConSedesConsecutivas,
} from "./fixtures/sedes-consecutivas";

/** Plan de usuario con estas materias y comisiones en el período del corpus. */
function conComisiones(
  elegidas: readonly { codigo: string; comision?: string }[],
) {
  return planCon({}, { [PERIODO_RARO]: [...elegidas] });
}

describe("bloquesDelPeriodo", () => {
  it("sin comisión elegida no hay bloques", () => {
    const plan = conComisiones([{ codigo: "93.18" }]);
    expect(bloquesDelPeriodo(PERIODO_RARO, plan, HORARIOS_RAROS)).toEqual([]);
  });

  it("toma los bloques de la comisión elegida", () => {
    const plan = conComisiones([{ codigo: "93.18", comision: "A" }]);
    const bloques = bloquesDelPeriodo(PERIODO_RARO, plan, HORARIOS_RAROS);
    expect(bloques).toHaveLength(3);
    expect(bloques.map((ubicado) => ubicado.bloque.dia)).toEqual([
      "lunes",
      "miercoles",
      "jueves",
    ]);
    expect(bloques[0]?.nombre).toBe("Álgebra Lineal");
  });

  it("una comisión guardada que ya no existe no aporta bloques", () => {
    const plan = conComisiones([{ codigo: "93.18", comision: "Z" }]);
    expect(bloquesDelPeriodo(PERIODO_RARO, plan, HORARIOS_RAROS)).toEqual([]);
  });

  it("horarios de otro período son un error del llamador, no cero bloques", () => {
    const plan = conComisiones([{ codigo: "93.18", comision: "A" }]);
    expect(() => bloquesDelPeriodo("2027-1C", plan, HORARIOS_RAROS)).toThrow(
      HorariosDeOtroPeriodo,
    );
  });

  it("una materia ya aprobada no ocupa bloques aunque siga planificada", () => {
    const planificada = conComisiones([
      { codigo: "72.44", comision: "S" },
      { codigo: "93.18", comision: "A" },
    ]);
    expect(
      bloquesDelPeriodo(PERIODO_RARO, planificada, HORARIOS_RAROS).map(
        (ubicado) => ubicado.codigo,
      ),
    ).toEqual(["72.44", "93.18", "93.18", "93.18"]);
    expect(choques(PERIODO_RARO, planificada, HORARIOS_RAROS)).toHaveLength(1);

    const aprobada = planCon(
      { "72.44": { estado: "aprobada" } },
      { [PERIODO_RARO]: planificada.periodos[PERIODO_RARO] ?? [] },
    );
    expect(
      bloquesDelPeriodo(PERIODO_RARO, aprobada, HORARIOS_RAROS).map(
        (ubicado) => ubicado.codigo,
      ),
    ).toEqual(["93.18", "93.18", "93.18"]);
    expect(choques(PERIODO_RARO, aprobada, HORARIOS_RAROS)).toEqual([]);
  });

  it("cursando o regular sí ocupan bloques: esas se están cursando", () => {
    const plan = planCon(
      { "72.44": { estado: "cursando" } },
      { [PERIODO_RARO]: [{ codigo: "72.44", comision: "S" }] },
    );
    expect(bloquesDelPeriodo(PERIODO_RARO, plan, HORARIOS_RAROS)).toHaveLength(
      1,
    );
  });
});

describe("choques", () => {
  it("93.18 A y 72.44 S chocan el lunes (caso del mockup)", () => {
    const plan = conComisiones([
      { codigo: "93.18", comision: "A" },
      { codigo: "72.44", comision: "S" },
    ]);
    const encontrados = choques(PERIODO_RARO, plan, HORARIOS_RAROS);
    expect(encontrados).toHaveLength(1);
    const choque = encontrados[0];
    expect(choque?.dia).toBe("lunes");
    // 93.18 A: 14:00–16:00. 72.44 S: 15:00–18:00.
    expect(choque?.desde).toBe("15:00");
    expect(choque?.hasta).toBe("16:00");
    expect([choque?.a.codigo, choque?.b.codigo]).toEqual(["72.44", "93.18"]);
  });

  it("con la comisión C de 93.18 no hay choque", () => {
    const plan = conComisiones([
      { codigo: "93.18", comision: "C" },
      { codigo: "72.44", comision: "S" },
    ]);
    expect(choques(PERIODO_RARO, plan, HORARIOS_RAROS)).toEqual([]);
  });

  it("una comisión en dos aulas simultáneas no choca consigo misma", () => {
    // 93.18 com. B: miércoles 10:00–12:00 en 003T y 004T, un solo bloque.
    const plan = conComisiones([{ codigo: "93.18", comision: "B" }]);
    const bloques = bloquesDelPeriodo(PERIODO_RARO, plan, HORARIOS_RAROS);
    const miercoles = bloques.find(
      (ubicado) => ubicado.bloque.dia === "miercoles",
    );
    expect(miercoles?.bloque.aulas).toEqual(["003T", "004T"]);
    expect(choques(PERIODO_RARO, plan, HORARIOS_RAROS)).toEqual([]);
  });

  it("dos comisiones de la misma materia tampoco chocan entre sí", () => {
    // El estado del usuario guarda una sola comisión por materia; aun así la
    // regla es explícita: un choque es siempre entre materias distintas.
    const plan = conComisiones([
      { codigo: "93.18", comision: "A" },
      { codigo: "93.18", comision: "H" },
    ]);
    expect(choques(PERIODO_RARO, plan, HORARIOS_RAROS)).toEqual([]);
  });

  it("no hay choque si los cursos no se dictan a la vez", () => {
    // Fechas de dictado reales de 15.09 (período corto verificado en el SGA);
    // el segundo tramo es el complemento que hace falta para probar la regla.
    const corto: BloqueUbicado = {
      codigo: "15.09",
      nombre: "Agile, Lean y Lean Six Sigma",
      comision: "A",
      vigencia: { desde: "2026-09-18", hasta: "2026-10-16" },
      bloque: {
        dia: "lunes",
        desde: "14:00",
        hasta: "16:00",
        sede: "rectorado",
        modalidad: "presencial",
        aulas: [],
      },
    };
    const antes: BloqueUbicado = {
      ...corto,
      codigo: "72.44",
      nombre: "Criptografía y Seguridad",
      comision: "S",
      vigencia: { desde: "2026-07-26", hasta: "2026-09-04" },
    };
    const juntos: BloqueUbicado = { ...antes, vigencia: corto.vigencia };
    expect(paresQueChocan([corto, antes])).toEqual([]);
    expect(paresQueChocan([corto, juntos])).toHaveLength(1);
  });
});

describe("cambiosDeSede", () => {
  it("marca dos bloques pegados en sedes distintas y no los cuenta como choque", () => {
    const horarios = horariosConSedesConsecutivas();
    const plan = conComisiones([
      { codigo: "93.18", comision: "B" },
      { codigo: "30.28", comision: "A" },
    ]);
    const cambios = cambiosDeSede(PERIODO_RARO, plan, horarios);
    expect(cambios).toHaveLength(1);
    expect(cambios[0]?.dia).toBe("jueves");
    expect(cambios[0]?.hora).toBe("14:00");
    expect(cambios[0]?.a.codigo).toBe("93.18");
    expect(cambios[0]?.b.codigo).toBe("30.28");
    expect(choques(PERIODO_RARO, plan, horarios)).toEqual([]);
  });

  it("dos bloques igual de pegados pero en la misma sede no son un cambio", () => {
    // Mismo fixture que el caso positivo, con un único dato distinto: el
    // bloque movido queda en Rectorado, la sede del jueves de 93.18 com. B.
    const horarios = horariosConSedeRepetida();
    const plan = conComisiones([
      { codigo: "93.18", comision: "B" },
      { codigo: "30.28", comision: "A" },
    ]);
    const bloques = bloquesDelPeriodo(PERIODO_RARO, plan, horarios);
    const jueves = bloques.filter((ubicado) => ubicado.bloque.dia === "jueves");
    // El par existe y está pegado: 12:00–14:00 y 14:00–17:00, los dos en
    // Rectorado. Lo único que falta para el ↕ es el cambio de sede.
    expect(jueves.map((ubicado) => ubicado.bloque.sede)).toEqual([
      "rectorado",
      "rectorado",
    ]);
    expect(jueves.map((ubicado) => ubicado.bloque.desde)).toEqual([
      "12:00",
      "14:00",
    ]);
    expect(cambiosDeSede(PERIODO_RARO, plan, horarios)).toEqual([]);
  });

  it("con los horarios reales no hay ningún cambio de sede consecutivo", () => {
    const plan = conComisiones([
      { codigo: "93.18", comision: "A" },
      { codigo: "72.44", comision: "S" },
      { codigo: "30.28", comision: "A" },
    ]);
    expect(cambiosDeSede(PERIODO_RARO, plan, HORARIOS_RAROS)).toEqual([]);
  });
});

describe("cupoLleno y oferta", () => {
  it("48 de 48 está lleno; 31 de 48 no", () => {
    const curso = cursoDe("93.18", HORARIOS_RAROS);
    const llena = curso?.comisiones.find((comision) => comision.id === "A");
    const conLugar = curso?.comisiones.find((comision) => comision.id === "C");
    expect(llena && cupoLleno(llena)).toBe(true);
    expect(conLugar && cupoLleno(conLugar)).toBe(false);
  });

  it("sin ocupación publicada no se sabe, y no saber no es estar llena", () => {
    expect(cupoLleno({ id: "X", docentes: [], bloques: [] })).toBe(false);
  });

  it("seOfrece distingue lo publicado de lo que no", () => {
    expect(seOfrece("93.18", HORARIOS_RAROS)).toBe(true);
    expect(seOfrece("72.45", HORARIOS_RAROS)).toBe(false);
  });
});

describe("ordenarComisiones", () => {
  it("aplica los cuatro criterios en orden (comisiones reales de 93.18)", () => {
    const plan = conComisiones([{ codigo: "72.44", comision: "S" }]);
    const evaluadas = ordenarComisiones(
      "93.18",
      PERIODO_RARO,
      plan,
      HORARIOS_RAROS,
    );
    // Sin choques y con cupo: B, C, D, K. Sin choques y llenas: E, F, G.
    // Con choque y con cupo: H. Con choque y llena: A.
    expect(evaluadas.map((comision) => comision.id)).toEqual([
      "B",
      "C",
      "D",
      "K",
      "E",
      "F",
      "G",
      "H",
      "A",
    ]);
    expect(evaluadas.map((comision) => comision.choques)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 1, 1,
    ]);
    expect(evaluadas.map((comision) => comision.cupoLleno)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      false,
      true,
    ]);
  });

  it("explica la consecuencia de elegir una comisión, en el registro del mockup", () => {
    const plan = conComisiones([{ codigo: "72.44", comision: "S" }]);
    const evaluadas = ordenarComisiones(
      "93.18",
      PERIODO_RARO,
      plan,
      HORARIOS_RAROS,
    );
    const a = evaluadas.find((comision) => comision.id === "A");
    expect(a?.consecuencias).toEqual([
      "Se superpone con Criptografía y Seguridad (comisión S) el lunes de " +
        "15:00 a 16:00",
      "El cupo está lleno: 48 de 48",
    ]);
  });

  it("cuenta los cambios de sede como tercer criterio", () => {
    const horarios = horariosConSedesConsecutivas();
    const plan = conComisiones([{ codigo: "30.28", comision: "A" }]);
    const evaluadas = ordenarComisiones("93.18", PERIODO_RARO, plan, horarios);
    const b = evaluadas.find((comision) => comision.id === "B");
    expect(b?.cambiosDeSede).toBe(1);
    expect(b?.consecuencias).toContain("Cambiás de sede el jueves a las 14:00");
    // Ninguna otra comisión con cupo queda por debajo de B por este criterio.
    const sinChoques = evaluadas.filter(
      (comision) => comision.choques === 0 && !comision.cupoLleno,
    );
    expect(sinChoques[sinChoques.length - 1]?.id).toBe("B");
  });

  it("no compara la materia contra la comisión que ya tenía elegida", () => {
    const plan = conComisiones([{ codigo: "93.18", comision: "A" }]);
    const evaluadas = ordenarComisiones(
      "93.18",
      PERIODO_RARO,
      plan,
      HORARIOS_RAROS,
    );
    expect(evaluadas.every((comision) => comision.choques === 0)).toBe(true);
  });

  it("una materia que no se ofrece no tiene comisiones que ordenar", () => {
    const plan = conComisiones([]);
    expect(
      ordenarComisiones("72.45", PERIODO_RARO, plan, HORARIOS_RAROS),
    ).toEqual([]);
  });
});


describe("contrato 1.1.0: domingo y virtual", () => {
  it("`domingo` va último, después de sábado", () => {
    expect(DIAS).toEqual([
      "lunes",
      "martes",
      "miercoles",
      "jueves",
      "viernes",
      "sabado",
      "domingo",
    ]);
  });

  it("un bloque en domingo es un bloque más para el motor", () => {
    // 61.27 com. A: domingo 13:00–14:00 virtual asincrónico (sin sede ni aula)
    // y miércoles 19:00–21:00 presencial en la Sede Distrito Financiero.
    const plan = planCon(
      {},
      { [PERIODO_RARO]: [{ codigo: "61.27", comision: "A" }] },
    );
    const bloques = bloquesDelPeriodo(
      PERIODO_RARO,
      plan,
      HORARIOS_DOMINGO_VIRTUAL,
    );
    expect(bloques.map((ubicado) => ubicado.bloque.dia)).toEqual([
      "domingo",
      "miercoles",
    ]);
    expect(bloques[0]?.bloque.sede).toBeNull();
    expect(bloques[0]?.bloque.modalidad).toBe("virtual_asincronica");
  });

  it("`virtual` cuenta para los choques, como `virtual_sincronica`", () => {
    // Caso real del 2026-09-12: 25.20 com. K es «Virtual» los miércoles de
    // 15:00 a 18:00 y 61.27 com. D es presencial de 16:00 a 18:00. Tiene hora
    // fija: se pisan dos horas y eso es un choque.
    const plan = planCon(
      {},
      {
        [PERIODO_RARO]: [
          { codigo: "25.20", comision: "K" },
          { codigo: "61.27", comision: "D" },
        ],
      },
    );
    const pisados = choques(PERIODO_RARO, plan, HORARIOS_DOMINGO_VIRTUAL);
    expect(pisados).toHaveLength(1);
    expect(pisados[0]?.dia).toBe("miercoles");
    expect([pisados[0]?.desde, pisados[0]?.hasta]).toEqual(["16:00", "18:00"]);
    expect([pisados[0]?.a.codigo, pisados[0]?.b.codigo]).toEqual([
      "25.20",
      "61.27",
    ]);
  });

  it("los bloques de domingo no chocan con los de otro día", () => {
    // Los domingos de 61.27 com. D (12–13) y el miércoles de 25.20 com. K no
    // comparten día: el día sigue mandando también para el valor nuevo.
    const plan = planCon(
      {},
      {
        [PERIODO_RARO]: [
          { codigo: "25.20", comision: "K" },
          { codigo: "61.27", comision: "B" },
        ],
      },
    );
    const pisados = choques(PERIODO_RARO, plan, HORARIOS_DOMINGO_VIRTUAL);
    expect(pisados).toEqual([]);
  });

  it("un bloque sin sede no produce cambio de sede", () => {
    // 61.27 com. A cruza del domingo virtual (sede `null`) al miércoles en la
    // SDF: sin sede no hay a dónde viajar, y tampoco son el mismo día.
    const plan = planCon(
      {},
      { [PERIODO_RARO]: [{ codigo: "61.27", comision: "A" }] },
    );
    expect(
      cambiosDeSede(PERIODO_RARO, plan, HORARIOS_DOMINGO_VIRTUAL),
    ).toEqual([]);
  });
});
