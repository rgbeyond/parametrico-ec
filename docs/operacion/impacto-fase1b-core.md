# Qué le hace la Fase 1B a esta aplicación

**Fecha:** 2026-08-29 · **Estado: propuesta de diseño.** Nada aplicado a Beyond
DEV. **No se cambió código funcional en este commit.**

El diseño del Core vive en
`rgbeyond/beyond-platform` → `claude/phase1b-core` →
`docs/arquitectura/fase1b-core.md`. Aquí solo está lo que toca a esta
aplicación, para que quien la mantenga no tenga que leer el diseño entero.

---

## 1. Lo que esta aplicación le pide hoy a la base

Sacado del código, no de la memoria:

| Objeto | Uso | Dónde |
|---|---|---|
| `proyectos` | select, insert, update, archivar | `datos.js` |
| `proyecto_conceptos` | select, insert, delete | `datos.js` |
| `perfiles` | select, update | `datos.js`, `sesion.js` |
| `comentarios` | select **con incrustación** `perfiles(nombre, correo)`, insert | `datos.js` |
| `fn_conceptos_de('ec')` | RPC del catálogo maestro | `catalogo.js`, `datos.js` |
| `fn_promover_concepto`, `fn_asignar_rol` | RPC | `datos.js`, `ui/usuarios.js` |

**Ninguna de estas consultas menciona organizaciones.** Ése es el presupuesto de
toda la transición: si el Core obliga a esta aplicación a cambiar el mismo día
que se aplica una migración, la migración está mal partida.

---

## 2. Lo que **no** cambia

- **El modo sin cuenta sigue completo.** Sin variables `VITE_`, la herramienta
  funciona con el catálogo empaquetado y `localStorage`. El Core no lo toca.
- **`crearProyecto` no cambia.** El enlace con el proyecto universal lo hace un
  disparador en la base, no la aplicación. Fue un hallazgo de la revisión: sin
  ese disparador, la columna nueva se habría quedado nula en cada proyecto
  creado desde aquí, y la migración de cierre habría roto la creación.
- **`fn_conceptos_de('ec')` sigue siendo la vía del catálogo**, con la misma
  firma. Lo que cambia por dentro es quién puede llamarla con provecho.

---

## 3. Lo que sí cambia, y hay que decidir

### 3.1 Un usuario sin `view_costs` no puede abrir un proyecto

El Core sustituye el rol `vendedor` por la capacidad `view_costs`. El modelo
supone que alguien puede ver un proyecto y no sus cifras.

**En esta aplicación ese estado intermedio no existe.** Si
`fn_conceptos_de('ec')` devuelve cero filas, `resolverCatalogo` lanza
`ErrorCatalogo('vacio')` y `abrirProyecto` no llega a tocar el contexto: el
estimador no abre.

Es consecuencia directa —y correcta— de haber retirado el fallback silencioso en
la Fase 1A.1. Pero significa que, tal como está la aplicación hoy, la fila
«externo → `view_costs` no» del diseño se traduce a **«el externo no abre
proyectos EC»**, no a «los abre sin precios».

Hay que decidir cuál de las dos:

| Opción | Qué implica aquí |
|---|---|
| Error honesto | Nada que programar. El mensaje ya distingue la causa |
| Catálogo sin cifras | Consumir una función sin costo, como `fn_articulos_de`, y que el estimador sepa qué hacer sin precios. Es trabajo de verdad |

**Recomendación: error honesto en 1B.** Un estimador de CAPEX sin precios no
estima; fingir que sí es peor que decir que este perfil no puede abrirlo.

### 3.2 La pantalla de usuarios ofrece una acción que la base rechaza

`fn_asignar_rol` ahora **rechaza siempre** el cambio de rol propio. Es más
estricto que el guardián anterior, que solo impedía quitarse `admin` siendo el
único, y es a propósito: un administrador que se degrada por error deja la
organización sin quien la administre, y la función de arranque ya no sirve
porque exige que no haya ninguno.

`src/ui/usuarios.js:56` solo deshabilita el selector cuando queda **un solo**
administrador. Con dos, la pantalla ofrece cambiar el rol propio y la base lo
rechaza con una excepción. No es un fallo de seguridad —la base gana— pero es
un mensaje de error donde debería haber un control deshabilitado.

