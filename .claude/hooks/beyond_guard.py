#!/usr/bin/env python3
"""Guardia PreToolUse: bloquea main/produccion/force-push y escrituras a PROD.

Dos huecos encontrados al probarlo caso por caso (issue #4) y cerrados aqui:

  1. `git push` A SECAS no casaba con ningun patron. Si HEAD esta en main con
     upstream configurado, esa orden empuja a main y pasaba en silencio. No se
     resuelve con una expresion regular: hay que preguntarle a git en que rama
     estamos.
  2. `git push origin +main` fuerza mediante refspec sin `--force` ni `-f`, y
     ademas el `+` rompia el patron de main. Evadia los dos controles a la vez.

Sobre los falsos positivos: este guardia mira el TEXTO de la orden, asi que
tambien bloquea ordenes que solo MENCIONAN el literal (escribir una prueba,
documentar). Es deliberado: para un control de seguridad, sobre-bloquear y
pedir confirmacion humana es el sesgo correcto. Si estorba, arma la cadena en
tiempo de ejecucion o usa la herramienta de escritura en vez del shell.
"""
import json, os, re, subprocess, sys

PROD_REF = 'xteroaxzhkixehnnbpbh'
DEV_REF = 'gtxvzbeyywtqihfcvezk'
PROTEGIDAS = ('main', 'master')

try:
    e = json.load(sys.stdin)
except Exception:
    sys.exit(0)

t = str(e.get('tool_name', ''))
i = e.get('tool_input') or {}
x = json.dumps(i, ensure_ascii=False).lower()
c = str(i.get('command', '')).lower()


def out(d, r, u=None):
    o = {'hookSpecificOutput': {'hookEventName': 'PreToolUse',
                                'permissionDecision': d,
                                'permissionDecisionReason': r}}
    if u:
        o['systemMessage'] = u
    print(json.dumps(o, ensure_ascii=False))
    sys.exit(0)


CRITICO = 'BLOQUEADO — Riesgo CRÍTICO: podría modificar versión oficial/historial.'

# `git -C /otra/ruta push origin main` ejecuta exactamente lo mismo que
# `git push origin main`, pero entre `git` y `push` hay argumentos y NINGUN
# patron de abajo lo veia: todos exigen `git` y `push` pegados. El hueco no era
# teorico: la politica de permisos preautoriza `Bash(git -C /home/user/... *)`
# para trabajar los tres repositorios sin preguntar, asi que este guardia es lo
# unico que queda entre esa orden y main. Se normalizan las opciones globales
# de git ANTES de comparar. `c` ya viene en minusculas, por eso `-c` cubre
# tambien `-C`.
OPCIONES_GIT = re.compile(
    r'\bgit\s+((?:-c\s+\S+|--git-dir(?:=|\s+)\S+|--work-tree(?:=|\s+)\S+'
    r'|--no-pager|--exec-path=\S+|--literal-pathspecs)\s+)+')
c_literal = c
c = OPCIONES_GIT.sub('git ', c)
otro_repo = bool(re.search(r'\bgit\s+(-c|--git-dir|--work-tree)\b', c_literal))

# `\+?` cubre el refspec forzado `+main` y `HEAD:+main`.
for p in [r'git\s+push[^\n;&|]*(?:\s|:)\+?(?:main|master)(?:\s|$)',
          r'git\s+push[^\n;&|]*--force',
          r'git\s+push[^\n;&|]*\s-f(?:\s|$)',
          # Un `+` al frente de CUALQUIER refspec es un empuje forzado.
          r'git\s+push[^\n;&|]*\s\+[\w./-]+',
          r'gh\s+pr\s+merge',
          r'netlify\s+deploy[^\n;&|]*(?:--prod|-p)(?:\s|$)']:
    if re.search(p, c):
        out('deny', 'Acción crítica bloqueada: main/producción/force-push '
                    'requieren autorización explícita.', CRITICO)

# `git push` SIN refspec explicito: el destino lo decide la rama actual, asi que
# hay que mirarla. Se pregunta a git y no se adivina; si git no responde se pide
# confirmacion, que es el lado seguro de la duda.
if re.search(r'(^|[;&|]\s*)git\s+push\b', c) and not re.search(
        r'git\s+push[^\n;&|]*\s[\w./+-]+\s+[\w./+:-]+', c):
    if otro_repo:
        # El empuje apunta a OTRO repositorio y sin destino explicito lo decide
        # la rama de ESE repositorio, que no es la que resuelve el bloque de
        # abajo. Preguntar es el unico lado honesto de la duda.
        out('ask', '`git push` sin destino explícito sobre otro repositorio: '
                   'la rama de destino no es la de este proyecto.',
            'CONFIRMACIÓN — no se pudo determinar el destino del empuje.')
    # Se resuelve contra CLAUDE_PROJECT_DIR y no contra el directorio heredado:
    # si el gancho corriera desde fuera del repositorio, `git rev-parse` falla y
    # toda orden `git push` acabaria pidiendo confirmacion sin motivo.
    try:
        rama = subprocess.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
                              capture_output=True, text=True, timeout=3,
                              cwd=os.environ.get('CLAUDE_PROJECT_DIR') or None
                              ).stdout.strip().lower()
    except Exception:
        rama = ''
    if rama in PROTEGIDAS:
        out('deny', f'`git push` sin destino explícito desde la rama {rama}: '
                    'empujaría a una rama protegida.', CRITICO)
    if not rama:
        out('ask', '`git push` sin destino explícito y no se pudo leer la rama '
                   'actual: confirma que no va a una rama protegida.',
            'CONFIRMACIÓN — no se pudo determinar el destino del empuje.')

if PROD_REF in x:
    words = ('apply_migration', 'insert', 'update', 'delete', 'alter', 'drop',
             'truncate', 'create', 'grant', 'revoke', 'upsert', 'deploy')
    if any(w in t.lower() or re.search(r'\b' + re.escape(w) + r'\b', x)
           for w in words):
        out('deny', 'Beyond PROD no admite escrituras sin autorización explícita.',
            'BLOQUEADO — Riesgo CRÍTICO: intenta modificar Beyond PROD.')
    out('ask', 'Consulta a Beyond PROD: parece sólo lectura, pero usa datos reales.',
        'CONFIRMACIÓN — Riesgo ALTO por entorno: consulta datos reales de PROD.')

if DEV_REF in x or 'apply_migration' in t.lower():
    if any(re.search(r'\b' + w + r'\b', x) for w in
           ('insert', 'update', 'delete', 'alter', 'drop', 'truncate',
            'create', 'grant', 'revoke')) or 'apply_migration' in t.lower():
        out('ask', 'Cambio en Beyond DEV: puede modificar datos/permisos/estructura.',
            'CONFIRMACIÓN — Riesgo ALTO: modifica el laboratorio DEV, no PROD.')

sys.exit(0)
