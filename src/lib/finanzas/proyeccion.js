/* Proyección mensual de operación (issue #7).
   ===========================================

   QUÉ ES ESTO
   -----------
   El motor que convierte los supuestos del proyecto en una serie mensual:
   sesiones, energía vendida, ventas, costo de electricidad, costos variables,
   OPEX fijo y EBITDA. Es una función pura: entra un objeto, sale un arreglo.
   No toca el DOM, no lee `cfg` por su cuenta y no guarda nada. La interfaz
   sólo pinta lo que aquí se calcula.

   QUÉ NO ES
   ---------
   No es un modelo bancable. No hay TIR, VPN, deuda, impuestos, depreciación ni
   distribución de flujo, y no los habrá aquí hasta que alguien lo pida con un
   alcance escrito. Tampoco hay simulación horaria: el almacenamiento no
   despacha mes a mes en este motor —ver la limitación declarada más abajo—.

   LAS DECISIONES QUE HAY QUE CONOCER PARA LEER UNA CIFRA
   ------------------------------------------------------

   1. TODO ESCALA POR ANIVERSARIO DEL INICIO DE OPERACIÓN, no por año
      calendario. El año de operación de un mes es `floor(mes / 12)` con el
      primer mes en cero, y cada tasa entra como `(1 + tasa)^año`: un escalón
      por aniversario, no una capitalización mensual. Con año calendario, una
      estación que abre en septiembre recibiría el aumento completo en su
      cuarto mes de vida.

   2. EL COSTO DE ELECTRICIDAD NO ES SÓLO ENERGÍA. Lleva tres piezas:
      energía comprada por su costo unitario, los cargos de capacidad y
      distribución aplicados a la demanda facturable, y el cargo fijo. Dejar
      fuera los cargos de demanda —que se cobran por kW y no por kWh—
      subestimaría el costo de una electrolinera de forma grosera: a los
      cargos de la división Centro Sur son del orden de $572 por kW al mes.

   3. LA DEMANDA FACTURABLE ES LA MENOR entre la máxima declarada del escenario
      y el término calculado `Q / (24 × d × F.C.)`, que es la regla de la
      tarifa que la aplicación ya usa en el tablero de escenarios. Aquí se
      aplica la misma. **Simplificación declarada:** la tarifa distingue la
      demanda de punta (cargo de capacidad) de la máxima mensual (cargo de
      distribución); este motor usa una sola demanda facturable para los dos,
      porque sin perfil horario no hay forma de separarlas.

   4. EL BALANCEO NO RECORTA ENERGÍA POR UN PORCENTAJE INVENTADO. Lo único que
      se aplica es un techo físico: una estación no puede entregar en un día
      más energía que su demanda de diseño por 24 horas. Cuando la demanda del
      escenario excede ese techo, la diferencia se reporta en su propia columna
      en vez de desaparecer. En la mayoría de los casos ese castigo es cero, y
      eso es correcto: la reserva de balanceo limita potencia simultánea, no
      energía diaria.

   5. EL ALMACENAMIENTO NO APARECE EN LA SERIE. El tablero de escenarios ya
      calcula su efecto —recorte de pico y arbitraje— con la información
      disponible, pero llevarlo a una serie mensual exige un despacho horario
      que este motor no hace y que el issue pide expresamente no construir
      todavía. Consecuencia: en un proyecto con BESS, el costo de electricidad
      proyectado es CONSERVADOR.

   6. LA GENERACIÓN FOTOVOLTAICA SE RESTA DE LA ENERGÍA COMPRADA, suponiendo
      que toda desplaza consumo propio. Es el mismo supuesto optimista que ya
      declara el tablero de escenarios: sin perfil horario no se puede separar
      autoconsumo de excedente exportado.

   7. EL COSTO UNITARIO DEL MEM SE DERIVA DEL DE CFE con el ahorro declarado.
      No hay una curva de mercado capturada: `costoMEM = costoCFE × (1 −
      ahorro)`, y el ahorro es un supuesto editable del proyecto porque el
      material de referencia se contradice entre 10% y 15%.
*/

