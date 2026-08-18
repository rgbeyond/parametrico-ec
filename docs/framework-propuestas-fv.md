# Framework de propuestas fotovoltaicas Beyond

**Versión del framework: 0.2.1** — 2026-08-18
**Estado del documento: borrador interno para revisión.** Nada de lo aquí
descrito está construido; este documento define qué se va a construir y cómo,
antes de la primera línea de código. Se revisa y aprueba antes de arrancar.

Este archivo vive temporalmente en `parametrico-ec/docs/` porque es donde está
la sesión de trabajo; el producto es **independiente del estimador de
electrolineras** y su repositorio definitivo es una decisión abierta (ver
sección 10). Lo que sí queda decidido: a futuro este producto le entrega al
estimador de electrolineras el costo de la partida fotovoltaica, no al revés.

---

## 1. Propósito

Reducir el tiempo y el riesgo de emitir propuestas de sistemas fotovoltaicos
para clientes comerciales e industriales en México, reemplazando el flujo
actual de tres hojas de cálculo desconectadas por un instrumento único que:

1. Parte de datos básicos y hasta 12 recibos de CFE.
2. Produce una propuesta preliminar sin bloquearse por falta de precisión,
   usando valores asumidos **declarados**.
3. Se refina por niveles hasta un BoM completo y una propuesta firme.
4. Presenta al cliente los cuatro esquemas de contratación (contado, crédito,
   PPA, arrendamiento) sobre un mismo motor de cálculo.
5. Genera el formato de levantamiento de campo a partir de los huecos que la
   propia propuesta declara.

Alcance de la fase 1: **solo fotovoltaico**. BESS, compensación de factor de
potencia y migración al MEM se agregan después como módulos sobre el mismo
contrato de datos, que ya los prevé.

Herramienta de **uso interno de Beyond**.

---

## 2. Fuentes: qué se toma y qué se descarta

Criterio acordado: usar lo que sirve de los instrumentos existentes; lo
desactualizado o roto se descarta, no se migra.

### 2.1 GDMTH BEYOND V.260604 (cotizador actual)

