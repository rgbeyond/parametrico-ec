/* Inversionistas: participación y brecha de fondeo (issue #7).
   ============================================================

   QUÉ ES UNA PARTICIPACIÓN AQUÍ, Y QUÉ NO ES
   ------------------------------------------
   Participación = aportación del inversionista entre el capital APORTADO
   TOTAL, no entre el CAPEX requerido. La diferencia importa y no es sutil:

   - Sobre el aportado, las participaciones suman 100% desde el primer peso, y
     lo que falta por fondear se reporta aparte, en su propio renglón.
   - Sobre el CAPEX, un proyecto fondeado a medias mostraría participaciones
     que suman 50% y el resto quedaría en el aire, como si hubiera un socio
     invisible.

   Se toma la primera porque es la que pidió el issue y la que se puede
   defender: reparte lo que existe. Pero hay que decir en voz alta lo que NO
   significa: **no es una tabla accionaria**. Una participación societaria real
   depende del acta constitutiva, del tipo de acciones, de las aportaciones en
   especie y del acuerdo de socios; nada de eso vive en esta herramienta. Lo
   que hay aquí es la proporción del dinero puesto, y así debe presentarse.

   LO QUE ESTA P0 NO CALCULA
   -------------------------
   Sin retornos, sin TIR, sin VPN, sin deuda, sin impuestos, sin depreciación y
   sin distribución de flujo. Esas cifras dependen de ingresos que este
   instrumento todavía no modela, y publicarlas antes sería inventarlas.
*/

const activo = (x) => x && x.activo !== false;
const aporte = (x) => (Number.isFinite(+x?.aportacion) && +x.aportacion > 0 ? +x.aportacion : 0);

/* `capexRequerido` es la inversión total que ya calculó el proyecto. Este
   módulo NO la calcula ni la puede modificar: llega como argumento. */
export function resumenInversionistas(lista = [], capexRequerido = 0) {
  const todos = Array.isArray(lista) ? lista : [];
  const activos = todos.filter(activo);
  const capex = Number.isFinite(+capexRequerido) && +capexRequerido > 0 ? +capexRequerido : 0;
  const aportado = activos.reduce((a, x) => a + aporte(x), 0);
  const participantes = activos.map((x) => ({
    id: x.id,
    nombre: x.nombre || "Sin nombre",
    aportacion: aporte(x),
    // Sin capital aportado no hay reparto que calcular.
    participacion: aportado > 0 ? aporte(x) / aportado : 0,
  })).sort((a, b) => b.aportacion - a.aportacion);
  return {
    capexRequerido: capex,
    aportado,
    // Faltante y excedente son excluyentes: uno de los dos siempre es cero.
    faltante: Math.max(0, capex - aportado),
    excedente: Math.max(0, aportado - capex),
    // Sin CAPEX no hay nada que cubrir; se reporta cero y no infinito.
    cobertura: capex > 0 ? aportado / capex : 0,
    participantes,
    sumaParticipaciones: participantes.reduce((a, x) => a + x.participacion, 0),
    activos: activos.length,
    inactivos: todos.length - activos.length,
  };
}
