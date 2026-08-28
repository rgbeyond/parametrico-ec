/* Los cuatro estados del catálogo maestro.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * ---------------------------
 * `catalogoMaestro()` tenía una línea que colapsaba tres situaciones distintas
 * en una respuesta feliz:
 *
 *   if(error || !data?.length) return catalogoLocal.map(...)
 *
 * Con eso, una prueba de conexión contra Beyond DEV daba verde aunque la base
 * estuviera vacía, la RLS mal puesta o las credenciales equivocadas: la
 * pantalla se veía idéntica porque el JSON empaquetado la llenaba. Estas
 * pruebas existen para que esa línea no pueda volver.
 *
 * QUE SE PRUEBA, Y POR QUE ASI
 * ----------------------------
 * Se ejercita `resolverCatalogo()`, que es LA lógica de decisión, no una copia.
 * `catalogoMaestro()` de `datos.js` no hace más que atarla a Supabase y a la
 * sesión reales. Probar una reimplementación paralela sería probar la
 * reimplementación.
 *
 * Por eso la decisión se mudó a `src/lib/catalogo.js`: ese módulo no importa
 * Supabase, ni la sesión, ni el JSON del catálogo —que solo Vite sabe cargar—,
 * así que Node lo ejecuta tal cual, sin transpilar ni levantar nada.
 *
 * Las dependencias entran por parámetro —`conNube`, `conSesion`, `consultar`,
 * `local`— así que no hace falta interceptar módulos ni levantar un navegador.
 *
 * Correr:  npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolverCatalogo, ErrorCatalogo, origenCatalogo, COLUMNAS }
  from '../src/lib/catalogo.js';

/* Un catálogo local mínimo. No se importa el de verdad: lo que se comprueba es
   de dónde salieron los datos, no cuántos cables hay en el JSON. */
const LOCAL = [
  { c: 'LOC-1', cat: 'prueba', n: 'Concepto local', u: 'pza', pu: 1, t: 'supuesto' }
];
const local = () => LOCAL.map((x) => ({ ...x, ambito: 'maestro' }));

const filaNube = {
  codigo: 'NUB-1', categoria: 'prueba', nombre: 'Concepto de la nube',
  unidad: 'pza', precio: '42.50', taxonomia: 'validado',
  aplicabilidad: 'Base', fuente: 'Beyond DEV', fecha_ref: '2026-08'
};

const conNube = (respuesta) => () => Promise.resolve(respuesta);

/* Un `local` que NO debe llamarse.
 *
 * El aviso no puede ir en un `assert.fail()` dentro del validador de
 * `assert.rejects`: ahí el AssertionError lo consume la propia comprobación de
 * tipo y quien corra `npm test` lee «The expression evaluated to a falsy
 * value» en vez del aviso. Se registra en una bandera y se comprueba fuera,
 * donde el mensaje sí llega entero. */
function localProhibido(aviso){
  const espia = () => { espia.llamado = aviso; return LOCAL; };
  espia.llamado = null;
  return espia;
}

// --------------------------------------------------------------- 1. local
test('sin nube: usa el catálogo local y lo declara', async () => {
  const { conceptos, origen } = await resolverCatalogo({
    conNube: false,
    conSesion: false,
    local,
    consultar: () => assert.fail('no debe consultar Supabase sin nube')
  });
  assert.equal(conceptos[0].c, 'LOC-1');
  assert.equal(origen.fuente, 'local');
  assert.equal(origen.motivo, 'sin-nube');
});

test('con nube pero sin sesión: catálogo local, y se distingue del caso anterior',
  async () => {
    const { conceptos, origen } = await resolverCatalogo({
      conNube: true,
      conSesion: false,
      local,
      consultar: () => assert.fail('no debe consultar Supabase sin sesión')
    });
    assert.equal(conceptos[0].c, 'LOC-1');
    assert.equal(origen.fuente, 'local');
    /* El motivo separa «la herramienta corre sin cuenta» de «no configuraron
       Supabase». Las dos devuelven lo mismo y no son lo mismo. */
    assert.equal(origen.motivo, 'sin-sesion');
  });

