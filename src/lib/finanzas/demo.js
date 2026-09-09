/* Datos de demostración para la vista previa (issue #7).
   ======================================================

   ESTO NO ES UN VALOR POR OMISIÓN Y NO DEBE CONVERTIRSE EN UNO
   -------------------------------------------------------------
   Un proyecto nuevo arranca con Finanzas VACÍAS. Estas cifras existen para una
   sola cosa: que RG pueda abrir la Deploy Preview y ver las cuatro pantallas
   con contenido, en vez de cuatro tablas en blanco. Se cargan sólo cuando
   alguien presiona el botón, y el estado que producen queda marcado con
   `demo: true`, que la interfaz convierte en un aviso visible en las cuatro
   pantallas —la de inversionista incluida— hasta que se quita.

   Los montos son inventados y no salen de ningún proyecto real. Los nombres
   son letras a propósito: el archivo de referencia de RG trae personas reales
   y ninguna de ellas tiene por qué acabar escrita en el repositorio.

   Si algún día estas cifras hicieran falta como punto de partida real, el
   camino no es cambiarles la etiqueta: es capturarlas en un proyecto, con su
   sustento, como se hace con cualquier otro número de esta herramienta.
*/

import { VERSION_FINANZAS, idNuevo } from "./estado.js";

const OPEX_DEMO = [
  ["Operación y atención en sitio", "Personal", 120000],
  ["Arrendamiento del predio y predial", "Renta / predial", 45000],
  ["Vigilancia y monitoreo", "Seguridad", 35000],
  ["Enlace de datos y servicios generales", "Servicios / conectividad", 18000],
  ["Mantenimiento preventivo de equipos de carga", "Mantenimiento", 60000],
  ["Póliza de responsabilidad civil y daños", "Seguros", 22000],
  ["Promoción y programa de usuarios", "Marketing", 15000],
  ["Administración y contabilidad del vehículo del proyecto", "Administración", 40000],
];

const INVERSIONISTAS_DEMO = [
  ["Inversionista A", 12000000],
  ["Inversionista B", 8000000],
  ["Inversionista C", 5000000],
];

export function finanzasDemo() {
  return {
    v: VERSION_FINANZAS,
    demo: true,
    opex: OPEX_DEMO.map(([concepto, categoria, monto]) => ({
      id: idNuevo("opex"), concepto, categoria, monto, activo: true,
    })),
    inversionistas: INVERSIONISTAS_DEMO.map(([nombre, aportacion]) => ({
      id: idNuevo("inv"), nombre, aportacion, activo: true,
    })),
    notas: "Datos de demostración. Los montos de operación y las aportaciones "
      + "son inventados para mostrar la pantalla y no corresponden a ningún "
      + "proyecto real.",
  };
}