/* 365/12, el mismo promedio que usa el resto de la aplicación. */
export const DIAS_MES = 30.4;
export const MESES_NOMBRE = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

import { montoEnMes, resumenVariables } from "./opex.js";

const n = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

/* "AAAA-MM" a {anio, mes} con mes base cero. Devuelve null si no se puede
   leer: la proyección entonces arranca en el mes que le indique quien la
   llama, y la interfaz avisa que falta capturar la fecha. */
export function leerMes(txt) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(txt || "").trim());
  if (!m) return null;
  const anio = +m[1]; const mes = +m[2] - 1;
  if (mes < 0 || mes > 11 || anio < 1900 || anio > 2999) return null;
  return { anio, mes };
}

const sumaMeses = (base, k) => {
  const total = base.anio * 12 + base.mes + k;
  return { anio: Math.floor(total / 12), mes: ((total % 12) + 12) % 12 };
};

/* Distancia en meses entre dos {anio, mes}. Negativa si el segundo es
   anterior. */
const distancia = (a, b) => (b.anio * 12 + b.mes) - (a.anio * 12 + a.mes);

/* Sesiones por día del mes `m`. La rampa lleva del arranque al objetivo del
   escenario en `rampaMeses`; a partir de ahí manda el objetivo, y ambos
   crecen por aniversario con la tasa declarada. Sin rampa capturada, la
   estación arranca directo en el objetivo del escenario. */
export function sesionesEnMes(m, { sesionesIni = 0, objetivo = 0, rampaMeses = 0,
  crecSesiones = 0 } = {}) {
  const anio = Math.floor(Math.max(0, m) / 12);
  const g = (1 + n(crecSesiones) / 100) ** anio;
  if (rampaMeses > 0 && m < rampaMeses) {
    const ini = n(sesionesIni);
    const paso = (n(objetivo) - ini) / rampaMeses;
    return Math.max(0, (ini + paso * (m + 1)) * g);
  }
  return Math.max(0, n(objetivo) * g);
}

/* El costo unitario variable de la energía, en $/kWh, para el mes `m`. */
export function costoUnitario(m, { costoCFE = 0, incCFE = 0, incMEM = 0,
  ahorroMem = 0, enMem = false } = {}) {
  const anio = Math.floor(Math.max(0, m) / 12);
  if (enMem) {
    return n(costoCFE) * (1 - n(ahorroMem) / 100) * ((1 + n(incMEM) / 100) ** anio);
  }
  return n(costoCFE) * ((1 + n(incCFE) / 100) ** anio);
}

/* El costo unitario de CFE que sale de la tarifa capturada: el reparto por
   periodo horario aplicado a los cargos de energía, más los otros cargos por
   kWh. Si el reparto no suma 100 se normaliza por su suma en vez de producir
   una cifra sin sentido; la pantalla de tarifa ya avisa del desajuste. */
export function costoCFEDeTarifa({ pctPunta = 0, pctInterm = 0, pctBase = 0,
  enPunta = 0, enInterm = 0, enBase = 0, otrosKwh = 0 } = {}) {
  const p = n(pctPunta); const i = n(pctInterm); const b = n(pctBase);
  const suma = p + i + b;
  if (suma <= 0) return 0;
  const mezcla = (p * n(enPunta) + i * n(enInterm) + b * n(enBase)) / suma;
  return mezcla + n(otrosKwh);
}

/* --- el motor ------------------------------------------------------------ */

