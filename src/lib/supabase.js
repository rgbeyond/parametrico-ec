import { createClient } from '@supabase/supabase-js';
import { opcionesCliente } from './platform.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* Si no hay variables de entorno, la app corre sin nube y persiste en el
   navegador. No se rompe: solo pierde el catálogo compartido. */
/* Bajo Beyond Platform: PKCE y sin canjear callbacks (solo Platform lo hace).
   Standalone: las opciones de siempre. Ver `platform.js`. */
export const supabase = (url && key) ? createClient(url, key, { auth: opcionesCliente() }) : null;

export const hayNube = !!supabase;
