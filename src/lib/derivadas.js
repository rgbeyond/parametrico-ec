/* Derivaciones de la configuración del proyecto.
   ==============================================

   POR QUÉ ESTO VIVE APARTE
   ------------------------
   Estas siete funciones estaban dentro de `app.js`, que se monta solo al
   importarse: cualquier otra pantalla que las necesitara tenía que arrancar el
   estimador completo, o copiarlas. El portal de inversionistas necesita contar
   equipos, puntos y potencia, así que la alternativa era duplicarlas, y una
   regla duplicada acaba divergiendo —es exactamente lo que este repositorio
   evita en el resto de sus cifras—.

   Son puras y no tocan el DOM: `app.js` las importa y el portal también, así
   que las dos pantallas dicen lo mismo por construcción.

   NO SON EL MOTOR DE COSTOS. Aquí no se calcula ni un peso: el CAPEX sale de
   `totals()` en `app.js` y nadie más lo reconstruye.
*/

/* Sólo los tipos de cargador con cantidad mayor que cero. */
export const grp = (g) => (g.grupos || []).filter((x) => x.q > 0);

export const nEvse = (g) => grp(g).reduce((a, b) => a + +b.q, 0);
export const potEvse = (g) => grp(g).reduce((a, b) => a + +b.kw * +b.q, 0);
export const nCon = (g) => grp(g).reduce((a, b) => a + +b.con * +b.q, 0);

/* Demanda de diseño: la potencia que la estación puede tomar de la red al
   mismo tiempo. Con balanceo dinámico se reserva un porcentaje de la carga
   instalada que el sistema de gestión recorta en el pico, o que cubre el
   almacenamiento, así que la acometida y el transformador se dimensionan
   contra la diferencia y no contra la suma de placas. Tiene consecuencia
   operativa: en el pico los vehículos cargan más lento. */
export const potDis = (g) => (g.balanceo
  ? potEvse(g) * (1 - (+g.balanceoPct || 0) / 100)
  : potEvse(g));

/* Piso de la demanda contratada ante el suministrador, en kW. La tarifa GDMTH
   la deja a voluntad del usuario pero le fija un piso (apartado 4): no menor
   al 60% de la carga total conectada ni menor a 100 kW. Aquí la carga
   conectada se toma como la potencia de los equipos de carga, que es la que
   domina en una electrolinera; si el sitio tiene otras cargas conectadas el
   piso real es mayor y hay que capturarlo a mano. Importa porque el depósito
   en garantía se calcula sobre esta cifra, no sobre la capacidad del
   transformador, y por eso un proyecto por fases puede contratar menos y
   reducir el depósito. */
export const pisoDemCon = (g) => Math.max(100, potEvse(g) * 0.60);

export const demCon = (g) => (+g.demCon > 0 ? +g.demCon : pisoDemCon(g));
