import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { ProveedorPlanUsuario } from "./estado/contexto";
import "./fuentes/fuentes.css";
import "./estilos/tokens.css";
import "./estilos/base.css";

const raiz = document.getElementById("raiz");
if (raiz === null) {
  throw new Error("Falta el elemento #raiz en index.html.");
}

createRoot(raiz).render(
  <StrictMode>
    <ProveedorPlanUsuario>
      <App />
    </ProveedorPlanUsuario>
  </StrictMode>,
);
