#!/usr/bin/env bash
#
# run.sh — regenera los datos, compila el sitio y lo levanta para ver los cambios.
#
# Antes de compilar hay que regenerar lib/planner/data.json a partir de
# data/plan/data.js (lo hace el hook predev/prebuild de npm); este script
# además limpia las cachés para que NUNCA queden cambios viejos pegados.
#
# Uso:
#   ./run.sh            modo dev: limpia, regenera y arranca el dev server con
#                       hot-reload en  http://localhost:3100
#   ./run.sh build      build estático de producción (idéntico a GitHub Pages):
#                       next build y lo sirve en  http://localhost:3101/Cuatris/
#   ./run.sh clean      solo borra cachés y artefactos generados
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="${1:-dev}"
DEV_PORT="${PORT:-3100}"
STATIC_PORT="${STATIC_PORT:-3101}"

log() { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }

free_port() {
  local pids
  pids="$(lsof -ti tcp:"$1" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    log "Liberando puerto $1 (PIDs: $pids)"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
  fi
}

ensure_deps() {
  if [ ! -d node_modules ]; then
    log "Instalando dependencias (npm ci)"
    npm ci
  fi
}

clean() {
  log "Limpiando caché de Next y artefactos generados"
  rm -rf .next out tsconfig.tsbuildinfo lib/planner/data.json .preview
}

case "$MODE" in
  clean)
    clean
    ;;
  dev)
    clean
    ensure_deps
    free_port "$DEV_PORT"
    log "Dev server en http://localhost:$DEV_PORT"
    exec npm run dev -- --port "$DEV_PORT"
    ;;
  build)
    clean
    ensure_deps
    log "Build estático (next build → out/)"
    npm run build
    touch out/.nojekyll
    free_port "$STATIC_PORT"
    # Sirve out/ bajo /Cuatris/ tal como lo hace GitHub Pages (basePath).
    rm -rf .preview && mkdir -p .preview && ln -s "$ROOT/out" .preview/Cuatris
    log "Sirviendo http://localhost:$STATIC_PORT/Cuatris/"
    exec python3 -m http.server "$STATIC_PORT" --directory .preview
    ;;
  *)
    echo "uso: ./run.sh [dev|build|clean]" >&2
    exit 2
    ;;
esac
