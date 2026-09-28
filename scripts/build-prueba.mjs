/* Compilación para las pruebas de navegador que necesitan sesión.
   ==============================================================

   Las pruebas de `pruebas-navegador/ui_retorno.test.mjs` tienen que ejercitar
   el regreso desde OAuth, y para eso hace falta que la aplicación CREA que hay
   nube: sin `VITE_SUPABASE_URL` el cliente ni siquiera existe y `sesion.perfil`
   nunca puede ser verdadero.

   Esta compilación apunta a un doble local —un servidor de mentira que la
   propia prueba levanta en ese puerto— y sale a `dist-prueba`, que no se
   publica y está en `.gitignore`. La compilación de verdad, la que despliega
   Netlify, no se toca.

   El puerto es fijo a propósito: la dirección queda dentro del paquete al
   compilar, así que la prueba tiene que levantar su doble exactamente ahí.
*/
import { build } from 'vite';

export const PUERTO_DOBLE = 54321;
export const URL_DOBLE = `http://127.0.0.1:${PUERTO_DOBLE}`;

process.env.VITE_SUPABASE_URL = URL_DOBLE;
/* Una llave cualquiera: el doble no la verifica. No es un secreto y no
   corresponde a ningún proyecto real. */
process.env.VITE_SUPABASE_ANON_KEY = 'llave-anonima-de-prueba';

await build({ build: { outDir: 'dist-prueba' }, logLevel: 'warn' });
