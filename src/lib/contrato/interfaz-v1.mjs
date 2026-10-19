// COPIA de rgbeyond/beyond-platform:plataforma/contrato/interfaz-v1.mjs (claude/ui-01-comun @ d04141a).
// No editar aquí: se cambia en Platform y se vuelve a copiar.
// beyond-ui-contract/v1 — parte ejecutable del contrato de interfaz común
// (docs/arquitectura/contrato-interfaz-v1.md): encabezado, regreso a
// beyond core, tema y cuenta, iguales en Core y en las apps integradas.
//
// Sin dependencias. Lo que toca el DOM lo recibe por argumento (documento,
// ventana, contenedor), así que las pruebas lo ejercen sin navegador y cada
// app lo copia tal cual a src/lib/contrato/. Si una copia diverge,
// CONTRATO_UI dice contra qué versión se escribió.
//
// Lo que este módulo NO hace: no decide la puerta, no cierra sesión y no
// guarda nada fuera de la preferencia de tema. Cerrar sesión sigue siendo
// navegar a /salir (contrato de sesión §7).

export const CONTRATO_UI = "beyond-ui-contract/v1";

// §2 — nombre visible y regreso global. No renombra repos, hosts ni IDs.
export const NOMBRE = "beyond core";
export const ETIQUETA_VOLVER = "Volver a beyond core";
export const DESTINO_VOLVER = "/";

// §4 — preferencia de tema: una por navegador y origen. Mismo origen para
// las tres superficies (contrato de sesión §2), así que la misma llave las
// cubre. /salir no la borra: no es dato de sesión.
export const CLAVE_TEMA = "beyond:tema";
export const TEMAS = Object.freeze({ CLARO: "claro", OSCURO: "oscuro" });
const VALIDOS = new Set(Object.values(TEMAS));

// La elección manual guardada, o null si no hay (o no se puede leer).
export function leerTema(almacen) {
  try {
    const v = almacen?.getItem(CLAVE_TEMA);
    return VALIDOS.has(v) ? v : null;
  } catch { return null; }
}

// Primera visita: el sistema. Una elección manual prevalece.
export function temaInicial({ almacen, sistemaClaro }) {
  return leerTema(almacen) ?? (sistemaClaro ? TEMAS.CLARO : TEMAS.OSCURO);
}

export const otroTema = (tema) => (tema === TEMAS.CLARO ? TEMAS.OSCURO : TEMAS.CLARO);

// La etiqueta describe la ACCIÓN, no el estado (§4).
export const accionTema = (tema) =>
  tema === TEMAS.CLARO ? "Activar modo oscuro" : "Activar modo claro";

// §5 — identidad informativa: correo y rol reales, nunca inventados.
export function textoCuenta(cuenta) {
  if (!cuenta || !cuenta.correo) return "";
  return cuenta.rol ? `${cuenta.correo} · ${cuenta.rol}` : cuenta.correo;
}

