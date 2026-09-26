/* Plantilla de conceptos de OPEX (issue #7).
   ==========================================

   DE DÓNDE SALE ESTA LISTA
   ------------------------
   De la estructura del modelo financiero de referencia de Ecatepec/Atlacomulco
   que revisó RG, no de una taxonomía inventada. Es la lista de CONCEPTOS que
   ese modelo contempla para operar una estación; **no trae ni un solo monto**.

   Esa distinción es la que hace que la plantilla sea legítima: los nombres de
   los renglones son estructura del negocio y se pueden defender; los montos
   son datos de un proyecto concreto y tendrían que capturarse con su sustento.
   Una plantilla que llegara con cifras precargadas convertiría el supuesto de
   otro proyecto en el número por omisión de todos.

   SÓLO SE APLICA CUANDO ALGUIEN LA PIDE
   -------------------------------------
   No se materializa al abrir un proyecto. La interfaz ofrece «Usar plantilla
   OPEX» y hasta ese clic el proyecto sigue sin `estado.finanzas`.

   INCREMENTO ANUAL
   ----------------
   Todos arrancan en «IPC del proyecto», que es lo que pide el issue. El IPC
   del proyecto es a su vez un supuesto capturable que arranca en cero: la
   plantilla no introduce una tasa de inflación inventada por la puerta de
   atrás.
*/

import { renglonOpexNuevo } from "./estado.js";

/* Concepto y categoría. La categoría es la del catálogo de categorías de OPEX
   que ya existía en la sección; sirve para el reparto por categoría y no
   cambia el cálculo. */
export const PLANTILLA_OPEX = [
  ["Sueldo Encargado(s)", "Personal"],
  ["Sueldo Supervisor", "Personal"],
  ["Contador", "Administración"],
  ["Guardias Seguridad", "Seguridad"],
  ["Publicidad", "Marketing"],
  ["Internet", "Servicios / conectividad"],
  ["Agua", "Servicios / conectividad"],
  ["Renta", "Renta / predial"],
  ["Predial", "Renta / predial"],
  ["Papelería", "Administración"],
  ["Despensa", "Personal"],
  ["Seguros y Fianzas", "Seguros"],
  ["Otros", "Otros"],
];

export function opexDePlantilla() {
  return PLANTILLA_OPEX.map(([concepto, categoria]) => renglonOpexNuevo({
    concepto, categoria, monto: 0, activo: true, inc: { modo: "ipc", tasa: 0 },
  }));
}
