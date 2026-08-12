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

## Estructura

```
index.html                 marcado de la aplicación
src/main.js                punto de entrada
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
5. Marcarte como aprobador:

```sql
update perfiles set rol = 'aprobador' where correo = 'rg@beyond-ae.com';
```

El alta de perfil es automática al primer ingreso y rechaza cualquier correo
fuera de `@beyond-ae.com`. Ese dominio está escrito en la función
`fn_alta_perfil` de `01_esquema.sql`: si cambia, hay que editarlo ahí.

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
  ya lo soporta; el cliente todavía aprueba solo en memoria.
- Motor de cantidades: varias partidas siguen calculándose por reglas de
  escalamiento lineal declaradas en el propio renglón. Validar contra proyectos
  cerrados antes de usarlas en propuesta firme.
- Depósito y aportación del suministrador siguen siendo extrapolaciones por
  kVA. No presentarlos como firmes sin oficio.
