#!/usr/bin/env python3
"""Scrapea los programas analíticos (PDF) y deja un JSON separado por bloques.

Fuente:  public/electivas-fichas/<codigo>.pdf  (Programas Analíticos - GRADO, ITBA)
Salida:  lib/planner/resumenes.json  (Record<codigo, Resumen>, tracked en git)

Cada entrada queda separada por bloques que consume el sitio para armar el
"resumen" que va ANTES del programa completo de cada materia:

  {
    "72.41": {
      "codigo", "materia",
      "puntosClave": ["...", ...],          # derivado de los Objetivos de aprendizaje
      "contenidosMinimos": "...",           # resumen oficial de temas
      "evaluacion": {
        "resumen": "Se evalúa con ...",     # una línea legible (determinista)
        "flags": {parcial, final, tp, promociona, asistenciaObligatoria, asistenciaPct},
        "texto": "..."                       # crudo (Modalidad + Requisitos)
      },
      "bibliografia": {"obligatoria": [...], "complementaria": [...]}
    }, ...
  }

Se corre A MANO (depende de `pdftotext`, poppler). Regenerar con:
    python3 data/plan/build-resumenes.py
"""
import json
import os
import re
import subprocess
import unicodedata

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC_DIR = os.path.join(REPO, "public", "electivas-fichas")
OUT = os.path.join(REPO, "lib", "planner", "resumenes.json")

SECTIONS = [
    "Carga horaria",
    "Contenidos mínimos",
    "Presentación de la materia",
    "Objetivos de aprendizaje",
    "Contenidos",
    "Estrategias de enseñanza",
    "Actividades",
    "Recursos didácticos",
    "Modalidad de evaluación y aprobación",
    "Bibliografía obligatoria",
    "Bibliografía complementaria",
]

HEADING_RE = re.compile(r"^\s*➢\s*(.+?):\s*$")
FOOTER_RE = re.compile(r"Generado:\s*\d{1,2}\s+\w+\.?\s+\d{4}", re.I)


def pdftotext(path, *args):
    return subprocess.run(
        ["pdftotext", *args, path, "-"],
        capture_output=True, text=True, check=True,
    ).stdout


def clean(s):
    return s.replace("​", "").replace(" ", " ")


def collapse(s):
    return re.sub(r"[ \t]+", " ", s).strip()


def norm(s):
    """minúsculas sin acentos (para matchear robusto)."""
    s = (s or "").lower()
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def split_sections(layout):
    """Divide el texto -layout en {nombre: [líneas]} por los bullets ➢."""
    lines = [l for l in clean(layout).split("\n") if not FOOTER_RE.search(l)]
    heads = []
    for i, l in enumerate(lines):
        m = HEADING_RE.match(l)
        if m:
            heads.append((m.group(1).strip(), i))
    secs = {}
    for k, (name, i) in enumerate(heads):
        end = heads[k + 1][1] if k + 1 < len(heads) else len(lines)
        secs[name] = lines[i + 1:end]
    header = "\n".join(lines[: heads[0][1]]) if heads else ""
    return header, secs


def prose(lines):
    """Une líneas en párrafos (separados por línea en blanco)."""
    if not lines:
        return ""
    paras, cur = [], []
    for raw in lines:
        l = raw.strip()
        if not l:
            if cur:
                paras.append(collapse(" ".join(cur)))
            cur = []
        else:
            cur.append(l)
    if cur:
        paras.append(collapse(" ".join(cur)))
    return "\n\n".join(p for p in paras if p)


def biblio(lines):
    """Tabla 'N° | Descripción' → lista de descripciones (une filas que envuelven)."""
    if not lines:
        return []
    out = []
    for raw in lines:
        l = raw.strip()
        if not l:
            continue
        m = re.match(r"^(\d+)\s{1,}(.+)$", l)
        if m:
            out.append(collapse(m.group(2)))
        elif out and not re.match(r"^N°", l, re.I) and not re.match(r"^Descripci", l, re.I):
            out[-1] = collapse(out[-1] + " " + l)
    return out


