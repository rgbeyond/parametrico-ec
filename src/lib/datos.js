import { supabase, hayNube } from './supabase.js';
import { sesion } from './sesion.js';
import catalogoLocal from '../data/catalogo.json';

/* Repositorio de datos. Con nube lee y escribe en Supabase; sin nube trabaja
   contra el catalogo incluido y localStorage, para que la herramienta siga
   siendo usable sin cuenta. */

const CLAVE_LOCAL = 'beyond:proyectos';

const leerLocal = () => { try { return JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '[]'); } catch { return []; } };
const escribirLocal = (l) => { try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(l)); } catch {} };

export const slug = (t) => String(t || 'proyecto')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'proyecto';

// ---------------------------------------------------------------- catálogo
/* La decisión vive en `catalogo.js`, sin dependencias, para poder probarla.
   Se reexporta para no romper a quien ya importaba desde aquí. */
import { resolverCatalogo, ErrorCatalogo, origenCatalogo, COLUMNAS }
  from './catalogo.js';
export { resolverCatalogo, ErrorCatalogo, origenCatalogo, COLUMNAS };

const deLocal = () => catalogoLocal.map(x => ({ ...x, ambito: 'maestro' }));

const SELECT_CONCEPTOS = COLUMNAS.join(', ');

/* El origen tiene que poder consultarse desde la consola del navegador.

   Un export de módulo no es alcanzable desde ahí: Vite empaqueta y los nombres
   desaparecen. Sin esto, el paso de validación contra Beyond DEV —«mira
   `origenCatalogo` y comprueba que dice nube»— sería una instrucción que no se
   puede ejecutar, y la comprobación se reduciría a «la app abrió», que es lo
   que ya hacía con el backend mal. */
function publicarOrigen(origen){
  if(typeof window !== 'undefined') window.origenCatalogo = origen;
  console.info('[catálogo] origen:', origen);
  return origen;
}

export async function catalogoMaestro(){
  try {
    const { conceptos, origen } = await resolverCatalogo({
      conNube: hayNube,
      conSesion: !!sesion.perfil,
      local: deLocal,
      consultar: () => supabase.from('conceptos')
        .select(SELECT_CONCEPTOS)
        .eq('activo', true).order('codigo')
    });
    publicarOrigen(origen);
    return conceptos;
  } catch (err) {
    /* También al fallar: es cuando más falta hace saber qué se intentó. */
    publicarOrigen({ ...origenCatalogo });
    throw err;
  }
}

export async function conceptosDelProyecto(proyectoId){
  if(!hayNube || !sesion.perfil || !proyectoId) return [];
  const { data, error } = await supabase.from('proyecto_conceptos')
    .select('codigo, categoria, nombre, unidad, precio, taxonomia, aplicabilidad, fuente, fecha_ref')
    .eq('proyecto_id', proyectoId).order('codigo');
  if(error) return [];
  return (data || []).map(r => ({
    c: r.codigo, cat: r.categoria, n: r.nombre, u: r.unidad, pu: Number(r.precio),
    t: r.taxonomia, ap: r.aplicabilidad, f: r.fuente, fe: r.fecha_ref, ambito: 'proyecto'
  }));
}

export async function agregarConceptoAProyecto(proyectoId, c){
  const { error } = await supabase.from('proyecto_conceptos').insert({
    proyecto_id: proyectoId, codigo: c.c, categoria: c.cat, nombre: c.n, unidad: c.u,
    precio: c.pu, taxonomia: c.t, aplicabilidad: c.ap || 'Condicional',
    fuente: c.f, fecha_ref: new Date().toISOString().slice(0, 7),
    creado_por: sesion.perfil.id
  });
  if(error) throw error;
}

export async function borrarConceptoDeProyecto(proyectoId, codigo){
  const { error } = await supabase.from('proyecto_conceptos')
    .delete().eq('proyecto_id', proyectoId).eq('codigo', codigo);
  if(error) throw error;
}

export async function promoverConcepto(proyectoId, codigo){
  const { error } = await supabase.rpc('fn_promover_concepto',
    { p_proyecto: proyectoId, p_codigo: codigo });
  if(error) throw error;
}

/* Plantilla con el caso que ya trabajamos, para no arrancar de cero.
   Se ofrece cuando la organización todavía no tiene proyectos. */
