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

**El transformador se dimensiona contra la demanda de diseño, no contra la suma
de placas.** Con balanceo dinámico declarado, la demanda de diseño es la
potencia instalada menos el porcentaje reservado; sin balanceo son iguales. La
conversión de kW a kVA usa `FP_DIM` 0.80 más `MARGEN_TRAFO` 1.10, ambos en
`app.js`. Ese 0.80 es **criterio de dimensionamiento de Beyond, no el factor de
potencia del equipo**: los cargadores de corriente directa con corrección activa
operan entre 0.95 y 0.99, así que el criterio ya incorpora del orden de 16% de
colchón encima del margen explícito. No presentarlo como si fuera la física del
equipo. El balance eléctrico convierte en el sentido inverso con el mismo 0.80,
a propósito: con dos valores distintos los dos paneles se contradicen. **Sujeto
a validación contra proyectos cerrados.**

La reserva de balanceo tiene consecuencia operativa, no solo de costo: en el pico
los vehículos cargan más lento. Es decisión comercial de throughput y debe quedar
declarada en la propuesta, no escondida en el cálculo. Depende de `GE-001`: sin
sistema de gestión no se sostiene la reserva, y por lo tanto tampoco se puede
dimensionar el transformador por debajo de la suma de placas.

**El balance eléctrico compara kVA contra kVA**, no kW contra kW. Convertir la
capacidad del transformador a kW con el mismo 0.80 mezclaba unidades y además la
subestimaba, porque el 0.80 es criterio de dimensionamiento y no el factor de
potencia real de la carga.

**Las tensiones se declaran, no se asumen.** Configuración tiene tensión primaria
y secundaria, 23 kV y 480 V por omisión. Antes el cálculo de corriente para el
criterio de 125% traía 440 V escrito en el código, y la diferencia no es
cosmética: a 1,500 kVA son 1,968 A contra 1,804 A, marcos de interruptor
distintos. Los materiales de media tensión del catálogo son clase 25 kV,
consistentes con 23 kV; si se declara otra tensión primaria la app avisa en el
renglón del transformador pero **no** cambia los materiales. Seleccionarlos por
clase de aislamiento es motor de cantidades, no un campo.

**El depósito en garantía se calcula sobre la demanda contratada, no sobre el
transformador.** La tarifa GDMTH, apartado 9: *tres veces el importe que resulte
de aplicar el cargo por capacidad a cada kilowatt de demanda contratada*. La
provisión histórica de `$3,100/kVA` sobre la capacidad del transformador está
calculada sobre la variable equivocada y es probable que sobreestime. Con el
cargo por capacidad capturado en Configuración, `CFE-005` deja de ser
`allowance` y pasa a `fuente`. Mientras no se capture, se mantiene la provisión
con la advertencia escrita en el propio renglón.

**La demanda contratada tiene un piso de tarifa.** Apartado 4: no menor al 60%
de la carga total conectada, ni menor a 100 kW. Si el 60% de la carga conectada
excede la capacidad de la subestación, la demanda contratada se toma como esa
capacidad al 90% —regla cuya conversión de kVA a kW está **pendiente de
confirmar**. Consecuencia práctica: un proyecto por fases puede contratar menos
y reducir el depósito, pero no por debajo del 60% de lo que tenga conectado.
`pisoDemCon` en `app.js` usa la potencia de los equipos como carga conectada,
que es la que domina; si el sitio tiene otras cargas, el piso real es mayor.

**Cobro medido contra calculado.** El cargo por capacidad se aplica a la **menor**
entre la demanda máxima medida en punta y `Qmensual / (24 × d × F.C.)`; el cargo
por distribución, entre la máxima **mensual** —no la de punta— y la misma
fórmula. Dos consecuencias para cualquier modelo de recorte de picos con
almacenamiento: recortar solo en punta no baja el cargo por distribución, y si
el término calculado es el que manda, recortar el pico no ahorra nada en
capacidad. El valor del `F.C.` está en el apartado 3.1.2 del Anexo Único del
Acuerdo A/T58/2024 y **no lo tenemos**: sin él no se puede afirmar que el peak
shaving se pague.

**Las citas regulatorias de la presentación interna de almacenamiento no están
verificadas.** Ese mazo se generó con NotebookLM y los números de acuerdo
(RES/550/2021 para el Código de Red, A/108/2024 de electromovilidad) son
exactamente el tipo de dato que una herramienta generativa produce plausible
pero equivocado. El Código de Red podría venir de RES/151/2016. No citar
ninguno en documento a cliente sin verificarlo en el DOF.