BULLET_RE = re.compile(r"^\s*[-•*·▪◦o]\s+(.*)")
ENDS_SENTENCE = re.compile(r"[.:;!?)]$")


def puntos_clave(obj_lines, cont_minimos):
    """Deriva los puntos clave desde 'Objetivos de aprendizaje'.

    Maneja 3 formas reales del PDF:
      · bullets con marcador  ('- Aprender a ...')
      · lista con intro ':'   ('Se espera que ...:' + líneas sin marcador)
      · una sola oración      (un único objetivo)
    Une líneas que envuelven al ítem anterior. Fallback: contenidos mínimos.
    """
    lines = [l.strip() for l in (obj_lines or []) if l.strip()]
    if not lines:
        # fallback: primeras oraciones de contenidos mínimos
        frases = re.split(r"(?<=[.;])\s+", cont_minimos or "")
        return [collapse(f) for f in frases if len(collapse(f)) > 12][:5]

    marked = any(BULLET_RE.match(l) for l in lines)
    items = []

    if marked:
        cur = None
        for l in lines:
            m = BULLET_RE.match(l)
            if m:
                if cur:
                    items.append(cur)
                cur = collapse(m.group(1))
            elif cur is not None:
                cur = collapse(cur + " " + l)  # continuación (línea envuelta)
        if cur:
            items.append(cur)
    else:
        # ¿hay intro terminada en ':'? → lista sin marcador
        start = 0
        if lines[0].endswith(":"):
            start = 1
        rest = lines[start:]
        if start == 1 and len(rest) > 1:
            # lista sin marcador tras intro (ej. "Se espera que ...:"): cada ítem
            # arranca en Mayúscula/dígito; una línea en minúscula es continuación
            # (wrap) del ítem anterior.
            cur = None
            for l in rest:
                starts_new = bool(re.match(r"^[A-ZÁÉÍÓÚÜÑ0-9¿]", l))
                if cur is not None and not starts_new:
                    cur = collapse(cur + " " + l)
                else:
                    if cur:
                        items.append(cur)
                    cur = collapse(l)
            if cur:
                items.append(cur)
        else:
            # bloque de prosa → un único punto (o dividir por oraciones si es largo)
            texto = collapse(" ".join(rest))
            if len(texto) > 220:
                frases = re.split(r"(?<=[.;])\s+", texto)
                items = [collapse(f) for f in frases if len(collapse(f)) > 12]
            else:
                items = [texto] if texto else []

    # limpieza: sacar puntas de marcador residual, cap a 6
    items = [re.sub(r"^[-•*·]\s*", "", it).strip() for it in items if it.strip()]
    return items[:6]


def derive_eval(texto):
    """Flags de evaluación (mismo heurístico que lib/planner/programa.ts)."""
    t = norm(texto)
    parcial = bool(re.search(r"\bparcial(es)?\b", t))
    tp = bool(re.search(r"\btrabajos?\s+practicos?\b|\btp\b|\btpe\b", t))
    final = bool(
        re.search(r"\bexamen(es)?\s+final(es)?\b", t)
        or re.search(r"\bfinal(es)?\b\s*(escrito|oral|individual|integrador)", t)
        or re.search(r"aprobar la materia[^.]{0,120}\bfinal\b", t)
        or re.search(r"rendir[^.]{0,40}\bfinal\b", t)
        or re.search(r"coloquio\s+final", t)
    )
    promociona = None
    if re.search(r"\bpromoc\w*", t):
        promociona = True
    elif final:
        promociona = False
    elif parcial:
        promociona = True

    asis_oblig = None
    asis_pct = None
    if re.search(r"\b(asistencia|presentismo|inasistencia|asistir)\b", t):
        if (re.search(r"(asistencia|presentismo)[^.]{0,70}(obligatori|reglamento|minim|requisit|debe)", t)
                or re.search(r"(obligatori|requisit|minim)[^.]{0,50}(asistencia|presentismo)", t)):
            asis_oblig = True
        pb = re.search(r"(\d{2,3})\s*%\s*(?:o\s+mas)?\s*(?:de\s+(?:las\s+)?)?(?:asistencia|presentismo|clases|de asistir)", t)
        pa = re.search(r"(?:asistencia|presentismo|asistir)(?:\s+a\s+clases?)?\s*(?:\(|del?\s+|al\s+|de\s+al\s+menos\s+|mas\s+del?\s+|mayor\s+al?\s+|superior\s+al?\s+|minim\w*\s+(?:del?\s+)?)*(\d{2,3})\s*%", t)
        m = pb or pa
        if m:
            n = int(m.group(1))
            if 40 <= n <= 100:
                asis_pct = n
                asis_oblig = True
    return {
        "parcial": parcial, "final": final, "tp": tp,
        "promociona": promociona,
        "asistenciaObligatoria": asis_oblig, "asistenciaPct": asis_pct,
    }


