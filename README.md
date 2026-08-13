# Estimador paramétrico de electrolineras — Beyond AE

Herramienta interna para estimar el CAPEX de estaciones de carga a partir de
datos macro del sitio, con el nivel de definición del estimado calculado y no
declarado a mano.

## Qué resuelve

El catálogo de conceptos es la fuente única de precios. Un proyecto no captura
precios propios: consume los del catálogo y declara la base de cada cifra.
El nivel de definición del estimado (clases 5 a 1, mapeadas a la práctica de
AACE 18R-97) se calcula ponderando el sustento de cada precio por su importe,
y la herramienta indica qué partidas hay que cotizar para subir de nivel.

## Decisiones técnicas

**Sin framework de interfaz.** El estimador es JavaScript de módulos ES sobre
Vite. No hay React porque no aporta nada aquí y sí agrega superficie de fallo:
la lógica ya funcionaba en vanilla y portarla habría sido reescribirla.

**El naranja de marca es `#FF8700`,** el del archivo `beyond-orange.png`. El
token histórico decía `#FB8722`; se corrigió en `src/styles/tokens.css` porque
una marca tiene que coincidir con su propio logo.

**Tipografía servida desde el repo.** Montserrat en subconjunto latino, cinco
pesos, como WOFF2. Sin dependencia de Google Fonts, así que el documento
imprime igual con o sin internet.

**El precio final se aprueba.** Cualquiera propone un precio; solo un perfil
con rol `aprobador` lo aplica al catálogo, y el cambio queda en historial con
autor, fecha y fuente. Está en la base de datos, no en el cliente: una política
de RLS no se puede evadir desde el navegador.

## Cuentas y roles

Se entra con Google Workspace de `beyond-ae.com`. No hay contraseñas ni registro:
el perfil se crea solo la primera vez que alguien inicia sesión, y las cuentas
de otro dominio se rechazan en la base de datos, no en el navegador.

| Rol | Puede |
|---|---|
| Administrador | Todo: aprobar precios, promover conceptos al maestro, asignar roles |
| Editor | Crear y editar proyectos, proponer precios, agregar conceptos al proyecto |
| Comentarista | Leer todo y dejar comentarios |
| Solo lectura | Consultar sin modificar |

**El primero que entra queda como administrador.** Los siguientes entran como
solo lectura y un administrador los promueve desde la pantalla de Usuarios. Es
deliberado: quien acaba de entrar no debería poder mover precios que alimentan
propuestas a cliente. Si prefieres lo contrario, cambia el valor por omisión en
`fn_alta_perfil` dentro de `01_esquema.sql`.

## Proyectos y catálogos

Todos los usuarios ven todos los proyectos; el rol define qué pueden hacer. La
base de datos es una sola.

El catálogo maestro es global y compartido. Además, **cada proyecto puede tener
conceptos propios**: lo que ese sitio necesita y el maestro todavía no tiene.
Nacen con ámbito de proyecto y solo un administrador los promueve al maestro,
con `fn_promover_concepto`. Así una estación captura lo que requiere sin
ensuciar la fuente única de precios.

Las tablas `tipologias` y `tipologia_conceptos` ya existen para discretizar
tipos de electrolinera por subconjunto de conceptos. La interfaz de esa parte
está pendiente.

## Estructura

```
index.html                 marcado de la aplicación
src/main.js                punto de entrada y orquestación
src/ui/portada.js          pantalla de proyectos
src/ui/usuarios.js         administración de roles
src/lib/sesion.js          sesión, roles y permisos
src/lib/datos.js           repositorio: proyectos, conceptos, comentarios
src/lib/contexto.js        proyecto abierto y su catálogo
src/lib/app.js             núcleo del estimador (pendiente de dividir por pestaña)
src/lib/almacenamiento.js  persistencia: Supabase > visor > navegador
src/lib/auth.js            sesión con Google, restringida por dominio
src/lib/supabase.js        cliente; si no hay variables, corre en modo local
src/lib/fuentes.js         reglas @font-face para el documento de la propuesta
src/data/catalogo.json     188 conceptos con precio, sustento y fuente
src/styles/tokens.css      tokens de marca Beyond
src/styles/app.css         estilos de la aplicación
supabase/01_esquema.sql    tablas, tipos y función de aprobación
supabase/02_politicas.sql  RLS
supabase/03_semilla.sql    generado desde catalogo.json (npm run seed)
scripts/generar-seed.mjs   regenera la semilla
```

## Arranque local

```bash
npm install
cp .env.example .env.local     # opcional: sin esto corre en modo local
npm run dev
```

Sin variables de entorno la aplicación funciona completa y guarda en el
navegador. Lo único que pierde es el catálogo compartido entre personas.

## Supabase

1. Crear un proyecto en supabase.com.
2. En **SQL Editor**, ejecutar en orden: `01_esquema.sql`, `02_politicas.sql`,
   `03_semilla.sql`.
3. En **Authentication > Providers**, habilitar Google y pegar el Client ID y
   el Client Secret de una credencial OAuth de Google Cloud. En esa credencial,
   agregar como URI de redirección autorizado el que muestra Supabase.
4. En **Authentication > URL Configuration**, poner la URL del sitio de Netlify
   en *Site URL* y también en *Redirect URLs*, junto con `http://localhost:5173`.
5. Entrar al sitio por primera vez. Quedas como administrador automáticamente.
   Si por alguna razón no ocurre:

```sql
update perfiles set rol = 'admin' where correo = 'rg@beyond-ae.com';
```

El dominio permitido está en la función `fn_dominio_permitido` de
`01_esquema.sql`. Si cambia, se edita ahí.

## Netlify

1. **Add new site > Import an existing project**, elegir este repositorio.
2. Build command `npm run build`, publish directory `dist`. Ya viene en
   `netlify.toml`, no hay que teclearlo.
3. En **Site configuration > Environment variables**, agregar
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_DOMINIO_PERMITIDO`.
4. Volver al paso 4 de Supabase y registrar la URL definitiva del sitio.

La llave anónima de Supabase es pública por diseño: la seguridad la dan las
políticas de RLS, no el secreto de la llave.

## Estado del catálogo

De 188 conceptos: 9 con dato validado, 18 con fuente identificable, el resto
supuestos con criterio declarado y 8 provisiones sin base de precio. Las
provisiones son las que hay que cotizar primero; el índice de definición las
castiga con cero.

## Pendientes conocidos

- Dividir `src/lib/app.js` en módulos por pestaña. Hoy es un solo archivo
  heredado del prototipo.
- Leer el catálogo desde Supabase en lugar del JSON incluido, y dejar el JSON
  solo como semilla y respaldo sin conexión.
- Interfaz para proponer y aprobar precios contra `precio_propuestas`. La base
  ya lo soporta; en la pantalla de base de datos la aprobación todavía vive en
  memoria de la sesión.
- Interfaz de comentarios. La tabla y las políticas existen; el rol de
  comentarista aún no tiene dónde escribir.
- Interfaz de tipologías.
- Motor de cantidades: varias partidas siguen calculándose por reglas de
  escalamiento lineal declaradas en el propio renglón. Validar contra proyectos
  cerrados antes de usarlas en propuesta firme.
- Depósito y aportación del suministrador siguen siendo extrapolaciones por
  kVA. No presentarlos como firmes sin oficio.
