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

---

## Qué se implementó (2026-08-28, v0.9.0)

### 1. El fallback silencioso, retirado

`catalogoMaestro()` tenía una línea que colapsaba tres situaciones distintas en
la misma respuesta feliz:

```js
if(error || !data?.length) return catalogoLocal.map(...)
```

Con eso, una prueba de conexión contra Beyond DEV daba verde con la base vacía,
con la RLS mal puesta o con las credenciales equivocadas: la pantalla se veía
idéntica porque el JSON empaquetado la llenaba.

Ahora las tres se separan:

| Situación | Antes | Ahora |
|---|---|---|
| Sin nube configurada | catálogo local | catálogo local, `motivo: 'sin-nube'` |
| Con nube, sin sesión | catálogo local | catálogo local, `motivo: 'sin-sesion'` |
| Supabase devuelve error | catálogo local, sin avisar | `ErrorCatalogo('consulta')` |
| Supabase devuelve cero filas | catálogo local, sin avisar | `ErrorCatalogo('vacio')` |
| Supabase devuelve filas | conceptos de la nube | igual, y lo declara |

El respaldo local **se conserva** para los dos primeros casos. Es la decisión
de producto de que la herramienta siga siendo usable sin cuenta, y no cambia.

### 2. Dónde vive la decisión

`src/lib/catalogo.js`, módulo nuevo, sin importar Supabase, sesión ni el JSON
del catálogo. Es código puro para que `node --test` lo ejecute sin navegador,
sin credenciales y sin el `import` de JSON que solo entiende Vite.

`datos.js` lo ata a las dependencias reales y reexporta lo público, así que
nadie que importara desde `datos.js` se rompe.

### 3. El error tiene que verse

`portada.js` llama a `alAbrir(p)` en cuatro sitios sin `await` y sin `.catch()`.
Si `abrirProyecto` lanzara, el resultado sería un rechazo de promesa no
capturado: una línea en la consola y nada en pantalla, que es el mismo fallo
invisible mudado de sitio. Se atrapa en `abrir()` de `main.js` —un solo punto,
que además cubre a cualquier llamador futuro— y se muestra con el mensaje que
corresponde a la causa.

### 4. `origenCatalogo`

Objeto exportado con `fuente`, `motivo`, `filas` y `en`. Existe para poder
**demostrar** de dónde salieron los conceptos de la pantalla en vez de deducirlo
de que la pantalla se llenó. Es lo que se mira en la consola al validar contra
Beyond DEV.

### 5. Pruebas

Primeras del repositorio: `pruebas/catalogo.test.mjs`, `npm test`, 9 casos que
cubren los cuatro estados. Dos de ellos fallan con un mensaje explícito si el
fallback silencioso regresa.

```
npm test    # 9/9
npm run build
```

## Lo que falta, y no se puede hacer desde aquí

Este entorno no alcanza Supabase. La carga de los 188 conceptos en Beyond DEV y
su comprobación desde la aplicación están en
`beyond-platform/docs/operacion/catalogo-base-dev.md`, pasos 1 a 6. El paso 6 es
la prueba negativa: sin ella, lo único demostrado es que la app abre, que es
justo lo que ya hacía con el backend mal.