def eval_resumen(f):
    """Arma una línea legible de la evaluación desde los flags (determinista)."""
    inst = []
    if f["parcial"]:
        inst.append("parcial(es)")
    if f["tp"]:
        inst.append("trabajo práctico")
    if f["final"]:
        inst.append("examen final")
    if inst:
        if len(inst) == 1:
            instancias = inst[0]
        else:
            instancias = ", ".join(inst[:-1]) + " y " + inst[-1]
        base = f"Se evalúa con {instancias}."
    else:
        base = "Modalidad de evaluación según la cátedra."

    if f["promociona"] is True and not f["final"]:
        base += " Promociona sin examen final."
    elif f["final"]:
        base += " Requiere aprobar un examen final."

    if f["asistenciaPct"] is not None:
        base += f" Asistencia obligatoria del {f['asistenciaPct']}%."
    elif f["asistenciaObligatoria"] is True:
        base += " Asistencia / presentismo obligatorio."
    return base


def build(codigo, path):
    layout = pdftotext(path, "-layout")
    header, secs = split_sections(layout)
    h = clean(header)
    mm = re.search(r"Materia:\s*([\s\S]*?)\s{2,}Código:", h)
    materia = collapse(mm.group(1)) if mm else ""

    cont_min = prose(secs.get("Contenidos mínimos"))
    obj_lines = secs.get("Objetivos de aprendizaje")
    eval_txt = prose(secs.get("Modalidad de evaluación y aprobación"))
    flags = derive_eval(eval_txt)

    return {
        "codigo": codigo,
        "materia": materia,
        "puntosClave": puntos_clave(obj_lines, cont_min),
        "contenidosMinimos": cont_min,
        "evaluacion": {
            "resumen": eval_resumen(flags),
            "flags": flags,
            "texto": eval_txt,
        },
        "bibliografia": {
            "obligatoria": biblio(secs.get("Bibliografía obligatoria")),
            "complementaria": biblio(secs.get("Bibliografía complementaria")),
        },
    }


def main():
    pdfs = sorted(f for f in os.listdir(SRC_DIR) if f.endswith(".pdf"))
    if not pdfs:
        raise SystemExit(f"[build-resumenes] no hay PDFs en {SRC_DIR}")
    out = {}
    for f in pdfs:
        codigo = f[:-4]
        out[codigo] = build(codigo, os.path.join(SRC_DIR, f))

    ordered = {k: out[k] for k in sorted(out)}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(ordered, fh, ensure_ascii=False, indent=1)

    con_pk = sum(1 for v in ordered.values() if v["puntosClave"])
    con_ev = sum(1 for v in ordered.values() if v["evaluacion"]["texto"])
    print(f"[build-resumenes] {len(ordered)} materias → lib/planner/resumenes.json"
          f" · {con_pk} con puntos clave · {con_ev} con evaluación")
    sin_pk = [k for k, v in ordered.items() if not v["puntosClave"]]
    if sin_pk:
        print(f"  ⚠ sin puntos clave: {', '.join(sin_pk)}")


if __name__ == "__main__":
    main()
