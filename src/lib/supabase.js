import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* Si no hay variables de entorno, la app corre sin nube y persiste en el
   navegador. No se rompe: solo pierde el catálogo compartido. */
export const supabase = (url && key) ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

export const hayNube = !!supabase;
