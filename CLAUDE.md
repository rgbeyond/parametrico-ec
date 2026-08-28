# Paramétrico de electrolineras

Herramienta interna de Beyond AE para estimar el CAPEX de estaciones de carga
para vehículos eléctricos a partir de datos macro del sitio. El nivel de
definición del estimado se **calcula**, no se declara a mano.

Trabaja en **español**. Código, comentarios, interfaz y commits en español. Sin
emoji.

<!-- Reducido de 352 a ~150 líneas en la Fase 0 (2026-08-26). Lo que salió está
     en .claude/rules/ y en docs/. Mapeo completo en
     docs/claude-engineering-phase0.md. Git conserva el original. -->

---

## Lo que hay que saber siempre

**Toda cifra lleva su taxonomía**: `validado`, `fuente`, `supuesto`,
`allowance`. Nunca las colapses ni presentes un supuesto como hecho. Un concepto
sin base declarada es «pendiente de cotizar», no un número inventado. Si llenas
un hueco con una regla de escalamiento, dilo en el propio renglón: una regla no
convierte un supuesto en dato.

**El nivel de definición se calcula.** Índice = promedio del puntaje de sustento
de cada renglón, **ponderado por importe**, no por conteo. `validado` 1.00,
`fuente` 0.75, `supuesto` 0.35, `allowance` 0.00. Se mapea a clases 5–1 según
AACE 18R-97. Un renglón mal sustentado en una partida dominante pesa más que
cuarenta validados en partidas menores.

**Los rangos son asimétricos.** La cola larga está del lado alto. No los
conviertas en ± simple en el cálculo interno, aunque al cliente se le comunique
así.

**Verifica antes de afirmar.** No inventes nombres de elementos de interfaz de
productos de terceros, ni artículos de norma, ni valores de configuración.

**Señala riesgos, huecos e inconsistencias sin suavizar.**

**No sobrescribas márgenes ni estructura de costos** sin instrucción explícita.
Cualquier cambio se documenta con su razón.

---

## Arquitectura

Dos repositorios federados, no un monorepo. Este es el paramétrico; el
Portafolio Energético vive en `rgbeyond/propuestas-fv` y monta este sitio por
proxy de Netlify en `/ec/*`. Comparten **un solo proyecto de Supabase**, tabla
`perfiles` y funciones de rol.

**Sin framework de interfaz, a propósito.** JavaScript de módulos ES sobre Vite.

```
index.html                 marcado completo de la aplicación
src/main.js                sesión, portada, carga diferida del estimador
src/ui/portada.js          pantalla de proyectos
src/ui/usuarios.js         administración de roles
src/ui/bitacora.js         historial de versiones
src/lib/sesion.js          sesión con Google, roles, objeto `puede`
src/lib/datos.js           repositorio: proyectos, conceptos, comentarios
src/lib/catalogo.js        de qué fuente sale el catálogo, y qué pasa si falla
src/lib/contexto.js        proyecto abierto y su catálogo combinado
src/lib/app.js             núcleo del estimador  ← 1,076 líneas, deuda declarada
src/lib/almacenamiento.js  respaldo local y modo sin cuenta
src/data/catalogo.json     188 conceptos: precio, sustento y fuente
supabase/                  esquema, políticas y semilla (01–03 en esta rama)
scripts/generar-seed.mjs   regenera 03_semilla.sql desde catalogo.json
pruebas/                   node --test, sin navegador ni credenciales
```

**Sin variables de entorno la aplicación funciona completa** y guarda en el
navegador. Es decisión deliberada: la herramienta debe seguir siendo usable sin
cuenta. No introduzcas dependencias que rompan ese modo.

---

## Comandos

| Qué | Comando |
|---|---|
| Desarrollo | `npm run dev` |
| Compilar | `npm run build` |
| Probar | `npm test` |
| Regenerar semilla | `npm run seed` |

**Las pruebas cubren un solo módulo, y ese sigue siendo el hueco mayor.**
`pruebas/catalogo.test.mjs` ejercita los cuatro estados del catálogo maestro. El
resto del repositorio —el estimador entero, que es donde están las cifras— no
tiene ninguna. No presentes «las pruebas pasan» como si cubrieran el cálculo.

Al terminar cualquier cambio, corre `npm test` y `npm run build`: si el build no
pasa, Netlify tampoco.

Las pruebas corren en Node sin transpilar, así que un módulo que quiera ser
probable **no puede importar JSON ni Supabase**: por eso la decisión del
catálogo se mudó a `src/lib/catalogo.js`, que no importa nada. Es el patrón a
seguir cuando saques lógica de `app.js`.

---

---

## ⚠ Las migraciones del esquema compartido ya no viven aquí

**Desde la Fase 1A, la fuente de verdad del esquema de Supabase es
`rgbeyond/beyond-platform`.**

