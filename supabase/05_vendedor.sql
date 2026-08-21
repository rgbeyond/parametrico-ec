-- Rol VENDEDOR y separacion de la visibilidad de costos — Beyond AE
--
-- Decision de RG (2026-08-21) al abrir el flujo de propuestas
-- fotovoltaicas: hace falta un perfil que pueda capturar recibos y
-- emitir propuestas preliminares SIN ver el costo de los articulos, el
-- BoQ, el markup, el margen ni las comisiones.
--
-- Por que un rol nuevo y no un permiso sobre `lector`
-- ---------------------------------------------------
-- `lector` consulta todo sin modificar: es el perfil de quien audita.
-- `vendedor` es lo contrario —escribe expedientes pero ve menos—, asi
-- que no es un grado mas de la misma escala y no cabe en la jerarquia
-- admin > editor > comentarista > lector. Es una rama aparte.
--
-- Como se aplica la restriccion de costos
-- ---------------------------------------
-- RLS filtra renglones, no columnas, asi que no se puede "ocultar la
-- columna precio" con una politica. La restriccion se aplica al reves:
-- el vendedor NO lee `conceptos` en absoluto, y en su lugar lee la
-- funcion `fn_articulos_de`, que devuelve la ficha tecnica y comercial
-- sin ninguna cifra de costo. Un solo camino, y el que no debe ver el
-- costo no tiene forma de pedirlo: no depende de que la interfaz
-- esconda un campo, que es exactamente lo que un navegador alterado
-- deja de hacer.
--
-- Aplicar DESPUES de 01, 02, 03 y 04. Se puede volver a ejecutar.

-- ---------------------------------------------------------------
-- El valor nuevo del enum
-- ---------------------------------------------------------------
-- `add value if not exists` no corre dentro de un bloque de
-- transaccion en versiones viejas de PostgreSQL; en el editor SQL de
-- Supabase (PG 15+) si. Se deja idempotente.
do $$ begin
  alter type rol_usuario add value if not exists 'vendedor';
exception when duplicate_object then null; end $$;

comment on type rol_usuario is
  'admin: todo. editor: proyectos y precios del maestro. '
  'comentarista: lee y comenta. lector: solo lectura. '
  'vendedor: captura expedientes y emite propuestas preliminares, sin '
  'ver costos, BoQ, margen ni comisiones.';

-- ---------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------
-- Quien puede ver dinero de costo. Se define por exclusion y no por
-- lista blanca a proposito: si manana se agrega un rol nuevo, lo
-- prudente es que vea los costos y que quitarselos sea una decision
-- explicita, no que se le nieguen por olvido y nadie entienda por que
-- el catalogo le sale vacio.
--
-- Sin perfil devuelve FALSO, no verdadero: `fn_rol()` es nulo cuando no
-- hay sesion o el perfil esta inactivo, y `<>` propaga el nulo hasta el
-- coalesce. La exclusion aplica a roles conocidos; la ausencia de rol
-- no es un rol nuevo, es nadie.
create or replace function fn_puede_ver_costos() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(fn_rol() <> 'vendedor', false)
$$;

-- Quien puede levantar un expediente: alta de proyecto, carga de
-- recibos, propuesta preliminar.
create or replace function fn_puede_vender() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(fn_rol() in ('admin','editor','vendedor'), false)
$$;

-- ---------------------------------------------------------------
-- Catalogo maestro: el vendedor no lo lee
-- ---------------------------------------------------------------
-- `conceptos` lleva el precio en la misma fila que el nombre. Mientras
-- el precio viva ahi, dar lectura de la tabla es dar lectura del costo.
drop policy if exists conceptos_lectura on conceptos;
create policy conceptos_lectura on conceptos for select
  using (auth.uid() is not null and fn_puede_ver_costos());

-- Igual para el catalogo por proyecto: un concepto de ambito de
-- proyecto tambien trae precio.
drop policy if exists pconceptos_lectura on proyecto_conceptos;
create policy pconceptos_lectura on proyecto_conceptos for select
  using (auth.uid() is not null and fn_puede_ver_costos());

-- Y para el historial y las propuestas de precio, que son la misma
-- cifra en otra tabla.
do $$ begin
  if exists (select 1 from pg_class where relname = 'precio_historial') then
    execute 'drop policy if exists historial_lectura on precio_historial';
    execute 'create policy historial_lectura on precio_historial for select '
         || 'using (auth.uid() is not null and fn_puede_ver_costos())';
  end if;
  if exists (select 1 from pg_class where relname = 'precio_propuestas') then
    execute 'drop policy if exists propuestas_lectura on precio_propuestas';
    execute 'create policy propuestas_lectura on precio_propuestas for select '
         || 'using (auth.uid() is not null and fn_puede_ver_costos())';
  end if;
end $$;

-- `fn_conceptos_de` devuelve filas completas de `conceptos`, precio
-- incluido. Se le agrega un aviso explicito para el vendedor: con solo
-- la politica RLS la funcion le devolveria una lista vacia y el usuario
-- creeria que el catalogo esta vacio en vez de que no le corresponde.
--
-- NO lleva `security definer`. La tentacion es ponerlo para que el
-- guard sea la unica puerta, pero `security definer` salta la RLS de
-- `conceptos` y convertiria esta funcion en la via para leer costos sin
-- sesion. La RLS sigue siendo la que manda; el raise solo hace honesto
-- el mensaje.
create or replace function fn_conceptos_de(area text)
returns setof conceptos
language plpgsql stable set search_path = public as $$
begin
  if fn_rol() = 'vendedor' then
    raise exception 'Este perfil no tiene acceso a los costos del catalogo';
  end if;
  return query
    select * from conceptos
     where activo and ambitos && array[area, 'comun']
     order by categoria, codigo;
end $$;

-- ---------------------------------------------------------------
-- Roles: quien los asigna
-- ---------------------------------------------------------------
-- `fn_asignar_rol` ya exige administrador y protege al ultimo admin;
-- el valor nuevo del enum entra sin cambiarla. Se deja constancia de
-- que se reviso y no requiere cambio.
