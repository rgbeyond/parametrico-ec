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
src/lib/contexto.js        proyecto abierto y su catálogo combinado
src/lib/app.js             núcleo del estimador  ← 1,076 líneas, deuda declarada
src/lib/almacenamiento.js  respaldo local y modo sin cuenta
src/data/catalogo.json     188 conceptos: precio, sustento y fuente
supabase/                  esquema, políticas RLS y semilla (bloques 01–05)
scripts/generar-seed.mjs   regenera 03_semilla.sql desde catalogo.json
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
| Regenerar semilla | `npm run seed` |
| Validar el SQL | `bash scripts/validar-sql.sh` |

**Este repositorio no tiene pruebas automatizadas.** Es su mayor hueco. Al
terminar cualquier cambio, corre `npm run build`: si el build no pasa, Netlify
tampoco.

---

## Definición de terminado

1. `npm run build` pasa.
2. `bash scripts/validar-sql.sh` en verde si tocaste `supabase/`.
3. Si el cambio agrega capacidad o corrige algo visible: versión en
   `package.json` **y** entrada en `src/data/versiones.json`, mismo commit.
4. El razonamiento de cada supuesto queda en el propio renglón del código.

---

## Roles

| Rol | Puede |
|---|---|
| `admin` | Todo: aprobar precios, promover conceptos, asignar roles |
| `editor` | Crear y editar proyectos, actualizar precio/taxonomía/fuente, agregar conceptos |
| `comentarista` | Leer todo y dejar comentarios |
| `lector` | Consultar sin modificar |
| `vendedor` | Levanta expedientes sin ver costos. **En la base sí, en esta interfaz no** |

`vendedor` no es un grado más de la escala: es una rama aparte. `lector`
consulta todo sin modificar —es quien audita—; `vendedor` es lo contrario,
escribe expedientes y ve menos.

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

## Dónde está lo demás

| Tema | Dónde |
|---|---|
| Dimensionamiento eléctrico, GDMTH, depósito | `.claude/rules/motor-ec.md` |
| Migraciones, RLS, catálogo compartido | `.claude/rules/supabase.md` |
| Interfaz, marca, estado guardado, versión | `.claude/rules/ui.md` |
| Revisión independiente de un cambio | subagente `code-critic` |
| Investigación regulatoria | subagente `normative-researcher` |
| Arquitectura objetivo de la plataforma | `propuestas-fv/docs/arquitectura/` |
