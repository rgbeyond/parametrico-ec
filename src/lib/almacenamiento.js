/* Adaptador de persistencia.
   Orden de preferencia: Supabase (si hay sesión) > almacenamiento del visor > localStorage.
   Así el mismo código corre en local, en Netlify y dentro de un visor embebido. */
import { supabase } from './supabase.js';
import { sesion } from './sesion.js';

/* El estado de un proyecto se guarda en la tabla proyectos a través de
   contexto.js. Este adaptador queda para el respaldo local y para el modo
   sin cuenta, que es el que permite trabajar sin conexión. */

export const DB = {
  async get(k){
    if(typeof window!=='undefined' && window.storage){
      try{ return await window.storage.get(k); }catch(e){ return null; }
    }
    try{ const v=window.localStorage.getItem(k); return v!=null?{key:k,value:v}:null; }catch(e){ return null; }
  },
  async set(k,v){
    if(typeof window!=='undefined' && window.storage) return await window.storage.set(k,v);
    window.localStorage.setItem(k,v); return { key:k };
  },
  get modo(){
    if(sesion && sesion.perfil) return 'nube';
    if(typeof window!=='undefined' && window.storage) return 'visor';
    try{ window.localStorage.setItem('_t','1'); window.localStorage.removeItem('_t'); return 'navegador'; }
    catch(e){ return 'sin almacenamiento'; }
  }
};