**Especificación de cable en corriente directa: RHW-2/XHHW-2 XLPE 1000 V.**
"THHW-LS 1000 V" no existe comercialmente: el THHW-LS llega a 600 V. Corregirlo
donde aparezca.

**Naranja de marca: `#FF8700`**, el del archivo `beyond-orange.png`. Un token
anterior decía `#FB8722`; se corrigió porque una marca debe coincidir con su
logo. Para texto naranja sobre papel se usa `--accent-ink` `#B4590C`, que es la
versión con contraste AA.

**Actualizar el precio del catálogo maestro es de admin y editor.** Se
flexibilizó (2026-08) para no dejar toda aprobación en una sola persona: un
editor puede escribir precio, taxonomía y fuente directo en `conceptos`, sin
pasar por propuesta. Lo que sigue siendo exclusivo de administrador es *crear
o eliminar* un concepto del maestro (`conceptos_alta`, `conceptos_baja` en
`02_politicas.sql`) y aplicar/rechazar una propuesta formal
(`fn_aprobar_precio`, `fn_rechazar_precio`). El sistema de propuestas
(`precio_propuestas`) sigue existiendo para quien prefiera pasar por una
revisión antes de tocar el maestro, pero ya no es obligatorio.

Para no perder trazabilidad al abrir la escritura directa, cualquier cambio
de precio en `conceptos` —lo escriba quien lo escriba— queda registrado solo
una vez en `precio_historial` vía el disparador `tr_registrar_historial_precio`.
La verificación de quién puede escribir qué vive en la base de datos, en las
políticas RLS y en las funciones `security definer`. Nunca mover esa
validación al cliente: un navegador se puede alterar, una política no.

**Un concepto nuevo nace con ámbito de proyecto**, no en el maestro. Vive solo
en esa estación hasta que un administrador lo promueve con
`fn_promover_concepto`. Así una estación captura lo que necesita sin ensuciar
la fuente única de precios.

**El catálogo es uno para todo el portafolio, separado por área** (decisión de
RG, 2026-08-21): esta app y el Portafolio Energético comparten un solo proyecto
de Supabase. `conceptos.ambitos` es un `text[]` —no una bandera— porque hay
conceptos **comunes**: conductores, canalizaciones, interruptores y obra civil
sirven a electrolineras y a fotovoltaico por igual, y capturarlos dos veces
produce dos precios para el mismo material. Cada área consulta con
`fn_conceptos_de('<área>')`, que devuelve lo suyo **más** lo común. Los
conceptos que ya existen arrancan en `{ec}` y no en `comun`: el catálogo nació
de este estimador y reclasificarlos es revisión manual, concepto por concepto,
no un `update` masivo. Cambiar el ámbito es reclasificar el maestro y por eso
queda en administrador, no en editor. Migración en `supabase/04_ambitos.sql`.

**El SQL se valida antes de pegarlo en Supabase.** `scripts/validar-sql.sh`
levanta un PostgreSQL desechable, aplica los archivos de `supabase/` en orden
—cada uno **en una sola transacción**, como hace el editor SQL de Supabase— y
corre `supabase/pruebas/`. Ese `--single-transaction` no es cosmético: hay
errores que solo aparecen así. El que lo puso ahí fue `05_vendedor.sql`, que
aplicaba limpio archivo por archivo y reventaba pegado en Supabase, porque
PostgreSQL no deja **usar** un valor de enum recién agregado hasta que la
transacción que lo agregó se confirma (55P04). Por eso las funciones de ese
archivo comparan `fn_rol()::text` y no el literal del enum: partir el archivo
en dos y pedir que se corran por separado sería una trampa esperando a que
alguien la pise. No cubre RLS con usuarios reales —`auth.uid()` y los
roles de Supabase no existen fuera de Supabase y ahí solo se sustituyen— pero
sí atrapa que el SQL aplique, que las restricciones rechacen lo que deben y que
las consultas usen sus índices.

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

## Versión y bitácora

La versión vive **únicamente en `package.json`**. `vite.config.js` la lee al
compilar y la inyecta junto con la fecha del build; `src/lib/version.js` la
expone ya formateada. No escribirla a mano en ningún otro archivo: dos fuentes
se desincronizan.

Numeración por **versionado semántico** (SemVer), `mayor.menor.parche`:

- **parche**: correcciones que no agregan capacidad.
- **menor**: capacidad nueva, compatible con lo anterior.
- **mayor**: rompe compatibilidad. Aquí eso significa algo concreto: que el
  formato del estado guardado de los proyectos deje de abrir. Por eso las
  cuatro rutas de carga mezclan con `Object.assign` en lugar de reemplazar, y
  por eso al renombrar la etiqueta "grupo" a "tipo de cargador" **no** se
  renombró la llave de datos `grupos`.