// Íconos: una sola familia (trazo 1.5, extremos redondeados, 24×24), la
// misma de las tarjetas de módulo de Core. Decorativos: el nombre accesible
// va siempre en el control.
const TRAZO = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
export const ICONOS = Object.freeze({
  volver: `<svg width="20" height="20" viewBox="0 0 24 24" ${TRAZO}><path d="M19 12H5m6-6-6 6 6 6"/></svg>`,
  sol: `<svg width="20" height="20" viewBox="0 0 24 24" ${TRAZO}><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  luna: `<svg width="20" height="20" viewBox="0 0 24 24" ${TRAZO}><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/></svg>`,
  abajo: `<svg width="16" height="16" viewBox="0 0 24 24" ${TRAZO}><path d="m6 9 6 6 6-6"/></svg>`,
});

// §4 — aplica el tema al documento y lo mantiene coherente: elección
// manual, cambios desde otra pestaña del mismo origen (evento `storage`) y
// cambios del sistema mientras no haya elección manual.
export function iniciarTema(doc, win, { alCambiar } = {}) {
  const raiz = doc.documentElement;
  const almacen = (() => { try { return win.localStorage; } catch { return null; } })();
  const mql = win.matchMedia ? win.matchMedia("(prefers-color-scheme: light)") : null;
  const oyentes = new Set();
  // La elección manual también vive en memoria: si el almacenamiento falta o
  // rechaza la escritura, vale para esta página y un cambio del sistema no la
  // pisa. Lo guardado (de esta u otra pestaña) manda cuando se puede leer.
  let manual = null;
  const elegida = () => leerTema(almacen) ?? manual;
  const calcular = () => elegida() ?? (mql?.matches ? TEMAS.CLARO : TEMAS.OSCURO);
  function aplicar(tema) {
    if (raiz.dataset.tema === tema) return;
    raiz.dataset.tema = tema;
    raiz.style.colorScheme = tema === TEMAS.CLARO ? "light" : "dark";
    for (const f of oyentes) f(tema);
    alCambiar?.(tema);
  }
  aplicar(calcular());
  // key null: otra pestaña vació el almacenamiento entero.
  win.addEventListener("storage", (e) => { if (e.key === CLAVE_TEMA || e.key === null) aplicar(calcular()); });
  mql?.addEventListener?.("change", () => { if (!elegida()) aplicar(calcular()); });
  return {
    actual: () => raiz.dataset.tema,
    elegir(tema) {
      if (!VALIDOS.has(tema)) return;
      manual = tema;
      try { almacen?.setItem(CLAVE_TEMA, tema); } catch { /* sin almacenamiento: vale para esta página */ }
      aplicar(tema);
    },
    alternar() { this.elegir(otroTema(raiz.dataset.tema)); },
    alAplicar(f) { oyentes.add(f); return () => oyentes.delete(f); },
  };
}

// §3 — el encabezado común. `superficie`:
//   "core" — marca sin regreso; la cuenta abre un menú con las acciones que
//            existen (hoy solo «Cerrar sesión»).
//   "app"  — «← beyond core» a la izquierda; la cuenta es informativa, sin
//            menú ni flecha.
// `antesDeVolver()` (apps) devuelve un mensaje si hay cambios sin guardar o
// una escritura en vuelo; entonces se pide confirmación y, si se cancela, no
// se navega: la ruta y los datos quedan como estaban.
export function montarEncabezado(raiz, {
  superficie, titulo = "", entorno = null, logo = null, tema,
  cuenta = null, acciones = [], antesDeVolver = null, confirmar = null,
}) {
  const doc = raiz.ownerDocument;
  const win = doc.defaultView;
  const enApp = superficie === "app";
  const ctrl = new AbortController();
  const senal = { signal: ctrl.signal };
  const el = (tag, attrs = {}, hijos = []) => {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "html") n.innerHTML = v; else if (k === "texto") n.textContent = v; else n.setAttribute(k, v === true ? "" : v);
    }
    for (const h of hijos) if (h) n.append(h);
    return n;
  };
  const lockup = () => {
    const l = el("span", { class: "bc-lockup" });
    if (logo) l.append(el("img", { class: "bc-logo", src: logo, alt: "", width: "2172", height: "724" }));
    l.append(el("span", { class: logo ? "bc-nombre bc-nombre-tras-logo" : "bc-nombre", texto: logo ? "core" : NOMBRE }));
    return l;
  };

  const izquierda = enApp
    ? el("a", { class: "bc-volver", href: DESTINO_VOLVER, "aria-label": ETIQUETA_VOLVER },
      [el("span", { class: "bc-ico", html: ICONOS.volver }), lockup()])
    : el("span", { class: "bc-marca", role: "img", "aria-label": NOMBRE }, [lockup()]);

  const botonTema = el("button", { type: "button", class: "bc-tema" });
  const pintarTema = (t) => {
    botonTema.innerHTML = t === TEMAS.CLARO ? ICONOS.luna : ICONOS.sol;
    botonTema.setAttribute("aria-label", accionTema(t));
    botonTema.title = accionTema(t);
  };
  pintarTema(tema.actual());
  const soltarTema = tema.alAplicar(pintarTema);
  botonTema.addEventListener("click", () => tema.alternar(), senal);

  const zonaCuenta = el("div", { class: "bc-cuenta" });
  // La identidad completa, visible sin hover: en celular el texto de la fila
  // superior se recorta, y un `title` no se consulta con el dedo. En las apps
  // va como línea de contexto (CSS la muestra solo en angosto); en Core, al
  // principio del menú. Para lectores de pantalla ya está entera arriba.
  const identidad = el("span", { class: "bc-identidad", "aria-hidden": "true", hidden: true });
  const idMenu = "bc-menu-cuenta";
  let boton = null, menu = null;
  function cerrarMenu({ foco = false } = {}) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    boton.setAttribute("aria-expanded", "false");
    if (foco) boton.focus();
  }
  function pintarCuenta(c) {
    zonaCuenta.replaceChildren();
    boton = menu = null;
    const texto = textoCuenta(c);
    identidad.textContent = texto;
    identidad.hidden = !texto || !(enApp || !acciones.length);
    if (!texto) return;
    if (enApp || !acciones.length) {
      zonaCuenta.append(el("span", { class: "bc-cuenta-info", title: texto }, [el("span", { class: "bc-cuenta-texto", texto })]));
      return;
    }
    boton = el("button", { type: "button", class: "bc-cuenta-boton", "aria-expanded": "false", "aria-controls": idMenu, title: texto },
      [el("span", { class: "bc-oculto", texto: "Cuenta: " }), el("span", { class: "bc-cuenta-texto", texto }), el("span", { class: "bc-ico", html: ICONOS.abajo })]);
    menu = el("ul", { class: "bc-menu", id: idMenu, hidden: true });
    menu.append(el("li", { class: "bc-menu-identidad", "aria-hidden": "true", texto }));
    for (const a of acciones) menu.append(el("li", {}, [el("a", { class: "bc-menu-item", href: a.href, texto: a.texto })]));
    boton.addEventListener("click", () => {
      const abrir = menu.hidden;
      menu.hidden = !abrir;
      boton.setAttribute("aria-expanded", String(abrir));
    }, senal);
    zonaCuenta.append(boton, menu);
  }
  pintarCuenta(cuenta);
  // Escape cierra y devuelve el foco; salir del grupo con Tab o clicar
  // fuera cierra sin robar el foco. Sin trampa: el orden de tabulación es
  // el del documento.
  zonaCuenta.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarMenu({ foco: true }); }, senal);
  zonaCuenta.addEventListener("focusout", (e) => { if (!zonaCuenta.contains(e.relatedTarget)) cerrarMenu(); }, senal);
  doc.addEventListener("pointerdown", (e) => { if (!zonaCuenta.contains(e.target)) cerrarMenu(); }, senal);

  if (enApp) {
    izquierda.addEventListener("click", (e) => {
      const aviso = antesDeVolver?.();
      if (!aviso) return;
      const ok = (confirmar ?? ((m) => win.confirm(m)))(aviso);
      if (!ok) e.preventDefault();
    }, senal);
  }

  const tituloEl = el("span", { class: "bc-titulo", texto: titulo });
  const entornoEl = entorno ? el("span", { class: "bc-entorno", texto: entorno }) : null;
  const ruta = el("nav", { class: "bc-ruta", "aria-label": "Ruta", hidden: true });
  const contexto = el("div", { class: "bc-contexto" }, [tituloEl, entornoEl, ruta]);
  const barra = el("header", { class: "bc-barra", "data-superficie": enApp ? "app" : "core", "data-contrato": CONTRATO_UI }, [
    el("div", { class: "bc-fila" }, [izquierda, el("div", { class: "bc-controles" }, [botonTema, zonaCuenta])]),
    contexto,
  ]);
  contexto.after(identidad);
  raiz.replaceChildren(barra);

  return {
    barra,
    fijarCuenta: pintarCuenta,
    fijarTitulo(t) { tituloEl.textContent = t; },
    // Migas de la app: [{ texto, href?, alActivar? }]. Vacío las oculta. Una
    // miga con `alActivar` es un enlace (href para abrir en otra pestaña) cuyo
    // clic normal navega dentro de la app sin recargar: para apps cuya lista
    // no tiene ruta propia (la portada de EC).
    fijarRuta(partes = []) {
      ruta.replaceChildren();
      ruta.hidden = !partes.length;
      partes.forEach((p, i) => {
        if (i) ruta.append(el("span", { class: "bc-sep", "aria-hidden": "true", texto: "/" }));
        const ultimo = i === partes.length - 1;
        if (!p.href || ultimo) { ruta.append(el("span", { "aria-current": ultimo ? "page" : null, texto: p.texto })); return; }
        const a = el("a", { href: p.href, texto: p.texto });
        if (p.alActivar) a.addEventListener("click", (e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          p.alActivar();
        });
        ruta.append(a);
      });
    },
    destruir() { ctrl.abort(); soltarTema(); barra.remove(); },
  };
}