Las dos aplicaciones comparten un solo proyecto de Supabase, y evolucionar el
mismo esquema desde dos repositorios es lo que produjo la divergencia que la
Fase 1A tuvo que reconciliar: la base desplegada acabó por delante de las dos
ramas principales, y una base nueva construida desde Git **no arrancaba**.

| | Dónde |
|---|---|
| Migración nueva del esquema compartido | `beyond-platform/supabase/migrations/` |
| Migraciones de aquí | **se quedan**, como registro |

**Las migraciones de este repositorio no se borran.** Son la arqueología de
cómo se llegó al esquema actual, y `beyond-platform/origen/` guarda una copia
exacta para poder diffear la línea base contra su fuente. Borrarlas no
arreglaría nada y quitaría la única forma de comprobar la reconstrucción.

**Lo que sí cambia:** no escribas aquí una migración nueva del esquema
compartido. Si un cambio de esquema hace falta, va en `beyond-platform`, se
prueba con `beyond-platform/scripts/reconstruir.sh` contra una
base vacía, se aplica a
Beyond DEV y solo entonces se propone para producción.

Detalle en `beyond-platform/docs/reconciliacion/compatibilidad-apps.md`.

## Definición de terminado

1. `npm test` y `npm run build` pasan.
2. Si tocaste `supabase/`: **trae `scripts/validar-sql.sh` primero**. No está
   en esta rama y aplicar SQL sin validarlo es cómo se descubre el error 55P04
   en producción. Ver `.claude/rules/supabase.md`.
3. Si el cambio agrega capacidad o corrige algo visible: versión en
   `package.json` **y** entrada en `src/data/versiones.json`, mismo commit.
4. El razonamiento de cada supuesto queda en el propio renglón del código.
5. Si tocaste `.claude/`: `python3 .claude/hooks/probar-guardias.py` en verde.
   Los guardias han fallado abierto tres veces y las tres parecían estar bien.
6. Si tocaste `CLAUDE.md` o `.claude/rules/`:
   `python3 scripts/verificar-referencias.py .` sin rutas rotas ni globs
   huérfanos. Una regla cuyo `paths:` no casa con nada **no se carga nunca** y
   no avisa. Una ausencia declarada a propósito no cuenta como error.

---

## Roles

| Rol | Puede |
|---|---|
| `admin` | Todo: aprobar precios, promover conceptos, asignar roles |
| `editor` | Crear y editar proyectos, actualizar precio/taxonomía/fuente, agregar conceptos |
| `comentarista` | Leer todo y dejar comentarios |
| `lector` | Consultar sin modificar |

**`vendedor` no está en esta rama** —ni en `sesion.js` ni en `supabase/`— pero
**sí está aplicado en la base de datos desplegada**. Es una de las divergencias
que documenta `.claude/rules/supabase.md`. La decisión de producto es
**retirarlo**, en Fase 1.

El primero que entra queda administrador; los siguientes entran como `lector`.
Es deliberado: quien acaba de entrar no debería poder mover precios que
alimentan propuestas a cliente. El dominio permitido está en
`fn_dominio_permitido`.

---

## Caso de referencia: Atlacomulco Fase 1

5 equipos de 240 kW, 10 puntos de carga, 1,200 kW, balanceo dinámico con 30%
reservado —lo que baja la demanda de diseño a 840 kW y sostiene el transformador
de 1,500 kVA; sin esa reserva el criterio pediría 2,000 kVA—, 615 kWp
fotovoltaico, 2 módulos de almacenamiento de 261 kWh. Tarifa GDMTH división
**Centro Sur**, captura de agosto 2026. Costo directo $36,370,522; inversión
total $48,670,755; depósito de garantía $757,944 aparte, sobre 720 kW de demanda
contratada. **Clase 4, índice 0.42.**

**Problema abierto, de negocio y no de código:** la obra civil está costeada
para los 29 equipos del desarrollo completo, no para los 5 de la fase 1.
Sobreestima cerca de $700,000.

Este caso debería convertirse en la primera prueba dorada del repositorio.

---

## De qué base parte esta rama

`origin/main`. **No incluye** los nueve commits de
`claude/solar-proposal-skill-iwp1oi` —framework FV, `conceptos.ambitos`,
diagnóstico, rol `vendedor`— por decisión explícita: el rol `vendedor` se
retira, no se completa, y meterlo a producción como parte de una fase de
configuración sería exactamente lo contrario.

Su integración es una decisión aparte. Detalle en
`docs/claude-engineering-phase0.md`.

---

## Dónde está lo demás

| Tema | Dónde |
|---|---|
| Dimensionamiento eléctrico, GDMTH, depósito | `.claude/rules/motor-ec.md` |
| Migraciones, RLS, y la divergencia con la base desplegada | `.claude/rules/supabase.md` |
| Interfaz, marca, estado guardado, versión | `.claude/rules/ui.md` |
| Revisión independiente de un cambio | subagente `code-critic` |
| Investigación regulatoria | subagente `normative-researcher` |
| Arquitectura objetivo de la plataforma | `propuestas-fv/docs/arquitectura/` |
