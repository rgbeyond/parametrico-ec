-- Estimador parametrico de electrolineras — Beyond AE
-- Esquema base. Ejecutar en el editor SQL de Supabase, en orden 01, 02, 03.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Perfiles. El rol define quien puede APROBAR precios del catalogo.
-- ---------------------------------------------------------------
create type rol_usuario as enum ('lector','editor','aprobador');

create table perfiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  correo       text not null,
  nombre       text,
  rol          rol_usuario not null default 'editor',
  creado_en    timestamptz not null default now()
);

-- Alta automatica al primer ingreso, restringida al dominio corporativo.
create or replace function fn_alta_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) not like '%@beyond-ae.com' then
    raise exception 'Dominio no autorizado: %', new.email;
  end if;
  insert into perfiles (id, correo, nombre)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger tr_alta_perfil
  after insert on auth.users
  for each row execute function fn_alta_perfil();

-- ---------------------------------------------------------------
-- Catalogo maestro de conceptos. Fuente unica de precios.
-- ---------------------------------------------------------------
create type taxonomia_dato as enum ('validado','fuente','supuesto','allowance');

create table conceptos (
  codigo        text primary key,
  categoria     text not null,
  nombre        text not null,
  unidad        text,
  precio        numeric(14,2) not null default 0,
  taxonomia     taxonomia_dato not null default 'supuesto',
  aplicabilidad text,
  fuente        text,
  fecha_ref     text,
  activo        boolean not null default true,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references perfiles(id)
);

create index on conceptos (categoria);
create index on conceptos (taxonomia);

-- ---------------------------------------------------------------
-- Gobierno de precios: cualquiera propone, solo un aprobador aplica.
-- ---------------------------------------------------------------
create type estado_propuesta as enum ('propuesta','aprobada','rechazada');

create table precio_propuestas (
  id             uuid primary key default gen_random_uuid(),
  concepto       text not null references conceptos(codigo) on delete cascade,
  precio_actual  numeric(14,2) not null,
  precio_nuevo   numeric(14,2) not null,
  taxonomia_nueva taxonomia_dato not null default 'validado',
  fuente         text not null,
  justificacion  text,
  estado         estado_propuesta not null default 'propuesta',
  propuesto_por  uuid not null references perfiles(id),
  propuesto_en   timestamptz not null default now(),
  resuelto_por   uuid references perfiles(id),
  resuelto_en    timestamptz,
  nota_resolucion text
);

create index on precio_propuestas (concepto);
create index on precio_propuestas (estado);

-- Historial: cada cambio de precio aprobado queda registrado.
create table precio_historial (
  id            bigserial primary key,
  concepto      text not null references conceptos(codigo) on delete cascade,
  precio_anterior numeric(14,2),
  precio_nuevo  numeric(14,2) not null,
  taxonomia     taxonomia_dato not null,
  fuente        text,
  propuesta_id  uuid references precio_propuestas(id),
  autor         uuid references perfiles(id),
  fecha         timestamptz not null default now()
);

-- Aplicar una propuesta: mueve el precio, escribe historial y cierra la propuesta.
-- Solo un perfil con rol aprobador puede ejecutarla.
create or replace function fn_aprobar_precio(p_id uuid, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_rol rol_usuario; v_p precio_propuestas; v_ant numeric(14,2);
begin
  select rol into v_rol from perfiles where id = auth.uid();
  if v_rol is distinct from 'aprobador' then
    raise exception 'Solo un perfil aprobador puede aplicar precios al catalogo';
  end if;

  select * into v_p from precio_propuestas where id = p_id and estado = 'propuesta';
  if not found then raise exception 'Propuesta inexistente o ya resuelta'; end if;

  select precio into v_ant from conceptos where codigo = v_p.concepto;

  update conceptos
     set precio = v_p.precio_nuevo,
         taxonomia = v_p.taxonomia_nueva,
         fuente = v_p.fuente,
         fecha_ref = to_char(now(),'YYYY-MM'),
         actualizado_en = now(),
         actualizado_por = auth.uid()
   where codigo = v_p.concepto;

  insert into precio_historial (concepto, precio_anterior, precio_nuevo, taxonomia, fuente, propuesta_id, autor)
  values (v_p.concepto, v_ant, v_p.precio_nuevo, v_p.taxonomia_nueva, v_p.fuente, v_p.id, auth.uid());

  update precio_propuestas
     set estado='aprobada', resuelto_por=auth.uid(), resuelto_en=now(), nota_resolucion=p_nota
   where id = p_id;
end $$;

-- ---------------------------------------------------------------
-- Proyectos. El estado completo del estimador vive aqui.
-- ---------------------------------------------------------------
create table proyectos (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references perfiles(id) on delete cascade,
  clave          text not null,
  nombre         text,
  ubicacion      text,
  estado         jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (usuario_id, clave)
);

create index on proyectos (usuario_id);

-- Compartir un proyecto con el resto del equipo sin exponerlo por defecto.
create table proyecto_compartido (
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  perfil_id   uuid not null references perfiles(id) on delete cascade,
  puede_editar boolean not null default false,
  primary key (proyecto_id, perfil_id)
);
