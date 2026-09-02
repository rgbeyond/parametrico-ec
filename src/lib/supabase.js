import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* Si no hay variables de entorno, la app corre sin nube y persiste en el
   navegador. No se rompe: solo pierde el catálogo compartido. */
export const supabase = (url && key) ? createClient(url, key, {
  /* PKCE, no el flujo implícito: el implícito deja la URL con tokens como
     entrada del historial (auth-js la limpia con una navegación de hash) y
     el botón Atrás tras entrar los reponía en la barra. Con PKCE vuelve un
     código de un solo uso y la limpieza es replaceState, sin entrada extra.
     Mismo cambio que en propuestas-fv (beyond-platform#7). */
  auth: { persistSession: true, autoRefreshToken: true,
    detectSessionInUrl: true, flowType: 'pkce' }
}) : null;

export const hayNube = !!supabase;
