/* Retorno a la ruta original después de iniciar sesión (issue #9).
   ================================================================

   La mitad de estas pruebas son negativas, y son las que importan: un «vuelve
   a donde estabas» que acepte cualquier destino es un redirect abierto, y
   sirve para mandar a alguien a un sitio ajeno desde una liga que parece
   nuestra. La lista blanca tiene que rechazar todo lo que no sea una ruta
   local declarada.

   La otra mitad prueba que la llave se consuma UNA vez: de ahí depende que no
   haya bucle entre la raíz y el portal.
*/

import { test } from "node:test";
import assert from "node:assert/strict";

import { rutaValida, guardarRetorno, tomarRetorno, rutaActual,
  LLAVE_RETORNO, RUTAS_PERMITIDAS } from "../src/lib/retorno.js";

const PORTAL = "/portal-inversionista.html";
const ECATEPEC = `${PORTAL}?proyecto=038f0972-16de-4c5c-830d-9b0729022c10`;

/* Un `sessionStorage` de mentira, con la misma superficie que el del
   navegador. */
function almacen(inicial = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
    get tamano() { return datos.size; },
  };
}

// --- lo que sí se acepta ----------------------------------------------------

test("una ruta del portal con sus parámetros es válida", () => {
  assert.equal(rutaValida(ECATEPEC), ECATEPEC);
  assert.equal(rutaValida(PORTAL), PORTAL);
});

test("el fragmento se descarta", () => {
  /* Ahí es donde Supabase deja el token al volver de OAuth: no tiene por qué
     viajar a ninguna parte. */
  assert.equal(rutaValida(`${ECATEPEC}#access_token=abc123`), ECATEPEC);
});

test("los espacios de alrededor no invalidan la ruta", () => {
  assert.equal(rutaValida(`  ${ECATEPEC}  `), ECATEPEC);
});

test("la lista blanca es exactamente la declarada", () => {
  assert.deepEqual(RUTAS_PERMITIDAS, ["/portal-inversionista.html"]);
});

// --- lo que se rechaza ------------------------------------------------------

test("un destino externo se rechaza", () => {
  for (const malo of [
    "https://otro-dominio.com/portal-inversionista.html",
    "http://otro-dominio.com/",
    "//otro-dominio.com",
    "//otro-dominio.com/portal-inversionista.html",
    "https://evil.com/portal-inversionista.html?proyecto=1",
  ]) {
    assert.equal(rutaValida(malo), null, `debió rechazar ${malo}`);
  }
});

test("un esquema ejecutable se rechaza", () => {
  for (const malo of ["javascript:alert(1)", "data:text/html,<script>",
    "JavaScript:alert(1)", "vbscript:msgbox"]) {
    assert.equal(rutaValida(malo), null, `debió rechazar ${malo}`);
  }
});

test("la contrabarra se rechaza, porque algunos navegadores la normalizan a barra", () => {
  for (const malo of ["\\\\otro-dominio.com", "/\\otro-dominio.com",
    "/portal-inversionista.html\\..\\admin"]) {
    assert.equal(rutaValida(malo), null, `debió rechazar ${malo}`);
  }
});

test("una ruta local que no está en la lista blanca se rechaza", () => {
  for (const malo of ["/", "/index.html", "/admin", "/portal-inversionista",
    "/otra/portal-inversionista.html", "/portal-inversionista.html.bak"]) {
    assert.equal(rutaValida(malo), null, `debió rechazar ${malo}`);
  }
});

test("un intento de salir del directorio no alcanza otra ruta", () => {
  /* `/a/../portal-inversionista.html` normaliza a la ruta permitida, y eso
     está bien: lo que importa es dónde ACABA, no cómo se escribió. Lo que no
     puede pasar es que acabe en otro sitio. */
  assert.equal(rutaValida("/a/../portal-inversionista.html"), PORTAL);
  assert.equal(rutaValida("/portal-inversionista.html/../index.html"), null);
});

