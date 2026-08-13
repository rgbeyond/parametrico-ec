# Contexto del proyecto

Herramienta interna de Beyond AE para estimar el CAPEX de electrolineras
(estaciones de carga para vehículos eléctricos) a partir de datos macro del
sitio. El nivel de definición del estimado se **calcula**, no se declara a mano.

Trabaja en **español**. El código, los comentarios, los mensajes de interfaz y
los commits van en español. Sin emoji.

---

## Reglas de datos que no se negocian

Estas reglas vienen del negocio, no del código. Romperlas produce propuestas
que no se pueden defender frente a un cliente.

**Toda cifra lleva su taxonomía.** Cuatro niveles: `validado`, `fuente`,
`supuesto`, `allowance`. Nunca colapsarlos ni presentar un supuesto como hecho.
Un concepto sin base declarada es "pendiente de cotizar", no un número
inventado. Si vas a llenar un hueco con una regla de escalamiento, dilo en el
propio renglón: una regla no convierte un supuesto en dato.

**El nivel de definición se calcula.** Índice = promedio del puntaje de
sustento de cada renglón, **ponderado por importe**, no por conteo. Puntajes:
validado 1.00, fuente 0.75, supuesto 0.35, allowance 0.00. Se mapea a clases 5
a 1 según la práctica de AACE 18R-97. Un renglón mal sustentado en una partida
dominante pesa más que cuarenta validados en partidas menores.

**Los rangos son asimétricos.** Los sobrecostos no se distribuyen de forma
simétrica: la cola larga está del lado alto. No los conviertas en ± simple en
el cálculo interno, aunque al cliente se le comunique así.

**Norma vigente: NOM-001-SEDE-2012.** La revisión 2018 nunca se publicó en el
DOF; no citarla. Interruptores principales y derivados se verifican contra 125%
de la carga continua, artículo 625-21.

**Especificación de cable en corriente directa: RHW-2/XHHW-2 XLPE 1000 V.**
"THHW-LS 1000 V" no existe comercialmente: el THHW-LS llega a 600 V. Corregirlo
donde aparezca.

**Naranja de marca: `#FF8700`**, el del archivo `beyond-orange.png`. Un token
anterior decía `#FB8722`; se corrigió porque una marca debe coincidir con su
logo. Para texto naranja sobre papel se usa `--accent-ink` `#B4590C`, que es la
versión con contraste AA.

**El precio final se aprueba.** Cualquiera propone; solo un administrador
aplica al catálogo maestro. La verificación vive en la base de datos, en
`fn_aprobar_precio` y en las políticas RLS. Nunca mover esa validación al
cliente: un navegador se puede alterar, una política no.

**Un concepto nuevo nace con ámbito de proyecto**, no en el maestro. Vive solo
en esa estación hasta que un administrador lo promueve con
`fn_promover_concepto`. Así una estación captura lo que necesita sin ensuciar
la fuente única de precios.

---

## Arquitectura

**Sin framework de interfaz, a propósito.** JavaScript de módulos ES sobre
Vite. La lógica del estimador ya funcionaba en vanilla y portarla a React
habría sido reescribirla. Si algún día se migra, que sea por partes.

```
index.html                 marcado completo de la aplicación
src/main.js                orquestación: sesión, portada, carga diferida del estimador
src/ui/portada.js          pantalla de proyectos
src/ui/usuarios.js         administración de roles
src/lib/sesion.js          sesión con Google, roles, objeto `puede`
src/lib/datos.js           repositorio: proyectos, conceptos, comentarios
src/lib/contexto.js        proyecto abierto y su catálogo combinado
src/lib/app.js             núcleo del estimador
src/lib/almacenamiento.js  respaldo local y modo sin cuenta
src/lib/supabase.js        cliente; sin variables de entorno corre en modo local
src/lib/fuentes.js         reglas @font-face para el documento de la propuesta
src/data/catalogo.json     188 conceptos: precio, sustento y fuente
src/styles/               tokens de marca, fuentes y estilos
supabase/                 esquema, políticas RLS y semilla
scripts/generar-seed.mjs  regenera 03_semilla.sql desde catalogo.json
```

**Sin variables de entorno la aplicación funciona completa** y guarda en el
navegador. Es una decisión deliberada: la herramienta debe seguir siendo usable
sin cuenta. No introduzcas dependencias que rompan ese modo.

