#!/usr/bin/env python3
"""Genera data.js (window.PLAN) mergeando electivas.json + obligatorias.json + horarios.json.
Agrega abreviaturas, paridad de cuatrimestre y parseo de aula/sede/modalidad por slot."""
import json, re

ele = json.load(open("electivas.json", encoding="utf-8"))
obl = json.load(open("obligatorias.json", encoding="utf-8"))
hor = json.load(open("horarios.json", encoding="utf-8"))

AREAS = ["Ciencia de Datos", "Imágenes y Realidad Virtual", "Inteligencia Artificial", "Arquitectura de Software"]
AREA_MAP = {
    "Ciencia de  Datos": "Ciencia de Datos",
    "Imágenes y Realidad Virtual": "Imágenes y Realidad Virtual",
    "Inteligencia Artificial": "Inteligencia Artificial",
    "Arqitectura de Software": "Arquitectura de Software",
}

# Abreviaturas curadas (las lindas). El resto se autogenera.
ABBR = {
    # --- Obligatorias del núcleo informático (abreviaturas pedidas) ---
    "72.03": "Intro a la Info", "93.59": "Discreta", "93.35": "Lógica",
    "72.32": "XML", "93.41": "F1", "93.42": "F2", "93.43": "F3",
    "72.08": "Arqui", "72.35": "Inge 1", "72.36": "HCI", "72.07": "Protos",
    "72.39": "TLA", "93.24": "Proba", "31.08": "Sist. Representación",
    "94.24": "Metodología",
    # ------------------------------------------------------------------
    "72.41": "BDII", "72.42": "POD", "93.75": "MNA", "72.27": "SIA",
    "72.43": "GPI", "72.44": "Cripto", "72.20": "Redes", "12.83": "SOA",
    "72.45": "PF", "72.98": "PL", "94.23": "FG3", "94.52": "Inglés II",
    "72.40": "Inge 2", "61.23": "Eco", "61.32": "Der", "72.25": "SDS",
    "72.52": "ATI", "72.75": "ML", "73.40": "ArqMS", "81.57": "ASD",
    "73.82": "BDEM", "72.80": "BigData", "73.81": "Ciber", "73.84": "CDA",
    "82.08": "Cloud", "25.04": "Cuántica", "72.58": "CG", "94.42": "ComEst",
    "10.07": "Creat", "61.08": "DerDig", "61.11": "DerLab", "73.98": "DIV",
    "73.30": "DPS", "72.87": "DSon", "94.62": "Ética", "82.21": "FPDD",
    "61.50": "Finanzas", "10.09": "FpE", "73.22": "DevOps", "81.13": "FutPos",
    "72.71": "ISI", "72.90": "IoT", "16.50": "Bioinfo", "81.14": "ProdM",
    "73.23": "PODat", "73.50": "Infra", "72.97": "IPV", "73.62": "IPP",
    "81.74": "RA", "81.16": "Negoc", "16.04": "Neuro", "61.13": "PCont",
    "94.65": "PPS", "94.64": "PExp", "73.66": "PIS", "82.18": "NLP",
    "23.15": "RV", "73.63": "REq", "16.57": "RobBio", "72.79": "SMA",
    "73.64": "DL", "72.74": "VisInfo",
    "72.50": "DevJueg", "72.53": "Visión3D", "72.54": "OLAP", "72.18": "ProgFunc",
    "72.66": "Embeb", "72.72": "AVMC", "72.77": "Testing", "72.85": "WebSem",
    "72.92": "Grafos", "73.89": "Blockchain", "72.96": "AppMóvil", "73.21": "AppMP",
    "73.69": "LLM", "73.70": "ADNeuro", "74.60": "Visión", "81.76": "TecFin",
}

STOP = {"de","la","el","y","en","a","para","los","las","del","e","al","con","un","una"}
ROMAN = {"i","ii","iii","iv"}
def auto_abbr(nombre):
    words = [w for w in re.split(r"[\s\-:()]+", nombre) if w]
    sig = [w for w in words if w.lower() not in STOP]
    if not sig: sig = words
    out = []
    for w in sig[:5]:
        if w.lower() in ROMAN: out.append(w.upper())
        else: out.append(w[0].upper())
    ab = "".join(out)
    if len(ab) < 2: ab = sig[0][:5].capitalize()
    return ab

def abbr_of(codigo, nombre):
    return ABBR.get(codigo) or auto_abbr(nombre)