| Se toma | Se descarta |
|---|---|
| Tablas de tarifas GDMTH por división 2019–2026 (como semilla, con validación de unidades) | Simplificación del cargo por capacidad contra demanda del año móvil |
| Lógica de dimensionamiento por valor de la energía (pondera horarios por su tarifa relativa) | Motores rotos: Enphase (#N/A), competencia (parcial) |
| Verificación contra capacidad del transformador | Pestañas legado: anteproyecto residencial, carta poder con #REF! |
| Catálogo maestro de artículos (COD_ART, $/W EXW/FOB/CIF/DDP, proveedor) | Dato basura activo: MDO Hoymiles a $319,183/panel |
| Tabuladores de verificación e inspección (medidor, UVIE, UIIE por rango de kWp) | Inflación energética con dos cifras contradictorias (3.9% motor vs 3.70% nota al pie) |
| Estructura de las 4 salidas (portada, cotización, recuperación, anexos) | DAP como % plano capturado a mano sin fuente municipal |
| Disciplina de bitácora de versiones | Relaciones horarias 0.56/1.00/1.19 tomadas de un caso y usadas como criterio |
| Distribución de precio de venta entre partidas con "¿llevar a unitario?" | |

### 2.2 BOQ BEYOND

| Se toma | Se descarta |
|---|---|
| Estructura de secciones del BoQ vigente (equipo FV, CD, CA, suministros, ingeniería y MDO, interconexión, herrería) | Las 4 generaciones de formato incompatibles: se define una sola |
| Reglas de cantidades encontradas en celdas (conectores = 2 × inversores × cadenas; coples = tubos × 2/3; abrazaderas = tubos/2.5; holguras 10–30%) — se formalizan como catálogo de reglas | Precios escritos a mano sin fecha ni fuente |
| Motor paramétrico abandonado `COSTOS`/`METADATOS` (parámetros de entrada, tabla de estructuras, lista de cable con ampacidad) como especificación | Pestaña `50+100` rota con #REF!; encabezados heredados sin actualizar |
| Pares (COTIZACIÓN)/(INSTALACIÓN) como banco de validación de reglas contra proyectos cerrados | IVA en dura (`*1.16`) regado por celdas |

### 2.3 MASTER COSTOS BEYOND

| Se toma | Se descarta |
|---|---|
| El **modelo** del tabulador de mano de obra: anclas de precio + interpolación + parámetros (paneles/día, viáticos, recargo). Se migran las anclas y la fórmula, no las 1,110 filas | Todos los precios 2022–2023 sin recotizar |
| Tipos de estructura y modificadores de riesgo por superficie (como esquema, con precios por recotizar) | Los dos tipos de cambio fijos ($17.90 y $18.00) |
| Modelo de costo de cuadrilla (carga social, jornada) como estructura de cálculo | La pestaña de nómina con nombres y salarios reales **no entra al producto**: es dato personal y vive aparte |

### 2.4 Marco de Referencia Propuestas FV (proyecto "Proyectos Fotovoltaicos")

Se toma casi íntegro; es el método. En particular:

- Catálogo de fallas recurrentes (sección 4 del marco) → motor de auditoría.
- Reglas duras de diseño (sección 5) → validaciones automáticas del BoM.
- Jerarquía de fuentes y marco normativo (secciones 9 y 10).
- Correcciones de simulación HelioScope (sección 7).
- Condicionales por tipo de sitio (sección 11).
- Estados documentales y etiquetas epistémicas (sección 8), que coinciden con
  la taxonomía del paramétrico.
- La **compuerta de emisión** (sección 14): lista corta de documentos sin los
  cuales no se emite nada. Se adopta como parte del flujo, adaptada por nivel
  de propuesta (una conceptual exige menos documentos que una firme, pero
  ninguna se emite sin su mínimo).
- La separación auditoría / redacción en skills distintos.

No se toma: las cifras de obra de Amores 219 y Mayan Lakes como valores por
defecto. Son historial. El propio marco lo advierte.

**Nota de lectura.** Cuando este framework menciona Amores 219 o Mayan Lakes,
lo hace como *procedencia* de una regla —el error o hallazgo real del que
salió—, nunca como dato a reutilizar. Ningún número de esas obras viaja a
proyectos nuevos.

### 2.5 SKILLPROPUESTASFV (desarrollo "Analisis PPA")

Se toma casi íntegro; es el motor financiero y las reglas de presentación:

- Motor v2 mensual a 360 meses, flujos por esquema, correcciones numéricas de
  TIR (bisección anual para inversionista, brackets acotados, `null` en vez de
  valor disparado).
- Los 4 esquemas con su terminología normalizada y las condiciones por esquema
  (propiedad, mantenimiento, seguro, al finalizar).
- Reglas de reporte: cliente nunca ve TIR/VPN/indicadores del inversionista;
  amortización mensual en instrumentos financiados; máximo 4 indicadores en
  vista cliente; plazo siempre visible.
- Reglas de formato de cifras y sistema de diseño (con la corrección de color
  de la sección 8).
- Errores conocidos (sección 9 de ese documento) como casos de prueba.

Se corrige: los `DEFAULTS_V2` pasan de constantes a **supuestos declarados
con fuente** (ver sección 8). Un default sin fuente es un supuesto, y así se
etiqueta.

### 2.6 Paramétrico de electrolineras (este repositorio)

Se toman los patrones probados: taxonomía de sustento en cada cifra, índice de
definición ponderado por importe mapeado a clases AACE, bitácora de versiones
en el repo desplegada con el código, versión y fecha en el pie del documento,
rangos de incertidumbre asimétricos, y el criterio tarifario del término
medido contra calculado (sección 5.2).

---

## 3. Principios no negociables

1. **Toda cifra lleva su taxonomía**: `validado`, `fuente`, `supuesto`,
   `allowance`. Un default del motor es un `supuesto` y se muestra como tal.
2. **El nivel de la propuesta se calcula**, no se declara: índice ponderado
   por importe, como en el paramétrico.
3. **Una sola cifra por concepto en todo el documento.** Toda cifra financiera
   declara de qué cifra de ahorro depende. (Regla derivada de la falla real de
   Amores 219 rev00: capacidad en tres cifras distintas.)
4. **Nunca se bloquea la generación de la propuesta por falta de precisión**:
   un hueco se llena con valor asumido declarado que castiga el índice, no con
   un error. La excepción es la compuerta de emisión: hay un mínimo de
   documentos por nivel por debajo del cual no se emite ni preliminar.
5. **Fuente única de precios** con historial de cambios. Se acabaron los
   precios por pestaña con tipo de cambio congelado.
6. **Un solo motor multi-tecnología** parametrizado (inversor central /
   microinversores), no motores duplicados que divergen.
7. **Ninguna cifra de desempeño entra al documento de cliente** si no la
   sostiene la simulación propia o un documento del fabricante.
8. **Jerarquía de fuentes**: manual de instalación > ficha técnica > norma >
   nota técnica del fabricante > literatura > material comercial. Ante
   contradicción, se consulta por escrito al fabricante.
9. **Versionado SemVer con bitácora en el repo**, entrada de bitácora en el
   mismo commit que el cambio, versión y fecha de compilación en el pie de
   todo documento emitido.
10. **Estados documentales**: borrador interno → versión revisable → apto para
    cliente final. Si no se puede verificar que está listo, no se clasifica
    como apto.
11. **La validación de permisos y escritura vive en la base de datos**, no en
    el cliente, cuando el producto tenga backend (patrón del paramétrico).

---

## 4. Contrato de datos

Un archivo/registro por proyecto, esquema versionado (`schemaVersion`),
fuente única de verdad para el motor, los documentos, los skills y el
levantamiento. Todo campo cuantitativo es un objeto:

```
{ "valor": ..., "origen": "validado|fuente|supuesto|allowance",
  "fuente": "de dónde salió", "fecha": "AAAA-MM" }
```

Secciones:

- **cliente**: razón social, contacto, régimen fiscal (declarado, no
  asumido: gobierna el beneficio fiscal y la deducibilidad).
- **sitio**: dirección, coordenadas, altitud, tipo de montaje, condicionales
  de sitio activas (costero, huracán, sísmico, cálido, seca prolongada,
  azotea), estación climatológica de referencia.
- **suministro**: número de servicio (RPU), medidor, tarifa, división CFE,
  tensión, demanda contratada, carga conectada, transformador existente.
- **historial[1..12]**: por recibo: periodo, kWh por horario (base,
  intermedia, punta), demanda máxima, FP, factor de carga, cargos unitarios
  aplicados, importe facturado, **reconciliación** (¿cargos × consumos
  reproducen el total impreso?).
- **simulacion**: origen (HelioScope import / HSP interno), kWh/kWp mensual,
  parámetros corregidos (binning, ensuciamiento, tamaño de cadena),
  irradiancia posterior efectiva, versión del reporte.
- **sistema**: módulos (modelo, cantidad, potencia), inversores, cadenas por
  MPPT, tipo de estructura, longitudes CD/CA, punto de interconexión y su
  tensión real medida.
- **bom**: renglones con concepto, cantidad (capturada o regla), precio
  unitario con taxonomía, sección, moneda de origen y tipo de cambio con
  fecha.
- **precios**: margen general sobre costo, márgenes por familia, comisiones,
  descuentos; todo bidireccional costo↔venta (sección 7).
- **financiero**: parámetros del motor v2 con origen declarado; esquemas
  activos y sus condiciones.
- **medidas[]**: fv (fase 1); reservado: bess, fp, mem.
- **salidas**: documentos emitidos con versión, fecha, estado documental y
  hash del contrato de datos que los produjo.
- **pendientes**: generado, no capturado — los campos en `supuesto`/`allowance`
  con su impacto; alimenta el levantamiento de campo.

---

## 5. Módulos del motor

### M1 — Ingesta de recibos (hasta 12)

Extracción de PDF de CFE a `historial[]`. Por cada recibo: **reconciliación
aritmética** — si cargos extraídos × consumos extraídos no reproducen el total
impreso dentro de tolerancia, el recibo se marca no conciliado y se dice, no
se promedia en silencio. Detecta además: FP y penalización/bonificación
vigente, DAP real del recibo (no % capturado), cambios de medidor (lectura
anterior en cero), y la discrepancia tipo "julio 2026 de Amores" (diferencia
inexplicada entre reconstrucción y cobro).

CFE no expone API pública de tarifas ni de recibos (verificado 2026-08): la
ingesta es por PDF y la actualización tarifaria es manual con validación.

### M2 — Motor tarifario

- Semilla: las tablas GDMTH 2019–2026 del cotizador actual, extraídas una vez
  a datos estructurados con división, mes, cargo, **unidad validada** y fuente.
- Cobertura fase 1: GDMTH. GDMTO y GDBT en fase 2 (el marco de referencia ya
  trae el método GDBT validado: factor de carga 0.49 del acuerdo
  CT/11.SE/8-2025, reprodujo 11 de 12 meses).
- **Criterio del término medido contra calculado: el del paramétrico.** El
  cargo por capacidad se aplica a la menor entre la demanda medida en punta y
  `Q/(24 × d × F.C.)`; el de distribución, entre la máxima mensual y la misma
  fórmula. Es la fórmula del pliego (página GDMTH de CFE) y es la vía por la
  que un SFV sí reduce demanda facturada cuando el término calculado es el que
  manda: menos kWh ⇒ menor demanda calculada. La herramienta **declara en el
  resultado cuál término manda por mes**, porque el ahorro por demanda existe
  solo cuando manda el calculado.
- Actualización mensual manual con validación de unidad, división y vigencia;
  cada tarifa capturada declara su fuente (portal CFE, oficio, o acuerdo).

### M3 — Dimensionamiento y generación

- Entrada primaria: **importación del reporte de HelioScope** (PDF/CSV
  exportado). Decisión cerrada 2026-08: no se contrata el plan Enterprise que
  exige la API de HelioScope; el sistema se alimenta con los reportes
  exportados. No hay API de por medio en ningún módulo.
- Respaldo sin simulación (nivel conceptual): HSP por ciudad + rendimiento
  declarado como `supuesto`.
- Se replica la lógica buena del cotizador: fracción del requerimiento por
  **valor** de la energía (no solo kWh), tope por transformador y por área,
  verificación contra demanda contratada.
- Checklist de simulación (marco de referencia sección 7): binning según
  ficha, ajuste espectral, perfil de ensuciamiento según programa de limpieza,
  tamaño de cadena fijo, y comparación contra la versión anterior tras cada
  corrección.
- Bajo medición neta, dimensionar por encima del 100% del consumo exige
  justificación explícita (créditos caducan a 12 meses).

### M4 — Catálogo y BoM por niveles

Tres niveles de catálogo, alineados al nivel de propuesta:

| Nivel | Catálogo | Cantidades |
|---|---|---|
| Conceptual | $/Wp paramétrico por familia (módulos, inversores, estructura, BOS, MDO, interconexión) con valores asumidos declarados | Derivadas todas del tamaño del sistema |
| Preliminar | Catálogo simplificado: equipos principales reales + familias paramétricas para el resto | Mixtas: equipos capturados, resto por regla |
| Firme | BoM completo por secciones (estructura del BOQ vigente) | Capturadas o por regla, cada una con su base |

- Las **reglas de cantidades** viven en un catálogo de reglas con fuente y
  estado de validación, no en celdas. Se validan contra los pares
  (COTIZACIÓN)/(INSTALACIÓN) del BOQ histórico antes de usarse en propuesta
  firme.
- Las **reglas duras de diseño** (marco sección 5: cadena por Voc corregido y
  criterio del fabricante, corriente por MPPT con ganancia bifacial, derrateo
  por tensión de red real, calibre por caída y ampacidad contra terminal del
  inversor, conectores mismo tipo y origen, colas de 6 mm²) corren como
  validaciones del BoM: no bloquean, marcan.
- **Las claves de artículo conservan el sistema de códigos del cotizador
  actual** (COD_ART: jerarquía numérica de categoría/tipo/subtipo + marca +
  especificación, p. ej. `1113TRI635`). Decisión de RG 2026-08. En fase 0 se
  extrae el diccionario completo, se valida unicidad y se documenta la regla
  de alta. Mejora acordada: los atributos nuevos se agregan como campos del
  catálogo, no como más dígitos en la clave.
- Tabulador de MDO: anclas + interpolación + parámetros, recotizado.
- Moneda por renglón con tipo de cambio fechado; nada de TC congelado
  implícito.

### M5 — Precios y márgenes

Modelo acordado, bidireccional:

- Margen general sobre costo → interpretación por familia de material →
  margen general resultante sobre precio de venta. Conversión en ambos
  sentidos: `m_venta = m_costo / (1 + m_costo)` y `m_costo = m_venta /
  (1 − m_venta)`. El usuario captura cualquiera de los dos y el otro se
  calcula y se muestra.
- Comisiones y montos fijos como capa separada del margen (estructura del
  cotizador actual: vendedor, ingeniería, administrativos, recargos).
- Distribución del precio entre partidas visibles de la cotización con la
  opción de absorber en unitario ("¿llevar a unitario?"), heredada del
  cotizador.
- El margen nunca aparece en documentos de cliente.

### M6 — Motor financiero (4 esquemas)

El motor v2 del desarrollo "Analisis PPA", con sus flujos por esquema,
detalles numéricos de TIR/VPN y `schemeReport`, adoptado como especificación.
Cambios sobre esa especificación:

1. Todos los `DEFAULTS_V2` se declaran con origen y fuente (sección 8).
2. `ahorroPct` deja de ser un default plano (39.5%): lo produce M2+M3 por
   proyecto (recibo reconstruido con y sin sistema). El default solo sobrevive
   en nivel conceptual, etiquetado `supuesto`.
3. El beneficio fiscal se condiciona al régimen fiscal capturado del cliente
   (falla real de Amores 219: persona física sin actividad empresarial no
   deduce Art. 34-XIII). Sin régimen capturado, el beneficio se muestra
   condicionado, nunca sumado en silencio.
4. La degradación y la generación vienen de M3, no de un % del consumo.

### M7 — Documentos

- Por esquema: **reporte cliente** y **reporte interno** (8 combinaciones),
  con las reglas de contenido del desarrollo Analisis PPA (cliente sin
  TIR/VPN/margen; amortización mensual; máximo 4 indicadores; plazo siempre
  visible; condiciones por esquema en 4 conceptos).
- Sistema de diseño Beyond: Montserrat, tema light para documentos impresos,
  carta US Letter, cifras grandes en pesos thin, iconos Lucide, sin emoji.
  **Naranja `#FF8700`** (el documento de Analisis PPA dice `#FB8722`; ese
  token ya se corrigió en el sistema de diseño para coincidir con el logo, y
  `--accent-ink #B4590C` para texto sobre papel).
- Estructura del insumo interno: la del marco de referencia sección 8.1,
  incluyendo "qué cambia respecto a la revisión anterior y por qué" y la tabla
  dice/debe decir cuando sustituye a un documento emitido.
- Pie con versión del software, fecha de compilación y hash del contrato de
  datos: toda propuesta impresa se puede reconciliar con el cálculo que la
  produjo.

### M8 — Auditoría, compuerta y levantamiento

- **Auditoría**: verificación mecánica de consistencia interna del documento
  (una cifra por concepto, tarifa del documento = tarifa del recibo, modelo de
  módulo consistente entre propuesta/simulación/ficha, nombre del cliente
  contra recibo, financieros trazables al ahorro declarado, afirmaciones de
  bifacialidad contra la irradiancia posterior simulada). Es el catálogo de
  fallas de Amores 219 rev00 convertido en checks.
- **Compuerta de emisión por nivel**: mínimo de documentos para emitir.
  Conceptual: al menos 1 recibo conciliado. Preliminar: 12 recibos (o los que
  existan, declarándolo) + simulación propia. Firme: manuales de módulo e
  inversor, área útil confirmada, ficha de proyecto completa, levantamiento
  cerrado.
- **Levantamiento de campo**: generado desde `pendientes` — exactamente los
  campos en `supuesto`/`allowance`, ordenados por impacto sobre el total, en
  formato imprimible/móvil. Al volver con datos, la propuesta sube de nivel
  sola.
- **Análisis de FP como paso previo obligatorio** cuando la tarifa mide
  reactivos: si hay penalización previa, se reporta y se cotiza como paquete
  separado (regla del marco; además el FP puede empeorar con FV). En fase 1
  esto es solo detección y advertencia; la medida FP completa es fase
  posterior.

---

## 6. Flujo de trabajo (procedimiento)

```
1. Alta de proyecto        → ficha mínima: cliente, sitio, objetivo
2. Ingesta de recibos      → M1: hasta 12 PDF, reconciliación por recibo
3. Línea base              → M2: reconstrucción tarifaria, FP, término que manda
4. Dimensionamiento        → M3: conceptual (HSP) o con HelioScope importado
5. BoM y costo             → M4: nivel según información disponible
6. Precio                  → M5: márgenes y comisiones
7. Esquemas financieros    → M6: contado / crédito / PPA / arrendamiento
8. Auditoría + compuerta   → M8: checks de consistencia; ¿se puede emitir?
9. Emisión                 → M7: documentos cliente/interno, versionados
10. Levantamiento          → M8: formato generado desde los huecos
11. Refinamiento           → vuelve al paso que corresponda; toda revisión
                             declara qué cambió y por qué
```

Cada paso escribe sobre el contrato de datos; ningún paso escribe sobre un
documento directamente.

### Skills (fase de operación por terminal, antes de interfaz)

Tres, separados a propósito (recomendación del marco, adoptada):

1. **`fv-ingesta`** — recibos PDF → contrato de datos, con reconciliación.
2. **`fv-propuesta`** — contrato de datos → cálculo + documentos. Exige ficha
   de proyecto como requisito de entrada; no rellena huecos con contexto.
3. **`fv-auditoria`** — documento (propio o ajeno) → tabla dice/debe decir.
   Es el de mayor retorno inmediato: audita también propuestas ya emitidas.

---

## 7. Niveles de propuesta

Mapeados a la práctica AACE 18R-97 como en el paramétrico, con índice
calculado (validado 1.00 / fuente 0.75 / supuesto 0.35 / allowance 0.00,
ponderado por importe):

| Clase | Nombre | Base típica |
|---|---|---|
| 5 | Conceptual | 1+ recibos, catálogo paramétrico, HSP |
| 4 | Preliminar / presupuestal | 12 recibos, simulación propia, catálogo simplificado |
| 3 | Técnico-económica | BoM completo, equipos cotizados, levantamiento |
| 2 | Definitiva | Cotizaciones formales, manuales verificados, sitio confirmado |

El rango de incertidumbre se comunica por clase y es asimétrico en el cálculo
interno.

---

## 8. Inconsistencias entre fuentes — a resolver antes de codificar

| # | Tema | Fuentes en conflicto | Resolución propuesta |
|---|---|---|---|
| 1 | Naranja de marca | `#FB8722` (doc Analisis PPA) vs `#FF8700` (logo, tokens del paramétrico) | **Resuelto: `#FF8700`.** Corregir el doc de Analisis PPA |
| 2 | Inflación energética | 3.9% (motor GDMTH y defaults PPA) vs 3.70% (nota al pie del propio GDMTH, CAGR 2020–2025) vs 8% (modelo v1 histórico) | **Resuelto (2026-08): 3.7% como supuesto vigente**, el único de los tres con base declarada (CAGR 2020–2025). Trabajo futuro acordado: discretizarla **por división de CFE**, porque cada división se comporta distinto; el contrato de datos ya guarda la división, así que el cambio es de datos, no de estructura |
| 3 | Rendimiento FV de referencia | 1,650 kWh/kWp·año (doc PPA) vs ~1,440 (120/mes, caso GDMTH) vs 1,380 (115/mes, paramétrico, "media zona centro, conservador") | El rendimiento es **por sitio** (simulación o HSP local); cualquier número único nacional es `supuesto` y se etiqueta. Sin resolución única a propósito |
| 4 | `ahorroPct` 39.5% | Default del motor PPA | Deja de ser default: lo calcula M2+M3. Solo sobrevive en clase 5 como `supuesto` |
| 5 | F.C. de la fórmula tarifaria | `CLAUDE.md` del paramétrico dice "no lo tenemos" y cita "A/T58/2024"; `app.js` trae 0.57/0.55/0.49 citando "A/158/2024"; el marco FV valida 0.49 (GDBT) contra CT/11.SE/8-2025 con 11/12 meses | Verificar el acuerdo vigente en el DOF y corregir `CLAUDE.md` o `app.js` según resulte. La validación empírica de GDBT (0.49) da confianza, pero la cita hay que cerrarla |
| 6 | Cargo por capacidad | Demanda del año móvil (cotizador GDMTH) vs fórmula del pliego (paramétrico y página CFE) | **Resuelto: fórmula del pliego**, declarando qué término manda por mes |
| 7 | Beneficio fiscal | Flujo único mes 10 asumiendo contribuyente con utilidad (cotizador y doc PPA) vs "exige verificar régimen" (marco, con falla real) | Condicionado al régimen capturado; sin dato, se muestra condicionado |
| 8 | Bifacialidad | "10–20% según albedo" (propuesta emitida) vs 1.3–2.3% (simulaciones reales de ambas obras) | Solo entra la irradiancia posterior efectiva de la simulación propia |

---

## 9. Control de versiones

Igual que el paramétrico:

- SemVer en el manifiesto del producto; la bitácora (`versiones.json` o
  equivalente) va **en el mismo commit** que el cambio que documenta.
- El framework mismo se versiona: este documento es 0.1.0 y cambia por
  revisión acordada, con su entrada de bitácora al final.
- Todo documento emitido lleva versión del software + fecha + hash del
  contrato de datos.
- Los esquemas del contrato de datos llevan `schemaVersion`; las rutas de
  carga mezclan con `Object.assign`, nunca reemplazan (la lección del
  paramétrico para no romper proyectos guardados).

---

## 10. Decisiones abiertas

1. **Repositorio definitivo del producto.** Producto independiente; propuesta:
   repo nuevo (`propuestas-fv` o nombre por definir), llevándose de aquí los
   patrones y, cuando exista backend compartido, leyendo el catálogo común.
   Este framework se muda con él.
2. **Forma de la interfaz** (cuando llegue): ¿app web tipo paramétrico o
   dashboard único como el centro de análisis PPA? No bloquea fases 0–2.
3. **Dónde vive el catálogo de precios FV**: ¿Supabase compartida con el
   paramétrico o propia? Depende de la decisión 1.
4. **Los 5 documentos base de Mayan Lakes** (tabla de límites de equipo,
   checklist de diseño, glosario, marco normativo, carta a fabricante):
   confirmar cuáles existen y traerlos como `references/` del skill.

## 11. Pendientes por validar (no bloquean el framework, sí el contenido)

1. Acuerdo tarifario vigente y valores de F.C. (inconsistencia 5) — en el DOF.
2. Discretización de la inflación energética por división de CFE
   (inconsistencia 2): recalcular el CAGR con la serie de cada división a
   partir de las tablas 2019–2026 ya extraídas en fase 0.
3. Recotización de tabuladores de MDO y estructura (base 2022–2023).
4. Fórmula vigente de penalización/bonificación de FP para el módulo de
   detección (el marco ya validó 3/5×(90/FP−1) contra un recibo real de 2026).
5. Reglas de cantidades contra los pares cotizado/instalado del BOQ.

---

## 12. Roadmap

| Fase | Entrega | Depende de |
|---|---|---|
| 0 | Este framework aprobado + extracción de activos de los sheets (tarifas, catálogo de artículos, tabuladores, reglas de cantidades) a datos estructurados con taxonomía | Revisión de RG |
| 1 | Contrato de datos + skill `fv-ingesta` (hasta 12 recibos, reconciliación) probado con recibos reales | Fase 0, recibos de prueba |
| 2 | M2 línea base GDMTH + M3 conceptual + primer documento extremo a extremo (clase 5) | Fase 1 |
| 3 | Importación HelioScope + M4/M5 (catálogo por niveles, márgenes) → clase 4 | Fase 2 |
| 4 | M6 cuatro esquemas + M7 reportes cliente/interno + skill `fv-auditoria` | Fase 3 |
| 5 | Levantamiento de campo + compuerta completa; después BESS/FP/MEM como medidas nuevas | Fase 4 |

El caso de validación de paridad es el vivo del cotizador (Federación
Mexicana de Futbol, 452.8 kWp): la herramienta debe reproducir sus números
desde los mismos insumos, y cada desviación deliberada (fórmula del pliego,
beneficio fiscal condicionado) queda documentada con su razón.

---

## Bitácora del framework

| Versión | Fecha | Cambios |
|---|---|---|
| 0.2.1 | 2026-08-18 | Decisión de RG: se conserva el sistema de códigos COD_ART del catálogo de artículos del cotizador; el diccionario se extrae y valida en fase 0, y los atributos nuevos se agregan como campos, no como dígitos. |
| 0.2.0 | 2026-08-17 | Decisiones de RG: inflación energética 3.7% como supuesto vigente, con discretización por división de CFE como trabajo futuro (las tablas 2019–2026 extraídas en fase 0 son la materia prima). Sin APIs: CFE no tiene y HelioScope Enterprise queda descartado; el sistema se alimenta con reportes exportados de HelioScope. Nota de lectura sobre Amores 219 y Mayan Lakes: son procedencia de reglas, no datos reutilizables. |
| 0.1.0 | 2026-08-17 | Primera versión. Consolida: análisis de GDMTH BEYOND V.260604, BOQ BEYOND y MASTER COSTOS BEYOND; Marco de Referencia Propuestas FV v1; SKILLPROPUESTASFV (Analisis PPA); patrones del paramétrico de electrolineras. Decisiones de RG incorporadas: hasta 12 recibos, criterio tarifario del paramétrico, catálogo por niveles sin bloqueo, márgenes bidireccionales costo↔venta, framework antes que código, uso interno. |
