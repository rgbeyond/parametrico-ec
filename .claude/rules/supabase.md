---
paths:
  - "supabase/**/*.sql"
  - "src/lib/sesion.js"
  - "src/lib/supabase.js"
  - "src/lib/datos.js"
---

# Base de datos y roles

> **Esta rama describe lo que existe en `origin/main`.** El esquema aquí son
> tres archivos: `01_esquema.sql`, `02_politicas.sql`, `03_semilla.sql`. Los
> bloques `04_ambitos`, `05_vendedor` y `diagnostico.sql` **no están en esta
> base**, y `scripts/validar-sql.sh` tampoco. Viven en la rama
> `claude/solar-proposal-skill-iwp1oi`. Lee la advertencia de abajo antes de
> tocar cualquier cosa de base de datos: hay una divergencia real entre esta
> rama y la base desplegada.

## ⚠ La base desplegada está POR DELANTE de esta rama

Hallazgo de la Fase 0.1, y es el que más importa de este archivo.

El proyecto de Supabase en producción **ya tiene aplicadas** migraciones que no
están en `origin/main`:

| En la base desplegada | ¿En esta rama? |
|---|---|
| `conceptos.ambitos` (catálogo por área) | **No** |
| Rol `vendedor` en el enum y sus funciones | **No** |
| `fn_conceptos_de` | **No** |
| `fn_articulos_de` | **No aplica: es del portafolio**, y allí sí está versionada |
| Bucket `recibos` y sus políticas | **No** (son del otro repositorio) |

Cómo se sabe: el Portafolio Energético está desplegado y depende de
`conceptos.ambitos`; los buckets existen con la huella exacta que deja el SQL.

**Corrección de la Fase 1A.** Una versión anterior de esta tabla listaba
`fn_articulos_de` como divergencia de este repositorio. **Es falso.** Esa
función se define en `propuestas-fv/supabase/21_articulos.sql`, que sí está en
`main` de aquel repositorio; nunca faltó de Git. Lo que sí es real, y es peor:
esa migración `21` **depende de `conceptos.ambitos`**, la columna que crea
`04_ambitos.sql` de este repositorio y que no está en esta rama. Una base nueva
construida desde las dos ramas principales **no arranca**: la `21` falla porque
la columna no existe. Detalle en
`propuestas-fv/docs/arquitectura/reconciliacion-supabase-phase1a.md`.

**Consecuencia práctica:** las migraciones dejaron de ser la fuente de verdad
para este repositorio. Si alguien clona `main` y aplica `supabase/` a una base
nueva, obtiene un esquema **distinto** del que corre en producción.

**No lo arregles de paso.** Reconciliar esto es una decisión de integración: hay
que decidir si los nueve commits de la rama designada entran a `main`, y eso
incluye el rol `vendedor`, que la decisión de producto es **retirar**. Es
trabajo de Fase 1.

Mientras tanto: **antes de escribir cualquier migración nueva, comprueba contra
qué esquema estás escribiendo.**

## Un solo proyecto, compartido

Este repositorio y el Portafolio Energético comparten un proyecto de Supabase.
Numeración por bloques: `01`–`05` aquí, `20`–`23` en `propuestas-fv`, aplicados
en ese orden sobre la misma base.

**Ese proyecto es producción.** Tiene usuarios reales con sesión iniciada y las
dos aplicaciones dependen de él. No se experimenta contra él, no se le aplican
migraciones desde un agente, y no se le conecta un MCP con capacidad de
escritura. Ver `propuestas-fv/docs/operacion/mcp.md`.

## Quién puede escribir qué

Actualizar el precio del catálogo maestro es de **administrador y editor**. Lo
exclusivo de administrador es *crear o eliminar* un concepto del maestro y
aplicar o rechazar una propuesta formal de precio.

Cualquier cambio de precio en `conceptos` queda registrado **una sola vez** en
`precio_historial` vía `tr_registrar_historial_precio`.

## La verificación vive en la base

RLS y funciones `security definer`. **Nunca la muevas al cliente:** un navegador
se puede alterar, una política no. Esconder un botón es cortesía, no control.

## Antes de aplicar SQL

En esta base **no existe** `scripts/validar-sql.sh`. Existe en la rama designada
y es la herramienta correcta: levanta un PostgreSQL desechable y aplica cada
archivo **en una sola transacción**, como hace el editor de Supabase.

Ese detalle no es cosmético. Hay errores que solo aparecen así: PostgreSQL no
deja **usar** un valor de enum recién agregado hasta que la transacción que lo
agregó se confirma (55P04). Un archivo puede aplicar limpio uno por uno y
reventar pegado en Supabase.

**Si vas a tocar SQL en esta rama, trae el validador primero.** Aplicar a mano
sin él es cómo se descubre el 55P04 en producción.

Lo que el validador **no** cubre, ni aquí ni allá: RLS con usuarios reales.
`auth.uid()` y los roles de Supabase no existen fuera de Supabase.

## ⚠ Una migración nueva del esquema compartido NO va aquí

Desde la Fase 1A la fuente de verdad es `rgbeyond/beyond-platform`. Las
migraciones de este repositorio **se conservan** como registro histórico, pero
no se agregan más: dos repositorios evolucionando el mismo esquema es lo que
produjo la divergencia que hubo que reconciliar.

El camino es: `beyond-platform/supabase/migrations/` →
`beyond-platform/scripts/reconstruir.sh` sobre una base vacía → Beyond DEV → revisión
humana → producción.
