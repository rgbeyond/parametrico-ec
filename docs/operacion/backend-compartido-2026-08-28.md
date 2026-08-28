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

## Qué se implementó (2026-08-28, v0.9.0 y v0.10.0)

### 0. El catálogo se pide por ámbito (v0.10.0)

La primera versión de este cambio leía `conceptos` con `.eq('activo', true)` y
nada más. **Funciona hoy y sería incorrecta mañana**: la base compartida guarda
en la misma tabla los 188 conceptos base del estimador —`ambitos` contiene
`ec`— y los 103 equipos fotovoltaicos del Portafolio —`ambitos` contiene `fv` y
no `ec`—. Mientras Beyond DEV solo tenga los 188 no se nota; el día que entre el
catálogo FV, el estimador ofrecería módulos e inversores entre sus partidas de
obra sin dar ningún error.

La lectura pasa ahora por **`fn_conceptos_de('ec')`**, que ya existe en el
esquema canónico —`20260827214619_ambitos.sql`, redefinida en
`20260827214705_compatibilidad_vendedor.sql`— y devuelve los conceptos activos
cuyos ámbitos cruzan `['ec','comun']`, con `EXECUTE` concedido a
`authenticated`.

No se reimplementa ese criterio en el cliente: dos definiciones de lo mismo
divergen, y la que manda es la de la base. Lo que sí hace el cliente es
**comprobar el contrato**: si llega un concepto que no es de `ec` ni de `comun`,
falla con causa `ambito`. Un concepto con `['ec','fv']` es legítimo y pasa.

**Consecuencia de despliegue, y hay que decirla:** `fn_conceptos_de` pasa a ser
dependencia dura. Una base que no la tenga hace fallar el catálogo de forma
visible. Es coherente con retirar el fallback silencioso, pero antes de apuntar
la aplicación a un backend hay que comprobar que la función existe y está
concedida. Para Beyond DEV está verificado en el repositorio canónico; **para
Beyond PROD no se ha verificado desde aquí** —`origen/ec/04_ambitos.sql` sugiere
que sí, porque es el mismo archivo que creó la columna `ambitos` que PROD tiene,
pero eso es inferencia y no comprobación—. Esta rama no se despliega a
producción, así que la comprobación va antes de cualquier mezcla a `main`.

### El resto (v0.9.0)

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
| Con nube, sin sesión | catálogo local | catálogo local, `motivo: 'sin-sesion'` (1) |
| Supabase devuelve error | catálogo local, sin avisar | `ErrorCatalogo('consulta')` |
| Supabase devuelve cero filas | catálogo local, sin avisar | `ErrorCatalogo('vacio')` |
| Supabase devuelve filas | conceptos de la nube | igual, y lo declara |
| Llega un concepto de otro ámbito | entraba al estimador | `ErrorCatalogo('ambito')` |

El respaldo local **se conserva** para los dos primeros casos. Es la decisión
de producto de que la herramienta siga siendo usable sin cuenta, y no cambia.

(1) De los cuatro estados, «con nube y sin sesión» hoy **no es alcanzable desde
la interfaz**: con nube y sin usuario, `portada.js` pinta la puerta de acceso, y
con usuario sin perfil pinta «tu cuenta todavía no tiene perfil». En ninguna de
las dos hay tarjetas que abrir. La rama defensiva se queda y la prueba también,
pero contarla como modo de uso inflaría la cobertura: los estados que la
aplicación produce de verdad son tres.

Queda además un **segundo respaldo al JSON**, en `src/lib/app.js`: si
`ctx.conceptos` llegara vacío, el estimador cotiza con el archivo incluido. Hoy
no es alcanzable —`app.js` solo se importa tras una apertura exitosa—, pero es
el mismo patrón y toca la estructura de costos, así que se dejó anotado en su
propio renglón y no se cambió. Decisión de producto pendiente.

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

Objeto con `fuente`, `motivo`, `filas` y `en`. Existe para poder **demostrar**
de dónde salieron los conceptos de la pantalla en vez de deducirlo de que la
pantalla se llenó.

Un export de módulo no se alcanza desde la consola —Vite empaqueta y el nombre
desaparece—, así que `datos.js` lo publica de dos formas al resolver, y también
al fallar: un `console.info('[catálogo] origen: …')` y `window.origenCatalogo`.
Eso es lo que se mira al validar contra Beyond DEV.

Los caminos de error **también anotan**, con `fuente: 'error'` y el motivo
(`consulta` o `vacio`). Si no lo hicieran, tras un fallo el objeto seguiría
diciendo `nube / consulta-ok / 188` de la vez anterior: una señal sana con el
backend caído, que es el mismo defecto que esta rama vino a quitar.

### 5. Pruebas

Primeras del repositorio: `pruebas/catalogo.test.mjs`, `npm test`, 16 casos que
cubren los cuatro estados, el registro del origen —incluido el de después de un
fallo—, la correspondencia entre las columnas que se piden y las que se
traducen, y el ámbito: contra qué se pregunta, qué recibe el Paramétrico cuando
la respuesta trae `ec`, `comun` y `fv`, y qué pasa si se cuela uno solo `fv`. Dos casos fallan con un aviso explícito si el fallback silencioso
regresa.

Siguen siendo el único módulo cubierto. El estimador, que es donde están las
cifras, no tiene ninguna prueba.

```
npm test    # 16/16
npm run build
```

## Este repositorio es público

Comprobado el 2026-08-28 contra la API de GitHub: `rgbeyond/parametrico-ec` es
**público**; `rgbeyond/beyond-platform` es privado.

No hay credenciales comiteadas —`.env` está ignorado, y lo único con forma de
JWT son los casos de prueba de los guardias y el marcador de `.env.example`—.
Lo que sí es público es todo lo demás:

- `src/data/catalogo.json`: 188 precios con su sustento, y renglones que citan
  reglas internas de margen.
- El identificador del proyecto de Supabase DEV, en este mismo documento. No es
  una credencial —viaja en la URL del proyecto y la llave anónima llega al
  navegador—, pero junto con lo anterior deja la superficie de DEV enumerada en
  un archivo indexable.

No es consecuencia de este cambio: ya era así. Se anota porque el bloque de
catálogo mueve esos precios a un segundo repositorio y conviene que la decisión
sea consciente. **Decisión pendiente de Rommel**, no del código.

## Lo que falta, y no se puede hacer desde aquí

Este entorno no alcanza Supabase. La carga de los 188 conceptos en Beyond DEV y
su comprobación desde la aplicación están en
`beyond-platform/docs/operacion/catalogo-base-dev.md`, pasos 1 a 6. El paso 6 es
la prueba negativa: sin ella, lo único demostrado es que la app abre, que es
justo lo que ya hacía con el backend mal.
