/* Vite inyecta estos dos valores en tiempo de compilación: la versión desde
   package.json y la fecha del build. Ver el bloque `define` en vite.config.js.
   No escribir la versión a mano aquí: package.json es la fuente única. */
export const VERSION = __APP_VERSION__;
export const BUILD_ISO = __BUILD_DATE__;

const fecha = new Date(BUILD_ISO).toLocaleDateString('es-MX',
  { day: '2-digit', month: 'short', year: 'numeric' });

/* Se muestra en la interfaz y también en el pie del documento de propuesta.
   Sin esto, una propuesta impresa no se puede reconciliar con el código que
   generó sus cifras, que es justo lo que exige la trazabilidad del proyecto. */
export const VERSION_TXT = `v${VERSION} · compilado ${fecha}`;
