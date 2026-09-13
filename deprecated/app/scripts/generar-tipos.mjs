/**
 * Genera los tipos TypeScript del contrato de datos a partir de los JSON Schema.
 *
 *   npm run tipos
 *
 * Lee `schemas/v1/*.schema.json` (hermano de `app/`) y escribe un modulo por
 * schema en `app/src/contrato/generado/`. `app/src/contrato/tipos.ts` reexporta
 * esos tipos con los nombres que usa la aplicacion.
 *
 * Un solo origen de verdad: si el schema cambia, la aplicacion no compila hasta
 * adaptarse. Por eso `typecheck` y `build` corren este script antes.
 *
 * Falla ruidosamente: cualquier error de compilacion corta el proceso con
 * codigo distinto de cero y el archivo problematico en el mensaje.
 */

/*
 * `eslint.config.js` (Ola 1) no declara los globales de Node para `scripts/`.
 * Se declaran acá para no tocar un archivo ajeno por tres identificadores.
 */
/* global console, process */

import { readdir, mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compileFromFile } from "json-schema-to-typescript";

const aqui = dirname(fileURLToPath(import.meta.url));
/** `app/` es hermana de `schemas/`. */
const raizApp = resolve(aqui, "..");
const directorioSchemas = resolve(raizApp, "..", "schemas", "v1");
const directorioSalida = join(raizApp, "src", "contrato", "generado");

const SUFIJO = ".schema.json";

/**
 * Cabecera en espanol de cada archivo generado.
 *
 * Sin `eslint-disable`: lo que sale son declaraciones de tipo y ninguna regla
 * del proyecto se queja de ellas, asi que la directiva solo agregaria un aviso
 * de «directiva sin usar» en cada corrida de `npm run lint`.
 */
function cabecera(nombreSchema) {
  return [
    "/**",
    ` * Generado por \`npm run tipos\` desde \`schemas/v1/${nombreSchema}\`.`,
    " *",
    " * NO LO EDITES A MANO: la proxima generacion pisa los cambios. Si hace",
    " * falta otra forma, se cambia el schema y se vuelve a generar.",
    " */",
  ].join("\n");
}

/** Opciones comunes; el estilo sigue al del resto de `app/src`. */
function opciones(nombreSchema) {
  return {
    bannerComment: cabecera(nombreSchema),
    // Sin firmas de indice `[k: string]: unknown`: el contrato es cerrado.
    additionalProperties: false,
    cwd: directorioSchemas,
    declareExternallyReferenced: true,
    enableConstEnums: false,
    style: {
      bracketSpacing: true,
      printWidth: 80,
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      trailingComma: "all",
      useTabs: false,
    },
  };
}

/** Reemplaza el archivo solo si el contenido cambio (no toca mtime al pedo). */
async function escribirSiCambio(ruta, contenido) {
  let anterior = null;
  try {
    anterior = await readFile(ruta, "utf8");
  } catch {
    anterior = null;
  }
  if (anterior === contenido) {
    return false;
  }
  await writeFile(ruta, contenido, "utf8");
  return true;
}

async function principal() {
  let entradas;
  try {
    entradas = await readdir(directorioSchemas);
  } catch (error) {
    throw new Error(
      `No se pudo leer ${directorioSchemas}: ${error.message}. ` +
        "Los schemas del contrato viven en `schemas/v1/`, hermana de `app/`.",
    );
  }
  const schemas = entradas.filter((nombre) => nombre.endsWith(SUFIJO)).sort();
  if (schemas.length === 0) {
    throw new Error(
      `No hay ningun \`*${SUFIJO}\` en ${directorioSchemas}; sin schemas no ` +
        "hay tipos que generar.",
    );
  }

  await mkdir(directorioSalida, { recursive: true });

  const generados = [];
  for (const nombreSchema of schemas) {
    const base = nombreSchema.slice(0, -SUFIJO.length);
    let codigo;
    try {
      codigo = await compileFromFile(
        join(directorioSchemas, nombreSchema),
        opciones(nombreSchema),
      );
    } catch (error) {
      throw new Error(
        `Fallo la generacion de tipos de ${nombreSchema}: ${error.message}`,
      );
    }
    const ruta = join(directorioSalida, `${base}.ts`);
    const cambio = await escribirSiCambio(ruta, codigo);
    generados.push({ base, cambio });
  }

  const cambiados = generados.filter((uno) => uno.cambio).length;
  console.log(
    `tipos: ${generados.length} schema(s) -> src/contrato/generado/ ` +
      `(${cambiados} archivo(s) actualizado(s))`,
  );
}

principal().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
