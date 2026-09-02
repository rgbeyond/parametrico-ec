import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

/* La versión vive únicamente en package.json. Si además se escribiera en el
   código, los dos lugares se desincronizarían tarde o temprano. La fecha se
   estampa al compilar: es lo que permite reconciliar una propuesta impresa con
   el código que produjo sus cifras. */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  /* Rutas RELATIVAS en el paquete. Beyond Platform monta esta aplicación por
     proxy de Netlify bajo /ec/*, y con la base absoluta por omisión el índice
     pedía /assets/... al host de Beyond —que no los tiene— y la pantalla
     quedaba en blanco. Con base relativa los mismos archivos funcionan en el
     host propio y bajo el proxy, sin duplicar builds. */
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString())
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'es2020'
  },
  server: { port: 5173, open: true }
});
