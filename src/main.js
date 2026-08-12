import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import { montarSesion } from './lib/auth.js';
import './lib/app.js';

/* La barra de sesión se monta aparte del estimador: si no hay Supabase
   configurado, la app funciona igual y guarda en el navegador. */
montarSesion(document.getElementById('sesion'));
