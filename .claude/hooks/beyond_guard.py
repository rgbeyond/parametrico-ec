#!/usr/bin/env python3
import json,re,sys
PROD_REF='xteroaxzhkixehnnbpbh';DEV_REF='gtxvzbeyywtqihfcvezk'
try:e=json.load(sys.stdin)
except Exception:sys.exit(0)
t=str(e.get('tool_name',''));i=e.get('tool_input') or {};x=json.dumps(i,ensure_ascii=False).lower();c=str(i.get('command','')).lower()
def out(d,r,u=None):
 o={'hookSpecificOutput':{'hookEventName':'PreToolUse','permissionDecision':d,'permissionDecisionReason':r}}
 if u:o['systemMessage']=u
 print(json.dumps(o,ensure_ascii=False));sys.exit(0)
for p in [r'git\s+push[^\n;&|]*(?:\s|:)(?:main|master)(?:\s|$)',r'git\s+push[^\n;&|]*--force',r'git\s+push[^\n;&|]*\s-f(?:\s|$)',r'gh\s+pr\s+merge',r'netlify\s+deploy[^\n;&|]*(?:--prod|-p)(?:\s|$)']:
 if re.search(p,c):out('deny','Acción crítica bloqueada: main/producción/force-push requieren autorización explícita.','BLOQUEADO — Riesgo CRÍTICO: podría modificar versión oficial/historial.')
if PROD_REF in x:
 words=('apply_migration','insert','update','delete','alter','drop','truncate','create','grant','revoke','upsert','deploy')
 if any(w in t.lower() or re.search(r'\b'+re.escape(w)+r'\b',x) for w in words):out('deny','Beyond PROD no admite escrituras sin autorización explícita.','BLOQUEADO — Riesgo CRÍTICO: intenta modificar Beyond PROD.')
 out('ask','Consulta a Beyond PROD: parece sólo lectura, pero usa datos reales.','CONFIRMACIÓN — Riesgo ALTO por entorno: consulta datos reales de PROD.')
if DEV_REF in x or 'apply_migration' in t.lower():
 if any(re.search(r'\b'+w+r'\b',x) for w in ('insert','update','delete','alter','drop','truncate','create','grant','revoke')) or 'apply_migration' in t.lower():out('ask','Cambio en Beyond DEV: puede modificar datos/permisos/estructura.','CONFIRMACIÓN — Riesgo ALTO: modifica el laboratorio DEV, no PROD.')
sys.exit(0)