// ---------------------------------------------------------- 2. nube con datos
test('nube con datos: usa Supabase y traduce los nombres de columna', async () => {
  const { conceptos, origen } = await resolverCatalogo({
    conNube: true,
    conSesion: true,
    local: () => assert.fail('no debe caer al local cuando la nube responde'),
    consultar: conNube({ data: [filaNube], error: null })
  });

  assert.equal(conceptos.length, 1);
  const c = conceptos[0];
  assert.equal(c.c, 'NUB-1');
  assert.equal(c.n, 'Concepto de la nube');
  /* `precio` llega como cadena desde PostgREST por ser `numeric`. Si no se
     convierte, las sumas del estimador concatenan en vez de sumar. */
  assert.equal(c.pu, 42.5);
  assert.equal(typeof c.pu, 'number');
  assert.equal(c.ambito, 'maestro');

  assert.equal(origen.fuente, 'nube');
  assert.equal(origen.filas, 1);
});

// ------------------------------------------------------------- 3. nube error
test('nube con error: LANZA, no devuelve el catálogo local', async () => {
  const local = localProhibido('EL FALLBACK SILENCIOSO VOLVIO: un error de '
    + 'Supabase se está ocultando con el catálogo local');

  await assert.rejects(
    () => resolverCatalogo({
      conNube: true,
      conSesion: true,
      local,
      consultar: conNube({ data: null, error: { message: 'JWT expired' } })
    }),
    (e) => {
      assert.ok(e instanceof ErrorCatalogo);
      assert.equal(e.causa, 'consulta');
      /* El detalle del error de Supabase se conserva: sin él, quien depure
         solo ve «no se pudo leer» y no sabe si fue sesión, red o permisos. */
      assert.equal(e.detalle.message, 'JWT expired');
      return true;
    }
  );
  assert.equal(local.llamado, null, local.llamado);
});

test('nube con error: tampoco cae al local aunque el error venga con data vacía',
  async () => {
    await assert.rejects(
      () => resolverCatalogo({
        conNube: true, conSesion: true,
        local: () => assert.fail('cayó al local'),
        consultar: conNube({ data: [], error: { message: 'permission denied' } })
      }),
      /* El error manda sobre el vacío: si Supabase falló, la causa es la
         consulta, aunque de paso no traiga filas. */
      (e) => e.causa === 'consulta'
    );
  });

// ------------------------------------------------------------- 4. nube vacía
test('nube vacía: LANZA. Cero conceptos es configuración incompleta', async () => {
  const local = localProhibido('EL FALLBACK SILENCIOSO VOLVIO: una base vacía '
    + 'se está disfrazando con el catálogo local');

  await assert.rejects(
    () => resolverCatalogo({
      conNube: true,
      conSesion: true,
      local,
      consultar: conNube({ data: [], error: null })
    }),
    (e) => {
      assert.ok(e instanceof ErrorCatalogo);
      assert.equal(e.causa, 'vacio');
      return true;
    }
  );
  assert.equal(local.llamado, null, local.llamado);
});

test('nube que devuelve null sin error: se trata como vacía', async () => {
  await assert.rejects(
    () => resolverCatalogo({
      conNube: true, conSesion: true,
      local: () => assert.fail('cayó al local'),
      consultar: conNube({ data: null, error: null })
    }),
    (e) => e.causa === 'vacio'
  );
});

// ------------------------------------------------------- el origen es visible
test('el origen queda registrado y permite demostrar qué fuente se usó',
  async () => {
    await resolverCatalogo({
      conNube: true, conSesion: true, local,
      consultar: conNube({ data: [filaNube], error: null })
    });
    assert.equal(origenCatalogo.fuente, 'nube');
    assert.equal(origenCatalogo.filas, 1);
    assert.ok(origenCatalogo.en, 'debe llevar marca de tiempo');

    /* Y cambia al volver al modo local: es lo que hace que una prueba pueda
       DEMOSTRAR la fuente en vez de deducirla de que la pantalla se llenó. */
    await resolverCatalogo({
      conNube: false, conSesion: false, local,
      consultar: () => assert.fail('no debe consultar')
    });
    assert.equal(origenCatalogo.fuente, 'local');
    assert.equal(origenCatalogo.motivo, 'sin-nube');
  });

