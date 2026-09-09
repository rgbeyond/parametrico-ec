/* Modelo de referencia para demostración (issue #7).
   ==================================================

   ESTO NO ES UN VALOR POR OMISIÓN Y NO SE GUARDA SOLO
   ---------------------------------------------------
   Un proyecto nuevo arranca con Finanzas VACÍAS. Estas cifras existen para que
   RG pueda abrir la vista previa y recorrer las pantallas con contenido en vez
   de con tablas en blanco.

   La interfaz las carga en un **modo demostración temporal**: viven en memoria
   de la pantalla, no entran al estado del proyecto y no se guardan. Sólo pasan
   a ser datos del proyecto si alguien lo pide explícitamente y confirma. El
   estado que produce esa conversión queda marcado con `demo: true`, y ese
   aviso viaja hasta dentro de la hoja de inversionista.

   La versión anterior de esta pantalla tenía un botón que escribía los datos
   demo directo en el proyecto. Eso estaba mal y por eso se cambió: unas cifras
   inventadas guardadas en silencio dentro de un proyecto real son
   indistinguibles de datos capturados en cuanto pasa una semana.

   DE DÓNDE SALEN LOS NÚMEROS
   --------------------------
   Son cifras coherentes con el orden de magnitud del modelo financiero de
   referencia que revisó RG, no una copia de él, y ninguna está validada. Los
   nombres de inversionista son letras a propósito: el archivo de referencia
   trae personas reales y ninguna tiene por qué acabar escrita en este
   repositorio.

   Los porcentajes de comisión de concesionaria y de O&M viven SÓLO aquí. No
   son constantes del producto: en un proyecto real se capturan.
*/

import { VERSION_FINANZAS, idNuevo, ctrlNuevo } from "./estado.js";

const OPEX_DEMO = [
  ["Sueldo Encargado(s)", "Personal", 42000],
  ["Sueldo Supervisor", "Personal", 28000],
  ["Contador", "Administración", 9000],
  ["Guardias Seguridad", "Seguridad", 35000],
  ["Publicidad", "Marketing", 15000],
  ["Internet", "Servicios / conectividad", 3500],
  ["Agua", "Servicios / conectividad", 1800],
  ["Renta", "Renta / predial", 45000],
  ["Predial", "Renta / predial", 6000],
  ["Papelería", "Administración", 1500],
  ["Despensa", "Personal", 4000],
  ["Seguros y Fianzas", "Seguros", 18000],
  ["Otros", "Otros", 8000],
];

/* Costos variables sobre ventas. El material de referencia contempla una
   comisión de concesionaria y un fee de O&M de esta especie. Los valores viven
   sólo en el modo demostración. */
const VARIABLES_DEMO = [
  ["Comisiones Concesionaria", 15],
  ["Fee de O&M", 7],
];

const INVERSIONISTAS_DEMO = [
  ["Inversionista A", 12000000],
  ["Inversionista B", 8000000],
  ["Inversionista C", 5000000],
];

/* Escenario de consumo para la demostración.
   ------------------------------------------
   Los escenarios de consumo viven en `cfg`, no en `finanzas`, y el modo
   demostración NO escribe en `cfg`: tocar la configuración del proyecto para
   enseñar una pantalla sería exactamente lo que este modo existe para evitar.

   La plantilla de Atlacomulco no trae escenarios capturados, así que sin esto
   la proyección saldría en ceros y la demostración no demostraría nada. Este
   escenario se usa ÚNICAMENTE en modo demostración y sólo cuando el escenario
   elegido del proyecto está vacío; en cuanto el proyecto capture el suyo,
   manda el del proyecto. La pantalla lo dice cuando está en uso. */
export const ESCENARIO_DEMO = {
  nombre: "Escenario de demostración",
  sesiones: 24,
  kwhSesion: 45,
  dmax: 900,
};

export function finanzasDemo() {
  return {
    v: VERSION_FINANZAS,
    demo: true,
    ctrl: ctrlNuevo({
      inicio: "2027-01",
      horizonte: 10,
      ipc: 4.5,
      precioKwh: 8.5,
      precioPromo: 6.9,
      mesesPromo: 6,
      incPrecio: 4,
      uptime: 97,
      perdidas: 3,
      escenario: 2,
      sesionesIni: 6,
      rampaMeses: 12,
      crecSesiones: 8,
      incCFE: 5,
      incMEM: 4,
      ahorroMem: 12,
      cambioMem: "2028-01",
    }),
    opex: OPEX_DEMO.map(([concepto, categoria, monto]) => ({
      id: idNuevo("opex"), concepto, categoria, monto, activo: true,
      inc: { modo: "ipc", tasa: 0 },
    })),
    variables: VARIABLES_DEMO.map(([concepto, pct]) => ({
      id: idNuevo("var"), concepto, pct, activo: true,
    })),
    inversionistas: INVERSIONISTAS_DEMO.map(([nombre, aportacion]) => ({
      id: idNuevo("inv"), nombre, aportacion, activo: true,
    })),
    notas: "Datos de demostración. Los supuestos de operación, el gasto y las "
      + "aportaciones son inventados para mostrar la pantalla y no "
      + "corresponden a ningún proyecto real.",
  };
}
