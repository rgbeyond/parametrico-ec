# Coordinación multiagente — regla obligatoria

## Contexto canónico obligatorio
Antes de continuar cualquier trabajo Beyond, lee `docs/operacion/contexto-compartido-chatgpt-claude.md` y contrástalo con el issue activo y la evidencia más reciente. Ese documento contiene decisiones de producto, forma de trabajo de RG, límites DEV/PROD y correcciones de alcance que no deben depender de memoria de sesión. La copia de `beyond-platform` es canónica; si cambia una decisión material, sincroniza primero esa copia, replica los tres espejos y registra los SHAs antes del handoff.

Tras trabajo externo: sincroniza; lee protocolo/issue/evidencia; resume qué cambió, hecho, no repetir y pendiente antes de escribir. Un writer, reviewers read-only, todo cambio comiteado/pusheado antes del handoff.

## Modo rápido seguro
Usa reviewers Beyond según superficie; sólo hallazgos >=80%; tests focalizados y `/beyond-validate` en hitos; `/beyond-handoff`, `/beyond-e2e`, `/beyond-migration` cuando corresponda; mutation testing sólo autorización nueva/HIGH/CRITICAL/prueba dudosa.

## Permisos en lenguaje simple
Antes de un permiso visible explica: Qué voy a hacer; Para qué; Dónde afecta; Riesgo BAJO/MEDIO/ALTO/CRÍTICO; Reversible y cómo; Recomendación permitir una vez/siempre patrón exacto/denegar. No uses nombres de tools como explicación. No pidas permitir siempre para comandos compuestos/amplios por comodidad; Auto mode/reglas específicas cubren rutina. Hook PermissionRequest es respaldo.

## Límites
No bypassPermissions; no PROD/main/deploy producción sin autorización explícita; DEV no implica PROD; nunca dos writers sobre el mismo sistema.

## Reglas de seguridad Beyond
`.claude/claude-security-guidance.md` lleva las reglas concretas de este producto (PROD vs DEV, sesión, `user_metadata`, catálogo, costos, secretos/PII, proxy). Léelo antes de revisar o cambiar auth, RLS, catálogo o rutas. El plugin `security-guidance` no lo carga solo: no lee rutas arbitrarias del proyecto, así que sin esta referencia el archivo no lo abre nadie.