export function proyectar({
  ctrl = {},
  opex = [],
  variables = [],
  // Del escenario seleccionado, tal como está capturado en `cfg`.
  escenario = { sesiones: 0, kwhSesion: 0, dmax: 0 },
  // De la tarifa capturada en `cfg`, ya resumida.
  tarifa = { costoCFE: 0, cargoCap: 0, cargoDist: 0, cargoFijo: 0, fc: 0.57 },
  // `true` cuando el proyecto declara suministro calificado desde el arranque.
  memInicial = false,
  // Generación fotovoltaica en kWh por mes. Un número, o doce.
  generacion = 0,
  // Demanda de diseño en kW: el techo físico de energía diaria.
  potDiseno = 0,
  meses = 12,
  hoy = new Date(),
} = {}) {
  const ipc = n(ctrl.ipc);
  const uptime = Math.max(0, Math.min(100, n(ctrl.uptime, 100))) / 100;
  const perdidas = Math.max(0, Math.min(90, n(ctrl.perdidas))) / 100;
  const vars = resumenVariables(variables);
  const inicio = leerMes(ctrl.inicio)
    || { anio: hoy.getFullYear(), mes: hoy.getMonth() };
  const cambio = leerMes(ctrl.cambioMem);
  const mesCambio = cambio ? distancia(inicio, cambio) : null;
  const fc = n(tarifa.fc, 0.57) || 0.57;
  const genMes = (k) => (Array.isArray(generacion)
    ? n(generacion[k % 12]) : n(generacion));
  const techoDia = n(potDiseno) > 0 ? n(potDiseno) * 24 : Infinity;

  const serie = [];
  for (let m = 0; m < Math.max(0, meses); m++) {
    const anio = Math.floor(m / 12);
    const fecha = sumaMeses(inicio, m);

    const sesiones = sesionesEnMes(m, {
      sesionesIni: ctrl.sesionesIni, objetivo: escenario.sesiones,
      rampaMeses: ctrl.rampaMeses, crecSesiones: ctrl.crecSesiones,
    });
    const kwhSesion = n(escenario.kwhSesion);
    const kwhDiaBruto = sesiones * kwhSesion * uptime;
    const kwhDia = Math.min(kwhDiaBruto, techoDia);
    // Lo que el techo físico dejó fuera. Casi siempre cero, y eso está bien.
    const castigoDia = Math.max(0, kwhDiaBruto - kwhDia);
    const kwhMes = kwhDia * DIAS_MES;

    const promoVigente = n(ctrl.mesesPromo) > 0 && m < n(ctrl.mesesPromo)
      && n(ctrl.precioPromo) > 0;
    const precioBase = promoVigente ? n(ctrl.precioPromo) : n(ctrl.precioKwh);
    const precio = precioBase * ((1 + n(ctrl.incPrecio) / 100) ** anio);
    const ventas = kwhMes * precio;

    const enMem = !!memInicial || (mesCambio !== null && m >= mesCambio);
    const costoKwh = costoUnitario(m, {
      costoCFE: tarifa.costoCFE, incCFE: ctrl.incCFE, incMEM: ctrl.incMEM,
      ahorroMem: ctrl.ahorroMem, enMem,
    });
    /* Comprada = vendida más pérdidas, menos lo que genera el sol. Las
       pérdidas son de la instalación: la energía que entra por el medidor es
       mayor que la que sale por el dispensador. */
    const kwhEntregado = perdidas < 1 ? kwhMes / (1 - perdidas) : kwhMes;
    const kwhPerdido = kwhEntregado - kwhMes;
    /* La generación sólo puede desplazar lo que la estación consume. Lo que
       sobra se reporta en su propio renglón en lugar de desaparecer: es
       energía que se exporta y que este modelo NO acredita ni vende, porque
       el excedente se paga a otro valor y eso no está capturado. En una
       estación que arranca con rampa y con un arreglo grande, ese excedente
       es la mayor parte del año uno. */
    const gen = genMes(fecha.mes);
    const genUsada = Math.min(gen, kwhEntregado);
    const excedenteFV = gen - genUsada;
    const kwhComprado = Math.max(0, kwhEntregado - genUsada);
    const costoEnergia = kwhComprado * costoKwh;

    /* Demanda facturable: la menor entre la máxima declarada del escenario y
       el término calculado de la tarifa. Sin máxima declarada manda el
       calculado, que es lo que hace la propia tarifa. */
    const dCalc = kwhComprado / (24 * DIAS_MES * fc);
    const dmax = n(escenario.dmax);
    const demandaFact = dmax > 0 ? Math.min(dmax, dCalc) : dCalc;
    const factorCFE = (1 + n(ctrl.incCFE) / 100) ** anio;
    const cargosDemanda = demandaFact * (n(tarifa.cargoCap) + n(tarifa.cargoDist))
      * factorCFE;
    const cargoFijo = n(tarifa.cargoFijo) * factorCFE;
    const costoElectricidad = costoEnergia + cargosDemanda + cargoFijo;

    const utilidadBruta = ventas - costoElectricidad;
    const costoVariable = ventas * vars.pctTotal / 100;
    const opexFijo = opex.reduce((a, r) => a + montoEnMes(r, m, ipc), 0);
    const egresos = costoElectricidad + costoVariable + opexFijo;
    const ebitda = ventas - egresos;

    serie.push({
      m,
      anioOperacion: anio,
      anio: fecha.anio,
      mesNum: fecha.mes,
      etiqueta: `${MESES_NOMBRE[fecha.mes]} ${fecha.anio}`,
      sesionesDia: sesiones,
      kwhSesion,
      uptime: uptime * 100,
      castigoKwhDia: castigoDia,
      kwhDia,
      kwhMes,
      precio,
      promo: promoVigente,
      ventas,
      suministrador: enMem ? "MEM" : "CFE",
      costoKwh,
      kwhPerdido,
      generacion: genUsada,
      excedenteFV,
      kwhComprado,
      costoEnergia,
      demandaFact,
      cargosDemanda: cargosDemanda + cargoFijo,
      costoElectricidad,
      utilidadBruta,
      costoVariable,
      opexFijo,
      egresos,
      ebitda,
      margen: ventas > 0 ? ebitda / ventas : 0,
    });
  }
  return serie;
}

