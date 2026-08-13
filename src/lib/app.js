/* Núcleo del estimador. Extraído del prototipo de un solo archivo.
   Pendiente de refactor: separar en módulos de interfaz por pestaña. */
import logoUrl from '../assets/logos/beyond-orange.png';
import { FONT_CSS } from './fuentes.js';
import { DB } from './almacenamiento.js';
const LOGO_URL=logoUrl;
document.documentElement.style.setProperty('--logo',`url("${logoUrl}")`);

const S={validado:1,fuente:.75,supuesto:.35,allowance:0};
const TAXN={validado:"Dato validado",fuente:"Estimación con fuente",supuesto:"Supuesto",allowance:"Sin base de precio"};
const RNG={validado:[-3,5],fuente:[-10,15],supuesto:[-20,35],allowance:[-30,70]};
const COL={validado:"#4ADE80",fuente:"#82D7FB",supuesto:"#FBBF24",allowance:"#F87171"};
const CLASES=[
{c:5,idd:0,nom:"Propuesta conceptual",lo:-35,hi:65,cont:25,use:"Orden de magnitud. No debe usarse para comprometer un precio."},
{c:4,idd:.40,nom:"Propuesta preliminar / presupuestal",lo:-22,hi:35,cont:18,use:"Sirve para evaluar viabilidad y conseguir presupuesto."},
{c:3,idd:.60,nom:"Propuesta técnico-económica",lo:-15,hi:20,cont:12,use:"Presupuesto y autorización de inversión."},
{c:2,idd:.78,nom:"Propuesta definitiva / licitación",lo:-10,hi:12,cont:7,use:"Nivel adecuado para comprometer precio."},
{c:1,idd:.92,nom:"Ingeniería de detalle / precio contractual",lo:-5,hi:8,cont:4,use:"Construcción, control y contratación."}
];
const CATN={DPL:"Diseño, ingeniería, permisos y licencias",LEG:"Legal y corporativo",CFE:"Suministrador y trámites de red",MT:"Media tensión y transformación",BT:"Instalación eléctrica en baja tensión",INS:"Mano de obra e instalación",TIE:"Sistema de puesta a tierra",EVSE:"Equipos de carga",SFV:"Sistema fotovoltaico",GE:"Gestión de energía y almacenamiento",TEL:"Telecomunicaciones y seguridad",OC:"Obra civil",PC:"Protección civil",MED:"Medición",SB:"Señalización y branding",SDE:"Sala de espera"};
const MODOS={
"epc":{n:"EPC para tercero",d:"El cliente es dueño de la estación. La utilidad de Beyond va en los márgenes de suministro e instalación por partida, no en un fee. No aplican constitución de sociedad, aportación de obra ni depósito de garantía: los tramita el cliente.",fee:0,cont:0,leg:0,dep:0},
"propia":{n:"Estación propia",d:"Beyond invierte y opera. El costo se integra con indirectos de administración y una reserva de contingencia. Incluye constitución del vehículo del proyecto, aportación de obra y depósito de garantía ante el suministrador.",fee:10,cont:25,leg:1,dep:1},
"coinv":{n:"Inversión compartida",d:"Varios socios aportan capital y Beyond administra la obra y la operación. Los indirectos de administración son el ingreso de Beyond por ese rol, así que conviene declararlos por separado del costo directo. Requiere tabla de aportaciones y acuerdo de socios.",fee:10,cont:25,leg:1,dep:1},
"concesion":{n:"Concesión en predio de tercero",d:"Beyond invierte y opera sobre un predio que no es propio, bajo arrendamiento o comodato. El CAPEX es el mismo que en estación propia, pero la renta del predio y las contraprestaciones al dueño son gasto de operación y no aparecen aquí: hay que modelarlas aparte.",fee:10,cont:25,leg:1,dep:1},
"caas":{n:"Infraestructura como servicio",d:"Beyond financia la infraestructura y la cobra al cliente por mensualidad o por kWh entregado. El costo directo es el mismo, pero la decisión de inversión depende del costo de capital y del plazo del contrato, no del monto de obra. Incluir garantía extendida y refacciones es obligatorio porque el riesgo de disponibilidad se queda en Beyond.",fee:10,cont:25,leg:1,dep:1},
"llave":{n:"Llave en mano con operación por Beyond",d:"El cliente es dueño del activo y Beyond ejecuta la obra y opera bajo contrato de O&M. Se cotiza como EPC, pero conviene presupuestar refacciones y garantía extendida porque el compromiso de disponibilidad es de Beyond.",fee:0,cont:0,leg:0,dep:1}
};
const POT_EVSE=[
{kw:60, pu:320000, tax:"supuesto",  r:"Referencia interna de proyecto de estación propia, 2026."},
{kw:80, pu:396667, tax:"allowance", r:"No existe referencia para esta potencia. Se interpola linealmente entre las referencias de 60 y 120 kW. Es una provisión, no un precio: hay que cotizarla."},
{kw:120,pu:550000, tax:"supuesto",  r:"Referencia interna de proyecto de estación propia, 2026. Otra referencia interna la ubica en $437,909."},
{kw:240,pu:900000, tax:"supuesto",  r:"Se toma la referencia alta de las dos internas disponibles ($900,000 frente a $575,505) porque incluye instalación, garantía y riesgo de suministro. La diferencia entre ambas es material: es la primera cotización a solicitar."}
];
import CAT_GEN_RAW from '../data/catalogo.json';
import { ctx, guardarEstado, agregarConcepto, promover, puede } from './contexto.js';
/* El catálogo del proyecto abierto: maestro más los conceptos propios de esa
   estación. Sin sesión cae al archivo incluido, para poder trabajar en local. */
const CAT_GEN=(ctx.conceptos && ctx.conceptos.length ? ctx.conceptos : CAT_GEN_RAW).map(x=>({...x}));

const cfg={nom:"",loc:"",modo:"propia",
grupos:[],
kva:"750",balanceo:0,balanceoPct:30,
kwp:0,fvModo:"llave",fvUsdWp:0.79,bess:0,besskwh:261,besskw:125,
mbt:0,mmt:0,dem:0,piso:0,techNueva:0,tech:0,sde:0,sdeBanos:1,
cliEvse:0,cliTrafo:0,cliCctv:0,cliIng:0,derechos:0,via:0,
fee:10,cont:25,fx:18.5};
const UAB={servicio:"Serv",lote:"Lote",pza:"Pza",m:"m",m2:"m²",kWp:"kWp",sistema:"Sist",nodo:"Nodo",juego:"Jgo",kg:"kg","%":"%",pieza:"Pza"};
const uab=u=>UAB[u]||u||"";
let genEdits={}, genApproved={};
function dbPrice(code){ if(genApproved[code]!=null) return genApproved[code];
const x=CAT_GEN.find(y=>y.c===code); return x?x.pu:null; }
function dbTax(code){ const x=CAT_GEN.find(y=>y.c===code); return x?x.t:null; }
const PU_EVSE={}; 
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const FONT_FACES=FONT_CSS;
const LOGO_SRC=LOGO_URL;
const mx=n=>"$"+Math.round(n).toLocaleString("es-MX");
const money=n=>"$"+(Math.round((+n||0)*100)/100).toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2});
const unmoney=v=>parseFloat(String(v).replace(/[^0-9.\-]/g,""))||0;
const mxs=n=>{const a=Math.abs(n);if(a>=1e6)return (n/1e6).toFixed(2).replace(/\.00$/,"")+" M";if(a>=1e3)return Math.round(n/1e3)+" k";return Math.round(n)+"";};
POT_EVSE.forEach(p=>PU_EVSE[p.kw]=p);
const grp=g=>(g.grupos||[]).filter(x=>x.q>0);
const nEvse=g=>grp(g).reduce((a,b)=>a+ +b.q,0);
const potEvse=g=>grp(g).reduce((a,b)=>a+ +b.kw* +b.q,0);
const nCon=g=>grp(g).reduce((a,b)=>a+ +b.con* +b.q,0);
const circEq=g=>grp(g).reduce((a,b)=>a+ +b.q*(+b.kw/120),0);
const nCam=g=>{const p=nCon(g); if(p<=0)return 0; return Math.min(10,Math.max(2,Math.round(2+(p-4)*8/26)));};
const techM2=g=>g.techNueva?(g.tech>0?g.tech:nCon(g)*15):0;
/* Demanda de diseño: la potencia que la estación puede tomar de la red al
   mismo tiempo. Con balanceo dinámico se reserva un porcentaje de la carga
   instalada que el sistema de gestión recorta en el pico, o que cubre el
   almacenamiento, así que la acometida y el transformador se dimensionan
   contra la diferencia y no contra la suma de placas. Tiene consecuencia
   operativa: en el pico los vehículos cargan más lento. */
const potDis=g=>g.balanceo?potEvse(g)*(1-(+g.balanceoPct||0)/100):potEvse(g);
/* Conversión de kW a kVA y margen de sobredimensionamiento del transformador.
   FP_DIM 0.80 es criterio de dimensionamiento de Beyond, no el factor de
   potencia real del equipo: los cargadores de corriente directa con
   corrección activa operan entre 0.95 y 0.99, así que este valor ya
   incorpora del orden de 16% de colchón encima del margen explícito.
   Sujeto a validación contra proyectos cerrados. */
