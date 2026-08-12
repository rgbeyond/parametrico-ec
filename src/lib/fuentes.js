/* Las reglas @font-face que necesita el documento independiente de la propuesta.
   El documento se escribe dentro de un iframe o de un archivo aparte, asi que
   no hereda la hoja de estilos de la aplicacion: hay que llevarle las fuentes.
   Vite reescribe estas rutas a los archivos con hash del build. */
import extraLight from '../assets/fonts/Montserrat-ExtraLight.woff2';
import light from '../assets/fonts/Montserrat-Light.woff2';
import regular from '../assets/fonts/Montserrat-Regular.woff2';
import semiBold from '../assets/fonts/Montserrat-SemiBold.woff2';
import bold from '../assets/fonts/Montserrat-Bold.woff2';

const cara = (peso, url) =>
  `@font-face{font-family:Montserrat;font-style:normal;font-weight:${peso};font-display:swap;src:url("${new URL(url, window.location.href).href}") format("woff2")}`;

export const FONT_CSS = [
  cara(200, extraLight), cara(300, light), cara(400, regular),
  cara(600, semiBold), cara(700, bold)
].join('\n');
