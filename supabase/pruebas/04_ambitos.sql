-- Prueba de la migracion 04 (ambitos del catalogo).
--
-- Se corre con scripts/validar-sql.sh, que levanta un PostgreSQL
-- desechable, aplica 01, 02 y 04, y ejecuta esto. No sustituye a
-- probar en Supabase —RLS con roles reales y auth.uid() de verdad no
-- se reproducen aqui— pero atrapa lo que si se puede atrapar sin
-- conexion: que el SQL aplica, que las restricciones rechazan lo que
-- deben y que la consulta tipica usa el indice.
\set ON_ERROR_STOP on

insert into conceptos (codigo, categoria, nombre, unidad, precio) values
  ('T-EC','Equipos','Concepto de electrolinera','pza',1000),
  ('T-CBL','Conductores','Concepto comun','m',10),
  ('T-FV','Modulos','Concepto fotovoltaico','pza',100)
on conflict (codigo) do nothing;

-- 1. Lo existente arranca declarado en 'ec', no en 'comun': el catalogo
--    nacio del estimador de electrolineras y afirmar que todo aplica a
--    todo seria inventar una aplicabilidad que nadie verifico.
do $$ begin
  if exists (select 1 from conceptos where ambitos <> array['ec']) then
    raise exception 'los conceptos existentes deben arrancar en {ec}';
  end if;
end $$;

update conceptos set ambitos = array['comun'] where codigo = 'T-CBL';
update conceptos set ambitos = array['fv']    where codigo = 'T-FV';

-- 2. Cada area ve lo suyo MAS lo comun, y nunca lo ajeno.
do $$
declare fv text[]; ec text[];
begin
  select array_agg(codigo order by codigo) into fv
    from fn_conceptos_de('fv') where codigo like 'T-%';
  select array_agg(codigo order by codigo) into ec
    from fn_conceptos_de('ec') where codigo like 'T-%';
  if fv <> array['T-CBL','T-FV'] then
    raise exception 'fotovoltaico deberia ver el comun y el suyo: %', fv;
  end if;
  if ec <> array['T-CBL','T-EC'] then
    raise exception 'electrolinera deberia ver el comun y el suyo: %', ec;
  end if;
end $$;

-- 3. Un ambito que no esta en el catalogo se rechaza.
do $$ begin
  begin
    update conceptos set ambitos = array['solar'] where codigo = 'T-FV';
    raise exception 'deberia haber rechazado un ambito desconocido';
  exception when others then
    if position('desconocido' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- 4. Un concepto sin ambito se rechaza: todo concepto pertenece a algo.
do $$ begin
  begin
    update conceptos set ambitos = '{}' where codigo = 'T-FV';
    raise exception 'deberia haber rechazado un concepto sin ambito';
  exception when others then
    if position('al menos un ambito' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- 5. La consulta tipica usa el indice GIN y no un recorrido completo.
do $$
declare plan text;
begin
  set local enable_seqscan = off;
  execute 'explain (costs off) select * from conceptos '
    || 'where ambitos && array[''fv'',''comun'']' into plan;
  if position('Bitmap' in plan) = 0 and position('Index' in plan) = 0 then
    raise exception 'la consulta por ambito no usa el indice: %', plan;
  end if;
end $$;

delete from conceptos where codigo like 'T-%';
\echo 'ambitos: todas las comprobaciones en verde'
