-- Diagnostico de la base compartida de Beyond.
--
-- Para que sirve: saber en que estado esta el proyecto de Supabase antes
-- de aplicarle nada —que archivos ya corrieron, si las tablas tienen
-- RLS, si alguien ha entrado, si hay buckets—. Es mas confiable que
-- preguntarle a la memoria de alguien.
--
-- Pegar completo en el editor SQL de Supabase y ejecutar. SOLO LECTURA:
-- no crea, no modifica y no borra nada. Ninguna linea del resultado
-- expone llaves ni datos de clientes, asi que se puede compartir tal
-- cual. Verificado contra una copia local del esquema.
-- Conteo REAL por tabla, no estimado. La primera version usaba
-- pg_stat_user_tables.n_live_tup, que es una estimacion del recolector
-- de estadisticas: en la base real dio 0 para las nueve tablas mientras
-- conceptos tenia 188 filas y proyectos 2. Un diagnostico que se
-- contradice consigo mismo no sirve para decidir nada, asi que se
-- cuenta de verdad. query_to_xml permite hacerlo sobre tablas
-- descubiertas al vuelo sin declarar una funcion.
with t as (
  select c.relname tabla, c.relrowsecurity rls,
         (xpath('/row/c/text()', query_to_xml(
            format('select count(*) as c from public.%I', c.relname),
            false, true, '')))[1]::text::bigint filas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
)
select 'postgres' clave, split_part(version(), ' on ', 1) valor
union all
select 'tablas public', coalesce(string_agg(tabla || ' (' || filas ||
       case when rls then '' else ', SIN RLS' end || ')', ', '
       order by tabla), 'ninguna') from t
union all
select 'funciones fn_*', coalesce((select string_agg(p.proname, ', '
         order by p.proname) from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'fn\_%'), 'ninguna')
union all
select '04_ambitos aplicado',
  case when exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='conceptos'
          and column_name='ambitos') then 'SI' else 'NO' end
union all
select '20_portafolio aplicado',
  case when to_regclass('public.pf_proyectos') is null then 'NO' else 'SI' end
union all
select 'conceptos activos',
  coalesce((select count(*)::text from conceptos where activo), 'n/a')
union all
select 'proyectos del parametrico',
  coalesce((select count(*)::text from proyectos), 'n/a')
union all
select 'perfiles por rol',
  coalesce((select string_agg(rol || '=' || n, ', ') from
    (select rol::text rol, count(*) n from perfiles group by rol) x),
    'ninguno: nadie ha entrado todavia')
union all
select 'usuarios que han entrado',
  coalesce((select count(*)::text from auth.users), 'n/a')
union all
select 'proveedores de acceso',
  coalesce((select string_agg(distinct provider, ', ')
            from auth.identities), 'ninguno configurado o nadie ha entrado')
union all
select 'buckets de storage',
  coalesce((select string_agg(id || case when public then ' (publico)'
    else ' (privado)' end, ', ') from storage.buckets), 'ninguno')
union all
select 'dominio permitido',
  coalesce((select public.fn_dominio_permitido()), 'la funcion no existe');
