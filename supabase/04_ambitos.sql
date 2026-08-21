-- Estimador parametrico de electrolineras — Beyond AE
-- Migracion 04: ambito de aplicacion de los conceptos del catalogo.
--
-- Decision (RG, 2026-08-21): el Portafolio Energetico Beyond y este
-- estimador comparten UN solo proyecto de Supabase, y el catalogo de
-- conceptos es unico para todas las areas. Los conceptos se separan por
-- el area a la que aplican, con la particularidad que motivo la
-- decision: hay conceptos COMUNES —conductores, canalizaciones,
-- interruptores, obra civil— que sirven a electrolineras y a
-- fotovoltaico por igual, y tenerlos capturados dos veces produce dos
-- precios para el mismo material.
--
-- Por que un ARREGLO y no una bandera. Un concepto puede pertenecer a
-- varias areas a la vez, asi que la relacion es de muchos a muchos y
-- una sola columna de texto no la representa: con una bandera habria
-- que duplicar el renglon del cable para que aparezca en las dos areas,
-- que es exactamente lo que se quiere evitar. Un `text[]` con indice
-- GIN resuelve la consulta "dame los conceptos de fotovoltaico" en un
-- solo predicado y sin tabla puente. Si algun dia hay que colgar
-- metadatos por area (por ejemplo un rendimiento distinto del mismo
-- material segun el uso), entonces si conviene la tabla puente.
--
-- Ejecutar despues de 01, 02 y 03. Se puede volver a ejecutar.

-- ---------------------------------------------------------------
-- Catalogo de ambitos. Tabla y no enum: agregar un area nueva es un
-- insert, no una migracion de tipo, y las areas de este portafolio van
-- a seguir creciendo.
-- ---------------------------------------------------------------
create table if not exists ambitos (
  clave        text primary key,
  nombre       text not null,
  orden        smallint not null default 100,
  activo       boolean not null default true
);

insert into ambitos (clave, nombre, orden) values
  ('comun', 'Comun a varias areas',        10),
  ('ec',    'Estacion de carga',           20),
  ('fv',    'Fotovoltaico',                30),
  ('bess',  'Almacenamiento',              40),
  ('fp',    'Factor de potencia',          50),
  ('mem',   'Migracion al MEM',            60)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------
-- Ambitos del concepto.
--
-- Arranca en {'ec'} para todo lo existente porque el catalogo actual
-- nacio del estimador de electrolineras: declararlo asi es honesto y
-- deja el trabajo de reclasificar como lo que es, una revision manual
-- concepto por concepto. Marcar todo como 'comun' de entrada seria
-- afirmar una aplicabilidad que nadie ha verificado.
-- ---------------------------------------------------------------
alter table conceptos
  add column if not exists ambitos text[] not null default '{ec}';

-- Integridad: todo ambito declarado tiene que existir en el catalogo, y
-- ningun concepto puede quedarse sin area. Se valida con disparador
-- porque una llave foranea no aplica a los elementos de un arreglo.
create or replace function fn_valida_ambitos() returns trigger
language plpgsql as $$
declare sobrantes text[];
begin
  if new.ambitos is null or array_length(new.ambitos, 1) is null then
    raise exception 'El concepto % debe declarar al menos un ambito',
      new.codigo;
  end if;
  select array_agg(a) into sobrantes
    from unnest(new.ambitos) as a
    where a not in (select clave from ambitos);
  if sobrantes is not null then
    raise exception 'Ambito(s) desconocido(s) en %: %',
      new.codigo, array_to_string(sobrantes, ', ');
  end if;
  return new;
end $$;

drop trigger if exists tr_valida_ambitos on conceptos;
create trigger tr_valida_ambitos
  before insert or update of ambitos on conceptos
  for each row execute function fn_valida_ambitos();

-- Consulta tipica: "conceptos de fotovoltaico", que debe traer tambien
-- los comunes. El indice GIN la resuelve con el operador de traslape.
--   select * from conceptos where ambitos && array['fv','comun'];
create index if not exists ix_conceptos_ambitos
  on conceptos using gin (ambitos);

-- Vista de conveniencia para las aplicaciones: recibe el area y
-- devuelve lo suyo mas lo comun, ya sin los conceptos dados de baja.
create or replace function fn_conceptos_de(area text)
returns setof conceptos
language sql stable as $$
  select * from conceptos
   where activo and ambitos && array[area, 'comun']
   order by categoria, codigo;
$$;

-- ---------------------------------------------------------------
-- Politicas. Los ambitos son catalogo maestro: los lee cualquiera con
-- sesion y solo un administrador los mueve, igual que dar de alta o de
-- baja un concepto (ver 02_politicas.sql). Cambiar el ambito de un
-- concepto es reclasificar el maestro, no actualizar un precio, asi que
-- NO se abre a editor.
-- ---------------------------------------------------------------
alter table ambitos enable row level security;

drop policy if exists ambitos_lectura on ambitos;
create policy ambitos_lectura on ambitos for select
  using (auth.uid() is not null);

drop policy if exists ambitos_escritura on ambitos;
create policy ambitos_escritura on ambitos for all
  using (fn_es_admin()) with check (fn_es_admin());
