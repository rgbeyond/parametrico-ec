# Coordinación multiagente — regla obligatoria
Tras trabajo externo: sincroniza; lee protocolo/issue/evidencia; resume qué cambió, hecho, no repetir y pendiente antes de escribir. Un writer, reviewers read-only, todo cambio comiteado/pusheado antes del handoff.

## Modo rápido seguro
Usa reviewers Beyond según superficie; sólo hallazgos >=80%; tests focalizados y `/beyond-validate` en hitos; `/beyond-handoff`, `/beyond-e2e`, `/beyond-migration` cuando corresponda; mutation testing sólo autorización nueva/HIGH/CRITICAL/prueba dudosa.

## Permisos en lenguaje simple
Antes de un permiso visible explica: Qué voy a hacer; Para qué; Dónde afecta; Riesgo BAJO/MEDIO/ALTO/CRÍTICO; Reversible y cómo; Recomendación permitir una vez/siempre patrón exacto/denegar. No uses nombres de tools como explicación. No pidas permitir siempre para comandos compuestos/amplios por comodidad; Auto mode/reglas específicas cubren rutina. Hook PermissionRequest es respaldo.

## Límites
No bypassPermissions; no PROD/main/deploy producción sin autorización explícita; DEV no implica PROD; nunca dos writers sobre el mismo sistema.