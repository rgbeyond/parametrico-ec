-- Prueba de la migracion 05 (rol vendedor y visibilidad de costos).
--
-- Igual que la de ambitos: PostgreSQL desechable, sin Supabase. Aqui se
-- conecta como superusuario, asi que la RLS NO se evalua; lo que si se
-- puede comprobar sin conexion es que el enum acepta el valor nuevo,
-- que los helpers devuelven lo que deben para cada rol, que las
-- politicas quedaron escritas contra la funcion correcta y —lo mas
-- importante— que ninguna funcion que devuelve costos quedo marcada
-- `security definer`, porque eso saltaria la RLS y abriria justo el
-- agujero que esta migracion cierra.
\set ON_ERROR_STOP on

-- 1. El enum admite el valor nuevo.
do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'rol_usuario' and e.enumlabel = 'vendedor') then
    raise exception 'el enum rol_usuario deberia incluir vendedor';
  end if;
end $$;

-- 2. Los helpers responden por rol. Se simula la sesion insertando el
--    perfil y fijando el claim que lee auth.uid().
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'vendedor@beyond-ae.com'),
  ('22222222-2222-2222-2222-222222222222', 'editor@beyond-ae.com')
on conflict (id) do nothing;
insert into perfiles (id, correo, rol) values
  ('11111111-1111-1111-1111-111111111111','vendedor@beyond-ae.com','vendedor'),
  ('22222222-2222-2222-2222-222222222222','editor@beyond-ae.com','editor')
on conflict (id) do update set rol = excluded.rol;

do $$
begin
  perform set_config('request.jwt.claim.sub',
    '11111111-1111-1111-1111-111111111111', true);
  if fn_puede_ver_costos() then
    raise exception 'el vendedor no debe poder ver costos';
  end if;
  if not fn_puede_vender() then
    raise exception 'el vendedor debe poder levantar expedientes';
  end if;
  if fn_puede_editar() then
    raise exception 'el vendedor no es editor del catalogo maestro';
  end if;

  perform set_config('request.jwt.claim.sub',
    '22222222-2222-2222-2222-222222222222', true);
  if not fn_puede_ver_costos() then
    raise exception 'el editor si debe ver costos';
  end if;
  if not fn_puede_vender() then
    raise exception 'el editor tambien levanta expedientes';
  end if;
end $$;

-- 3. Sin perfil no hay costos. El nulo de fn_rol() no puede colarse
--    como "no es vendedor, entonces si puede".
--
--    Se simula con un uuid que no tiene perfil, no con la cadena vacia:
--    el sustituto de auth.uid() del validador castea el claim a uuid y
--    revienta con ''. En Supabase auth.uid() devuelve nulo sin sesion,
--    que llega a fn_rol() por el mismo camino que un uuid desconocido.
do $$ begin
  perform set_config('request.jwt.claim.sub',
    '99999999-9999-9999-9999-999999999999', true);
  if fn_puede_ver_costos() then
    raise exception 'sin perfil no se pueden ver costos';
  end if;
  if fn_puede_vender() then
    raise exception 'sin perfil no se puede levantar un expediente';
  end if;
end $$;

-- 4. Al vendedor, fn_conceptos_de le falla con un mensaje claro en vez
--    de devolverle una lista vacia que parezca un catalogo sin datos.
do $$
declare msg text;
begin
  perform set_config('request.jwt.claim.sub',
    '11111111-1111-1111-1111-111111111111', true);
  begin
    perform * from fn_conceptos_de('fv');
    raise exception 'fn_conceptos_de deberia rechazar al vendedor';
  exception when others then
    get stacked diagnostics msg = message_text;
    if position('costos' in msg) = 0 then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',
    '99999999-9999-9999-9999-999999999999', true);
end $$;

-- 5. Ninguna funcion que devuelva costos puede ser security definer:
--    saltaria la RLS de conceptos.
do $$
declare f text;
begin
  select string_agg(p.proname, ', ') into f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.proname in ('fn_conceptos_de');
  if f is not null then
    raise exception 'estas funciones devuelven costos y son security definer: %', f;
  end if;
end $$;

-- 6. Las politicas de lectura de precio quedaron atadas al helper.
do $$
declare faltan text;
begin
  select string_agg(t.tabla, ', ') into faltan from (values
    ('conceptos','conceptos_lectura'),
    ('proyecto_conceptos','pconceptos_lectura'),
    ('precio_historial','historial_lectura'),
    ('precio_propuestas','propuestas_lectura')
  ) as t(tabla, politica)
  where exists (select 1 from pg_class c where c.relname = t.tabla)
    and not exists (
      select 1 from pg_policies p
       where p.tablename = t.tabla and p.policyname = t.politica
         and p.qual like '%fn_puede_ver_costos%');
  if faltan is not null then
    raise exception 'estas tablas exponen precio sin filtrar por rol: %', faltan;
  end if;
end $$;

delete from perfiles where correo in ('vendedor@beyond-ae.com','editor@beyond-ae.com');
delete from auth.users where email in ('vendedor@beyond-ae.com','editor@beyond-ae.com');
\echo 'vendedor: todas las comprobaciones en verde'