test('tras un fallo, el origen NO sigue diciendo que la nube respondió bien',
  async () => {
    /* Una resolución buena primero, para que haya algo que quedara viejo. */
    await resolverCatalogo({
      conNube: true, conSesion: true, local,
      consultar: conNube({ data: [filaNube], error: null })
    });
    assert.equal(origenCatalogo.fuente, 'nube');

    await assert.rejects(() => resolverCatalogo({
      conNube: true, conSesion: true, local,
      consultar: conNube({ data: null, error: { message: 'JWT expired' } })
    }));

    /* Si esto fallara, el instrumento de diagnóstico estaría mintiendo con el
       valor del éxito anterior: exactamente el modo de fallo que este módulo
       vino a retirar, mudado a la señal que sirve para detectarlo. */
    assert.equal(origenCatalogo.fuente, 'error');
    assert.equal(origenCatalogo.motivo, 'consulta');
    assert.equal(origenCatalogo.filas, 0);

    await assert.rejects(() => resolverCatalogo({
      conNube: true, conSesion: true, local,
      consultar: conNube({ data: [], error: null })
    }));
    assert.equal(origenCatalogo.fuente, 'error');
    assert.equal(origenCatalogo.motivo, 'vacio');
  });

test('el origen devuelto es una copia, no el objeto que cambia solo', async () => {
  const { origen } = await resolverCatalogo({
    conNube: true, conSesion: true, local,
    consultar: conNube({ data: [filaNube], error: null })
  });
  await resolverCatalogo({
    conNube: false, conSesion: false, local,
    consultar: () => assert.fail('no debe consultar')
  });
  /* Quien guarde el origen de una resolución para registrar de dónde vino un
     catálogo no debe encontrarse con que dice otra cosa más tarde. */
  assert.equal(origen.fuente, 'nube');
  assert.equal(origenCatalogo.fuente, 'local');
});

test('las columnas que se piden son las que se traducen', async () => {
  /* `datos.js` arma el `select` desde COLUMNAS y `deFila` las consume. Si las
     dos listas se separan, quitar una columna del `select` no rompe nada
     visible: `deFila` produciría `Number(undefined)` —NaN— y ese NaN entra a
     las sumas del estimador. Esta prueba ata las dos. */
  assert.deepEqual(COLUMNAS, Object.keys(filaNube));

  const { conceptos } = await resolverCatalogo({
    conNube: true, conSesion: true, local,
    consultar: conNube({ data: [filaNube], error: null })
  });
  for(const [k, v] of Object.entries(conceptos[0])){
    assert.notEqual(v, undefined, `el campo ${k} quedó sin traducir`);
    assert.ok(!Number.isNaN(v), `el campo ${k} quedó en NaN`);
  }
});

// ------------------------------------------------- el mensaje es para leerse
test('los mensajes de error dicen qué revisar', async () => {
  const consulta = new ErrorCatalogo('consulta', { message: 'x' });
  const vacio = new ErrorCatalogo('vacio');
  /* No se comprueba el texto exacto: se comprueba que diga algo distinto en
     cada caso y que no sea un genérico. Los dos fallos piden acciones
     diferentes —revisar la conexión, o cargar el catálogo— y un mensaje que
     no los distinga manda a buscar en el sitio equivocado. */
  assert.notEqual(consulta.message, vacio.message);
  assert.match(vacio.message, /incompleta/i);
  /* Y nombra la RLS: PostgREST devuelve `[]` sin error cuando la política
     filtra las filas, así que «no hay conceptos» y «este rol no los ve» son
     indistinguibles desde el cliente. Un mensaje que solo mande a cargar el
     catálogo manda a cargar algo que quizá ya está cargado. */
  assert.match(vacio.message, /RLS/);
  assert.equal(consulta.name, 'ErrorCatalogo');
});
