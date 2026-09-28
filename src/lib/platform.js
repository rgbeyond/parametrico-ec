/* Estaciones de Carga bajo Beyond Platform (beyond-session-contract/v1,
   rgbeyond/beyond-platform docs/arquitectura/contrato-sesion-navegacion-v1.md).

   Bajo Platform la app NO tiene puerta propia: no inicia sesión, no canjea
   callbacks, no cierra sesión y no guarda su propio retorno. Consume la
   sesión común del mismo origen y, si la puerta no abre, manda al acceso de
   Platform con retorno a la ruta exacta. Sin configuración no se entra: el
   modo local no existe bajo Platform.

   Aplica en el build `npm run build:platform` (VITE_BEYOND_PLATFORM=1, base
   /ec/, publicado en dist/ec/), que es el que Platform monta. Se decide AL
   COMPILAR, no por la URL. El build de la raíz se comporta como antes;
   retirarlo es una decisión de RG pendiente (handoff en beyond-platform#7). */
import { opcionesAuth, urlAcceso, rutaActual } from './contrato/sesion-v1.mjs';

export const BAJO_PLATFORM = import.meta.env.VITE_BEYOND_PLATFORM === '1';

/* Raíz de esta app: "/" standalone, "/ec/" bajo Platform. */
export const BASE = import.meta.env.BASE_URL || '/';

export function opcionesCliente(){
  return BAJO_PLATFORM
    ? opcionesAuth({ esPlatform: false })
    : { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true };
}

export function irAlAcceso(){
  window.location.replace(urlAcceso(rutaActual(window.location)));
}