export const PLANTILLA_ATLACOMULCO = {
  nombre: 'Electrolinera Atlacomulco — Fase 1',
  ubicacion: 'Atlacomulco, Estado de México',
  estado: { v: 1, cfg: {
    nom: 'Electrolinera Atlacomulco — Fase 1', loc: 'Atlacomulco, Estado de México', modo: 'coinv',
    grupos: [{ kw: 240, con: 2, q: 5 }],
    /* El balanceo al 30% es lo que sostiene el transformador de 1,500 kVA: la
       demanda de diseño baja a 840 kW. Sin esa reserva, el criterio de
       dimensionamiento pediría 2,000 kVA para los 1,200 kW instalados. */
    kva: '1500', kvaOtra: 0, vmt: 23, vbt: 480, balanceo: 1, balanceoPct: 30,
    /* Tarifa GDMTH de la división Centro Sur, que es la que corresponde a
       Atlacomulco: Ecatepec sería Valle de México Norte, con cargos distintos
       pese a estar en el mismo estado. Los cargos los aprueba la CRE cada mes,
       así que esta captura es de agosto de 2026 y hay que refrescarla.
       `otrosKwh` es la suma de transmisión 0.1801, CENACE 0.0076 y servicios
       conexos no MEM 0.0069, que se aplican a todos los kWh. */
    sumin: 'CFE Suministro Básico', tarifaCat: 'GDMTH',
    tarifaDiv: 'Centro Sur', tarifaMes: '2026-08',
    cargoCap: 350.90, cargoDist: 221.09, cargoFijo: 264.38, otrosKwh: 0.1946,
    enPunta: 1.6703, enInterm: 1.4539, enBase: 0.7422,
    /* 115 kWh por kWp al mes es la media medida en proyectos de la zona centro.
       Es criterio conservador y deliberado: los rendimientos de catálogo de
       fabricante suelen quedar por encima de lo que rinde una instalación real. */
    kwp: 615, fvKwhKwp: 115, fvModo: 'llave', fvUsdWp: 0.79, bess: 2, besskwh: 261, besskw: 125,
    mbt: 120, mmt: 72, dem: 350, piso: 1200, techNueva: 0, tech: 0, sde: 1, sdeBanos: 1,
    cliEvse: 0, cliTrafo: 0, cliCctv: 0, cliIng: 0, derechos: 0, via: 0,
    fee: 10, cont: 25, fx: 18.5
  }, edits: {}, genEdits: {}, genApproved: {} }
};

// ---------------------------------------------------------------- proyectos
export async function listarProyectos(){
  if(!hayNube || !sesion.perfil){
    return leerLocal().map(p => ({ ...p, local: true }));
  }
  const { data, error } = await supabase.from('proyectos')
    .select('id, clave, nombre, ubicacion, estado, archivado, creado_en, actualizado_en, creado_por, actualizado_por')
    .order('actualizado_en', { ascending: false });
  if(error) throw error;
  return data || [];
}

export async function crearProyecto({ nombre, ubicacion, estado }){
  const clave = slug(nombre) + '-' + Math.random().toString(36).slice(2, 6);
  if(!hayNube || !sesion.perfil){
    const l = leerLocal();
    const p = { id: clave, clave, nombre, ubicacion, estado, archivado: false,
                creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() };
    l.unshift(p); escribirLocal(l); return p;
  }
  const { data, error } = await supabase.from('proyectos')
    .insert({ clave, nombre, ubicacion, estado, creado_por: sesion.perfil.id,
              actualizado_por: sesion.perfil.id })
    .select().single();
  if(error) throw error;
  return data;
}

export async function guardarProyecto(id, { nombre, ubicacion, estado }){
  if(!hayNube || !sesion.perfil){
    const l = leerLocal(); const i = l.findIndex(p => p.id === id);
    if(i < 0) return null;
    l[i] = { ...l[i], nombre, ubicacion, estado, actualizado_en: new Date().toISOString() };
    escribirLocal(l); return l[i];
  }
  const { data, error } = await supabase.from('proyectos')
    .update({ nombre, ubicacion, estado }).eq('id', id).select().single();
  if(error) throw error;
  return data;
}

export async function leerProyecto(id){
  if(!hayNube || !sesion.perfil) return leerLocal().find(p => p.id === id) || null;
  const { data, error } = await supabase.from('proyectos').select('*').eq('id', id).maybeSingle();
  if(error) throw error;
  return data;
}

export async function duplicarProyecto(id, nombre){
  const orig = await leerProyecto(id);
  if(!orig) throw new Error('Proyecto no encontrado');
  return await crearProyecto({ nombre, ubicacion: orig.ubicacion, estado: orig.estado });
}

export async function archivarProyecto(id, archivado){
  if(!hayNube || !sesion.perfil){
    const l = leerLocal(); const i = l.findIndex(p => p.id === id);
    if(i >= 0){ l[i].archivado = archivado; escribirLocal(l); } return;
  }
  const { error } = await supabase.from('proyectos').update({ archivado }).eq('id', id);
  if(error) throw error;
}

// ---------------------------------------------------------------- comentarios
export async function comentariosDe(proyectoId){
  if(!hayNube || !sesion.perfil) return [];
  const { data, error } = await supabase.from('comentarios')
    .select('id, concepto, texto, resuelto, creado_en, autor, perfiles(nombre, correo)')
    .eq('proyecto_id', proyectoId).order('creado_en', { ascending: false });
  if(error) return [];
  return data || [];
}

export async function comentar(proyectoId, texto, concepto = null){
  const { error } = await supabase.from('comentarios')
    .insert({ proyecto_id: proyectoId, texto, concepto, autor: sesion.perfil.id });
  if(error) throw error;
}
