/* Genera supabase/03_semilla.sql a partir de src/data/catalogo.json.
   Uso: npm run seed  */
import { readFileSync, writeFileSync } from 'node:fs';

const cat = JSON.parse(readFileSync(new URL('../src/data/catalogo.json', import.meta.url)));
const esc = (v) => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

const filas = cat.map(x => `  (${esc(x.c)},${esc(x.cat)},${esc(x.n)},${esc(x.u)},${Number(x.pu) || 0},${esc(x.t)}::taxonomia_dato,${esc(x.ap)},${esc(x.f)},${esc(x.fe)})`);

const sql = `-- Generado por scripts/generar-seed.mjs — no editar a mano.
-- ${cat.length} conceptos. Ejecutar despues de 01_esquema.sql y 02_politicas.sql.

insert into conceptos (codigo, categoria, nombre, unidad, precio, taxonomia, aplicabilidad, fuente, fecha_ref) values
${filas.join(',\n')}
on conflict (codigo) do update set
  categoria = excluded.categoria,
  nombre = excluded.nombre,
  unidad = excluded.unidad,
  fuente = excluded.fuente,
  actualizado_en = now();
-- Nota: el precio y la taxonomia NO se sobreescriben al recargar la semilla.
-- Un precio ya aprobado en la base gana sobre el del archivo.
`;
writeFileSync(new URL('../supabase/03_semilla.sql', import.meta.url), sql);
console.log(`03_semilla.sql generado con ${cat.length} conceptos`);
