// Vuelo de la tarjeta de carrera hasta el icono de perfil de la barra.
//
// Al elegir una carrera en CarreraPicker, la tarjeta «despega» (una copia fija
// sobre la página; la original se oculta) y, cuando el planner ya montó con
// esa carrera, «aterriza» sobre el icono de perfil de la barra (la carrera
// vive dentro del perfil): la caja se desplaza y se redondea hasta la medida
// del icono mientras la cara de tarjeta se funde en la de perfil. Así se ve
// adónde fue a parar la elección y dónde se cambia después.
//
// Es imperativo y vive fuera de React a propósito: el árbol del planner se
// remonta entero al cambiar de carrera (`key`), y la copia tiene que
// sobrevivir a ese remontaje. CarreraPicker llama a `despegar` con la tarjeta
// tocada y PerfilMenu, al montar, a `aterrizar` con su botón. Si el destino
// no aparece (falló la carga) la copia se desvanece y la tarjeta vuelve.
// Con prefers-reduced-motion no hay vuelo.

/** Duración del vuelo (coincide con la transición de .cvuelo en planner.css). */
const VUELO_MS = 520;
/** Sin destino en este tiempo (carga fallida o lenta): se cancela. */
const ESPERA_MAX_MS = 2500;

interface Vuelo {
  ghost: HTMLElement;
  card: HTMLElement;
  desde: DOMRect;
  timeout: number;
}

let pendiente: Vuelo | null = null;

const sinMovimiento = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** El mismo avatar de PerfilMenu (IconAvatar dentro de .pmenu__avatar), como marcado. */
const ICONO_PERFIL =
  '<span class="pmenu__avatar" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><circle cx="12" cy="7.6" r="4.4"/><path d="M3.2 22c.4-5 4-7.8 8.8-7.8s8.4 2.8 8.8 7.8c0 .6-.4 1-1 1H4.2c-.6 0-1-.4-1-1Z"/></svg></span>';

function ubicar(el: HTMLElement, r: { left: number; top: number; width: number; height: number }) {
  el.style.left = `${r.left}px`;
  el.style.top = `${r.top}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
}

/** Copia la tarjeta en una capa fija y la deja «levantada» mientras carga el
 *  plan. La otra cara es el icono de perfil en el que se convierte. */
export function despegar(card: HTMLElement): void {
  if (pendiente || sinMovimiento() || typeof document === "undefined") return;
  const desde = card.getBoundingClientRect();

  const ghost = document.createElement("div");
  ghost.className = "planner cvuelo";
  ghost.setAttribute("aria-hidden", "true");
  ubicar(ghost, desde);

  // cara de tarjeta: la misma tarjeta, tal cual se ve
  const cara = card.cloneNode(true) as HTMLElement;
  cara.className = "cpick__card cvuelo__card";
  cara.removeAttribute("id");
  cara.setAttribute("tabindex", "-1");

  // cara de destino: el icono de perfil de la barra (con su color, si tiene)
  const btn = document.createElement("div");
  btn.className = "pmenu__btn cvuelo__btn";
  const real = document.querySelector<HTMLElement>(".pmenu__btn");
  const pf = real?.style.getPropertyValue("--pf");
  if (pf) btn.style.setProperty("--pf", pf);
  btn.insertAdjacentHTML("beforeend", ICONO_PERFIL);

  ghost.append(cara, btn);
  document.body.appendChild(ghost);
  card.style.visibility = "hidden";

  const timeout = window.setTimeout(cancelar, ESPERA_MAX_MS);
  const vuelo: Vuelo = { ghost, card, desde, timeout };
  pendiente = vuelo;
  // el levantado arranca en el próximo frame para que transicione (salvo que
  // el plan ya haya cargado y la copia esté volando)
  requestAnimationFrame(() => {
    if (pendiente === vuelo) ghost.classList.add("is-alto");
  });
}

/** Lleva la copia hasta `destino` (el botón del selector), que queda oculto
 *  hasta que la copia lo cubre; al final la copia se retira y el botón se
 *  muestra con un breve realce. Sin vuelo pendiente no hace nada. */
export function aterrizar(destino: HTMLElement): void {
  const v = pendiente;
  if (!v) return;
  pendiente = null;
  clearTimeout(v.timeout);

  const hasta = destino.getBoundingClientRect();
  if (!hasta.width) {
    // el botón no se ve (no debería pasar): sin destino, solo desvanecer
    desvanecer(v.ghost);
    return;
  }
  destino.style.visibility = "hidden";
  const { ghost } = v;
  // si el plan cargó en el mismo frame del clic, el estado inicial todavía no
  // se calculó: forzarlo antes de cambiar las medidas, así hay transición
  void ghost.offsetWidth;
  ghost.classList.remove("is-alto");
  ghost.classList.add("is-volando");
  ubicar(ghost, hasta);

  window.setTimeout(() => {
    ghost.remove();
    destino.style.visibility = "";
    destino.classList.add("is-recien");
    window.setTimeout(() => destino.classList.remove("is-recien"), 700);
  }, VUELO_MS + 40);
}

/** Abandona el vuelo (carga fallida): la copia se desvanece y la tarjeta
 *  original vuelve a verse. */
export function cancelar(): void {
  const v = pendiente;
  if (!v) return;
  pendiente = null;
  clearTimeout(v.timeout);
  v.card.style.visibility = "";
  desvanecer(v.ghost);
}

function desvanecer(ghost: HTMLElement) {
  ghost.classList.add("is-fuera");
  window.setTimeout(() => ghost.remove(), 240);
}
