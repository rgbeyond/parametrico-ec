-- Politicas de acceso. Ejecutar despues de 01_esquema.sql.
-- Principio: todos leen todo. Escribir depende del rol, y el rol se verifica
-- en la base. Un cliente se puede alterar desde el navegador; una politica no.

alter table perfiles            enable row level security;
alter table conceptos           enable row level security;
alter table proyectos           enable row level security;
alter table proyecto_conceptos  enable row level security;
alter table tipologias          enable row level security;
alter table tipologia_conceptos enable row level security;
alter table precio_propuestas   enable row level security;
alter table precio_historial    enable row level security;
alter table comentarios         enable row level security;

-- Limpieza para poder reejecutar el archivo
do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public'
  loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

-- ---------- Perfiles ----------
create policy perfiles_lectura on perfiles for select
  using (auth.uid() is not null);
-- El rol NO se cambia por update directo: se cambia con fn_asignar_rol.
create policy perfiles_nombre_propio on perfiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and rol = (select rol from perfiles p where p.id = auth.uid()));

-- ---------- Catalogo maestro ----------
-- Actualizar precio (y su taxonomia/fuente, que van junto con el precio) es
-- de admin y editor: quitarle a un administrador el cuello de botella de
-- aprobar cada cambio. Crear o eliminar un concepto del maestro sigue siendo
-- solo de admin, porque es una decision de alcance del catalogo, no de precio.
create policy conceptos_lectura on conceptos for select using (auth.uid() is not null);
create policy conceptos_actualizar on conceptos for update
  using (fn_puede_editar()) with check (fn_puede_editar());
create policy conceptos_alta on conceptos for insert with check (fn_es_admin());
create policy conceptos_baja on conceptos for delete using (fn_es_admin());

-- ---------- Proyectos: todos los ven, editores y admin los modifican ----------
create policy proyectos_lectura on proyectos for select using (auth.uid() is not null);
create policy proyectos_alta on proyectos for insert with check (fn_puede_editar());
create policy proyectos_edicion on proyectos for update
  using (fn_puede_editar()) with check (fn_puede_editar());
create policy proyectos_baja on proyectos for delete using (fn_es_admin());

-- ---------- Conceptos propios de un proyecto ----------
create policy pconceptos_lectura on proyecto_conceptos for select using (auth.uid() is not null);
create policy pconceptos_escritura on proyecto_conceptos for all
  using (fn_puede_editar()) with check (fn_puede_editar());

-- ---------- Tipologias ----------
create policy tipologias_lectura on tipologias for select using (auth.uid() is not null);
create policy tipologias_escritura on tipologias for all
  using (fn_puede_editar()) with check (fn_puede_editar());
create policy tipconceptos_lectura on tipologia_conceptos for select using (auth.uid() is not null);
create policy tipconceptos_escritura on tipologia_conceptos for all
  using (fn_puede_editar()) with check (fn_puede_editar());

-- ---------- Propuestas de precio ----------
create policy propuestas_lectura on precio_propuestas for select using (auth.uid() is not null);
create policy propuestas_alta on precio_propuestas for insert
  with check (fn_puede_editar() and propuesto_por = auth.uid() and estado = 'propuesta');
create policy propuestas_baja_propia on precio_propuestas for delete
  using (propuesto_por = auth.uid() and estado = 'propuesta');
-- Aprobar o rechazar pasa por fn_aprobar_precio / fn_rechazar_precio, que validan el rol.
create policy propuestas_resolver on precio_propuestas for update
  using (fn_es_admin()) with check (fn_es_admin());

-- ---------- Historial: solo lectura, lo escribe la funcion ----------
create policy historial_lectura on precio_historial for select using (auth.uid() is not null);

-- ---------- Comentarios ----------
create policy comentarios_lectura on comentarios for select using (auth.uid() is not null);
create policy comentarios_alta on comentarios for insert
  with check (fn_puede_comentar() and autor = auth.uid());
create policy comentarios_propios on comentarios for update
  using (autor = auth.uid() or fn_es_admin())
  with check (autor = auth.uid() or fn_es_admin());
create policy comentarios_baja on comentarios for delete
  using (autor = auth.uid() or fn_es_admin());

grant execute on function fn_aprobar_precio(uuid, text) to authenticated;
grant execute on function fn_rechazar_precio(uuid, text) to authenticated;
grant execute on function fn_promover_concepto(uuid, text) to authenticated;
grant execute on function fn_asignar_rol(uuid, rol_usuario) to authenticated;
