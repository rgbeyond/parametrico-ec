/* Contexto del proyecto abierto. El estimador (app.js) lo consulta para saber
   contra qué proyecto guarda y qué catálogo usa, sin conocer nada de Supabase. */
import * as datos from './datos.js';
import { sesion, puede } from './sesion.js';

export const ctx = {
  proyecto: null,
  conceptos: [],        // maestro + los propios del proyecto
  propios: new Set(),   // códigos de ámbito proyecto
  soloLectura: false
};

/* PRIMERO SE RESUELVE TODO, Y AL FINAL SE TOCA `ctx`.

   El orden importa desde que `catalogoMaestro()` puede lanzar. Si se asignara
   `ctx.proyecto = p` antes del await, un fallo del catálogo dejaría el
   contexto apuntando al proyecto que NO se abrió, mientras el estimador
   conserva en memoria el estado del anterior. La pantalla no lo delataría —no
   se muestra el estimador—, pero el autoguardado con retardo de `app.js`
   escribe contra `ctx.proyecto.id`: un temporizador pendiente guardaría el
   estado del proyecto viejo en el renglón del nuevo. Ventana estrecha y
   pérdida de datos silenciosa, que es la peor combinación. */
export async function abrirProyecto(p){
  const maestro = await datos.catalogoMaestro();
  const propios = await datos.conceptosDelProyecto(p?.id);
  const porCodigo = new Map(maestro.map(c => [c.c, c]));
  for(const c of propios) porCodigo.set(c.c, c);   // el propio del proyecto gana

  ctx.proyecto = p;
  ctx.soloLectura = !puede.editar;
  ctx.propios = new Set(propios.map(c => c.c));
  ctx.conceptos = [...porCodigo.values()].sort((a,b) => a.c.localeCompare(b.c));
  return ctx;
}

export async function guardarEstado(estado){
  if(!ctx.proyecto || !puede.editar) return null;
  return await datos.guardarProyecto(ctx.proyecto.id, {
    nombre: estado?.cfg?.nom || ctx.proyecto.nombre,
    ubicacion: estado?.cfg?.loc || ctx.proyecto.ubicacion,
    estado
  });
}

export async function agregarConcepto(c){
  if(!ctx.proyecto) throw new Error('No hay proyecto abierto');
  if(!puede.editar) throw new Error('Tu rol no permite agregar conceptos');
  if(ctx.conceptos.some(x => x.c === c.c)) throw new Error('Ese código ya existe en el catálogo');
  await datos.agregarConceptoAProyecto(ctx.proyecto.id, c);
  ctx.propios.add(c.c);
  ctx.conceptos.push({ ...c, ambito: 'proyecto' });
  ctx.conceptos.sort((a,b) => a.c.localeCompare(b.c));
}

export async function promover(codigo){
  if(!puede.aprobar) throw new Error('Solo un administrador promueve conceptos al maestro');
  await datos.promoverConcepto(ctx.proyecto.id, codigo);
  ctx.propios.delete(codigo);
  const c = ctx.conceptos.find(x => x.c === codigo);
  if(c) c.ambito = 'maestro';
}

export { sesion, puede };
