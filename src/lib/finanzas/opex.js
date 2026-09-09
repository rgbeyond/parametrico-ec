/* OPEX del proyecto: agregación mensual, anual y por categoría (issue #7).
   ========================================================================

   ALCANCE DECLARADO, PARA QUE NADIE LO LEA DE MÁS
   -----------------------------------------------
   Esto es una lista de gastos mensuales capturados a mano y su suma. No es
   contabilidad: no hay facturas, ni proveedores, ni conciliación, ni histórico
   real de pagos, ni inflación, ni escalamiento por año. El anual es el mensual
   por doce, y punto. Cualquier cifra que salga de aquí es un SUPUESTO del
   proyectista, no un dato validado, y así hay que presentarla.

   Las categorías son las que pidió el issue. No traen monto por omisión: un
   OPEX con números precargados sería exactamente el tipo de cifra inventada
   que este repositorio no admite.

   POR QUÉ EL PROMEDIO ANUAL ES MENSUAL x 12 Y NO OTRA COSA
   --------------------------------------------------------
   Porque no hay perfil mensual capturado. En cuanto lo haya —seguros que se
   pagan una vez al año, mantenimiento por temporada— esta función tendrá que
   cambiar, y entonces el anual dejará de ser un múltiplo. Queda dicho aquí
   para que el día que alguien lo necesite no lo descubra leyendo el número.
*/

/* Categorías de referencia del issue #7, en su orden. Es una lista de arranque
   para que la captura sea rápida y comparable entre proyectos, no una
   taxonomía cerrada del negocio. */
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

/* Un renglón desactivado sigue en la lista y no suma. Es deliberado: en una
   estación por fases conviene tener capturado el gasto que todavía no arranca
   sin que ensucie el total del mes. */
export function resumenOpex(lista = []) {
  const renglones = Array.isArray(lista) ? lista : [];
  const activos = renglones.filter(activo);
  const mensual = activos.reduce((a, r) => a + monto(r), 0);
  const mapa = new Map();
  for (const r of activos) {
    const k = r.categoria || "Otros";
    mapa.set(k, (mapa.get(k) || 0) + monto(r));
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
    anual: mensual * 12,
    porCategoria,
    activos: activos.length,
    renglones: renglones.length,
  };
}
