-- Estimador parametrico de electrolineras — Beyond AE
-- Esquema. Ejecutar en el editor SQL de Supabase, en orden 01, 02, 03.
-- Este archivo se puede volver a ejecutar sobre una base vacia.

create extension if not exists "pgcrypto";

-- ===============================================================
-- USUARIOS Y ROLES
-- ===============================================================
-- admin        : todo, incluido aprobar precios y asignar roles
-- editor       : crea y edita proyectos, propone precios, agrega conceptos
-- comentarista : lee todo y deja comentarios
-- lector       : solo lectura
do $$ begin
  create type rol_usuario as enum ('admin','editor','comentarista','lector');
exception when duplicate_object then null; end $$;

create table if not exists perfiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  correo         text not null unique,
  nombre         text,
  rol            rol_usuario not null default 'lector',
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  ultimo_acceso  timestamptz
);

-- Dominio corporativo permitido. Cambiarlo aqui si algun dia cambia.
create or replace function fn_dominio_permitido() returns text
language sql immutable as $$ select 'beyond-ae.com' $$;

-- Alta automatica al primer ingreso con Google Workspace.
-- El primer usuario que entra queda como admin; los siguientes como lector,
-- y un admin los promueve. Es deliberado: nadie que acaba de entrar deberia
-- poder mover precios que alimentan propuestas a cliente.
create or replace function fn_alta_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol rol_usuario := 'lector';
begin
  if lower(new.email) not like '%@' || fn_dominio_permitido() then
    raise exception 'Dominio no autorizado: %. Solo cuentas @%', new.email, fn_dominio_permitido();
  end if;

  if not exists (select 1 from perfiles where rol = 'admin') then
    v_rol := 'admin';
  end if;

  insert into perfiles (id, correo, nombre, rol, ultimo_acceso)
  values (new.id, lower(new.email),
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
          v_rol, now())
  on conflict (id) do update set ultimo_acceso = now();
  return new;
end $$;

drop trigger if exists tr_alta_perfil on auth.users;
create trigger tr_alta_perfil
  after insert on auth.users
  for each row execute function fn_alta_perfil();

-- Helpers de rol. security definer para que no dependan de las politicas.
create or replace function fn_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo
$$;
create or replace function fn_es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(fn_rol() = 'admin', false)
$$;
create or replace function fn_puede_editar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(fn_rol() in ('admin','editor'), false)
$$;
create or replace function fn_puede_comentar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(fn_rol() in ('admin','editor','comentarista'), false)
$$;

-- Un admin cambia el rol de otro. No puede quitarse el suyo si es el ultimo.
create or replace function fn_asignar_rol(p_perfil uuid, p_rol rol_usuario)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_es_admin() then raise exception 'Solo un administrador puede asignar roles'; end if;
  if p_perfil = auth.uid() and p_rol <> 'admin'
     and (select count(*) from perfiles where rol='admin' and activo) <= 1 then
    raise exception 'No puedes quitarte el rol de administrador siendo el unico';
  end if;
  update perfiles set rol = p_rol where id = p_perfil;
end $$;

-- ===============================================================
-- CATALOGO
-- ===============================================================
do $$ begin
  create type taxonomia_dato as enum ('validado','fuente','supuesto','allowance');
exception when duplicate_object then null; end $$;

-- Catalogo maestro global. Fuente unica de precios de referencia.
create table if not exists conceptos (
  codigo          text primary key,
  categoria       text not null,
  nombre          text not null,
  unidad          text,
  precio          numeric(14,2) not null default 0,
  taxonomia       taxonomia_dato not null default 'supuesto',
  aplicabilidad   text,
  fuente          text,
  fecha_ref       text,
  activo          boolean not null default true,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid references perfiles(id)
);
create index if not exists ix_conceptos_cat on conceptos (categoria);
create index if not exists ix_conceptos_tax on conceptos (taxonomia);

-- ===============================================================
-- PROYECTOS
-- ===============================================================
-- Todos los usuarios ven todos los proyectos. El rol define que pueden hacer.
create table if not exists proyectos (
  id              uuid primary key default gen_random_uuid(),
  clave           text not null unique,
  nombre          text not null,
  ubicacion       text,
  tipologia_id    uuid,
  estado          jsonb not null default '{}'::jsonb,
  archivado       boolean not null default false,
  creado_por      uuid references perfiles(id),
  creado_en       timestamptz not null default now(),
  actualizado_por uuid references perfiles(id),
  actualizado_en  timestamptz not null default now()
);
create index if not exists ix_proyectos_arch on proyectos (archivado);

-- Conceptos propios de un proyecto: lo que ese sitio necesita y el maestro
-- todavia no tiene. Nacen aqui, no en el catalogo global.
create table if not exists proyecto_conceptos (
  proyecto_id   uuid not null references proyectos(id) on delete cascade,
  codigo        text not null,
  categoria     text not null,
  nombre        text not null,
  unidad        text,
  precio        numeric(14,2) not null default 0,
  taxonomia     taxonomia_dato not null default 'supuesto',
  aplicabilidad text,
  fuente        text,
  fecha_ref     text,
  creado_por    uuid references perfiles(id),
  creado_en     timestamptz not null default now(),
  primary key (proyecto_id, codigo)
);