`1.0.0` cuando cierren los pendientes de interfaz de producto, no cuando se vea
bien. No confundir dos ejes: la versión mide el software y la clase del estimado
mide la calidad del dato. Se puede estar en 1.0 con un estimado Clase 4.

**Antes de subir a producción, revisa si la versión debe moverse.** Si el cambio
agrega capacidad o corrige algo visible, `package.json` y `src/data/versiones.json`
van en el mismo empujón. Se ha olvidado ya: acumular varios commits con capacidad
nueva bajo la misma versión deja la bitácora mintiendo sobre qué hay publicado.

La bitácora es `src/data/versiones.json`, y se abre desde el pie de la
interfaz. Está en el repositorio y no en la base de datos a propósito: describe
el código, así que se despliega junto con el cambio que documenta y no puede
anunciar una versión que no existe. **Al subir de versión, su entrada va en el
mismo commit.** Cada entrada declara sus commits para que sea verificable; las
versiones 0.2.0 y 0.3.0 son una reconstrucción retroactiva de etapas reales que
nunca se publicaron por separado, y así está anotado.

La versión y la fecha de compilación también van en el pie del documento de
propuesta. Sin eso, una propuesta impresa no se puede reconciliar con el código
que produjo sus cifras.

## Roles

| Rol | Puede |
|---|---|
| `admin` | Todo: aprobar precios, promover conceptos, asignar roles |
| `editor` | Crear y editar proyectos, actualizar precio/taxonomía/fuente en el catálogo maestro, agregar conceptos |
| `comentarista` | Leer todo y dejar comentarios |
| `lector` | Consultar sin modificar |
| `vendedor` | Levantar expedientes y emitir propuestas preliminares, **sin ver costos** |

`vendedor` no es un grado más de la escala `admin > editor > comentarista >
lector`: es una rama aparte. `lector` consulta todo sin modificar —es el perfil
de quien audita—; `vendedor` es lo contrario, escribe expedientes pero ve
menos. No ve el precio del catálogo, el BoQ, el margen ni las comisiones.

La restricción **no se implementa escondiendo campos en la interfaz**. RLS
filtra renglones y no columnas, así que mientras el precio viva en la misma
fila que el nombre, dar lectura de `conceptos` es dar lectura del costo: al
vendedor se le niega la tabla completa y se le da en su lugar una función que
devuelve la ficha sin ninguna cifra. Y `fn_conceptos_de` **no lleva
`security definer`** —ponérselo saltaría la RLS de `conceptos` y abriría justo
el agujero que la migración cierra—; su `raise` solo hace honesto el mensaje.
Migración en `supabase/05_vendedor.sql`.

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

5 equipos de 240 kW, 10 puntos de carga, 1,200 kW, balanceo dinámico con 30%
reservado —lo que baja la demanda de diseño a 840 kW y es lo que sostiene el
transformador de 1,500 kVA; sin esa reserva el criterio pediría 2,000 kVA—,
transformador de 1,500 kVA,
615 kWp fotovoltaico llave en mano a 0.79 USD/Wp, 2 módulos de almacenamiento
de 261 kWh. Tarifa GDMTH de la división **Centro Sur**, captura de agosto 2026
—Atlacomulco es Centro Sur; Ecatepec sería Valle de México Norte, con cargos
distintos pese a estar en el mismo estado—. Costo directo $36,370,522;
inversión total $48,670,755; depósito de garantía $757,944 aparte, calculado
sobre 720 kW de demanda contratada. Clase 4, índice 0.42.

**Dos problemas abiertos en ese caso, y son de negocio, no de código:**

1. La obra civil está costeada para los 29 equipos del desarrollo completo, no
   para los 5 de la fase 1. Sobreestima cerca de $700,000.
2. **Resuelto (2026-08).** El depósito de $4,650,000 estaba calculado sobre la
   capacidad del transformador a $3,100/kVA, cuando la tarifa lo calcula sobre
   la demanda contratada. Con la tarifa GDMTH de Centro Sur —la división que
   corresponde a Atlacomulco— de agosto de 2026, el cargo por capacidad es
   $350.90/kW y el piso de demanda contratada es 720 kW, el 60% de los 1,200 kW
   conectados: **3 × 350.90 × 720 = $757,944**. La provisión anterior
   sobreestimaba **seis veces**. No mueve el costo directo ni la inversión
   total, porque el depósito se reporta aparte. Lo que sigue pendiente es
   confirmarlo con oficio del suministrador y refrescar la tarifa, que la CRE
   aprueba cada mes.

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