/* Agrega una serie mensual. Los montos se suman; los unitarios se recalculan
   del agregado —precio promedio es ventas entre kWh, no el promedio de los
   doce precios—, que es la única forma de que el renglón anual cuadre con sus
   meses. */
export function agregar(serie = []) {
  const s = Array.isArray(serie) ? serie : [];
  const suma = (k) => s.reduce((a, x) => a + n(x[k]), 0);
  const kwhMes = suma("kwhMes");
  const kwhComprado = suma("kwhComprado");
  const ventas = suma("ventas");
  const costoEnergia = suma("costoEnergia");
  const costoElectricidad = suma("costoElectricidad");
  const egresos = suma("egresos");
  const ebitda = ventas - egresos;
  return {
    meses: s.length,
    anio: s.length ? s[0].anio : null,
    sesionesDia: s.length ? suma("sesionesDia") / s.length : 0,
    kwhMes,
    kwhComprado,
    kwhPerdido: suma("kwhPerdido"),
    generacion: suma("generacion"),
    excedenteFV: suma("excedenteFV"),
    castigoKwhDia: suma("castigoKwhDia"),
    precio: kwhMes > 0 ? ventas / kwhMes : 0,
    ventas,
    costoKwh: kwhComprado > 0 ? costoEnergia / kwhComprado : 0,
    costoEnergia,
    cargosDemanda: suma("cargosDemanda"),
    costoElectricidad,
    utilidadBruta: suma("utilidadBruta"),
    costoVariable: suma("costoVariable"),
    opexFijo: suma("opexFijo"),
    egresos,
    ebitda,
    margen: ventas > 0 ? ebitda / ventas : 0,
  };
}

/* Los años calendario que toca la proyección, para el selector de la
   pantalla. */
export function aniosDeSerie(serie = []) {
  return [...new Set((serie || []).map((x) => x.anio))].sort((a, b) => a - b);
}

/* Un resumen por año calendario, que es lo que consume la vista de
   inversionista. */
export function resumenPorAnio(serie = []) {
  return aniosDeSerie(serie).map((anio) => ({
    anio, ...agregar(serie.filter((x) => x.anio === anio)),
  }));
}
