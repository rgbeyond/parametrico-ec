-- Politicas de acceso. Ejecutar despues de 01_esquema.sql.
-- Principio: el catalogo lo lee todo el equipo, lo escribe solo un aprobador.

alter table perfiles            enable row level security;
alter table conceptos           enable row level security;
alter table precio_propuestas   enable row level security;
alter table precio_historial    enable row level security;
alter table proyectos           enable row level security;
alter table proyecto_compartido enable row level security;

create or replace function fn_es_aprobador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'aprobador');
$$;

-- Perfiles: cada quien ve el directorio del equipo, solo edita su propio nombre.
create policy perfiles_lectura on perfiles for select using (auth.uid() is not null);
create policy perfiles_propio  on perfiles for update using (id = auth.uid())
  with check (id = auth.uid() and rol = (select rol from perfiles where id = auth.uid()));

-- Conceptos: lectura para el equipo. Escritura directa solo para aprobadores.
create policy conceptos_lectura on conceptos for select using (auth.uid() is not null);
create policy conceptos_escritura on conceptos for all
  using (fn_es_aprobador()) with check (fn_es_aprobador());

-- Propuestas: cualquiera propone y ve las propias y las del equipo.
-- Nadie puede marcar una propuesta como aprobada por su cuenta: eso pasa
-- exclusivamente por fn_aprobar_precio, que valida el rol.
create policy propuestas_lectura on precio_propuestas for select using (auth.uid() is not null);
create policy propuestas_alta on precio_propuestas for insert
  with check (propuesto_por = auth.uid() and estado = 'propuesta');
create policy propuestas_baja_propia on precio_propuestas for delete
  using (propuesto_por = auth.uid() and estado = 'propuesta');
create policy propuestas_resolver on precio_propuestas for update
  using (fn_es_aprobador()) with check (fn_es_aprobador());

-- Historial: solo lectura. Lo escribe la funcion, no el cliente.
create policy historial_lectura on precio_historial for select using (auth.uid() is not null);

-- Proyectos: propios, mas los que alguien comparta explicitamente.
create policy proyectos_propios on proyectos for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy proyectos_compartidos_lectura on proyectos for select
  using (exists (select 1 from proyecto_compartido c
                 where c.proyecto_id = proyectos.id and c.perfil_id = auth.uid()));
create policy proyectos_compartidos_edicion on proyectos for update
  using (exists (select 1 from proyecto_compartido c
                 where c.proyecto_id = proyectos.id and c.perfil_id = auth.uid() and c.puede_editar));

create policy compartir_lectura on proyecto_compartido for select
  using (perfil_id = auth.uid()
         or exists (select 1 from proyectos p where p.id = proyecto_id and p.usuario_id = auth.uid()));
create policy compartir_gestion on proyecto_compartido for all
  using (exists (select 1 from proyectos p where p.id = proyecto_id and p.usuario_id = auth.uid()))
  with check (exists (select 1 from proyectos p where p.id = proyecto_id and p.usuario_id = auth.uid()));

grant execute on function fn_aprobar_precio(uuid, text) to authenticated;
