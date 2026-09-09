-- Baseline READ-ONLY de los proyectos, para comprobar que exportar no toca nada.
-- ============================================================================
-- Issue #4. RG puso una condición para esta desviación: los proyectos que ya
-- existen no se tocan. Este archivo es la forma de DEMOSTRARLO en vez de
-- afirmarlo: se corre antes de promover y otra vez después, y las dos salidas
-- tienen que ser idénticas.
--
-- SÓLO HAY SELECT AQUÍ. Ni INSERT, ni UPDATE, ni DELETE, ni DDL. Si alguna vez
-- alguien agrega una escritura a este archivo, deja de servir para lo que se
-- escribió.
--
-- Se corre contra el proyecto de Supabase que sirve el Paramétrico en
-- producción, con un rol de lectura. Quien lo corra ya está conectado a ese
-- proyecto: el identificador no se escribe aquí.
--
-- Los nombres de columna salen de `supabase/01_esquema.sql`, no de memoria.
-- OJO con uno: `proyectos.estado` es el jsonb con el ESTADO GUARDADO del
-- proyecto —de ahí sale el BOM—, no un estado de ciclo de vida. Lo activo o
-- archivado lo dice `archivado`.
--
-- Uso:
--   psql "<cadena de conexión de solo lectura>" -f scripts/baseline-proyectos.sql
-- o pegando cada bloque en el editor SQL del panel.

\echo '== 1. Activos y archivados =============================================='
-- Esperado hoy (registrado en el issue #4): 8 activos, 0 archivados.
select archivado, count(*) as proyectos
from public.proyectos
group by 1
order by 1;

\echo '== 2. Un renglón por proyecto ==========================================='
-- Clave, nombre y la marca de tiempo que NO debe moverse por exportar.
select id, clave, nombre, ubicacion, archivado, creado_en, actualizado_en
from public.proyectos
order by creado_en;

\echo '== 3. Huella de una línea ==============================================='
-- La comparación rápida: si este hash cambia entre el antes y el después,
-- algo escribió. Incluye archivado y la marca de tiempo de cada proyecto.
select count(*) as proyectos,
       md5(string_agg(
         id::text || '|' || archivado::text || '|' ||
         actualizado_en::text, ',' order by id)) as huella
from public.proyectos;

\echo '== 4. Huella del estado guardado de cada proyecto ======================='
-- El BOM se resuelve en la aplicación a partir de `proyectos.estado`, así que
-- el contenido de esa columna es lo que un export mal hecho podría ensuciar.
select id, nombre, length(estado::text) as bytes_estado,
       md5(estado::text) as huella_estado
from public.proyectos
order by nombre;

\echo '== 5. Conceptos propios de proyecto ====================================='
-- Registrado en el issue: hoy son 0 filas. Si aparecen, el export las incluiría
-- por venir del mismo catálogo combinado, y eso es correcto; lo que no puede
-- pasar es que su número cambie por exportar.
select count(*) as filas from public.proyecto_conceptos;

\echo '== 6. Huella del catálogo y de los precios =============================='
-- Exportar no puede mover un precio. Esta huella lo comprueba.
select count(*) as conceptos,
       count(*) filter (where activo) as activos,
       md5(string_agg(codigo || '|' || precio::text || '|' || taxonomia::text,
           ',' order by codigo)) as huella_precios
from public.conceptos;