const FP_DIM=0.80, MARGEN_TRAFO=1.10;
const KVA_COM=[300,500,750,1000,1500,2000,2500];
function sum(rs,codes){return rs.filter(r=>codes.includes(r.c)).reduce((a,b)=>a+b.imp,0);}
const M=()=>MODOS[cfg.modo];
let rows=[],edits={};
function catalog(){
const g=cfg, n=nEvse(g), pot=potEvse(g), mo=M(), kva=+g.kva;
const con=nCon(g), cam=nCam(g), tm2=techM2(g);
const L=[];
const add=(c,cat,d,u,q,pu,tax,r,o={})=>{
const src=o.src||c; let src2=src, from="";
if(!o.rule){ const p=dbPrice(src2);
if(p!=null&&p>0){ if(Math.abs(p-pu)>0.005) from="Precio tomado de la base de datos de conceptos ("+src2+"). "; pu=p; }
} else { from="Precio calculado por regla paramétrica, no tomado directo de la base de datos. "; }
if(genApproved[src2]!=null){ pu=genApproved[src2]; tax="validado";
from="Precio aprobado en la base de datos, sustituye la referencia anterior. "; }
L.push({c,cat,d,u,q:Math.max(0,q),pu,tax,r:from+r,fee:o.fee!==0,cont:o.cont!==0,tr:o.tr||"capex",src:src2,rule:!!o.rule});
};
if(!g.cliIng) add("DPL-002","DPL","Proyecto ejecutivo (media y baja tensión, civil, telecom y operación)","servicio",1,350000,"supuesto","Referencia interna de proyecto de hub multi-cargador, 2026. Escala con el número de equipos y la capacidad de la subestación.");
add("DPL-005","DPL","Ingeniería de detalle y expediente de verificación","servicio",1,85000,"validado","Presupuesto interno definido para el alcance de actualización de planos, memoria técnica y de cálculo, y expediente de unidad verificadora. Rango defendible $70,000–100,000."+(g.cliIng?" El cliente entrega la ingeniería básica, así que esta partida cubre solo el detalle.":" Incluye la ingeniería básica porque el cliente no la entrega."));
add("DPL-003","DPL","Uso de suelo, compatibilidad y gestión municipal","servicio",1,100000,"supuesto","Referencia interna. Varía de forma importante entre municipios: consultar el tabulador local.");
add("DPL-004","DPL","Licencia de construcción","servicio",1,250000,"supuesto","Referencia interna. Otra referencia la ubica en $450,000; la diferencia es municipal.");
add("DPL-006","DPL","Licencia de operación","servicio",1,180000,"supuesto","Referencia interna.");
add("DPL-007","DPL","Programa interno de protección civil y visto bueno de DRO","servicio",1,180000,"supuesto","Referencia interna."+(g.bess>0?" Con almacenamiento en sitio los requisitos de protección contra incendio aumentan; este monto puede quedar corto.":""));
if(kva>=1000) add("DPL-008","DPL","Estudios eléctricos: corto circuito, coordinación de protecciones, arc flash y malla de tierra","servicio",1,280000,"supuesto","Se activa a partir de 1,000 kVA. Necesario para dimensionar protecciones y verificar el criterio de 125% de carga continua.");
add("DPL-009","DPL","Topografía, mecánica de suelos y levantamiento de interferencias","servicio",1,160000,"supuesto","Necesario para cimentaciones, zanjas y base de transformador.");
if(tm2>0||g.kwp>0) add("DPL-010","DPL","Memorias de cálculo estructural de cubiertas y bases","servicio",1,120000,"supuesto","Se activa cuando hay techumbre o arreglo fotovoltaico: hay que verificar la carga estructural de la cubierta.");
if(mo.leg){
add("LEG-001","LEG","Constitución del vehículo del proyecto","servicio",1,12000,"supuesto","Referencia interna.",{fee:0,cont:0,tr:"legal"});
add("LEG-002","LEG","Libros corporativos y actas","servicio",1,5000,"supuesto","Dos referencias internas divergen de forma extrema ($5,000 frente a $225,000). Se usa la menor; hay que confirmarlo con el despacho.",{fee:0,cont:0,tr:"legal"});
add("LEG-003","LEG","Emisión de acciones","servicio",1,5000,"supuesto","Referencia interna.",{fee:0,cont:0,tr:"legal"});
add("LEG-004","LEG","Contratos, revisión de permisos, pólizas y arrendamiento","servicio",1,80000,"supuesto","Referencia interna. No lleva indirectos de administración.",{fee:0,cont:0,tr:"legal"});
}
add("CFE-001","CFE","Unidad de verificación de instalaciones eléctricas y dictamen NOM-001-SEDE-2012","servicio",1,38000,"fuente","Cotización de mercado, febrero 2026. Escala con la capacidad instalada.");
add("CFE-002","CFE","Trámite de interconexión en régimen general de distribución","servicio",1,52000,"validado","Dato interno confirmado sobre una cotización de mercado de $42,000. Aclarar si incluye el pago de derechos oficiales o solo la gestión.");
add("CFE-003","CFE","Gestoría de contratación de suministro y proyecto de media tensión","servicio",1,180000,"supuesto","Referencia interna.");
if(mo.dep){
add("CFE-004","CFE","Aportación y presupuesto de obra del suministrador","servicio",1,750*kva,"allowance","Provisión de $750/kVA, extrapolada linealmente desde un allowance interno de $1,500,000 para 2,000 kVA. No tiene respaldo documental: se requiere presupuesto oficial del suministrador. Es pass-through y no lleva indirectos ni contingencia.",{rule:1,fee:0,cont:0,tr:"pass"});
add("CFE-005","CFE","Depósito en garantía ante el suministrador","servicio",1,3100*kva,"allowance","Provisión de $3,100/kVA, derivada de dos datos internos de distinta capacidad. Es garantía reembolsable, no costo de obra: se reporta aparte y no lleva indirectos ni contingencia. Sin oficio del suministrador esta cifra no debe presentarse como firme.",{rule:1,fee:0,cont:0,tr:"dep"});
}
add("CFE-006","CFE","Estudios de factibilidad, libranzas y acompañamiento de energización","servicio",1,250000,"supuesto","Referencia interna.");
if(g.derechos) add("DPL-011","DPL","Pago de derechos oficiales municipales y del suministrador","lote",1,0,"allowance","Incluido en el alcance por decisión comercial, pero sin monto: los derechos los fija cada municipio y el suministrador, y no hay base para estimarlos. Hay que capturar el monto real antes de emitir propuesta.");
if(g.via) add("DPL-012","DPL","Derechos de vía y permisos de trayectoria","lote",1,0,"allowance","Incluido en el alcance por decisión comercial, pero sin monto: depende de los predios que cruce la canalización. Hay que capturar el monto real antes de emitir propuesta.");
if(!g.cliTrafo){
add("MT-015","MT","Transformador tipo pedestal "+kva.toLocaleString("es-MX")+" kVA, media a baja tensión","pza",1,847*kva,"allowance","Provisión de $847/kVA: punto medio entre dos referencias internas que difieren 85% por kVA ($594 y $1,100). Promediar dos supuestos incompatibles no produce un dato. Es la partida más urgente de cotizar.", {rule:1});
add("OC-006","MT","Base prefabricada, registro y excavación para transformador pedestal","pza",1,45000,"fuente","Cotización de mercado, febrero 2026, para 750 kVA, más excavación. Escala con la capacidad del equipo.");
add("INS-004","MT","Maniobra e instalación de transformador","pza",1,20000,"supuesto","Referencia interna. Incluye componentes y renta de equipo de maniobra.");
} else {
add("MT-015x","MT","Transformador — suministro del cliente","pza",1,0,"validado","Excluido del alcance por suministro del cliente. Debe quedar por escrito en la lista de exclusiones.");
}
add("MT-003","MT","Celda de media tensión: seccionamiento, protección y maniobra","lote",1,1300000,"supuesto","Partida frecuentemente omitida en estimados preliminares. Con acometida en media tensión no es opcional.");
add("MT-017","MT","Tablero general de baja tensión con interruptor principal, barra y medición","pza",1,1200000,"supuesto","Referencia interna. Verificar el interruptor principal contra 125% de la carga continua (Art. 625-21): a "+kva.toLocaleString("es-MX")+" kVA y 440 V la corriente de plena carga es del orden de "+Math.round(kva*1000/(1.732*440)).toLocaleString("es-MX")+" A.");
add("MT-005","MT","Tableros derivados para equipos de carga y servicios auxiliares","lote",1,Math.round(750000*(circEq(g)+3)/20),"allowance","Escalamiento lineal por número de circuitos sobre una referencia interna de $750,000 para veinte circuitos. Escalar tableros por conteo de circuitos es burdo: el precio real depende de la capacidad de barra.", {rule:1});
add("MT-006","MT","Juego de interruptores derivados","lote",1,Math.round(850000*circEq(g)/17),"allowance","Escalamiento lineal desde una referencia interna de $850,000 para diecisiete equipos, normalizado a circuitos de 120 kW. Cada interruptor debe verificarse contra 125% de la carga continua del circuito que alimenta.", {rule:1});
add("MT-007","MT","Alimentador principal de transformador a tablero general","servicio",1,650000,"supuesto","Referencia interna. Otra referencia lo ubica en $1,200,000 para 3,200 A.");
add("MT-014","MT","Gabinete y base de medición en media tensión","lote",1,450000,"supuesto","Referencia interna. La especificación exacta la fija la zona del suministrador.");
if(g.mmt>0){
add("MT-012","MT","Banco de ductos de media tensión, tres vías, en arroyo","m",g.mmt,1800,"fuente","Dos fuentes independientes coinciden en este precio: cotización de mercado de febrero 2026 y un proyecto de referencia. La cantidad viene del trazo declarado y debe medirse en sitio.");
add("MT-022","MT","Registro de gran formato para media tensión","pza",Math.max(1,Math.ceil(g.mmt/40)),22000,"supuesto","Un registro cada 40 m de trazo de media tensión.");
add("MT-019","MT","Transición aérea a subterránea y accesorios de media tensión","lote",1,228060,"supuesto","Suma de veintiún conceptos unitarios: cortacircuitos fusible, apartarrayos, terminales contráctiles, insertos, cable XLP 1/0, neutro corrido, marbetes de fase, herrajes, muerto de medición y soldadura exotérmica.");
add("MT-018","MT","Suministro e hincado de poste para servicio de media tensión","pza",1,95000,"supuesto","Aplica si no hay estructura del suministrador frente al predio. Confirmar si el suministrador lo ejecuta dentro de la aportación de obra.");
}
if(n>0) add("BT-001","BT","Alimentadores de baja tensión del tablero general a los equipos de carga","lote",1,Math.round(164706*circEq(g)),"allowance","Provisión de $164,706 por circuito equivalente de 120 kW, derivada de una referencia interna de $2,800,000 para diecisiete circuitos. En proyectos cerrados el cableado ha representado hasta la mitad del subtotal, así que esta es la partida que más se beneficia de una cotización de mayoreo. Cable de circuitos de corriente directa: RHW-2/XHHW-2 con aislamiento XLPE 1000 V.", {rule:1});
if(g.mbt>0) add("BT-canal","BT","Canalización, soportería, charolas y rutas principales de fuerza","lote",1,Math.round(4200*g.mbt),"allowance","Provisión de $4,200 por metro de trazo de baja tensión, derivada de una referencia interna de $1,250,000. Depende fuertemente del tipo de ruta (enterrada, aérea o en charola) y debe cerrarse con el trazo medido.", {rule:1});
add("BT-021","BT","Supresor de transitorios categoría C para tablero general","pza",1,120000,"supuesto","Referencia interna. Escala con la capacidad de la estación.");
add("BT-022","BT","Supresores categoría B para tableros auxiliares","lote",1,110000,"supuesto","Referencia interna.");
add("BT-023","BT","Transformador seco auxiliar 45 kVA para servicios generales","pza",1,130000,"supuesto","Referencia interna. Definir la tensión secundaria de la estación antes de cerrar esta partida.");
add("BT-024","BT","Tablero de distribución auxiliar con interruptores derivados","pza",1,80000,"supuesto","Referencia interna.");
add("BT-025","BT","Canalización y alimentadores auxiliares para alumbrado, contactos, nodos y cámaras","lote",1,600000,"supuesto","Referencia interna.");
add("BT-026","BT","Paros de emergencia, botoneras, señalización eléctrica y gabinetes","lote",1,160000,"supuesto","Referencia interna. Partida frecuentemente omitida en estimados preliminares.");
add("BT-027","BT","Pruebas eléctricas y comisionamiento","lote",1,Math.round(180000*Math.max(.5,circEq(g)/17+.4)),"supuesto","Base interna de $180,000 para diecisiete circuitos, escalada por número de circuitos con un piso fijo de movilización. Incluye resistencia de aislamiento, resistencia de tierras, termografía, torque y energización.", {rule:1});
add("BT-028","BT","Planos as-built, etiquetado, directorio de circuitos, manual de operación y capacitación","lote",1,90000,"supuesto","Referencia interna.");
add("INS-003","BT","Instalación de tableros","pza",3,15000,"supuesto","Referencia interna. Tablero general, derivado y auxiliar.");
add("TIE-008","TIE","Sistema de puesta a tierra: malla, varillas, compuesto mejorador, cable desnudo y soldadura exotérmica","lote",1,Math.round(450000*kva/2000),"allowance","Escalamiento por capacidad desde una referencia interna de $450,000 para 2,000 kVA. Con el estudio de malla de tierra esta provisión se sustituye por el desglose de materiales, que es lo que permite subir de clase.", {rule:1});
if(!g.cliEvse){
const agg={};
grp(g).forEach(x=>{const k=x.kw+"-"+x.con; agg[k]=agg[k]||{kw:+x.kw,con:+x.con,q:0}; agg[k].q+=+x.q;});
Object.values(agg).sort((a,b)=>b.kw-a.kw||b.con-a.con).forEach(x=>{
const p=PU_EVSE[x.kw]; if(!p)return;
add("EVSE-"+x.kw+"-"+x.con,"EVSE","Suministro y colocación de equipo de carga en corriente directa, "+x.kw+" kW, "+x.con+(x.con>1?" conectores":" conector"),"pza",x.q,p.pu,p.tax,
p.r+(x.con===1?" La referencia de precio no distingue el número de conectores; un equipo de un solo conector normalmente cuesta menos. Pendiente de confirmar con fabricante.":""));
});
if(n>0){
add("EVSE-005","EVSE","Flete, importación, seguros, maniobras y traslado local de equipos de carga","lote",1,Math.round(130000*n),"supuesto","Provisión de $130,000 por equipo, derivada de una referencia interna de lote. Solo aplica si el precio del equipo no lo incluye documentalmente: hay que verificarlo en la cotización, no asumirlo.");
add("EVSE-006","EVSE","Configuración de protocolo OCPP, integración a plataforma y puesta en servicio","lote",1,250000,"supuesto","Referencia interna.");
add("EVSE-007","EVSE","Refacciones críticas iniciales: cables, conectores, tarjetas y contactores","lote",1,Math.round(90000*n),"supuesto","Provisión por equipo derivada de una referencia interna de lote."+(["caas","llave"].includes(cfg.modo)?" Obligatoria en este modelo de negocio: el compromiso de disponibilidad es de Beyond.":" Recomendada para operación propia."));
add("EVSE-008","EVSE","Garantía extendida y soporte de arranque de operación","lote",1,300000,"supuesto","Referencia interna."+(["caas","llave"].includes(cfg.modo)?" Obligatoria en este modelo de negocio.":""));
}
} else if(n>0){
add("EVSE-cli","EVSE","Equipos de carga — suministro del cliente","pza",n,0,"validado","Excluido del alcance por decisión de reparto de suministro. Debe quedar por escrito en la lista de exclusiones.");
add("INS-002","EVSE","Montaje, conexión y puesta en servicio de equipo de carga suministrado por el cliente","pza",n,33000,"supuesto","Referencias internas de instalación de gabinete de potencia y dispensador, agregadas por equipo.");
}
if(g.kwp>0 && g.fvModo==="llave"){
add("SFV-000","SFV","Sistema fotovoltaico llave en mano de "+g.kwp+" kWp","kWp",g.kwp,Math.round(g.fvUsdWp*1000*g.fx),"fuente",
"Precio llave en mano de "+g.fvUsdWp.toFixed(2)+" dólares por Wp al tipo de cambio configurado, proporcionado como referencia para este proyecto. Incluye módulos, inversores, estructura, materiales de corriente directa y alterna, instalación, interconexión y verificación. Cotejo interno: el desglose por componentes del catálogo da el equivalente de 0.74 dólares por Wp, así que esta referencia queda 7% por arriba y es la más conservadora de las dos.",{rule:1});
}
if(g.kwp>0 && g.fvModo!=="llave"){
const nmod=Math.ceil(g.kwp*1000/635), ninv=Math.max(1,Math.round(g.kwp/1.23/125));
add("SFV-001","SFV","Módulo fotovoltaico monocristalino bifacial tipo N, 635 Wp","pza",nmod,3395.70,"supuesto","Referencia interna con un factor de protección de costo de 10%. Equivale a ~$5.35/Wp, por encima de la referencia de mercado de módulo: cotizar con distribuidor.");
add("SFV-002","SFV","Inversor de cadena 125 kW","pza",ninv,116187.50,"supuesto","Cantidad determinada por una relación de corriente directa a alterna de 1.23. Referencia interna con factor de protección de costo de 10%.");
add("SFV-003","SFV","Estructura de montaje de aluminio con accesorios de acero inoxidable","kWp",g.kwp,2156.77,"supuesto","Derivado de un costo de lote de referencia entre su capacidad, más factor de protección de 10%. No incluye cubierta nueva: verificar traslape con la partida de techumbre.");
add("SFV-004","SFV","Materiales eléctricos fotovoltaicos de corriente directa y alterna","kWp",g.kwp,3125.97,"supuesto","Derivado de un costo de lote de referencia entre su capacidad, más factor de protección de 10%. Escala con la distancia del arreglo a inversores y a tablero.");
add("SFV-005","SFV","Instalación y mano de obra fotovoltaica","lote",1,0,"allowance","La referencia de origen no presupuesta mano de obra fotovoltaica: solo tiene una partida de servicios por $125,000 para casi mil módulos, insuficiente para construir. Provisión calculada como 15% del suministro fotovoltaico. Es una reserva, no un precio: cotizar EPC fotovoltaico completo.", {rule:1});
add("SFV-006","SFV","Administración, ingeniería, procuración y desarrollo del sistema fotovoltaico","servicio",1,137500,"supuesto","Referencia interna con factor de protección de 10%. Limitado a indirectos: la construcción va en la partida de instalación.");
add("SFV-007","SFV","Gestión de interconexión fotovoltaica y medidor bidireccional","servicio",1,82500,"supuesto","Referencia interna con factor de protección de 10%. La modalidad de interconexión cambia el trámite y los tiempos.");
add("SFV-008","SFV","Verificación de la instalación fotovoltaica","servicio",1,137500,"supuesto","Referencia interna con factor de protección de 10%. Verificar si el suministrador acepta consolidarla con la verificación de la estación.");
}
if(g.bess>0){
add("GE-006","GE","Sistema de almacenamiento en batería, "+g.besskw+" kW / "+g.besskwh+" kWh","pza",g.bess,Math.round(g.besskwh*250*g.fx),"fuente","Referencia externa de mercado: el rango 2026 para almacenamiento comercial e industrial contenerizado es de 180 a 320 dólares por kWh instalado; se usa el punto medio de 250 al tipo de cambio configurado. No existe referencia interna propia para esta partida.", {rule:1});
add("GE-007","GE","Integración de almacenamiento con gestión de energía y generación","lote",1,0,"allowance","Provisión de 8% del costo del almacenamiento. Sin esta partida el equipo queda instalado pero sin despacho coordinado, y no recorta demanda.", {rule:1});
add("GE-008","GE","Obra civil, contención, ventilación y protección contra incendio del área de baterías","lote",1,0,"allowance","Provisión de 5% del costo del almacenamiento. Los requisitos reales los fija Protección Civil del municipio y pueden diferir de forma importante.", {rule:1});
}
const potBess=g.bess*g.besskw;
if(g.balanceo || pot>kva*FP_DIM || g.kwp>0 || g.bess>0)
add("GE-001","GE","Sistema de gestión de energía con límite total de potencia de estación","sistema",1,750000,"supuesto","Se activa con balanceo dinámico declarado, cuando la potencia de los equipos excede la capacidad del transformador, o cuando hay generación o almacenamiento en sitio: en esos casos hay despacho a nivel estación. Sin este sistema no se puede sostener una reserva de balanceo, y por lo tanto tampoco se puede dimensionar el transformador por debajo de la suma de placas. El balanceo nativo de un equipo de carga solo reparte entre sus propios conectores y no lo sustituye. Si la cotización demuestra que el controlador de estación viene incluido, esta partida se pone en cero.");
add("GE-003","GE","Sistema de monitoreo de calidad de la energía","sistema",1,280000,"supuesto","Referencia interna. Otra referencia la ubica en $45,000: la diferencia es de alcance, un punto de medición contra medición por alimentador.");
add("GE-004","GE","Medidores por alimentador e integración al sistema de gestión","lote",1,350000,"supuesto","Referencia interna.");
add("GE-002","GE","Medición comercial para mercado eléctrico mayorista","sistema",0,650000,"supuesto","En cero por omisión: migrar al mercado mayorista es una decisión de negocio, no de ingeniería.");
add("TEL-008","TEL","Nodo de red para equipo de carga, cámara, punto de acceso o pantalla","nodo",n+Math.ceil(cam/3)+2,18000,"supuesto","Un nodo por equipo de carga, uno por cada tres cámaras y dos para servicios auxiliares.");
if(cam>0){
if(!g.cliCctv) add("TEL-010","TEL","Sistema de videovigilancia con "+cam+(cam>1?" cámaras":" cámara")+", grabador y almacenamiento","sistema",1,Math.round(60000+13333*cam),"supuesto","Cantidad de cámaras derivada de los puntos de carga: dos para cuatro puntos, hasta diez para treinta. Base de grabador y almacenamiento más costo por cámara, sobre una referencia interna de doce cámaras.", {rule:1});
else add("INS-009","TEL","Instalación de videovigilancia con equipo suministrado por el cliente","lote",1,Math.round(2800*cam+1200*cam),"supuesto","Referencia interna por cámara más tendido de cable de red y consumibles. El equipo lo suministra el cliente y debe quedar por escrito en la lista de exclusiones.", {rule:1});
}
add("TEL-011","TEL","Enrutador industrial, firewall, enlace de respaldo, respaldo de energía y gabinete","sistema",1,180000,"supuesto","Referencia interna.");
add("TEL-012","TEL","Alarma, botón de pánico, sensores y gabinete de seguridad","sistema",1,160000,"supuesto","Referencia interna.");
add("TEL-009","TEL","Pluma de seguridad y control de acceso","pza",0,90000,"supuesto","En cero por omisión: depende del esquema de acceso del sitio.");
if(g.dem>0)  add("OC-018","OC","Demolición de piso de concreto reforzado de hasta 10 cm, con carga","m2",g.dem,832,"supuesto","Precio unitario de un proyecto de referencia. Contrastar con tabulador oficial antes de propuesta firme.");
if(g.piso>0) add("OC-019","OC","Piso de concreto f'c=200 kg/cm², 10 cm, acabado escobillado","m2",g.piso,750,"supuesto","Precio unitario de un proyecto de referencia. Contrastar con tabulador oficial antes de propuesta firme.");
if(tm2>0) add("OC-021","OC","Techumbre nueva de estructura metálica sobre equipos y cajones, con policarbonato, flashing y bases","m2",tm2,15200,"allowance","La referencia de origen captura este concepto con unidad ambigua: a este precio solo tiene sentido por metro cuadrado de claro estructural, no por metro lineal. Aclarar la unidad antes de comprometer el monto. Si el arreglo fotovoltaico va sobre esta cubierta, verificar traslape con la estructura de montaje.");
add("OC-015","OC","Cuarto eléctrico y área técnica para equipo de baja tensión, telecom y monitoreo","lote",1,650000,"supuesto","Referencia interna. Otra referencia lo ubica en $1,100,000 por cuarto: la diferencia es de alcance.");
if(n>0) add("OC-009","OC","Cimentación para equipo de carga","pza",n,15000,"supuesto","Referencia interna.");
if(g.mbt>0){
add("OC-004","OC","Zanja 50x100 cm: excavación, relleno, compactación y reposición de concreto","m",g.mbt,950,"fuente","Precio compuesto calibrado internamente a partir de tabulador oficial más reposición de concreto. La cantidad viene del trazo declarado: medirlo en sitio es la validación de mayor impacto sobre el total.");
add("OC-003","OC","Cinta de señalización de riesgo eléctrico subterránea","m",g.mbt,8,"supuesto","Cantidad ligada a los metros de zanja.");
add("OC-002","OC","Registro eléctrico polimérico 80x80x80 con tapa","pza",Math.max(1,Math.ceil(g.mbt/25)),5500,"supuesto","Un registro cada 25 m de trazo de baja tensión.");
add("OC-001","OC","Registro eléctrico polimérico 40x40x40 con tapa","pza",Math.max(1,Math.ceil(g.mbt/15)),2200,"supuesto","Un registro cada 15 m de trazo de baja tensión.");
}
if(n>0){
add("OC-010","OC","Tope vehicular por cajón de carga","pza",con,650,"supuesto","Un tope por punto de carga.");
add("OC-011","OC","Pintura de señalización horizontal en cajones de carga","m2",con*15,180,"supuesto","Quince metros cuadrados por cajón. No capturar además el branding horizontal: es doble conteo.");
add("OC-020","OC","Guarnición de concreto para delimitar la zona de carga","m",n*12,286,"supuesto","Doce metros lineales por equipo de carga.");
}
add("OC-017","OC","Drenaje pluvial, bolardos y protección física de equipos","lote",1,300000,"supuesto","Referencia interna.");
add("PC-001","PC","Extintor de polvo químico seco tipo ABC","pza",Math.max(4,Math.ceil(n/2)+2+(g.bess>0?2:0)),1000,"supuesto","Base de cuatro más uno por cada dos equipos de carga, más dos si hay almacenamiento. La cantidad y el tipo definitivos los fija Protección Civil.");
add("PC-002","PC","Señalética de salida y ruta de evacuación","pza",Math.max(6,n*2),180,"supuesto","Referencia interna, escalada por número de equipos.");
add("PC-003","PC","Señalética de alta tensión","pza",Math.max(6,n*2),150,"supuesto","Referencia interna.");
add("PC-004","PC","Señalética de extintor","pza",Math.max(4,Math.ceil(n/2)+2),120,"supuesto","Una por extintor.");
add("PC-005","PC","Pintura de punto de reunión","pza",1,2500,"supuesto","Referencia interna.");
add("PC-006","PC","Botiquín industrial de primeros auxilios","pza",2,1200,"supuesto","Referencia interna.");
add("MED-001","MED","Nicho de medición con herrerías","pza",1,27000,"fuente","Cotización de mercado de $22,000 más $5,000 de herrerías. La especificación exacta depende de la zona del suministrador.");
add("SB-001","SB","Señalética operativa, reglamentaria y de seguridad","lote",1,250000,"supuesto","Referencia interna.");
add("SB-002","SB","Letreros, fachada y tótem de identificación de la estación","lote",1,300000,"supuesto","Referencia interna. Otra referencia la ubica en $500,000: depende del diseño de marca.");
add("SB-005","SB","Instrucciones de usuario, código QR, emergencias y políticas de carga","lote",1,80000,"supuesto","Referencia interna.");
if(g.sde){
add("SDE-001","SDE","Adecuación de sala de espera: pintura, lambrín, estuco y acabados","lote",1,300000,"supuesto","Referencia interna.");
add("SDE-002","SDE","Estructura interior y adecuaciones arquitectónicas","lote",1,250000,"supuesto","Referencia interna.");
add("SDE-003","SDE","Mobiliario y equipamiento de sala de espera","lote",1,150000,"supuesto","Referencia interna.");
if(g.sdeBanos) add("SDE-004","SDE","Adecuación de baño","pza",2,140000,"supuesto","Dos baños: hombres y mujeres.");
add("SDE-005","SDE","Climatización y ventilación de sala de espera","lote",1,120000,"supuesto","Referencia interna.");
add("SDE-006","SDE","Equipamiento menor y pantallas","lote",1,85000,"supuesto","Referencia interna.");
}
return L;
}
function build(){
rows=catalog();
for(const r of rows){
const e=edits[r.c];
if(e){ if(e.q!=null){r.q=e.q;r.eq=1;} if(e.pu!=null){r.pu=e.pu;r.ep=1;} if(e.tax){r.tax=e.tax;r.et=1;} }
r.imp=r.q*r.pu;
}
const d=[["SFV-005",.15,["SFV-001","SFV-002","SFV-003","SFV-004"]],["GE-007",.08,["GE-006"]],["GE-008",.05,["GE-006"]]];
for(const [code,pct,src] of d){
const r=rows.find(x=>x.c===code); if(!r||r.ep)continue;
r.pu=Math.round(pct*sum(rows,src)); r.imp=r.q*r.pu;
}
}
function totals(){
const act=rows.filter(r=>r.q>0&&r.pu>0||r.q>0&&r.tr==="capex"&&r.pu===0);
const on=rows.filter(r=>r.q>0);
const capex=on.filter(r=>r.tr!=="dep");
const tec=capex.reduce((a,b)=>a+b.imp,0);
const fee=capex.filter(r=>r.fee).reduce((a,b)=>a+b.imp,0)*cfg.fee/100;
const cont=capex.filter(r=>r.cont).reduce((a,b)=>a+b.imp,0)*cfg.cont/100;
const dep=on.filter(r=>r.tr==="dep").reduce((a,b)=>a+b.imp,0);
const idd=tec?capex.reduce((a,b)=>a+b.imp*S[b.tax],0)/tec:0;
let cl=CLASES[0]; for(const c of CLASES) if(idd>=c.idd) cl=c;
const lo=tec?capex.reduce((a,b)=>a+b.imp*RNG[b.tax][0],0)/tec:0;
const hi=tec?capex.reduce((a,b)=>a+b.imp*RNG[b.tax][1],0)/tec:0;
return {tec,fee,cont,dep,total:tec+fee+cont,idd,cl,capex,on,lo,hi};
}
function catAgg(t){
const m={};
t.capex.forEach(r=>{ const k=m[r.cat]=m[r.cat]||{cat:r.cat,v:0,w:0,lo:0,hi:0};
k.v+=r.imp; k.w+=r.imp*S[r.tax]; k.lo+=r.imp*RNG[r.tax][0]; k.hi+=r.imp*RNG[r.tax][1]; });
return Object.values(m).filter(x=>x.v>0).map(x=>({...x,score:x.w/x.v,rlo:x.lo/x.v,rhi:x.hi/x.v,risk:x.v*(1-x.w/x.v)})).sort((a,b)=>b.v-a.v);
}
const scoreCol=s=>s>=.9?COL.validado:s>=.7?COL.fuente:s>=.4?COL.supuesto:COL.allowance;
function squarify(data,x,y,w,h){
const out=[]; let items=[...data].sort((a,b)=>b.v-a.v), remaining=items.reduce((a,b)=>a+b.v,0);
while(items.length&&w>.5&&h>.5&&remaining>0){
const short=Math.min(w,h), scale=(w*h)/remaining;
let row=[],rowSum=0,best=Infinity;
while(items.length){
const cand=rowSum+items[0].v, len=cand*scale/short;
if(len<=0)break;
const worst=Math.max(...[...row,items[0]].map(it=>{const a=it.v*scale/len;return Math.max(len/a,a/len);}));
if(worst<=best){best=worst;row.push(items.shift());rowSum=cand;} else break;
}
if(!row.length)break;
const len=rowSum*scale/short; let off=0;
if(w>=h){ for(const it of row){const hh=it.v*scale/len;out.push({...it,x,y:y+off,w:len,h:hh});off+=hh;} x+=len;w-=len; }
else{ for(const it of row){const ww=it.v*scale/len;out.push({...it,x:x+off,y,w:ww,h:len});off+=ww;} y+=len;h-=len; }
remaining-=rowSum;
}
return out;
}
function drawTreemap(t){
const data=catAgg(t), W=1180,H=380;
const cells=squarify(data,0,0,W,H);
const g=cells.map(c=>{
const pct=(c.v/t.tec*100), big=c.w>92&&c.h>52, mid=c.w>62&&c.h>34;
return `<g data-goc="${c.cat}"><title>${CATN[c.cat]} — ${mx(c.v)} (${pct.toFixed(1)}%) · rango ${c.rlo.toFixed(0)}% / +${c.rhi.toFixed(0)}% · clic para editar en el catálogo</title>
    <rect x="${c.x+1.5}" y="${c.y+1.5}" width="${Math.max(0,c.w-3)}" height="${Math.max(0,c.h-3)}" rx="6" fill="${scoreCol(c.score)}" fill-opacity=".82"/>
    ${mid?`<text x="${c.x+11}" y="${c.y+21}" font-size="12" font-weight="700" fill="#000">${c.cat}</text>`:""}
    ${big?`<text x="${c.x+11}" y="${c.y+40}" font-size="15" font-weight="300" fill="#000">${mxs(c.v)}</text>
<text x="${c.x+11}" y="${c.y+55}" font-size="10" fill="#000" fill-opacity=".7">${pct.toFixed(1)}% · +${c.rhi.toFixed(0)}%</text>`:""}</g>`;
}).join("");
$("#treemap").innerHTML=`<svg class="tm" viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${g}</svg>`;
}
function drawRange(t){
const data=catAgg(t).slice(0,12), W=620, rh=30, H=data.length*rh+26, lw=50, rw=150;
const maxHi=Math.max(...data.map(d=>d.v*(1+d.rhi/100)));
const sx=v=>lw+(W-lw-rw)*v/maxHi;
const g=data.map((d,i)=>{
const y=i*rh+16, lo=d.v*(1+d.rlo/100), hi=d.v*(1+d.rhi/100);
return `<g data-goc="${d.cat}" style="cursor:pointer"><title>${CATN[d.cat]}: ${mx(d.v)} · de ${mx(lo)} a ${mx(hi)} · clic para editar en el catálogo</title>
    <text x="0" y="${y+11}" font-size="11" font-weight="600" fill="#999">${d.cat}</text>
    <rect x="${lw}" y="${y+2}" width="${Math.max(1,sx(d.v)-lw)}" height="13" rx="3" fill="${scoreCol(d.score)}" fill-opacity=".55"/>
    <line x1="${sx(lo)}" y1="${y+8.5}" x2="${sx(hi)}" y2="${y+8.5}" stroke="${scoreCol(d.score)}" stroke-width="1.5"/>
    <line x1="${sx(lo)}" y1="${y+3}" x2="${sx(lo)}" y2="${y+14}" stroke="${scoreCol(d.score)}" stroke-width="1.5"/>
    <line x1="${sx(hi)}" y1="${y+3}" x2="${sx(hi)}" y2="${y+14}" stroke="${scoreCol(d.score)}" stroke-width="1.5"/>
    <text x="${W-62}" y="${y+12}" font-size="11" fill="#fff" font-weight="500" text-anchor="end">${mxs(d.v)}</text>
    <text x="${W-4}" y="${y+12}" font-size="10" fill="${scoreCol(d.score)}" text-anchor="end">+${d.rhi.toFixed(0)}%</text></g>`;
}).join("");
$("#rangechart").innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${g}</svg>`;
}
function drawScatter(t){
const data=catAgg(t), W=620,H=350, pl=52,pb=36,pt=34,pr=40;
const maxV=Math.max(...data.map(d=>d.v)), maxR=Math.max(...data.map(d=>d.rhi),40);
const maxRisk=Math.max(...data.map(d=>d.risk),1);
const maxRad=6+22;
const sx=v=>Math.min(W-pr-maxRad,Math.max(pl+maxRad,pl+maxRad+(W-pl-pr-2*maxRad)*Math.sqrt(v/maxV)));
const sy=r=>Math.min(H-pb-8,Math.max(pt,H-pb-(H-pb-pt)*(r/maxR)));
const grid=[0,.25,.5,.75,1].map(f=>`<line x1="${pl}" y1="${sy(maxR*f)}" x2="${W-pr}" y2="${sy(maxR*f)}" stroke="rgba(255,255,255,.08)"/>
    <text x="${pl-7}" y="${sy(maxR*f)+3}" font-size="10" fill="#666" text-anchor="end">+${Math.round(maxR*f)}%</text>`).join("");
const pts=data.map(d=>{
const r=6+22*Math.sqrt(d.risk/maxRisk);
return `<g data-goc="${d.cat}" style="cursor:pointer"><title>${CATN[d.cat]}: importe ${mx(d.v)} · puede subir +${d.rhi.toFixed(0)}% · dinero en riesgo ${mx(d.risk)} · clic para editar en el catálogo</title>
    <circle cx="${sx(d.v)}" cy="${sy(d.rhi)}" r="${r}" fill="${scoreCol(d.score)}" fill-opacity=".28" stroke="${scoreCol(d.score)}" stroke-width="1.2"/>
    <text x="${sx(d.v)}" y="${sy(d.rhi)+3.5}" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">${d.cat}</text></g>`;
}).join("");
$("#scatter").innerHTML=`<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${grid}
    <line x1="${pl}" y1="${H-pb}" x2="${W-pr}" y2="${H-pb}" stroke="rgba(255,255,255,.14)"/>
    <text x="${pl}" y="${H-12}" font-size="10" fill="#666">menor importe</text>
    <text x="${W-pr}" y="${H-12}" font-size="10" fill="#666" text-anchor="end">mayor importe</text>
    ${pts}</svg>`;
}
function render(){
build(); const t=totals(), mo=M(), n=nEvse(cfg), pot=potEvse(cfg), kva=+cfg.kva;
const con=nCon(cfg), cam=nCam(cfg), tm2=techM2(cfg);
$("#hProj").textContent=cfg.nom||"Sin nombre";
$("#hMeta").textContent=[cfg.loc,mo.n,n+" equipos · "+pot.toLocaleString("es-MX")+" kW",kva.toLocaleString("es-MX")+" kVA"].filter(Boolean).join(" · ");
$("#h_modo").textContent=mo.d;
$("#p_modo").textContent=mo.n+". "+mo.d;
$("#l_eq").textContent=n+(n===1?" equipo":" equipos");
$("#l_con").textContent=con+(con===1?" punto":" puntos");
$("#l_pot").textContent=pot.toLocaleString("es-MX")+" kW";
$("#l_cam").textContent=cam+(cam===1?" cámara":" cámaras");
$("#techBox").classList.toggle("hide",!cfg.techNueva);
$("#sdeBox").classList.toggle("hide",!cfg.sde);
$("#fvBox").classList.toggle("hide",!(cfg.kwp>0));
$("#fvWpBox").classList.toggle("hide",cfg.fvModo!=="llave");
const cm=$("#c_modo"); if(cm) cm.textContent="Almacenamiento: "+DB.modo;
$("#h_fv").textContent="Equivale a "+mx(cfg.fvUsdWp*1000*cfg.fx)+" por kWp · total "+mx(cfg.kwp*cfg.fvUsdWp*1000*cfg.fx);
$("#h_tech").textContent="Sugerido: "+(con*15)+" m² (15 m² por cajón). Deja 0 para usar el sugerido.";
$("#l_fee").textContent=cfg.fee.toFixed(1)+"%"; $("#l_cont").textContent=cfg.cont+"%";
$("#h_cont").textContent="Sugerido para Clase "+t.cl.c+": "+t.cl.cont+"%";
const potD=potDis(cfg), pctBal=Math.round(+cfg.balanceoPct||0);
$("#balBox").classList.toggle("hide",!cfg.balanceo);
$("#l_bal").textContent=pctBal+"%";
$("#h_bal").textContent=cfg.balanceo
  ?"Recorta "+Math.round(pot-potD).toLocaleString("es-MX")+" kW en el pico"
  :"";
/* El kVA que alimenta los costos es el que se elige a mano en el desplegable.
   Esto es solo la sugerencia, y declara con qué números la calculó. */
const req=potD/FP_DIM*MARGEN_TRAFO, sug=KVA_COM.find(s=>s>=req)||2500;
$("#h_kva").textContent=(cfg.balanceo
  ?"Demanda de diseño "+Math.round(potD).toLocaleString("es-MX")+" kW ("+pot.toLocaleString("es-MX")+" kW instalados menos "+pctBal+"% reservado al balanceo). "
  :"Demanda de diseño "+pot.toLocaleString("es-MX")+" kW, sin balanceo. ")
  +"Requiere "+Math.round(req).toLocaleString("es-MX")+" kVA con el criterio de conversión 0.80 y 10% de margen · siguiente capacidad comercial: "+sug.toLocaleString("es-MX")+" kVA";
$("#grBox").innerHTML=(cfg.grupos||[]).map((x,i)=>`<div class="gr">
    <div><div class="lbl">Potencia</div><select data-i="${i}" data-f="kw">${POT_EVSE.map(p=>`<option value="${p.kw}"${+x.kw===p.kw?" selected":""}>${p.kw} kW CD</option>`).join("")}</select></div>
    <div><div class="lbl">Conectores</div><select data-i="${i}" data-f="con"><option value="1"${+x.con===1?" selected":""}>1</option><option value="2"${+x.con===2?" selected":""}>2</option></select></div>
    <div><div class="lbl">Equipos</div><input type="number" min="0" step="1" value="${x.q}" data-i="${i}" data-f="q"></div>
    <button class="xbtn" data-del="${i}" title="Quitar tipo de cargador">&times;</button></div>`).join("")
||'<div class="tiny muted" style="padding:8px 0">Sin equipos de carga. Agrega un tipo de cargador.</div>';
$$("#grBox [data-f]").forEach(el=>el.addEventListener("input",e=>{
const i=+e.target.dataset.i,f=e.target.dataset.f;
cfg.grupos[i][f]=Math.max(f==="q"?0:1,parseInt(e.target.value)||0); render();}));
$$("#grBox [data-del]").forEach(el=>el.addEventListener("click",e=>{
cfg.grupos.splice(+e.target.dataset.del,1); render();}));
/* El balance usa el mismo 0.80 que la sugerencia de kVA: si convirtiera en un
   sentido con un valor y en el otro con otro, los dos paneles se contradirían. */
const kw=kva*FP_DIM, potB=cfg.bess*cfg.besskw, def=potD-kw;
const holgura=potD>0?(kw/potD-1)*100:0;
const items=[["Potencia instalada de equipos",pot.toLocaleString("es-MX")+" kW"]];
if(cfg.balanceo) items.push(
  ["Reservado al balanceo ("+pctBal+"%)","−"+Math.round(pot-potD).toLocaleString("es-MX")+" kW"],
  ["Demanda de diseño",Math.round(potD).toLocaleString("es-MX")+" kW"]);
items.push(
  ["Capacidad del transformador (conversión 0.80)",Math.round(kw).toLocaleString("es-MX")+" kW"],
  ["Aporte de almacenamiento en descarga",potB.toLocaleString("es-MX")+" kW"],
  ["Generación fotovoltaica en corriente alterna",Math.round(cfg.kwp/1.23).toLocaleString("es-MX")+" kW"]);
let msg,col;
const reservaTxt=cfg.balanceo
  ?" El "+pctBal+"% reservado lo absorbe el sistema de gestión recortando potencia en el pico"
    +(potB>0?", o el almacenamiento si hay energía disponible":"")+": los vehículos cargan más lento cuando la estación está llena."
  :"";
if(def<=0&&holgura>=10){msg="El transformador cubre la demanda de diseño con "+Math.round(holgura)+"% de holgura."+reservaTxt;col="var(--text-tertiary)";}
else if(def<=0){msg="El transformador cubre la demanda de diseño, pero solo con "+Math.round(Math.max(holgura,0))+"% de holgura; el criterio de dimensionamiento pide 10%."+reservaTxt;col="var(--warning)";}
else if(potB>=def){msg="Déficit de "+Math.round(def).toLocaleString("es-MX")+" kW frente a la red, cubierto por almacenamiento. Requiere despacho coordinado, no solo balanceo en el equipo."+reservaTxt;col="var(--warning)";}
else {msg="Déficit de "+Math.round(def).toLocaleString("es-MX")+" kW no cubierto por almacenamiento. Hay que subir capacidad de transformación o reservar más potencia al balanceo."+reservaTxt;col="var(--danger)";}
$("#balance").innerHTML=items.map(([a,b])=>`<div class="row sp"><span class="tiny muted">${a}</span><b style="font-variant-numeric:tabular-nums">${b}</b></div>`).join("")+
`<div class="xs" style="color:${col};margin-top:4px">${msg}</div>`;
const byCat={}; t.capex.forEach(r=>byCat[r.cat]=(byCat[r.cat]||0)+r.imp);
$("#cats").innerHTML=Object.entries(CATN).map(([k,v])=>`<div class="catitem ${byCat[k]?"on":"off"}">
    <span class="badge ${byCat[k]?"b-accent":"b-neutral"}" style="min-width:52px;justify-content:center">${k}</span>
    <span style="flex:1">${v}</span>${byCat[k]?`<b class="tiny" style="font-variant-numeric:tabular-nums">${mxs(byCat[k])}</b>`:'<span class="xs">inactiva</span>'}</div>`).join("");
$("#s_capex").textContent=mxs(t.tec); $("#s_indir").textContent=mxs(t.fee+t.cont);
$("#s_capex_x").textContent=mx(t.tec);
$("#s_total_x").textContent=mx(t.total)+" más IVA";
$("#s_indir_d").textContent=cfg.fee?("Indirectos "+mxs(t.fee)+" · Contingencia "+mxs(t.cont)):"Modelo por márgenes: sin fee";
$("#s_total").textContent=mxs(t.total); $("#s_dep").textContent=t.dep?mxs(t.dep):"—";
$("#s_kw").textContent=pot?mxs(t.total/pot):"—";
$("#s_conn").textContent=con?mxs(t.total/con):"—";
$("#s_lines").textContent=t.on.length; $("#s_idd").textContent=t.idd.toFixed(2);
$("#s_class").textContent=t.cl.nom; $("#s_class_n").textContent="Clase "+t.cl.c+" · "+t.cl.use;
const marks=CLASES.filter(c=>c.idd>0).map(c=>`<div class="tick" style="left:${c.idd*100}%"></div>`).join("");
$("#s_track").innerHTML=`<div class="fillp" style="width:${(t.idd*100).toFixed(1)}%"></div>${marks}<div class="mk" style="left:calc(${(t.idd*100).toFixed(1)}% - 1.5px)"></div>`;
const idxNow=CLASES.findIndex(c=>c.c===t.cl.c);
const nextCl=idxNow<CLASES.length-1?CLASES[idxNow+1]:null;
$("#s_ladder").innerHTML=[...CLASES].reverse().map(c=>{
const st=c.c===t.cl.c?"now":(c.c>t.cl.c?"done":(nextCl&&c.c===nextCl.c?"next":""));
const lbl=c.c===t.cl.c?"Estás aquí":(c.c>t.cl.c?"Superada":(nextCl&&c.c===nextCl.c?"Siguiente meta":"Requiere índice "+c.idd.toFixed(2)));
return `<div class="rung ${st}"><div class="cn">Clase ${c.c}</div>
      <div><div class="nm">${c.nom}</div><div class="xs muted">${lbl}${c.c!==t.cl.c?" · índice "+c.idd.toFixed(2)+" o más":" · índice actual "+t.idd.toFixed(2)}</div></div>
      <div class="rg">${c.lo}% / +${c.hi}%</div></div>`;}).join("");
const need=thr=>{
const target=thr*t.tec, W=t.idd*t.tec; if(W>=target) return null;
let def=target-W, acc=0; const list=[];
const cands=t.capex.filter(r=>r.imp>0&&S[r.tax]<1).map(r=>({...r,gain:r.imp*(1-S[r.tax])})).sort((a,b)=>b.gain-a.gain);
for(const c of cands){ if(acc>=def) break; list.push(c); acc+=c.gain; }
return {list,monto:list.reduce((a,b)=>a+b.imp,0),alcanzable:acc>=def};
};
const nx=nextCl?need(nextCl.idd):null, top=need(.92);
let nh="";
if(!nextCl){ nh=`<div class="note"><b>Nivel máximo alcanzado.</b> El estimado está en Clase 1 y puede sostenerse como precio contractual.</div>`; }
else if(nx){
nh=`<div class="note"><b>Para pasar a Clase ${nextCl.c} — ${nextCl.nom}</b> hay que llevar a dato validado ${nx.list.length} partida${nx.list.length===1?"":"s"}, que suman <b style="color:var(--accent)">${mx(nx.monto)}</b> (${(nx.monto/t.tec*100).toFixed(0)}% del costo directo). El rango se cerraría a ${nextCl.lo}% / +${nextCl.hi}%.</div>
    <div style="margin-top:12px">${nx.list.slice(0,6).map(r=>`<div class="gap">
<span class="badge b-${r.tax}" style="min-width:132px;justify-content:center">${TAXN[r.tax]}</span>
<span style="flex:1"><b>${r.c}</b> ${r.d}</span>
<span class="num" style="color:var(--accent);font-weight:600">${mx(r.imp)}</span></div>`).join("")}
      ${nx.list.length>6?`<div class="xs muted" style="padding-top:8px">y ${nx.list.length-6} partida(s) más</div>`:""}</div>`;
if(top&&top.list.length) nh+=`<div class="note" style="margin-top:14px"><b>Para llegar a Clase 1</b>, la de mayor precisión, hay que cotizar y validar ${top.list.length} partidas por <b>${mx(top.monto)}</b>, o sea ${(top.monto/t.tec*100).toFixed(0)}% del costo directo. Es el camino completo, no solo el siguiente escalón.</div>`;
}
$("#s_next").innerHTML=nh;
$("#s_rango").innerHTML=`<span style="color:var(--accent-2)">${mx(t.total*(1+t.cl.lo/100))}</span> &nbsp;a&nbsp; <span style="color:var(--danger)">${mx(t.total*(1+t.cl.hi/100))}</span>`;
$("#s_rango_n").textContent=`Rango de clase ${t.cl.lo}% / +${t.cl.hi}%, para comunicar al exterior. Agregando el rango de cada partida el resultado es ${t.lo.toFixed(0)}% / +${t.hi.toFixed(0)}%: se usa el más amplio de los dos porque el agregado no captura el riesgo de alcance faltante.`;
const alw=t.capex.filter(r=>r.tax==="allowance"), alwT=alw.reduce((a,b)=>a+b.imp,0);
$("#s_cap").innerHTML=alw.length?`<b>${alw.length} partidas son provisiones sin base de precio</b>, por ${mx(alwT)} (${(alwT/t.tec*100).toFixed(0)}% del costo directo)${t.dep?`, más un depósito de garantía de ${mx(t.dep)} que también es extrapolación`:""}. El estimado no puede subir de clase hasta cotizarlas.`
:`<b>Sin provisiones ciegas.</b> Todas las partidas tienen al menos una fuente identificable.`;
const qs={}; t.capex.forEach(r=>qs[r.tax]=(qs[r.tax]||0)+r.imp);
const ord=["validado","fuente","supuesto","allowance"];
$("#s_qual").innerHTML=`<div class="qbar">${ord.map(k=>`<span style="width:${(qs[k]||0)/t.tec*100}%;background:${COL[k]}"></span>`).join("")}</div>`+
ord.map(k=>`<div class="row sp"><span class="badge b-${k}"><span class="dot"></span>${TAXN[k]}</span><span style="font-variant-numeric:tabular-nums"><b>${mx(qs[k]||0)}</b> <span class="muted tiny">${((qs[k]||0)/t.tec*100).toFixed(0)}%</span></span></div>`).join("")+
`<div class="note" style="margin-top:6px">Ponderado por importe, no por número de renglones: un renglón mal sustentado en una partida dominante pesa más que cuarenta validados en partidas menores.</div>`;
drawTreemap(t); drawRange(t); drawScatter(t); renderGen(t);
["#treemap","#rangechart","#scatter"].forEach(sel=>{const c=$(sel); if(!c||c._goc)return; c._goc=1;
  c.addEventListener("click",ev=>{ let n=ev.target;
    while(n&&n!==c){ if(n.dataset&&n.dataset.goc){ goCat(n.dataset.goc); return; } n=n.parentNode; } });});
const ex=[];
if(cfg.cliEvse) ex.push(["Suministro de los equipos de carga","Beyond ejecuta el montaje, la conexión y la puesta en servicio."]);
if(cfg.cliTrafo) ex.push(["Suministro del transformador de media tensión","Beyond ejecuta la maniobra, la base y la conexión."]);
if(cfg.cliCctv) ex.push(["Suministro del equipo de videovigilancia","Beyond ejecuta el cableado y el montaje."]);
if(cfg.cliIng) ex.push(["Ingeniería básica","La entrega el cliente. Beyond desarrolla el detalle y el expediente de verificación."]);
if(!cfg.derechos) ex.push(["Pago de derechos oficiales","Se cotiza la gestión ante el municipio y el suministrador, no los derechos."]);
if(!cfg.via) ex.push(["Derechos de vía y permisos de trayectoria","Aplica si la canalización cruza predios de terceros."]);
if(t.dep) ex.push(["Depósito en garantía ante el suministrador","Garantía reembolsable de "+mx(t.dep)+". El monto lo determina el suministrador."]);
ex.push(["Obra civil oculta","Interferencias o condiciones de subsuelo distintas a las previstas."]);
ex.push(["IVA",""]);
$("#a_excl").innerHTML=ex.map(([a,b])=>`<div style="display:flex;gap:10px;align-items:flex-start">
    <span style="color:var(--accent);font-weight:600;line-height:1.4">—</span>
    <span><b style="font-size:13px">${a}</b>${b?`<div class="xs muted" style="margin-top:2px">${b}</div>`:""}</span></div>`).join("");
const efe=[];
const off=rows.filter(r=>r.pu===0&&r.q>0);
efe.push(["Partidas excluidas del costo",off.filter(r=>r.tax==="validado").length]);
efe.push(["Partidas incluidas sin monto capturado",off.filter(r=>r.tax==="allowance").length]);
$("#a_efecto").innerHTML=efe.map(([a,b])=>`<div class="derived"><span class="muted">${a}</span><b>${b}</b></div>`).join("")+
(off.filter(r=>r.tax==="allowance").length?`<div class="note warn" style="margin-top:10px">Hay partidas dentro del alcance sin monto. Aparecen en el catálogo con importe cero y el estimado las cuenta como sin base: captura el monto real antes de emitir propuesta.</div>`
:`<div class="note" style="margin-top:10px">Todo lo incluido en el alcance tiene un monto asociado.</div>`);
const blk=t.on.filter(r=>S[r.tax]<1&&r.imp>0).map(r=>({...r,impacto:r.imp*(1-S[r.tax])})).sort((a,b)=>b.impacto-a.impacto).slice(0,10);
$("#p_list").innerHTML=blk.map((r,i)=>`<div class="blk"><div class="rank">${String(i+1).padStart(2,"0")}</div>
    <div style="flex:1;min-width:0"><div class="row sp" style="align-items:flex-start;gap:14px"><div><b>${r.c}</b> — ${r.d}
    <div class="row" style="margin-top:6px"><span class="badge b-${r.tax}"><span class="dot"></span>${TAXN[r.tax]}</span><span class="chip">Importe ${mx(r.imp)}</span>${r.tr==="dep"?'<span class="chip">Garantía reembolsable</span>':""}${r.tr==="pass"?'<span class="chip">Pass-through</span>':""}</div></div>
    <div style="text-align:right"><div class="xs muted">Dinero en riesgo</div><div class="impact">${mx(r.impacto)}</div></div></div>
    <div class="tiny muted" style="margin-top:8px">${r.r}</div></div></div>`).join("");
$("#p_tabla").innerHTML=[...CLASES].reverse().map(c=>`<tr><td>${c.idd.toFixed(2)} +</td><td><b>Clase ${c.c}</b></td><td>${c.nom}</td><td class="num">${c.lo}% / +${c.hi}%</td></tr>`).join("");
const bq=(bf.q||"").toLowerCase();
const vis=rows.filter(r=>(!bf.cat||r.cat===bf.cat)&&(!bq||(r.c+" "+r.d).toLowerCase().includes(bq)));
const groups={}; vis.forEach(r=>{(groups[r.cat]=groups[r.cat]||[]).push(r)});
let html="";
for(const k of Object.keys(CATN)){ if(!groups[k])continue;
const st=groups[k].filter(r=>r.q>0).reduce((a,b)=>a+b.imp,0);
html+=`<tr class="catrow" id="cat-${k}"><td colspan="5">${k} · ${CATN[k]}</td><td class="num">${mx(st)}</td><td colspan="2"></td></tr>`;
for(const r of groups[k]) html+=`<tr style="opacity:${r.q>0?1:.42}">
      <td class="wrap" style="font-size:12px">${r.c}</td><td class="wrap">${r.d}</td><td class="u">${uab(r.u)}</td>
      <td class="num"><input type="number" step="any" min="0" value="${Math.round(r.q*100)/100}" data-c="${r.c}" data-k="q"></td>
      <td class="num"><input type="text" inputmode="decimal" class="money" value="${money(r.pu)}" data-c="${r.c}" data-k="pu"></td>
      <td class="num"><b>${mx(r.imp)}</b></td>
      <td class="wrap"><select class="tax b-${r.tax}" data-c="${r.c}" data-k="tax">${["validado","fuente","supuesto","allowance"].map(k=>`<option value="${k}"${r.tax===k?" selected":""}>${TAXN[k]}</option>`).join("")}</select>${(r.eq||r.ep)?'<div class="xs" style="color:var(--accent);margin-top:4px">Monto editado</div>':""}</td>
      <td class="tiny muted wrap">${r.r}</td></tr>`;
}
$("#b_body").innerHTML=html;
$("#b_count").textContent=t.on.length+" de "+rows.length+" renglones activos";
$("#b_filtered").textContent=(bf.cat||bf.q)?(vis.length+" mostrados"):"sin filtro";
const commit=e=>{
const el=e.target, c=el.dataset.c, k=el.dataset.k; if(!c||!k) return;
const r=rows.find(x=>x.c===c); if(!r) return;
const v=unmoney(el.value), cur=(k==="pu"?r.pu:r.q);
if(!isFinite(v)||Math.abs(v-cur)<0.005) return;
edits[c]=edits[c]||{}; edits[c][k]=v; touch(); render();
};
$$("#b_body input").forEach(i=>{
i.addEventListener("change",commit);
i.addEventListener("blur",commit);
i.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); commit(e); } });
});
$$("#b_body select.tax").forEach(i=>i.addEventListener("change",e=>{
const c=e.target.dataset.c;
edits[c]=edits[c]||{}; edits[c].tax=e.target.value; touch(); render();
}));
const bm={}; catalog().forEach(r=>bm[r.c]={q:r.q,pu:r.pu});
let dEd=0;
for(const r of rows){ const b=bm[r.c]; if(b&&(r.eq||r.ep)&&r.tr!=="dep") dEd+=r.imp-(b.q*b.pu); }
const nAp=Object.keys(genApproved).length, nPr=Object.keys(genEdits).length;
const parts=[];
if(Object.keys(edits).length) parts.push(`<b>${Object.keys(edits).length} ${Object.keys(edits).length===1?"renglón editado":"renglones editados"} a mano.</b> Efecto neto sobre el costo directo: <b style="color:var(--accent)">${dEd>=0?"+":""}${mx(dEd)}</b> contra los precios del catálogo.`);
if(nAp) parts.push(`<b>${nAp} ${nAp===1?"precio aprobado":"precios aprobados"}</b> en la base de datos ya alimentan este proyecto.`);
if(nPr) parts.push(`<b style="color:var(--danger)">${nPr} ${nPr===1?"precio propuesto":"precios propuestos"} sin aprobar:</b> todavía no afectan ninguna cifra.`);
$("#s_edits").innerHTML=parts.length?`<div class="note">${parts.join(" ")}</div>`:"";
const nEd=Object.keys(edits).length;
$("#b_edited").innerHTML=nEd?`<b>${nEd} ${nEd===1?"renglón editado":"renglones editados"}, efecto neto ${dEd>=0?"+":""}${mx(dEd)}.</b> Al cambiar un monto también hay que declarar su sustento en la columna correspondiente: es lo que mueve el nivel de definición. Un monto nuevo con sustento de supuesto no sube la clase.`
:`<b>Sin ediciones.</b> Al cambiar un monto, declara también su sustento: si viene de una cotización real, márcalo como dato validado y el nivel de definición del estimado sube.`;
const cs=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
$("#e_gate").innerHTML=t.cl.c<=2?`<b>Nivel suficiente para comprometer precio.</b> Confirma que la lista de exclusiones esté por escrito antes de enviar.`
:`<b>Salida como documento final bloqueada.</b> El estimado está en Clase ${t.cl.c} y solo Clase 2 o mejor permite comprometer precio. Lo que sigue es una vista de referencia.`;
$("#e_doc").innerHTML=`
   <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid rgba(0,0,0,.26);padding-bottom:18px;margin-bottom:22px">
     <div><img src="${LOGO_SRC}" alt="Beyond" style="display:block;width:132px;height:44px;object-fit:contain">
     <div class="eyebrow" style="margin-top:6px">BEYOND AE · INFRAESTRUCTURA DE CARGA</div></div>
     <div style="text-align:right"><div class="eyebrow">Proyecto</div><div style="font-weight:600">${cfg.nom||"Sin nombre"}</div>
     <div style="color:#5A5A57;font-size:12px">${[cfg.loc,n+" equipos de carga",pot.toLocaleString("es-MX")+" kW",kva.toLocaleString("es-MX")+" kVA",cfg.kwp?cfg.kwp+" kWp":"",cfg.bess?(cfg.bess*cfg.besskwh).toLocaleString("es-MX")+" kWh":"",con+" puntos"].filter(Boolean).join(" · ")}</div></div>
   </div>
   <h3>Propuesta económica</h3>
   <p style="max-width:660px">Estación de carga en corriente directa de ${pot.toLocaleString("es-MX")} kW distribuidos en ${n} equipos y ${con} puntos de carga, alimentada en media tensión con transformador de ${kva.toLocaleString("es-MX")} kVA${cfg.kwp?`, con generación fotovoltaica de ${cfg.kwp} kWp`:""}${cfg.bess?` y almacenamiento de ${(cfg.bess*cfg.besskwh).toLocaleString("es-MX")} kWh`:""}. Ingeniería y construcción bajo NOM-001-SEDE-2012.</p>
   <div style="background:#F0EFEC;border-radius:10px;padding:16px 18px;margin:22px 0">
     <div class="eyebrow" style="margin-bottom:6px">Nivel de definición de la propuesta</div>
     <div style="font-weight:600;font-size:16px">${t.cl.nom} — precisión esperada ${t.cl.lo}% / +${t.cl.hi}%</div>
     <div style="font-size:12px;color:#5A5A57;margin-top:6px">${t.cl.use} Esta cifra no constituye un precio cerrado y pierde vigencia al cambiar el alcance, las condiciones del sitio o las respuestas del suministrador de energía.</div>
   </div>
   <table><thead><tr><th>Partida</th><th class="num">Importe (MXN)</th><th class="num">%</th></tr></thead><tbody>
   ${cs.map(([k,v])=>`<tr><td>${CATN[k]}</td><td class="num">${mx(v)}</td><td class="num">${(v/t.tec*100).toFixed(1)}%</td></tr>`).join("")}
   <tr><td><b>Subtotal de obra y equipo</b></td><td class="num"><b>${mx(t.tec)}</b></td><td class="num"></td></tr>
   ${t.fee?`<tr><td>Indirectos y administración de proyecto</td><td class="num">${mx(t.fee)}</td><td class="num"></td></tr>`:""}
   ${t.cont?`<tr><td>Reserva de contingencia (${cfg.cont}%)</td><td class="num">${mx(t.cont)}</td><td class="num"></td></tr>`:""}
   <tr><td style="border-bottom:0"><b>Inversión total, más IVA</b></td><td class="num accent" style="border-bottom:0;font-size:15px"><b>${mx(t.total)}</b></td><td class="num" style="border-bottom:0"></td></tr>
   </tbody></table>
   <h4 style="margin-top:26px">No incluido</h4>
   <ul style="margin:8px 0 0;padding-left:20px">
     ${t.dep?`<li>Depósito en garantía ante el suministrador de energía, del orden de ${mx(t.dep)}. Es una garantía reembolsable, no un costo de obra, y su monto lo determina el suministrador.</li>`:""}
     ${cfg.derechos?"":"<li>Pago de derechos oficiales municipales y del suministrador de energía. Se cotiza la gestión, no los derechos.</li>"}
     ${cfg.via?"":"<li>Derechos de vía o permisos de trayectoria si la canalización cruza predios de terceros.</li>"}
     ${cfg.cliEvse?"<li>Suministro de los equipos de carga. Beyond ejecuta el montaje, la conexión y la puesta en servicio.</li>":""}
     ${cfg.cliTrafo?"<li>Suministro del transformador de media tensión. Beyond ejecuta la maniobra, la base y la conexión.</li>":""}
     ${cfg.cliCctv?"<li>Suministro del equipo de videovigilancia. Beyond ejecuta el cableado y el montaje.</li>":""}
     ${cfg.cliIng?"<li>Ingeniería básica: unifilar y layout los entrega el cliente.</li>":""}
     <li>Obra civil oculta o condiciones de subsuelo distintas a las previstas.</li>
     <li>IVA.</li>
   </ul>
   <h4 style="margin-top:22px">Qué puede mover esta cifra</h4>
   <p style="margin-top:8px">Las variables con mayor efecto sobre el monto son la cotización formal de los equipos de carga, la respuesta del suministrador de energía sobre aportación de obra y depósito, y el trazo de canalización medido en sitio. Al cerrarlas, el rango se estrecha y la propuesta sube de nivel de definición.</p>
   <div style="border-top:1px solid rgba(0,0,0,.16);margin-top:26px;padding-top:12px;font-size:11px;color:#8C8C88">
     Beyond AE, S.A.P.I. de C.V. · ${cfg.nom||""}${cfg.loc?" · "+cfg.loc:""} · Documento de referencia, no apto para envío sin revisión.
   </div>`;
  try{ const fr=$("#e_frame");
    if(fr){ const d=fr.contentDocument||fr.contentWindow.document;
      d.open(); d.write(docHTML(true)); d.close();
      setTimeout(()=>{ try{ fr.style.height=Math.max(900,d.body.scrollHeight+40)+"px"; }catch(e){} },80);
    } }catch(e){}
}
CAT_GEN.push({c:"SFV-000",cat:"Sistema fotovoltaico",n:"Sistema fotovoltaico llave en mano",
u:"kWp",pu:14615,t:"fuente",
f:"Referencia de 0.79 dólares por Wp a 18.5 MXN/USD. Cotejo con el desglose por componentes del catálogo: 0.74 dólares por Wp, así que esta referencia es la conservadora.",
fe:"2026-08",ap:"Condicional",mo:"Propia"});
CAT_GEN.sort((a,b)=>a.c.localeCompare(b.c));
const GCATS=[...new Set(CAT_GEN.map(x=>x.cat))].sort();
$("#g_cat").innerHTML='<option value="">Todas las categorías</option>'+GCATS.map(c=>`<option value="${c}">${c}</option>`).join("");
const gf={q:"",cat:"",tax:"",apl:""};
let usedCodes=new Set();
function renderGen(t){
usedCodes=new Set(rows.filter(r=>r.q>0).map(r=>r.c.split("-").slice(0,2).join("-")));
$("#g_tot").textContent=CAT_GEN.length;
$("#g_val").textContent=CAT_GEN.filter(x=>x.t==="validado").length;
$("#g_fue").textContent=CAT_GEN.filter(x=>x.t==="fuente").length;
$("#g_use").textContent=rows.filter(r=>r.q>0).length;
const q=gf.q.toLowerCase();
const list=CAT_GEN.filter(x=>
(!gf.cat||x.cat===gf.cat)&&(!gf.tax||x.t===gf.tax)&&(!gf.apl||x.ap===gf.apl)&&
(!q||(x.c+" "+x.n+" "+(x.f||"")).toLowerCase().includes(q)));
$("#g_count").textContent=list.length+" de "+CAT_GEN.length+" conceptos";
const nPend=Object.keys(genEdits).length, nApr=Object.keys(genApproved).length;
$("#g_gov").innerHTML=nPend
? `<b>${nPend} ${nPend===1?"precio propuesto":"precios propuestos"} en espera de aprobación.</b> Los precios propuestos no entran a los proyectos hasta aprobarse. Aprueba desde la columna de estado.`
: (nApr?`<b>${nApr} ${nApr===1?"precio aprobado":"precios aprobados"} en esta sesión.</b> Ya alimentan el catálogo del proyecto y su base declara el cambio.`
:`<b>Gobierno del catálogo.</b> Cualquiera puede proponer un precio; solo un precio aprobado entra a los proyectos. El precio propuesto queda visible y sin efecto hasta que se aprueba.`);
$("#g_body").innerHTML=list.map(x=>{
const on=usedCodes.has(x.c), pend=genEdits[x.c], apr=genApproved[x.c];
const shown=pend!=null?pend:(apr!=null?apr:x.pu);
return `<tr style="opacity:${on?1:.75}">
    <td class="wrap" style="font-size:12px">${x.c}${on?'<div class="xs" style="color:var(--accent);margin-top:3px">En uso</div>':""}</td>
    <td class="wrap"><b style="font-size:12.5px">${x.n}</b></td>
    <td class="u">${uab(x.u)}</td>
    <td class="num"><input type="text" inputmode="decimal" class="money${pend!=null?" pend":""}" value="${x.u==="%"?shown+"%":money(shown)}" data-g="${x.c}"></td>
    <td class="wrap"><span class="badge b-${apr!=null?"validado":x.t}"><span class="dot"></span>${TAXN[apr!=null?"validado":x.t]}</span></td>
    <td class="wrap">${pend!=null
       ? `<span class="badge b-accent" style="margin-bottom:5px"><span class="dot"></span>Propuesto</span><div><button class="approve" data-ap="${x.c}">Aprobar</button><button class="revert" data-rv="${x.c}">Descartar</button></div>`
       : (apr!=null?`<span class="badge b-validado"><span class="dot"></span>Aprobado</span><div style="margin-top:4px"><button class="revert" data-rv="${x.c}">Revertir</button></div>`
          :`<span class="tiny muted">${x.ap||""}</span>`)}</td>
    <td class="tiny muted wrap">${apr!=null?`<b style="color:var(--text-primary)">Precio aprobado en esta sesión</b>, sustituye a: `:""}${x.f||""}${x.fe?` <span style="color:var(--text-tertiary)">· ${x.fe}</span>`:""}</td></tr>`;}).join("");
const gcommit=e=>{
const c=e.target.dataset.g, x=CAT_GEN.find(y=>y.c===c);
const v=unmoney(e.target.value);
const cur=genApproved[c]!=null?genApproved[c]:x.pu;
if(Math.abs(v-cur)<0.005) delete genEdits[c]; else genEdits[c]=v;
touch(); render();
};
$$("#g_body input[data-g]").forEach(i=>{
i.addEventListener("change",gcommit);
i.addEventListener("blur",gcommit);
i.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); gcommit(e); } });
});
$$("#g_body [data-ap]").forEach(b=>b.addEventListener("click",e=>{
const c=e.target.dataset.ap; genApproved[c]=genEdits[c]; delete genEdits[c]; touch(); render();
}));
$$("#g_body [data-rv]").forEach(b=>b.addEventListener("click",e=>{
const c=e.target.dataset.rv; delete genEdits[c]; delete genApproved[c]; touch(); render();
}));
}
["q","cat","tax","apl"].forEach(k=>{const el=$("#g_"+k);if(el)el.addEventListener("input",e=>{gf[k]=e.target.value;renderGen();});});
const bf={q:"",cat:""};
$("#b_cat").innerHTML='<option value="">Todas las categorías</option>'+Object.entries(CATN).map(([k,v])=>`<option value="${k}">${k} · ${v}</option>`).join("");
$("#b_q").addEventListener("input",e=>{bf.q=e.target.value;render();});
$("#b_cat").addEventListener("change",e=>{bf.cat=e.target.value;render();});
const map={v_nom:"nom",v_loc:"loc",v_modo:"modo",v_kva:"kva",v_balanceoPct:"balanceoPct",v_kwp:"kwp",v_fvModo:"fvModo",v_fvUsdWp:"fvUsdWp",v_bess:"bess",v_besskwh:"besskwh",v_besskw:"besskw",
v_mbt:"mbt",v_mmt:"mmt",v_dem:"dem",v_piso:"piso",v_tech:"tech",v_fee:"fee",v_cont:"cont",v_fx:"fx"};
const checks={v_balanceo:"balanceo",v_sde:"sde",v_sdeBanos:"sdeBanos",v_techNueva:"techNueva",v_cliEvse:"cliEvse",v_cliTrafo:"cliTrafo",v_cliCctv:"cliCctv",v_cliIng:"cliIng",v_derechos:"derechos",v_via:"via"};
$("#v_modo").innerHTML=Object.entries(MODOS).map(([k,v])=>`<option value="${k}">${v.n}</option>`).join("");
function fill(){ for(const[i,k]of Object.entries(map))$("#"+i).value=cfg[k];
for(const[i,k]of Object.entries(checks))$("#"+i).checked=!!cfg[k]; }
for(const[i,k]of Object.entries(map)) $("#"+i).addEventListener("input",e=>{
const el=e.target;
cfg[k]=(el.type==="number"||el.type==="range")?(parseFloat(el.value)||0):el.value;
if(i==="v_modo"){const m=M();cfg.fee=m.fee;cfg.cont=m.cont;$("#v_fee").value=m.fee;$("#v_cont").value=m.cont;}
touch(); render();
});
for(const[i,k]of Object.entries(checks)) $("#"+i).addEventListener("change",e=>{cfg[k]=e.target.checked?1:0;touch();render();});
const TABS=["conf","alc","res","dist","prec","boq","gen","exp"];
function showTab(t,scroll){
$$(".tab").forEach(x=>x.setAttribute("aria-selected",x.dataset.t===t));
TABS.forEach(k=>$("#p-"+k).classList.toggle("hide",k!==t));
document.querySelector(".wrap").classList.toggle("wide",t==="boq"||t==="gen");
if(scroll!==false) window.scrollTo({top:0,behavior:"smooth"});
}
$$(".tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.t)));
function goCat(cat){ bf.cat=cat; const el=$("#b_cat"); if(el)el.value=cat; render(); showTab("boq");
setTimeout(()=>{const r=document.getElementById("cat-"+cat); if(r&&r.scrollIntoView)r.scrollIntoView({block:"start",behavior:"smooth"});},120); };
window.addEventListener("proyecto:abierto",()=>{
const e0=ctx.proyecto?ctx.proyecto.estado:null;
if(e0&&e0.cfg){ Object.assign(cfg,e0.cfg); edits=e0.edits||{}; genEdits=e0.genEdits||{}; genApproved=e0.genApproved||{}; }
else { edits={}; genEdits={}; genApproved={};
  Object.assign(cfg,{grupos:[],balanceo:0,kwp:0,bess:0,mbt:0,mmt:0,dem:0,piso:0,techNueva:0,tech:0,sde:0});
  cfg.nom=ctx.proyecto?.nombre||""; cfg.loc=ctx.proyecto?.ubicacion||""; }
fill(); render(); showTab("conf",false);
});
const _bv=document.getElementById("b_volver");
if(_bv) _bv.addEventListener("click",()=>{ if(window.volverAPortada) window.volverAPortada(); });
$("#b_addgr").addEventListener("click",()=>{cfg.grupos=cfg.grupos||[];cfg.grupos.push({kw:120,con:2,q:1});render();});
function docHTML(preview,inl){
const A=inl||{fuentes:FONT_FACES,logo:LOGO_SRC};
const css=`${A.fuentes}
@page{size:letter;margin:16mm 14mm}
  *{box-sizing:border-box}
  body{margin:0;background:#fff;color:#333330;font-family:Montserrat,system-ui,Arial,sans-serif;font-size:12.5px;line-height:1.5}
  .sheet{max-width:190mm;margin:0 auto;padding:14mm 12mm}
  h3{font-size:22px;margin:0;color:#1A1A1A;letter-spacing:-.02em}
  h4{font-size:15px;margin:0;color:#1A1A1A}
  .eyebrow{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5A5A57;font-weight:600}
  .mark{font-family:Montserrat,system-ui,Arial,sans-serif;font-weight:700;font-size:26px;color:#B4590C}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  th{text-align:left;color:#5A5A57;border-bottom:1px solid rgba(0,0,0,.26);padding:7px 6px;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
  td{border-bottom:1px solid rgba(0,0,0,.1);padding:7px 6px}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .accent{color:#B4590C;font-weight:600}
  ul{margin:8px 0 0;padding-left:18px} li{margin-bottom:4px}
  @media print{.noprint{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}img{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  .noprint{background:#F0EFEC;border-radius:8px;padding:10px 14px;font-size:11px;color:#5A5A57;margin-bottom:14px}`;
return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
  <title>${(cfg.nom||"Propuesta").replace(/[<>&]/g,"")} — Beyond</title>
    <style>${css}</style></head><body><div class="sheet">
  ${preview?"":'<div class="noprint">Documento listo para imprimir. Usa Imprimir del navegador y elige Guardar como PDF, tamaño Carta. Este aviso no aparece en la impresión.</div>'}
  ${$("#e_doc").innerHTML.replace(LOGO_SRC,A.logo)}
  </div></body></html>`;
}
/* Un archivo descargado se abre desde el disco, donde las rutas relativas al
   sitio ya no existen y las fuentes de otro origen quedan bloqueadas. Por eso
   el documento que se descarga lleva logo y tipografías incrustados. */
async function comoDataURL(url){
  const r=await fetch(url); if(!r.ok) throw new Error("No se pudo leer "+url);
  const b=await r.blob();
  return await new Promise((ok,mal)=>{ const f=new FileReader();
    f.onload=()=>ok(f.result); f.onerror=()=>mal(f.error); f.readAsDataURL(b); });
}
let _inl=null;
async function activosIncrustados(){
  if(_inl) return _inl;
  const logo=await comoDataURL(LOGO_SRC);
  const urls=[...FONT_FACES.matchAll(/url\("([^"]+)"\)/g)].map(m=>m[1]);
  let fuentes=FONT_FACES;
  for(const u of urls){
    try{ fuentes=fuentes.replace(u, await comoDataURL(u)); }catch(e){}
  }
  _inl={logo,fuentes};
  return _inl;
}
function fileName(){ return (cfg.nom||"propuesta").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase()+"-propuesta.html"; }
/* El diálogo de impresión del sistema es lo único que produce un PDF real;
   el archivo .html descargado es el respaldo portable, no el PDF en sí. */
function abrirDialogoImpresion(html){
  return new Promise(resolve=>{
    const iframe=document.createElement("iframe");
    iframe.style.position="fixed"; iframe.style.width="0"; iframe.style.height="0";
    iframe.style.border="0"; iframe.style.right="0"; iframe.style.bottom="0";
    iframe.addEventListener("load",()=>{
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(()=>{ iframe.remove(); resolve(); },1000);
    },{once:true});
    document.body.appendChild(iframe);
    iframe.srcdoc=html;
  });
}
$("#b_dl").addEventListener("click",async e=>{
const msg=$("#e_msg"), b=e.target, rot=b.textContent;
b.disabled=true; b.textContent="Preparando…";
msg.innerHTML='<span class="muted">Incrustando logotipo y tipografías…</span>';
try{
const inl=await activosIncrustados();
const html=docHTML(false,inl);
const blob=new Blob([html],{type:"text/html;charset=utf-8"});
const url=URL.createObjectURL(blob);
const a=document.createElement("a"); a.href=url; a.download=fileName();
document.body.appendChild(a); a.click(); a.remove();
setTimeout(()=>URL.revokeObjectURL(url),4000);
msg.innerHTML='<span class="muted">Archivo de respaldo descargado. Abriendo el diálogo de impresión para el PDF…</span>';
await abrirDialogoImpresion(html);
msg.innerHTML='<span style="color:var(--success)">Listo. En el diálogo de impresión elige Guardar como PDF, tamaño Carta. También descargamos '+fileName()+' como respaldo con el logotipo y las tipografías incrustados, por si necesitas abrirlo sin conexión.</span>';
}catch(err){
msg.innerHTML='<span style="color:var(--danger)">No se pudo generar el archivo: '+(err&&err.message||err)+'</span>';
}
b.disabled=false; b.textContent=rot;
});
const KEY="beyond:est:proyecto-activo";
let dirty=false;
let autoT=null;
function touch(){ dirty=true;
$$(".dirty").forEach(e=>{e.textContent="Cambios sin guardar…";e.style.color="var(--accent)";});
clearTimeout(autoT); autoT=setTimeout(()=>save(null,true),700);
}
function snapshot(){ const t=totals();
return JSON.stringify({v:1,cfg,edits,genEdits,genApproved,
  total:Math.round(t.total),directo:Math.round(t.tec),clase:t.cl.nom,idd:Number(t.idd.toFixed(3))}); }
async function save(btn,auto){ const o=btn?btn.textContent:"";
if(DB.modo==="sin almacenamiento"){ $$(".dirty").forEach(e=>{e.textContent="Sin almacenamiento: usa Copiar respaldo";e.style.color="var(--warning)";}); return; }
try{ const snap=snapshot();
if(ctx.proyecto && puede.editar){ await guardarEstado(JSON.parse(snap)); }
await DB.set(KEY,snap);
dirty=false; if(btn)btn.textContent="Guardado";
const t=new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
$$(".dirty").forEach(e=>{e.textContent=(auto?"Guardado automático ":"Guardado ")+t;e.style.color="var(--success)";});
} catch(e){
if(btn)btn.textContent="No se pudo guardar";
$$(".dirty").forEach(e=>{e.textContent="No se pudo guardar. Copia el respaldo.";e.style.color="var(--danger)";});
}
if(btn) setTimeout(()=>btn.textContent=o,1800); }
function restore(txt){
try{ const d=JSON.parse(txt);
if(!d||!d.cfg) throw new Error("El respaldo no tiene datos de proyecto.");
Object.assign(cfg,d.cfg); edits=d.edits||{}; genEdits=d.genEdits||{}; genApproved=d.genApproved||{};
fill(); touch(); render();
return {ok:true,n:Object.keys(edits).length,a:Object.keys(genApproved).length};
}catch(e){ return {ok:false,m:e.message}; }
}
$("#b_save").addEventListener("click",e=>save(e.target));
$("#b_save2").addEventListener("click",e=>save(e.target));
$("#b_copy").addEventListener("click",async e=>{
const txt=snapshot(); const b=e.target, o=b.textContent;
$("#bkBox").classList.remove("hide"); $("#bk").value=txt;
try{ await navigator.clipboard.writeText(txt); b.textContent="Copiado"; }
catch(err){ b.textContent="Selecciona y copia abajo"; $("#bk").select&&$("#bk").select(); }
$("#bkMsg").innerHTML='<span class="muted">Respaldo generado. Guárdalo en un archivo de texto: con esto restauras el proyecto completo en cualquier versión del instrumento.</span>';
setTimeout(()=>b.textContent=o,2000);
});
$("#b_paste").addEventListener("click",()=>{ $("#bkBox").classList.remove("hide"); $("#bk").value=""; $("#bkMsg").innerHTML='<span class="muted">Pega el respaldo y presiona Restaurar.</span>'; });
$("#b_restore").addEventListener("click",()=>{
const r=restore($("#bk").value.trim());
$("#bkMsg").innerHTML=r.ok
? `<span style="color:var(--success)">Restaurado: configuración del proyecto, ${r.n} renglón(es) editado(s) y ${r.a} precio(s) aprobado(s).</span>`
: `<span style="color:var(--danger)">No se pudo restaurar: ${r.m}</span>`;
});
$("#b_reset").addEventListener("click",()=>{edits={};render();});
$("#b_reset2").addEventListener("click",()=>{edits={};render();});
window.addEventListener("error",ev=>{
  const b=document.getElementById("bootfail");
  if(b){ b.classList.remove("hide"); b.textContent="El instrumento no arrancó: "+(ev.message||"error de carga")+". Si el archivo se abrió incompleto, vuelve a abrirlo; si persiste, avísame."; }
});
function boot(msg){ const b=document.getElementById("bootfail");
  if(b){ b.classList.remove("hide"); b.innerHTML="<b>El instrumento no arrancó.</b> "+msg; } }
window.addEventListener("error",ev=>boot((ev.message||"error")+(ev.lineno?" (línea "+ev.lineno+")":"")));
window.addEventListener("unhandledrejection",ev=>boot("Promesa rechazada: "+(ev.reason&&ev.reason.message||ev.reason)));
(async()=>{ try{
try{
const e0=ctx.proyecto?ctx.proyecto.estado:null;
if(e0&&e0.cfg){ Object.assign(cfg,e0.cfg); edits=e0.edits||{}; genEdits=e0.genEdits||{}; genApproved=e0.genApproved||{}; }
else if(ctx.proyecto){ cfg.nom=ctx.proyecto.nombre||""; cfg.loc=ctx.proyecto.ubicacion||""; }
else { const r=await DB.get(KEY);
  if(r&&r.value){const d=JSON.parse(r.value);Object.assign(cfg,d.cfg||{});edits=d.edits||{};
  genEdits=d.genEdits||{}; genApproved=d.genApproved||{};} }
}catch(e){}
fill(); render(); showTab("conf",false);
  const _b=document.getElementById("bootfail"); if(_b) _b.remove();
  } catch(err){ boot((err&&err.message||err)+". Vuelve a abrir el archivo; si persiste, avísame con este mensaje."); }
})();
