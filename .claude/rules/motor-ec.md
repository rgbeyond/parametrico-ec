---
paths:
  - "src/lib/app.js"
  - "src/lib/datos.js"
  - "src/data/catalogo.json"
---

# Motor del estimador paramétrico

Reemplaza las secciones de CLAUDE.md sobre dimensionamiento eléctrico, tarifa
GDMTH y depósito en garantía.

## Deuda declarada, y cómo tocarla

`src/lib/app.js` son ~1,076 líneas heredadas de un prototipo subido por
interfaz web. **Dividirlo por pestaña es la primera refactorización pendiente,
pero este repositorio no tiene ninguna prueba automatizada.** El orden correcto
es pruebas primero, división después. Ya se rompió varias veces.

## Reglas de dimensionamiento que no se negocian

**Norma vigente: NOM-001-SEDE-2012.** La revisión 2018 nunca se publicó en el
DOF; no citarla. Interruptores principales y derivados se verifican contra 125%
de la carga continua, artículo 625-21.

**El transformador se dimensiona contra la demanda de diseño, no contra la suma
de placas.** Con balanceo dinámico declarado, la demanda de diseño es la
potencia instalada menos el porcentaje reservado; sin balanceo son iguales. La
conversión de kW a kVA usa `FP_DIM` 0.80 y `MARGEN_TRAFO` 1.10.

Ese 0.80 es **criterio de dimensionamiento de Beyond, no el factor de potencia
del equipo**: los cargadores de corriente directa con corrección activa operan
entre 0.95 y 0.99, así que el criterio ya incorpora del orden de 16% de colchón
encima del margen explícito. **No lo presentes como si fuera la física del
equipo.** El balance eléctrico convierte en el sentido inverso con el mismo
0.80, a propósito: con dos valores distintos los dos paneles se contradicen.
Sujeto a validación contra proyectos cerrados.

**La reserva de balanceo tiene consecuencia operativa**, no solo de costo: en el
pico los vehículos cargan más lento. Es decisión comercial de throughput y va
declarada en la propuesta. Depende de `GE-001`: sin sistema de gestión no se
sostiene la reserva, y por lo tanto tampoco se puede dimensionar el
transformador por debajo de la suma de placas.

**El balance eléctrico compara kVA contra kVA**, no kW contra kW.

**Las tensiones se declaran, no se asumen.** 23 kV y 480 V por omisión. A
1,500 kVA la diferencia entre 440 V y 480 V son 1,968 A contra 1,804 A: marcos
de interruptor distintos. Los materiales de media tensión del catálogo son clase
25 kV; si se declara otra tensión primaria la app avisa pero **no** cambia los
materiales.

## Tarifa GDMTH

**El depósito en garantía se calcula sobre la demanda contratada, no sobre el
transformador.** Apartado 9 de la tarifa: tres veces el cargo por capacidad
aplicado a cada kW de demanda contratada. La provisión histórica de $3,100/kVA
sobre la capacidad del transformador está calculada sobre la variable
equivocada y sobreestima. Con el cargo por capacidad capturado, `CFE-005` pasa
de `allowance` a `fuente`.

**La demanda contratada tiene piso de tarifa.** Apartado 4: no menor al 60% de
la carga total conectada, ni menor a 100 kW.

**Cobro medido contra calculado.** El cargo por capacidad se aplica a la
**menor** entre la demanda máxima medida en punta y `Q/(24 × d × F.C.)`; el de
distribución, entre la máxima **mensual** y la misma fórmula. Dos consecuencias
para cualquier modelo de recorte de picos: recortar solo en punta no baja el
cargo por distribución, y si manda el término calculado, recortar el pico no
ahorra nada en capacidad.

## Motor de cantidades: pendiente de validar

Alimentadores de baja tensión, tableros e interruptores derivados, sistema de
tierras, aportación y depósito del suministrador se calculan con reglas de
escalamiento lineal declaradas en el propio renglón. **Validar contra proyectos
cerrados antes de usarlas en propuesta firme.**
