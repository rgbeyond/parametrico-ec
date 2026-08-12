/* Adaptador de persistencia.
   Orden de preferencia: Supabase (si hay sesión) > almacenamiento del visor > localStorage.
   Así el mismo código corre en local, en Netlify y dentro de un visor embebido. */
import { supabase } from './supabase.js';
import { usuarioActual } from './auth.js';

async function supaGet(k){
  const u=await usuarioActual(); if(!u||!supabase) return null;
  const { data, error } = await supabase.from('proyectos')
    .select('estado').eq('usuario_id',u.id).eq('clave',k).maybeSingle();
  if(error||!data) return null;
  return { key:k, value:JSON.stringify(data.estado) };
}
async function supaSet(k,v){
  const u=await usuarioActual(); if(!u||!supabase) return null;
  const { error } = await supabase.from('proyectos')
    .upsert({ usuario_id:u.id, clave:k, estado:JSON.parse(v), actualizado_en:new Date().toISOString() },
            { onConflict:'usuario_id,clave' });
  if(error) throw error;
  return { key:k };
}

export const DB = {
  async get(k){
    try{ const r=await supaGet(k); if(r) return r; }catch(e){}
    if(typeof window!=='undefined' && window.storage){
      try{ return await window.storage.get(k); }catch(e){ return null; }
    }
    try{ const v=window.localStorage.getItem(k); return v!=null?{key:k,value:v}:null; }catch(e){ return null; }
  },
  async set(k,v){
    try{ const r=await supaSet(k,v); if(r){ try{ window.localStorage.setItem(k,v); }catch(e){} return r; } }catch(e){}
    if(typeof window!=='undefined' && window.storage) return await window.storage.set(k,v);
    window.localStorage.setItem(k,v); return { key:k };
  },
  get modo(){
    try{ if(window.__sesion) return 'nube'; }catch(e){}
    if(typeof window!=='undefined' && window.storage) return 'visor';
    try{ window.localStorage.setItem('_t','1'); window.localStorage.removeItem('_t'); return 'navegador'; }
    catch(e){ return 'sin almacenamiento'; }
  }
};
