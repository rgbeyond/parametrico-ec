# Backend compartido — estado para esta rama

Rama: `claude/catalogo-dev-compatibilidad`

Antes de modificar integración con Supabase, leer el handoff canónico en:

`rgbeyond/beyond-platform` → rama `claude/catalogo-dev-compatibilidad` → `docs/operacion/estado-actual-2026-08-28.md`

## Reglas de este bloque

- `beyond-platform` es la fuente de verdad del esquema compartido de Supabase.
- Beyond DEV es `gtxvzbeyywtqihfcvezk`.
- Beyond PROD no se toca.
- `main` de este repositorio despliega Netlify producción; no mezclar esta rama hasta terminar pruebas contra DEV.
- No editar ni reutilizar las migraciones locales históricas de `parametrico-ec` como fuente canónica del backend.
- El catálogo local `src/data/catalogo.json` tiene 188 conceptos base y sigue siendo válido para modo local/offline.
- En modo nube autenticado, un error de Supabase NO debe ocultarse haciendo fallback silencioso al JSON local.
- Si Supabase responde correctamente pero con cero conceptos, tratarlo como backend/configuración incompleta para el flujo autenticado.
- No copiar todavía a DEV los 103 equipos FV adicionales observados en PROD.

## Resultado esperado

1. modo local sin nube/sesión conserva el catálogo JSON;
2. modo nube autenticado usa realmente los conceptos de Beyond DEV;
3. error de Supabase es observable;
4. respuesta vacía es observable;
5. hay pruebas para los cuatro casos;
6. `npm run build` pasa;
7. no se despliega esta rama a producción durante la validación.