test("caracteres de control y valores que no son texto se rechazan", () => {
  /* Lo peligroso es el carácter de control INCRUSTADO —el que sirve para
     partir una cabecera o un renglón de bitácora—. Un salto al final es
     espacio en blanco y se recorta como tal, igual que los espacios. */
  assert.equal(rutaValida(`${PORTAL}?a=1\nSet-Cookie: x`), null);
  assert.equal(rutaValida(`${PORTAL}?a=1%0d%0aSet-Cookie:x`.replace("%0d%0a", "\r\n")), null);
  assert.equal(rutaValida(`${PORTAL}\n`), PORTAL, "un salto al final es espacio");
  assert.equal(rutaValida(`/portal-inversionista.html\u0000`), null,
    "el nulo no es espacio y no se recorta");
  assert.equal(rutaValida(null), null);
  assert.equal(rutaValida(undefined), null);
  assert.equal(rutaValida(42), null);
  assert.equal(rutaValida({ pathname: PORTAL }), null);
  assert.equal(rutaValida(""), null);
  assert.equal(rutaValida("   "), null);
});

// --- guardar y consumir -----------------------------------------------------

test("se guarda la ruta bajo su propia llave", () => {
  const a = almacen();
  assert.equal(guardarRetorno(ECATEPEC, a), ECATEPEC);
  assert.equal(a.getItem(LLAVE_RETORNO), ECATEPEC);
});

test("una ruta inadmisible no se guarda", () => {
  const a = almacen();
  assert.equal(guardarRetorno("https://evil.com", a), null);
  assert.equal(a.getItem(LLAVE_RETORNO), null,
    "guardar algo que después se va a rechazar sólo confunde");
  assert.equal(a.tamano, 0);
});

test("tomar el retorno lo devuelve y lo borra: no se dispara dos veces", () => {
  const a = almacen({ [LLAVE_RETORNO]: ECATEPEC });
  assert.equal(tomarRetorno(a), ECATEPEC);
  assert.equal(a.getItem(LLAVE_RETORNO), null, "la llave se consume");
  assert.equal(tomarRetorno(a), null, "un segundo intento no devuelve nada");
});

test("una llave envenenada se borra igual, y no se devuelve", () => {
  /* El borrado ocurre SIEMPRE, aunque lo guardado sea inválido: si no, una
     llave mala se quedaría esperando al siguiente arranque. */
  const a = almacen({ [LLAVE_RETORNO]: "https://evil.com/robo" });
  assert.equal(tomarRetorno(a), null);
  assert.equal(a.getItem(LLAVE_RETORNO), null);
});

test("sin nada guardado no hay retorno", () => {
  assert.equal(tomarRetorno(almacen()), null);
});

test("un almacenamiento que lanza no rompe el arranque", () => {
  /* Un navegador con el almacenamiento bloqueado existe, y la aplicación tiene
     que arrancar igual. */
  const roto = {
    getItem() { throw new Error("bloqueado"); },
    setItem() { throw new Error("bloqueado"); },
    removeItem() { throw new Error("bloqueado"); },
  };
  assert.equal(tomarRetorno(roto), null);
  assert.equal(guardarRetorno(ECATEPEC, roto), null);
});

test("la ruta actual se arma sin origen ni fragmento", () => {
  assert.equal(rutaActual({
    pathname: PORTAL, search: "?proyecto=abc", hash: "#x",
    origin: "https://deploy-preview-10--parametrico-ec.netlify.app",
  }), `${PORTAL}?proyecto=abc`);
  assert.equal(rutaActual({ pathname: PORTAL, search: "" }), PORTAL);
});

// --- el ciclo completo ------------------------------------------------------

test("el ciclo: se guarda al entrar sin sesión y se consume al volver", () => {
  const a = almacen();
  // 1. El portal, sin sesión, anota a dónde hay que volver.
  guardarRetorno(rutaActual({ pathname: PORTAL, search: `?proyecto=038f0972-16de-4c5c-830d-9b0729022c10` }), a);
  // 2. OAuth se lleva al usuario y lo devuelve a la raíz.
  // 3. La raíz consume la ruta pendiente, una sola vez.
  assert.equal(tomarRetorno(a), ECATEPEC);
  // 4. Y ya no queda nada que pueda disparar un segundo salto.
  assert.equal(tomarRetorno(a), null);
});
