#!/usr/bin/env python3
import json,re,sys
PROD='xteroaxzhkixehnnbpbh';DEV='gtxvzbeyywtqihfcvezk'
try:e=json.load(sys.stdin)
except Exception:sys.exit(0)
t=str(e.get('tool_name',''));i=e.get('tool_input') or {};s=json.dumps(i,ensure_ascii=False);l=s.lower();c=str(i.get('command',''));d=str(i.get('description','')).strip();a=d or f'usar la herramienta {t}';w='la copia local de este repositorio';r='MEDIO';rev='Sí, normalmente mediante Git o repitiendo la operación.';rec='Permitir una vez.'
if PROD in l:w='Beyond PROD (datos reales)';r='CRÍTICO' if re.search(r'\b(insert|update|delete|alter|drop|truncate|create|grant|revoke|upsert)\b',l) else 'ALTO';rev='No debe asumirse reversible en PROD.';rec='Denegar salvo autorización explícita de PROD.'
elif DEV in l:w='Beyond DEV (laboratorio)';r='ALTO' if re.search(r'\b(insert|update|delete|alter|drop|truncate|create|grant|revoke|upsert)\b',l) or 'migration' in t.lower() else 'BAJO'
elif re.search(r'\bgit\s+(status|diff|log|fetch)\b',c):r='BAJO';rev='No cambia código de forma destructiva.';rec='Permitir siempre para este patrón exacto.'
elif re.search(r'\bnpm\s+(test|run\s+build)\b',c):r='BAJO';rev='Sí; sólo pruebas/artefactos.';rec='Permitir siempre si el comando es exactamente éste.'
elif re.search(r'\bgit\s+push\b',c):w='GitHub, rama indicada';r='MEDIO';rec='Permitir una vez salvo rama claude/* rutinaria claramente identificada.'
print(json.dumps({'systemMessage':f'PERMISO EN LENGUAJE SIMPLE\nQué quiere hacer: {a}\nDónde afecta: {w}.\nRiesgo: {r}.\nReversible: {rev}\nRecomendación: {rec}'},ensure_ascii=False))
