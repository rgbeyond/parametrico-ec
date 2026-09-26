/* OPEX del proyecto: agregación, reparto y escalamiento anual (issue #7).
   =======================================================================

   ALCANCE DECLARADO, PARA QUE NADIE LO LEA DE MÁS
   -----------------------------------------------
   Esto es una lista de gastos mensuales capturados a mano, su suma y una regla
   de incremento anual por renglón. No es contabilidad: no hay facturas, ni
   proveedores, ni conciliación, ni histórico real de pagos. Cualquier cifra
   que salga de aquí es un SUPUESTO del proyectista, no un dato validado.

   Las categorías son de arranque para que la captura sea comparable entre
   proyectos, y no traen monto por omisión.

   DOS ESPECIES DE COSTO, Y NO SE MEZCLAN
   --------------------------------------
   - **OPEX fijo o semifijo**: un monto al mes. Sueldos, renta, seguros.
   - **Costo variable sobre ventas**: un porcentaje de los ingresos. La
     comisión de la concesionaria del modelo de referencia es de esta especie.
   Sumarlos en un solo total escondería que el segundo escala con el negocio y
   el primero no, que es justo la diferencia que importa al ver un EBITDA.

   ESCALAMIENTO: POR ANIVERSARIO, NO POR AÑO CALENDARIO
   ----------------------------------------------------
   El incremento se aplica en el aniversario del inicio de operación. La
   alternativa —enero de cada año— le daría un aumento completo en el cuarto
   mes a una estación que abrió en septiembre, que es un salto artificial. El
   año de operación de un renglón es `floor(mes / 12)`, contando el primer mes
   como cero, y el factor es `(1 + tasa)^año`: un escalón por aniversario, no
   una capitalización mensual.
*/

/* Categorías de referencia, en su orden. Es una lista de arranque para que la
   captura sea rápida y comparable, no una taxonomía cerrada del negocio. */
export const CATEGORIAS_OPEX = [
  "Personal",
  "Renta / predial",
  "Seguridad",
  "Servicios / conectividad",
  "Mantenimiento",
  "Seguros",
  "Marketing",
  "Administración",
  "Otros",
];

const activo = (r) => r && r.activo !== false;
const monto = (r) => (Number.isFinite(+r?.monto) && +r.monto > 0 ? +r.monto : 0);
const pct = (r) => (Number.isFinite(+r?.pct) && +r.pct > 0 ? +r.pct : 0);

/* La tasa que de verdad se le aplica a un renglón, ya resuelta contra el IPC
   del proyecto. La interfaz la muestra: un renglón que dice «IPC» sin enseñar
   el número obliga a ir a buscarlo a otra pantalla. */
export function tasaEfectiva(renglon, ipcProyecto = 0) {
  const inc = renglon?.inc || {};
  if (inc.modo === "ninguno") return 0;
  if (inc.modo === "propia") return Number.isFinite(+inc.tasa) ? +inc.tasa : 0;
  return Number.isFinite(+ipcProyecto) ? +ipcProyecto : 0;
}

/* El monto de un renglón en el mes `mes` (base cero = primer mes de
   operación), ya escalado. */
export function montoEnMes(renglon, mes = 0, ipcProyecto = 0) {
  if (!activo(renglon)) return 0;
  const anio = Math.floor(Math.max(0, mes) / 12);
  const tasa = tasaEfectiva(renglon, ipcProyecto) / 100;
  return monto(renglon) * ((1 + tasa) ** anio);
}

/* Un renglón desactivado sigue en la lista y no suma. Es deliberado: en una
   estación por fases conviene tener capturado el gasto que todavía no arranca
   sin que ensucie el total del mes. `mes` permite pedir el resumen de un mes
   futuro, ya escalado; por omisión es el mes uno de operación. */
export function resumenOpex(lista = [], { mes = 0, ipc = 0 } = {}) {
  const renglones = Array.isArray(lista) ? lista : [];
  const activos = renglones.filter(activo);
  const valor = (r) => montoEnMes(r, mes, ipc);
  const mensual = activos.reduce((a, r) => a + valor(r), 0);
  const mapa = new Map();
  for (const r of activos) {
    const k = r.categoria || "Otros";
    mapa.set(k, (mapa.get(k) || 0) + valor(r));
  }
  const porCategoria = [...mapa.entries()]
    .filter(([, v]) => v > 0)
    .map(([categoria, m]) => ({
      categoria,
      mensual: m,
      anual: m * 12,
      // Sin gasto no hay reparto: el porcentaje sería una división entre cero.
      pct: mensual > 0 ? m / mensual : 0,
    }))
    .sort((a, b) => b.mensual - a.mensual);
  return {
    mensual,
    /* Anual del año en curso: doce veces el mensual de ESE año. Dentro de un
       año de operación no hay escalón, así que multiplicar por doce es exacto;
       entre años, cada uno tiene su propio mensual. */
    anual: mensual * 12,
    porCategoria,
    activos: activos.length,
    renglones: renglones.length,
  };
}

/* Costos variables: sólo el porcentaje agregado. El monto depende de las
   ventas del mes y por eso lo calcula la proyección, no este módulo. */
export function resumenVariables(lista = []) {
  const todos = Array.isArray(lista) ? lista : [];
  const activos = todos.filter(activo);
  const conceptos = activos.map((r) => ({
    id: r.id, concepto: r.concepto || "Sin nombre", pct: pct(r),
  }));
  return {
    conceptos,
    pctTotal: conceptos.reduce((a, r) => a + r.pct, 0),
    activos: activos.length,
    renglones: todos.length,
  };
}
