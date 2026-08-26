---
paths:
  - "supabase/**/*.sql"
  - "src/lib/sesion.js"
  - "src/lib/supabase.js"
---

# Base de datos y roles

## Un solo proyecto, compartido

Este repositorio y el Portafolio Energético comparten un proyecto de Supabase.
Numeración por bloques: `01`–`05` aquí, `20`–`23` en `propuestas-fv`, aplicados
en ese orden sobre la misma base.

`conceptos.ambitos` es un `text[]` y no una bandera porque hay conceptos
**comunes** —conductores, canalizaciones, interruptores, obra civil— que sirven
a electrolineras y a fotovoltaico por igual. Cada área consulta con
`fn_conceptos_de('<área>')`, que devuelve lo suyo **más** lo común.

Los conceptos existentes arrancan en `{ec}` y no en `comun`: el catálogo nació
de este estimador y reclasificarlos es revisión manual, concepto por concepto,
no un `update` masivo.

## Quién puede escribir qué

Actualizar el precio del catálogo maestro es de **administrador y editor**. Lo
exclusivo de administrador es *crear o eliminar* un concepto del maestro y
aplicar o rechazar una propuesta formal de precio.

Cualquier cambio de precio en `conceptos` queda registrado **una sola vez** en
`precio_historial` vía `tr_registrar_historial_precio`.

**Un concepto nuevo nace con ámbito de proyecto**, no en el maestro. Vive solo
en esa estación hasta que un administrador lo promueve con
`fn_promover_concepto`.

## La verificación vive en la base

RLS y funciones `security definer`. **Nunca la muevas al cliente:** un navegador
se puede alterar, una política no.

`fn_conceptos_de` **no lleva `security definer`** a propósito: ponérselo saltaría
la RLS de `conceptos`. Su `raise` solo hace honesto el mensaje.

## Antes de pegar SQL

```
bash scripts/validar-sql.sh
```

Aplica cada archivo **en una sola transacción**, como el editor de Supabase. Hay
errores que solo aparecen así: `05_vendedor.sql` aplicaba limpio archivo por
archivo y reventaba pegado en Supabase, porque PostgreSQL no deja **usar** un
valor de enum recién agregado hasta que la transacción que lo agregó se confirma
(55P04). Por eso las funciones de ese archivo comparan `fn_rol()::text`.

No cubre RLS con usuarios reales.

## Nota sobre el rol `vendedor`

Existe en la base y en la interfaz de este repositorio **no aparece**: `ROLES`
en `src/lib/sesion.js` tiene cuatro entradas y la base acepta cinco. Un
administrador no puede asignarlo desde esta pantalla; sí desde la del
portafolio. Está documentado como decisión pendiente en
`propuestas-fv/docs/arquitectura/adr-0002-autorizacion-objetivo.md`, que además
lo declara obsoleto. **No lo arregles de paso.**
