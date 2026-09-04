#!/usr/bin/env python3
"""Comprueba que cada archivo citado en la configuracion de Claude exista.

POR QUE EXISTE. La revision independiente encontro este mismo defecto dos
veces: una regla que manda a leer una ruta que en esa rama no esta. Es barato
de cometer -la regla se escribe mirando otra rama- y caro de detectar leyendo,
porque el texto se ve perfectamente razonable. Una regla que apunta a codigo
inexistente manda a buscar algo que no hay, y lo que se encuentra en su lugar
es una suposicion.

QUE MIRA. Las rutas entre acentos graves dentro de CLAUDE.md, .claude/rules/,
.claude/skills/ y .claude/agents/, mas los globs de `paths:` que no casan con
ningun archivo.

QUE NO CUENTA COMO ERROR. Una ausencia DECLARADA. Si el parrafo que cita la
ruta dice que en esta rama no existe -y varias reglas lo dicen a proposito,
porque saber que falta es informacion util-, no es un defecto: es
documentacion. Se reconoce por las frases de abajo.

Uso:  python3 scripts/verificar-referencias.py [raiz]
Sale 1 si hay algo roto, 0 si no.
"""
import glob
import os
import pathlib
import re
import sys

# Frases con las que una regla declara que algo NO esta en esta rama. Si
# aparecen en el mismo parrafo que la ruta, la ausencia es intencional.
AUSENCIA_DECLARADA = re.compile(
    r'no (existe|est[aá]n?|hay)\b|NO existe|no se encuentra|vive en la rama'
    r'|queda fuera|todav[ií]a no', re.I)

EXT = "js|mjs|py|sh|sql|json|md|css|html|toml|yml"
CITA = re.compile(r'`([A-Za-z0-9_./-]+\.(?:' + EXT + r'))`')


def parrafos(texto):
    """Devuelve (parrafo, texto) por cada bloque separado por linea en blanco."""
    return re.split(r'\n\s*\n', texto)


def revisar(raiz):
    raiz = pathlib.Path(raiz).resolve()
    fuentes = (sorted(raiz.glob(".claude/rules/*.md"))
               + sorted(raiz.glob(".claude/skills/*/SKILL.md"))
               + sorted(raiz.glob(".claude/agents/*.md"))
               + [raiz / "CLAUDE.md"])

    rotas, declaradas = [], []
    for f in fuentes:
        if not f.exists():
            continue
        for parrafo in parrafos(f.read_text(encoding="utf-8")):
            for m in CITA.finditer(parrafo):
                ref = m.group(1)
                # Sin barra no es una ruta, es un nombre de archivo suelto.
                # Y las plantillas de entorno se citan por nombre a proposito.
                if "/" not in ref or ref.startswith(("http", "." + "env")):
                    continue
                # Referencia al repositorio hermano: no se puede comprobar
                # desde aqui y no es un error.
                if ref.startswith(("propuestas-fv/", "parametrico-ec/",
                                   "beyond-platform/")):
                    continue
                if (raiz / ref).exists():
                    continue
                if AUSENCIA_DECLARADA.search(parrafo):
                    declaradas.append((f.name, ref))
                else:
                    rotas.append((f.name, ref))

    huerfanos = []
    cwd = os.getcwd()
    os.chdir(raiz)
    try:
        for f in sorted(raiz.glob(".claude/rules/*.md")):
            t = f.read_text(encoding="utf-8")
            if not t.startswith("---"):
                continue
            for p in re.findall(r'-\s*"([^"]+)"', t.split("---")[1]):
                if not glob.glob(p, recursive=True):
                    huerfanos.append((f.name, p))
    finally:
        os.chdir(cwd)

    print(f"{raiz.name}: {len(rotas)} rotas, {len(huerfanos)} globs sin "
          f"coincidencia, {len(declaradas)} ausencias declaradas (no cuentan)")
    for f, r in rotas:
        print(f"  ROTA      {f}: {r}")
    for f, p in huerfanos:
        print(f"  SIN CASAR {f}: {p}  <- la regla no se cargaria nunca")
    for f, r in declaradas:
        print(f"  declarada {f}: {r}")
    return 1 if (rotas or huerfanos) else 0


if __name__ == "__main__":
    sys.exit(revisar(sys.argv[1] if len(sys.argv) > 1 else "."))