-- Tipologias de electrolinera: un subconjunto de conceptos del catalogo.
-- La estructura queda lista; la interfaz se construye despues.
create table if not exists tipologias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  descripcion text,
  creado_por  uuid references perfiles(id),
  creado_en   timestamptz not null default now()
);
create table if not exists tipologia_conceptos (
  tipologia_id uuid not null references tipologias(id) on delete cascade,
  codigo       text not null references conceptos(codigo) on delete cascade,
  primary key (tipologia_id, codigo)
);

-- ===============================================================
-- GOBIERNO DE PRECIOS
-- ===============================================================
do $$ begin
  create type estado_propuesta as enum ('propuesta','aprobada','rechazada');
exception when duplicate_object then null; end $$;

create table if not exists precio_propuestas (
  id              uuid primary key default gen_random_uuid(),
  concepto        text not null references conceptos(codigo) on delete cascade,
  proyecto_id     uuid references proyectos(id) on delete set null,
  precio_actual   numeric(14,2) not null,
  precio_nuevo    numeric(14,2) not null,
  taxonomia_nueva taxonomia_dato not null default 'validado',
  fuente          text not null,
  justificacion   text,
  estado          estado_propuesta not null default 'propuesta',
  propuesto_por   uuid not null references perfiles(id),
  propuesto_en    timestamptz not null default now(),
  resuelto_por    uuid references perfiles(id),
  resuelto_en     timestamptz,
  nota_resolucion text
);
create index if not exists ix_prop_estado on precio_propuestas (estado);

create table if not exists precio_historial (
  id              bigserial primary key,
  concepto        text not null,
  precio_anterior numeric(14,2),
  precio_nuevo    numeric(14,2) not null,
  taxonomia       taxonomia_dato not null,
  fuente          text,
  propuesta_id    uuid references precio_propuestas(id),
  autor           uuid references perfiles(id),
  fecha           timestamptz not null default now()
);

create or replace function fn_aprobar_precio(p_id uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_p precio_propuestas; v_ant numeric(14,2);
begin
  if not fn_es_admin() then
    raise exception 'Solo un administrador puede aplicar precios al catalogo';
  end if;
  select * into v_p from precio_propuestas where id = p_id and estado = 'propuesta';
  if not found then raise exception 'Propuesta inexistente o ya resuelta'; end if;

  select precio into v_ant from conceptos where codigo = v_p.concepto;
  update conceptos set precio = v_p.precio_nuevo, taxonomia = v_p.taxonomia_nueva,
         fuente = v_p.fuente, fecha_ref = to_char(now(),'YYYY-MM'),
         actualizado_en = now(), actualizado_por = auth.uid()
   where codigo = v_p.concepto;

  insert into precio_historial (concepto, precio_anterior, precio_nuevo, taxonomia, fuente, propuesta_id, autor)
  values (v_p.concepto, v_ant, v_p.precio_nuevo, v_p.taxonomia_nueva, v_p.fuente, v_p.id, auth.uid());

  update precio_propuestas set estado='aprobada', resuelto_por=auth.uid(),
         resuelto_en=now(), nota_resolucion=p_nota where id = p_id;
end $$;

-- Promover un concepto de proyecto al catalogo maestro. Solo admin.
create or replace function fn_promover_concepto(p_proyecto uuid, p_codigo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_c proyecto_conceptos;
begin
  if not fn_es_admin() then
    raise exception 'Solo un administrador puede promover conceptos al catalogo maestro';
  end if;
  select * into v_c from proyecto_conceptos where proyecto_id = p_proyecto and codigo = p_codigo;
  if not found then raise exception 'Concepto inexistente en el proyecto'; end if;
  if exists (select 1 from conceptos where codigo = p_codigo) then
    raise exception 'El codigo % ya existe en el catalogo maestro', p_codigo;
  end if;

  insert into conceptos (codigo, categoria, nombre, unidad, precio, taxonomia,
                         aplicabilidad, fuente, fecha_ref, actualizado_por)
  values (v_c.codigo, v_c.categoria, v_c.nombre, v_c.unidad, v_c.precio, v_c.taxonomia,
          v_c.aplicabilidad, v_c.fuente, v_c.fecha_ref, auth.uid());

  delete from proyecto_conceptos where proyecto_id = p_proyecto and codigo = p_codigo;
end $$;

-- ===============================================================
-- COMENTARIOS
-- ===============================================================
create table if not exists comentarios (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  concepto    text,
  texto       text not null,
  resuelto    boolean not null default false,
  autor       uuid not null references perfiles(id),
  creado_en   timestamptz not null default now()
);
create index if not exists ix_com_proy on comentarios (proyecto_id, resuelto);

-- Marca de tiempo y autor en cada guardado de proyecto.
create or replace function fn_toca_proyecto()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists tr_toca_proyecto on proyectos;
create trigger tr_toca_proyecto before update on proyectos
  for each row execute function fn_toca_proyecto();