**Carga diferida.** `app.js` se importa sólo cuando se abre un proyecto, y se
comunica por el evento `proyecto:abierto`. No lo vuelvas a importar en el
arranque: la portada debe aparecer de inmediato.

### Deuda técnica conocida

`src/lib/app.js` son ~76 KB en un solo archivo, heredado de un prototipo.
Funciona y está probado. **Dividirlo por pestaña es la primera refactorización
pendiente**, pero hazlo con pruebas de por medio: ya se rompió varias veces.

Al terminar cualquier cambio, corre `npm run build`. Si el build no pasa,
Netlify tampoco.

---

## Roles

| Rol | Puede |
|---|---|
| `admin` | Todo: aprobar precios, promover conceptos, asignar roles |
| `editor` | Crear y editar proyectos, proponer precios, agregar conceptos |
| `comentarista` | Leer todo y dejar comentarios |
| `lector` | Consultar sin modificar |

El primero que entra queda administrador; los siguientes entran como `lector` y
un administrador los promueve. Es deliberado: quien acaba de entrar no debería
poder mover precios que alimentan propuestas a cliente. El dominio permitido
está en `fn_dominio_permitido`, en `01_esquema.sql`.

---

## Estado actual

Publicado en Netlify desde `rgbeyond/paremetrico-ec`. Supabase **en proceso de
configuración**: mientras no existan las variables de entorno, el sitio corre
en modo local.

### Pendientes de producto

- Interfaz para proponer y aprobar precios contra `precio_propuestas`. La base
  ya lo soporta; en la pantalla de base de datos la aprobación todavía vive en
  memoria de la sesión.
- Interfaz de comentarios. La tabla y las políticas existen; el rol de
  comentarista aún no tiene dónde escribir.
- Interfaz de tipologías. Las tablas `tipologias` y `tipologia_conceptos` están
  creadas para discretizar tipos de electrolinera por subconjunto de conceptos.
  El modelo de esa parte no está definido: pregunta antes de construirlo.
- Leer el catálogo desde Supabase como fuente primaria y dejar
  `catalogo.json` sólo como semilla y respaldo sin conexión.
- Motor de cantidades. Varias partidas se calculan con reglas de escalamiento
  lineal declaradas en el propio renglón: alimentadores de baja tensión,
  tableros e interruptores derivados, sistema de tierras, aportación y depósito
  del suministrador. **Validar contra proyectos cerrados antes de usarlas en
  propuesta firme.**

### Estado del catálogo

De 188 conceptos: 9 con dato validado, 18 con fuente identificable, el resto
supuestos con criterio declarado y 8 provisiones sin base de precio. Esas 8 son
lo primero a cotizar; el índice de definición las castiga con cero.

### Caso de referencia: Atlacomulco Fase 1

5 equipos de 240 kW, 10 puntos de carga, 1,200 kW, transformador de 1,500 kVA,
615 kWp fotovoltaico llave en mano a 0.79 USD/Wp, 2 módulos de almacenamiento
de 261 kWh. Costo directo $36,370,522; inversión total $48,670,755; depósito de
garantía $4,650,000 aparte. Clase 4, índice 0.42.

**Dos problemas abiertos en ese caso, y son de negocio, no de código:**

1. La obra civil está costeada para los 29 equipos del desarrollo completo, no
   para los 5 de la fase 1. Sobreestima cerca de $700,000.
2. El depósito de $4,650,000 es una extrapolación de $3,100/kVA derivada de dos
   proyectos de distinta capacidad. Sin oficio del suministrador no se debe
   presentar como firme.

---

## Cómo trabajar aquí

**Verifica antes de afirmar.** No inventes nombres de elementos de interfaz de
productos de terceros ni valores de configuración: consúltalos en su
documentación vigente. Si no puedes verificar algo, dilo en lugar de
aproximarlo.

**Señala riesgos, huecos e inconsistencias sin suavizar.** Si una decisión del
usuario tiene un problema, dilo y propón la alternativa. Estar de acuerdo por
inercia no ayuda.

**No sobrescribas márgenes ni estructura de costos** sin instrucción explícita.
Cualquier cambio se documenta con su razón.

**Los archivos deben ser autoexplicativos** para quien los abre por primera
vez. Documenta el razonamiento de todo supuesto en el propio renglón, no en un
archivo aparte.
