import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* La versión vive únicamente en package.json. Si además se escribiera en el
   código, los dos lugares se desincronizarían tarde o temprano. La fecha se
   estampa al compilar: es lo que permite reconciliar una propuesta impresa con
   el código que produjo sus cifras. */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const PLATFORM = process.env.VITE_BEYOND_PLATFORM === '1';

export default defineConfig({
  /* Dos builds del mismo código (contrato de sesión v1 de Beyond Platform):
     la raíz, como siempre, y `npm run build:platform` con base /ec/ en
     dist/ec/, que es el que Platform monta por proxy (src/lib/platform.js). */
  base: PLATFORM ? '/ec/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString())
  },
  build: {
    outDir: PLATFORM ? 'dist/ec' : 'dist',
    assetsInlineLimit: 0,
    target: 'es2020',
    /* Dos páginas: la aplicación y el portal de inversionistas. El portal es
       una entrada aparte a propósito —no carga el estimador ni su shell—, así
       que abrirlo no paga el costo de arrancar la herramienta interna. */
    rollupOptions: {
      input: {
        principal: resolve(__dirname, 'index.html'),
        portal: resolve(__dirname, 'portal-inversionista.html')
      }
    }
  },
  server: { port: 5173, open: true }
});