**Trabajo de aplicación pendiente:** deshabilitar el selector del propio
usuario, siempre, no solo cuando sea el último administrador.

### 3.3 `fn_asignar_rol` ya no puede mentir

Hoy la pantalla de usuarios llama a `fn_asignar_rol`, que escribe
`perfiles.rol`, y repinta leyendo esa misma columna.

Si el Core hace que la autorización se decida por la membresía y nadie toca esta
función, **la pantalla mostraría «Rol actualizado» y la base seguiría tratando a
esa persona como antes**. Un control de autorización que informa éxito sin
efecto es peor que uno que falla.

**Ya está resuelto del lado de la base:** `fn_asignar_rol` escribe la membresía
y el espejo `perfiles.rol` en la misma transacción, o falla. Si el perfil no
tiene membresía en la organización interna, lanza una excepción en vez de
devolver éxito. La pantalla puede seguir leyendo `perfiles.rol` para pintar.

Lo que sí cambia para esta aplicación: al asignar un rol se **sincronizan las
capacidades** de ese rol, y al degradar se revocan. Un editor que baja a lector
pierde `view_billing_data` y `can_download`.

### 3.4 Un lector o comentarista interno deja de ver los recibos

`pf_recibos` lleva RFC, razón social y número de servicio. Desde la Fase 1B
requiere la capacidad `view_billing_data` **además** del acceso al proyecto, y
por omisión solo la reciben `admin` y `editor`. Hoy cualquier autenticado los
ve.

Es la decisión D8 y por tanto intencional, pero es un cambio de comportamiento
visible para roles internos, no solo para externos. Afecta al Portafolio, no a
esta aplicación, y se anota aquí porque comparten backend.

### 3.5 Comentarios: la incrustación de PostgREST

`datos.js` pide `perfiles(nombre, correo)` incrustado, que necesita una relación
que PostgREST detecte.

Dos cosas verificadas contra la documentación, y una de ellas corrige lo que
este mismo repositorio suponía:

- PostgREST **sí** infiere llaves foráneas desde las tablas base de una vista,
  con dos condiciones: las columnas de la llave tienen que estar en el `select`
  de nivel superior, y **no funciona sobre vistas con `UNION`**.
- Después de cambiar llaves foráneas hay que **recargar la caché de esquema**, o
  la incrustación deja de resolverse aunque el esquema esté bien.

Conclusión para esta aplicación: **una vista de compatibilidad es viable**, pero
depende de una inferencia del servidor que solo se comprueba contra la Data API
real. Por eso el diseño deja los comentarios genéricos **fuera** de la Fase 1B.

### 3.6 `perfiles_lectura` va a dejar de ser «cualquiera con sesión»

Cuando existan externos, el directorio deja de estar abierto. Eso afecta a la
incrustación de arriba: si el autor de un comentario queda fuera del alcance de
quien lee, **el objeto incrustado llega nulo y no llega ningún error**. La
pantalla mostraría un comentario sin autor.

No es un fallo de la base: es lo que hace la RLS. Pero es exactamente la clase
de degradación silenciosa que esta rama vino a eliminar del catálogo, y conviene
tratarla igual: que la interfaz distinga «sin autor visible» de «sin autor».

---

## 4. El catálogo empaquetado y la confidencialidad de precios

`src/data/catalogo.json` viaja en el paquete que Vite entrega al navegador, con
los 188 precios. Es deliberado: el modo sin cuenta lo necesita.

**Consecuencia que conviene tener escrita:** `view_costs` protege el catálogo
**de la base**. No hace confidenciales esos precios, porque cualquiera con
acceso al sitio los lee del propio paquete, sin sesión. Y este repositorio es
público.

No es un defecto del diseño del Core. Es una tensión de producto entre el modo
sin cuenta y la confidencialidad, y no se resuelve en `beyond-platform`.

---

## 5. Lo que este documento no hizo

- No se cambió código funcional.
- No se aplicó nada a Beyond DEV.
- No se tocó PROD, ni `main`, ni Netlify.
- Las decisiones de 3.1 y 3.2 están abiertas.