def ciclo_short(raw):
    if not raw: return ""
    if "Básico" in raw or "Basico" in raw: return "Ciclo Básico"
    if "Profesional" in raw: return "Ciclo Profesional"
    return raw

def parse_seccion(s):
    m = re.search(r"Año\s+(\d+)\s*-\s*Cuatrimestre\s+(\d+)", s or "")
    return (int(m.group(1)), int(m.group(2))) if m else (9, 9)

# --- obligatorias ---
obligatorias = []
for m in obl["materias"]:
    anio, cuat = parse_seccion(m.get("seccion"))
    obligatorias.append({
        "codigo": m["codigo"], "nombre": m["nombre"], "abbr": abbr_of(m["codigo"], m["nombre"]),
        "creditos": m.get("creditos") or 0, "creditosReq": m.get("creditos_requeridos") or 0,
        "correlativas": m.get("correlativas", []),
        "ciclo": ciclo_short(m.get("ciclo")), "seccion": m.get("seccion", ""),
        "anio": anio, "cuatri": cuat, "parity": cuat if cuat in (1, 2) else None,
        "tipo": "obligatoria",
    })

# --- electivas ---
electivas = []
for m in ele["materias"]:
    areas = [AREA_MAP.get(a, a) for a in m.get("areas", [])]
    electivas.append({
        "codigo": m["codigo"], "nombre": m["nombre"], "abbr": abbr_of(m["codigo"], m["nombre"]),
        "creditos": m.get("creditos") or 0, "creditosReq": m.get("creditos_requeridos") or 0,
        "correlativas": m.get("correlativas", []), "areas": areas,
        "parity": None,
        "tipo": "electiva",
    })

# --- aula/sede/modalidad por slot ---
def parse_aula(raw):
    raw = raw or ""
    sala = ""
    mm = re.search(r"(\d{2,3}[A-Z])", raw)
    if mm: sala = mm.group(1)
    sede = ""
    ms = re.search(r"Sede\s+([A-Za-zÁÉÍÓÚáéíóúñ ]+?)(?:\s+Aula|$)", raw)
    if ms: sede = ms.group(1).strip()
    elif "SDT" in raw: sede = "SDT"
    modal = ""
    if re.search(r"asincr", raw, re.I): modal = "Asincrónico"
    elif re.search(r"sincr", raw, re.I): modal = "Virtual"
    elif re.search(r"blended", raw, re.I): modal = "Blended"
    elif re.search(r"presencial", raw, re.I): modal = "Presencial"
    return {"sala": sala, "sede": sede, "modalidad": modal, "async": bool(re.search(r"asincr", raw, re.I))}

# --- horarios (index por codigo) ---
horarios = {}
for c in hor:
    coms = []
    for cm in c.get("comisiones", []):
        slots = [{**s, **parse_aula(s.get("aula", ""))} for s in cm.get("slots", [])]
        coms.append({"comision": cm["comision"], "slots": slots,
                     "profesores": cm.get("profesores", ""), "cupo": cm.get("cupo", "")})
    horarios[c["codigo"]] = {
        "periodo": c.get("periodo", ""), "anio": c.get("anio", ""),
        "comienzo": c.get("comienzo", ""), "fin": c.get("fin", ""),
        "depto": c.get("depto", ""), "comisiones": coms,
    }

# Build divulgable / despersonalizado: el planner se publica SIN materias pre-aprobadas
# (cada compañero arranca limpio y persiste su propio progreso en localStorage). Mantener []
# acá para que data.js sea reproducible y no reintroduzca un historial académico personal.
aprobadas_default = []

edges = []; seen_e = set()
for src in (obl, ele):
    for e in src.get("aristas_correlativas", []):
        k = (e["from"], e["to"])
        if k not in seen_e: seen_e.add(k); edges.append({"from": e["from"], "to": e["to"]})

out = {
    "areas": AREAS, "obligatorias": obligatorias, "electivas": electivas,
    "horarios": horarios, "edges": edges, "aprobadasDefault": aprobadas_default,
    "creditosElectivasReq": 27, "tituloAnalista": 147,
    "generado": "2026-06-17",
}

with open("data.js", "w", encoding="utf-8") as f:
    f.write("// Generado por build-data.py — no editar a mano.\n")
    f.write("window.PLAN = ")
    f.write(json.dumps(out, ensure_ascii=False, indent=1))
    f.write(";\n")

print(f"OK data.js: {len(obligatorias)} oblig, {len(electivas)} electivas, {len(horarios)} con horario, {len(edges)} edges")
