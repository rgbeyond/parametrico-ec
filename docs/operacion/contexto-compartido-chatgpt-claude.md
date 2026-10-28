# Contexto canónico compartido — ChatGPT + Claude Code

**Estado:** documento vivo obligatorio
**Última actualización:** 2026-10-28 (ficha Compartir y sesión O&M de relevo; §28)
**Copia canónica:** `rgbeyond/beyond-platform`, rama `claude/infra-claude-code`
**Espejos:** mismo path en `rgbeyond/propuestas-fv` y `rgbeyond/parametrico-ec`

> Este archivo existe para que una sesión nueva de Claude Code, ChatGPT u otro agente no dependa de memoria conversacional. Antes de continuar trabajo de Beyond, debe leerse junto con el issue activo y la evidencia más reciente.
>
> Alcance: conserva el contenido **operativo y de producto** de la conversación de trabajo Beyond entre RG, ChatGPT y Claude. No contiene razonamiento privado de los modelos, mensajes de sistema, credenciales, secretos ni PII innecesaria de clientes. Tampoco replica conversaciones personales/no relacionadas con el proyecto.

> **Estado vigente:** control maestro y §21–28 para OM-EV-ENERLINK/C3a/C3b; protocolo de cierre bilateral en §20. Las referencias anteriores de secuencia son históricas cuando contradigan decisiones posteriores de RG.

---

## 1. Regla principal de coordinación

RG estableció como requisito: **“lo que sea que hagas necesito que Claude lo sepa también”**.

Por tanto:

1. todo cambio hecho fuera de Claude debe quedar persistido en GitHub antes de pedirle a Claude que continúe;
2. Claude debe sincronizar/fetch de las ramas coordinadas y leer este documento + issue activo + evidencia reciente antes de escribir;
3. no repetir acciones ya ejecutadas sólo porque una sesión nueva no las recuerde;
4. un solo writer por sistema/archivo/rama; reviewers pueden ser read-only;
5. no hacer escrituras simultáneas sobre el mismo sistema;
6. cada handoff debe decir: qué cambió, qué ya está hecho, qué NO repetir, qué no se tocó, pruebas/evidencia y siguiente paso;
7. GitHub es la fuente de verdad compartida, no la memoria de ChatGPT ni la de una sesión concreta de Claude.

Cuando este archivo cambie, las tres copias deben actualizarse en la misma operación de coordinación. Si hay discrepancia, manda la copia de `beyond-platform`.

---

## 2. Cómo trabaja RG — importante para instrucciones de interfaz

RG usa **Claude Desktop / la sección Code de la aplicación**, no Claude Code desde una terminal/Bash como interfaz principal.

Consecuencias:

- no dar por hecho que RG está en una terminal;
- no decir “abre Bash”, “abre la terminal” o “ejecuta `claude`” como paso normal;
- cuando se requiera una sesión nueva, hablar de **Claude Desktop → Code → nueva sesión / carpeta o repo correspondiente**;
- comandos slash como `/doctor`, `/permissions`, `/hooks`, `/plugin` se ejecutan dentro de la interfaz Code cuando estén disponibles;
- si una acción puede hacerla el agente directamente, hacerla; detener el flujo paso a paso sólo cuando RG deba observar/configurar algo manualmente;
- RG prefiere una sola siguiente acción concreta a la vez cuando se necesita intervención manual.

Error ya cometido y que no debe repetirse: ChatGPT indicó “abrir una sesión nueva en Paramétrico” con lenguaje de terminal; RG aclaró que usa la aplicación Desktop.

---

## 3. Repositorios y producto

Repositorios coordinados:

- `rgbeyond/beyond-platform` — Core/backend compartido.
- `rgbeyond/parametrico-ec` — Paramétrico de Estaciones de Carga.
- `rgbeyond/propuestas-fv` — producto que debe llamarse **Proyectos de Energía** a nivel de producto; el nombre técnico del repo se mantiene.

Dirección de producto acordada:

- shell común Beyond: Login → Beyond Platform → organización → módulos → proyectos;
- integrar primero Proyectos de Energía completamente al Core;
- después integrar Estaciones de Carga;
- unificar autenticación/sesión/contexto de organización y proyecto;
- cada bloque no crítico debe terminar con algo visible/operable en DEV;
- hacer checkpoint de decisiones de producto antes de seguir agregando infraestructura invisible.

---

## 4. Límites duros de seguridad

- **PROD no se modifica sin autorización explícita y separada de RG.**
- no merge/push a `main` ni deploy de producción por inferencia;
- autorización para DEV nunca implica autorización para PROD;
- lecturas de PROD, si fueran indispensables, deben declararse antes;
- migraciones ya aplicadas son inmutables: cualquier DDL futuro va en nueva migración;
- no usar `bypassPermissions` en flujo normal;
- no basar autorización en `user_metadata`;
- RLS = Row Level Security; debe seguir siendo frontera real en Supabase;
- secretos, credenciales y PII de clientes no deben incorporarse al repo salvo necesidad explícita y controlada.

---

## 5. Supabase — entornos conocidos

**Beyond DEV**
- project ref: `gtxvzbeyywtqihfcvezk`
- se usa para E2E y validación.

**Beyond PROD**
- project ref: `xteroaxzhkixehnnbpbh`
- contiene usuarios/datos reales.
- no modificar sin autorización explícita.

La preview de Proyectos de Energía se corrigió para usar variables de **DEV** en Netlify Deploy Previews. La producción de Netlify no se cambió. Supabase DEV tiene allowlist para la preview de Netlify. No alterar Site URL por inferencia.

---

## 6. Fase 1A — cerrada

Objetivo: catálogo común y compatibilidad de Paramétrico con Beyond DEV.

Hechos relevantes:

- Phase 1A cerrada; issue backend #1 completado.
- Paramétrico usa `catalogoMaestro()` / `fn_conceptos_de('ec')` y valida ámbitos.
- no hay fallback silencioso cuando nube+sesión fallan: se muestra error explícito.
- preview DEV de Paramétrico validó Google OAuth y catálogo real.
- draft PR de Paramétrico permanece **NO MERGE** salvo nueva decisión.

Documentos canónicos históricos del backend:

- `docs/operacion/estado-actual-2026-08-28.md`
- `docs/operacion/validacion-catalogo-dev-2026-08-28.md`
- `docs/operacion/protocolo-coordinacion-multiagente.md`

---

## 7. Fase 1B / Core — cerrada

Objetivo: organizaciones, membresías, proyecto universal, capacidades, invitaciones, auditoría y documentos.

Decisiones canónicas:

- `bp_proyectos` es contenedor Core universal.
- `proyectos` (EC) y `pf_proyectos` (Proyectos de Energía) son hijos; no se fusionan con Core.
- roles canónicos: admin / editor / comentarista / lector.
- `vendedor` se retira semánticamente.
- usuario interno verificado `@beyond-ae.com` puede tener default lector según reglas Core.
- invitación externa por email exacto.
- no auto-vincular proyectos históricos por nombre.
- proyecto no cambia de organización en 1B.
- admin interno puede operar proyectos de clientes.
- capacidades sensibles se separan del rol cuando tiene sentido.
- borrado físico de proyecto reservado a admin interno; para editor normal la acción de producto es archivar.

Issue backend #2 cerrado. Documento de validación: `docs/operacion/validacion-phase1b-dev-2026-08-29.md`.

Deuda técnica conocida de hardening: warnings de SECURITY DEFINER, protección de password leak, índices FK, initplan de auth y políticas permisivas múltiples. No confundir deuda con fallos funcionales de 1B.

---

## 8. Fase 1C-A — Proyectos de Energía contra Core

Issue backend #3: validación de `propuestas-fv`/Proyectos de Energía contra Core en Beyond DEV.

Ramas históricas de esta fase: `claude/phase1c-a-solar-core` en los tres repos.

### 8.1 Bug Core de upsert — corregido

Proyectos de Energía usa upsert por id. Un trigger BEFORE INSERT podía crear un contenedor Core duplicado antes del `ON CONFLICT`.

Se añadió y aplicó sólo a DEV la migración:

`20260830120000_bp_upsert_dominio.sql`

La prueba transaccional confirmó que el segundo upsert reutiliza el mismo `bp_proyecto_id`. La migración aplicada es inmutable. No reaplicarla.

### 8.2 E2E de autenticación y proyecto

Se creó en DEV un proyecto E2E de Proyectos de Energía y se confirmó:

- Google OAuth vuelve a la preview DEV correcta;
- proyecto de dominio y contenedor Core quedan enlazados;
- edición de datos persiste;
- cambio de pestaña ya no deja contenido central en blanco;
- F5 en deep link ya no deja contenido central en blanco.

Fixes de sesión/deep-link quedaron en la rama Phase 1C-A. No repetir diagnósticos de esos bugs salvo regresión observada.

### 8.3 Persistencia de recibos — bug encontrado y corregido

Un recibo CFE real autorizado por RG se usó **sólo en Beyond DEV** para E2E. No replicar aquí nombres, dirección, número de servicio ni otros identificadores.

Bug encontrado: el cache de `almacen_proyectos.js` se entregaba por referencia; `guardarRecibo()` mutaba el mismo arreglo usado como snapshot “antes”, por lo que el delta veía cero altas y no hacía POST/upsert a `pf_recibos`.

Corrección:

- snapshots clonados con `structuredClone`;
- cache interno separado de la UI;
- regresión añadida;
- v0.35.3 desplegada en preview (la rama avanzó después a **v0.36.0**, ver 8.5).

Resultado E2E confirmado por RG:

- el recibo persiste en `pf_recibos`;
- tras F5 sigue apareciendo y su análisis persiste.

Importante: el análisis JSON sí vive en Supabase. El binario PDF y miniaturas históricamente viven en IndexedDB del navegador; no asumir disponibilidad cross-device del PDF sin completar el flujo de Storage.

### 8.4 Mapeo de columnas indexadas — bug identificado y corregido en rama

El JSON del análisis usa:

- `fecha_inicio_iso`
- `conciliacion.conciliado`

La función `aFilaRecibo` usaba nombres antiguos:

- `fecha_ini_iso`
- `conciliacion.cuadra`

Se corrigió con compatibilidad hacia atrás y se añadió regresión. Commits externos en la rama Phase 1C-A:

- `266ea2e1173f72ea7b38f5fccba15a3752b92a92` — mapeo
- `112678ce3e858abf4e85d3dba218c34529a32fd8` — regresión

La preview de Netlify confirmó deployment sobre `112678ce...`.

### 8.5 Corrección de alcance: `view_billing_data`

Este punto es crítico porque hubo una desviación de producto en la conversación.

Inicialmente 1C-A trató `view_billing_data` como una capability que podía ocultar recibos/facturación incluso a alguien con acceso al proyecto. ChatGPT llegó a retirar temporalmente esa capability en DEV para probar el estado restringido.

RG cuestionó el propósito porque **no corresponde al modelo de usuario discutido desde el inicio**.

Decisión corregida:

- en **Proyectos de Energía**, quien tiene acceso al proyecto debe poder ver los recibos y datos energéticos/facturación necesarios para trabajar en ese proyecto;
- `view_billing_data` **NO debe usarse como gate funcional de Proyectos de Energía**;
- la separación que sí tiene sentido es `view_costs` para costos/márgenes/markup/información comercial interna;
- la capability `view_billing_data` puede permanecer en el Core para otro módulo futuro, pero no debe gobernar Proyectos de Energía salvo nueva aprobación explícita de RG.

El permiso temporal de RG fue restaurado inmediatamente en DEV y verificado activo.

**Estado de implementación — YA EJECUTADO Y VERIFICADO (2026-08-31, registrado 2026-09-01):**

- El gate está **retirado del código de la aplicación** en `propuestas-fv@deaff35` (v0.36.0, rama `claude/phase1c-a-solar-core`): se fue `acceso_recibos` con sus tres estados, la consulta por proyecto a `fn_bp_tiene_capacidad`, el expediente con `recibos: null` y los avisos de las cinco pestañas. Se conservaron las mejoras independientes ya validadas (borrado cloud-first con verificación de filas, error legible de membresía, snapshot del cache, mapeo de recibos). El mismo commit añadió la **puerta de autenticación del shell**: sin sesión sólo se ve la portada, los enlaces profundos vuelven a ella, salir/caducar invalidan la navegación; sin variables de entorno la herramienta local sigue abierta, por diseño. Verificación: 315 pruebas de motor, 31 de navegador, build y reconstrucción canónica en verde.
- La mitad **RLS** del retiro es la migración `20260831042000_bp_recibos_acceso_proyecto.sql` en `beyond-platform` (revisada; redefine las cuatro políticas de `pf_recibos` a `view`/`edit` sobre el proyecto y conserva la capability en el Core y en el bucket `recibos`). Las suites del Core que afirmaban el gate viejo se realinearon en `beyond-platform@91858af..3cfb837` y el arnés completo quedó en verde. Runbook: `docs/operacion/aplicar-recibos-acceso-proyecto.md`.
- **La migración NO está aplicada a Beyond DEV.** Hasta que se aplique, las políticas desplegadas en DEV siguen exigiendo `view_billing_data`: un E2E contra DEV hoy mostraría el comportamiento viejo y eso NO es una regresión de la app.
- **El cuerpo del issue #3 todavía contiene los criterios antiguos** («lectura/escritura de `pf_recibos` respeta `view_billing_data`»). Por la prelación del §15 manda esta decisión corregida; al cerrar #3 hay que validar contra esta sección, no contra ese texto, y conviene enmendar el issue.

### 8.6 Checkpoint final — Phase 1C-A CERRADA (2026-09-01)

La fase quedó completa y el issue #3 cerrado como `completed`. Lo que la cierra:

- **Modelo de permisos validado de punta a punta.** Arnés canónico con la misma
  cadena de migraciones que DEV: suite federada de 13 bloques (acceso por
  membresía/rol, recibos por nivel de proyecto sin `view_billing_data`, viewer
  vs editor sobre recibos Y sobre la fila del proyecto, archivar sí / hard
  delete no, `view_costs` con revocación real y sin superficie cableada, sin
  fugas entre organizaciones). `propuestas-fv@dc9d222`, registro en
  `docs/operacion/e2e-permisos-1ca-2026-09-01.md`.
- **Smoke real de RG en navegador contra la preview DEV: PASS** (proyecto abre,
  recibo visible, edición persiste, F5 y recarga profunda persisten, sin sesión
  sólo portada/login, re-login restaura).
- **Limpieza DEV ejecutada y verificada externamente:** recibo, `pf_proyectos`
  y contenedor Core del E2E eliminados; conteos 0/0/0. No se tocó nada más.
- **El cuerpo del issue #3 quedó enmendado** en sus dos menciones obsoletas de
  `view_billing_data`, con marcas visibles de enmienda.

Pendientes que la fase deja DECLARADOS, no abiertos a medias: superficie de
producto para `view_costs` (la capacidad existe y se revoca bien; nada la
consume aún); deuda de privacidad del corpus (8.7); PR draft del Paramétrico
sigue NO MERGE; la integración de las ramas `claude/phase1c-a-solar-core` e
`claude/infra-claude-code` hacia `main` es una decisión separada de RG.

### 8.7 Deuda de privacidad del repo `propuestas-fv`

Existe corpus versionado con documentos/clientes reales bajo `casos/`. No ampliar esa deuda.

En la infraestructura Claude posterior se decidió proteger **`casos/` entero**, porque incluye no sólo recibos/expedientes sino también salidas y simulaciones con datos reales. La purga histórica completa es una tarea separada; no reescribir historia Git destructivamente por inferencia.

---

## 9. Infraestructura Claude Code — issue #4

Issue backend #4: **Infraestructura Claude Code: agentes, skills, permisos y validación automática**.

Rama coordinada: `claude/infra-claude-code` en los tres repos.

Objetivo: acelerar trabajo sin reducir seguridad y sin convertir permisos en ruido.

Decisiones:

- único writer;
- reviewers/subagentes read-only especializados;
- skills reutilizables de handoff, validación, E2E y migración;
- permiso visible siempre explicado antes en lenguaje sencillo;
- Auto mode para operaciones rutinarias seguras, pero no `bypassPermissions`;
- PROD/main/deploy producción siguen con aprobación explícita;
- Agent Teams no habilitados en esta iteración.

### 9.1 Subagentes y skills

Cinco reviewers read-only:

- `beyond-security-reviewer`
- `beyond-database-reviewer`
- `beyond-frontend-e2e-reviewer`
- `beyond-adversarial-reviewer`
- `beyond-product-ux-reviewer` — agregado en el issue #5; corre en
  `claude-fable-5` por decisión de RG; parte del protocolo de revisión
  frontend.

Skills:

- `/beyond-handoff`
- `/beyond-validate`
- `/beyond-e2e`
- `/beyond-migration`

Reviewers reportan sólo hallazgos >=80% de confianza y no ruido de estilo/refactors opcionales.

### 9.2 Guardias

Los guardias están portados a los tres repos. En Proyectos de Energía el corpus protegido es `casos/` entero.

Guardias relevantes:

- `ejecutar-guardia.sh` — fail closed si el guardia no puede decidir;
- `guardia-secretos.sh`;
- `guardia-destructivo.py`;
- `guardia-commit.py` — inspecciona índice real antes de commit;
- `comprobar-guardias.sh` — canario/aviso en SessionStart;
- `beyond_guard.py`;
- `explain_permission.py`.

El porte con un PDF/binario real descubrió un defecto latente: `git diff` podía producir bytes no UTF-8 y `subprocess.run(..., text=True)` explotaba con `UnicodeDecodeError`. Fallaba cerrado, pero bloqueaba con motivo incorrecto y podía bloquear binarios legítimos. Se corrigió con `errors="replace"` y se añadieron casos de binario real.

Suites de guardias reportadas:

- Proyectos de Energía: 159/159.
- Paramétrico EC: 153/153.
- Beyond Platform: 153/153.

### 9.3 SHAs finales de esta iteración de guardias

Rama `claude/infra-claude-code`:

- `rgbeyond/propuestas-fv` → `1b1661d00f520b10f3c775d473a9d530e32e2692`
- `rgbeyond/parametrico-ec` → `62e8a0f66859fb53ebf455bd6d4fe6677b7bb5b6`
- `rgbeyond/beyond-platform` → `2b46b68d7fa50c42af8292b31692893442c782fa`

CI fue reportado verde en los tres sobre esos SHAs. En Proyectos de Energía se verificó además que el job incluyó `npm test`, build y Playwright/UI.

### 9.4 Auto mode y runtime local

`defaultMode: "auto"` se retiró de settings de proyecto porque no surte efecto allí y puede pisar preferencias. Si RG quiere Auto mode por omisión, debe configurarse a nivel usuario de Claude Desktop/Claude Code.

Comprobaciones que sólo pueden confirmarse en la sesión interactiva de RG:

- `/doctor` sin warnings;
- `/permissions` con allow/ask/deny cargados;
- `/hooks` mostrando PreToolUse, PermissionRequest, SessionStart y PostToolUse donde corresponda;
- permiso inocuo muestra bloque “PERMISO EN LENGUAJE SIMPLE”;
- ausencia de `AVISO DE SEGURIDAD` al arrancar significa que el canario no detectó guardias incompletos;
- `/plugin` debe mostrar marketplace oficial y `security-guidance` habilitado; el contenedor remoto no pudo verificar el marketplace local del usuario.

**Importante:** estas comprobaciones se explican en términos de Claude Desktop, no de terminal.

---

## 10. Política de permisos y explicación a RG

RG no necesita recibir nombres crípticos de tools como explicación.

Antes de un permiso visible, Claude debe explicar en español sencillo:

- qué va a hacer;
- para qué;
- dónde impacta;
- riesgo BAJO/MEDIO/ALTO/CRÍTICO;
- si es reversible y cómo;
- recomendación: permitir una vez / siempre sólo para patrón exacto / denegar.

No pedir “permitir siempre” para comandos compuestos/amplios por comodidad.

---

## 11. Preferencias operativas de RG para este proyecto

- avanzar sin preguntar por cada acción segura que el agente puede ejecutar;
- detenerse cuando haga falta una acción/observación manual de RG;
- cuando se detenga, dar **una sola siguiente acción concreta**;
- mensajes compactos, ejecutivos y sin tesis innecesarias;
- no perder contexto al cambiar de sesión;
- preservar la misma sesión de Claude cuando sea razonable; si se requiere sesión nueva, GitHub/docs deben permitir retomar sin pérdida;
- cualquier acción material hecha por ChatGPT debe quedar disponible para Claude y viceversa.

---

## 12. Qué NO debe asumirse en una sesión nueva

No asumir:

- que RG usa terminal;
- que una capability diseñada en Core automáticamente es requisito de producto en todos los módulos;
- que `view_billing_data` debe restringir Proyectos de Energía;
- que PROD puede tocarse porque DEV funcionó;
- que un receipt visible en UI significa que quedó persistido en DB; verificar cuando corresponda;
- que un PDF está en Storage porque el análisis está en Supabase;
- que un issue/bug ya cerrado debe repetirse porque la sesión no lo recuerda;
- que `propuestas-fv` sigue siendo sólo fotovoltaico: producto = Proyectos de Energía;
- que un cambio externo no existe si no está en el checkout local: sincronizar primero.

---

## 13. Phase 1C-A cerrada — próximos pasos de producto

**Todos los pasos operativos de 1C-A están hechos** (ver 8.6): gate retirado,
migración aplicada y verificada en DEV, E2E de permisos en arnés, smoke real
PASS, limpieza 0/0/0, issue #3 enmendado y cerrado.

Lo que sigue, en orden:

1. **Checkpoint de decisiones de producto — HECHO en el issue #6** (ver
   §17): Proyecto Beyond transversal, taxonomía de dominios, Module
   Contract v1 y dimensiones de acceso. El shell común NO se construye
   todavía; la prioridad vuelve a los módulos funcionales.
2. Decidir la **superficie de producto de `view_costs`**: qué
   pestañas/campos oculta y a quién; la capacidad ya existe y su revocación
   funciona (bloque 13 de la suite federada).
3. Decidir la **integración de ramas**: `claude/phase1c-a-solar-core` e
   `claude/infra-claude-code` hacia `main` son decisiones separadas de RG;
   ningún PR draft se mezcla sin autorización explícita.
4. La **deuda de privacidad del corpus** (8.7) mantiene su tarea propia.

No cerrar 1C-A basándose en la antigua prueba de `view_billing_data`.

---

## 14. Protocolo para futuras actualizaciones de contexto

Cuando RG diga algo que cambie alcance, arquitectura, forma de trabajo o una decisión ya registrada:

1. el agente que recibe la corrección actualiza este documento en `beyond-platform`;
2. replica el mismo contenido a los otros dos repos;
3. registra SHAs en el issue de infraestructura/coordinación o issue activo;
4. si el cambio afecta un issue funcional, añade comentario allí también;
5. sólo entonces se devuelve el control al otro agente.

Esto evita que una corrección hecha en ChatGPT se pierda en Claude o viceversa.

---

## 15. Fuente de verdad por prioridad

En caso de conflicto:

1. instrucción explícita más reciente de RG;
2. este documento, copia canónica de `beyond-platform`;
3. issue activo y comentarios más recientes;
4. documentos de validación/ADR del repo;
5. código/migraciones aplicadas;
6. memoria conversacional del agente.

La memoria del agente nunca debe ganar a una decisión canónica más reciente.

---

## 16. Issue #5 cerrado — Design System y experiencia de acceso v1

Cerrado por RG el 2026-09-01 con validación visual y la instrucción de
**congelar esta dirección visual como v1** para no iterar Platform
indefinidamente. Rama `claude/design-system-ux` de `beyond-platform`
(HEAD `ac5e7ff`, sin merge a `main`).

Queda como baseline para los módulos:

- `design-system/` es el espejo canónico completo del paquete fuente
  (tokens con `[data-theme]` en inglés, fuentes, wordmarks PNG —«beyond»
  en Comfortaa, sin punto—, componentes React, kits website/portal,
  guidelines, SKILL.md). Desviaciones abiertas documentadas en su README
  (p. ej. contraste del token `--focus-ring`).
- Experiencia de acceso: pantalla completa oscura con la red viva del
  ecosistema energético; la organización entra **solo con Google**; el
  correo (verificado) es **solo para invitados** con invitación emitida
  por quien tiene esa capability. Lenguaje de telemetría
  interno/externo (`CLEARANCE · L5` / `EXTERNAL ACCESS`) sembrado como
  semilla de los Member Levels, sin implementarlos.
- La preview es teatro de diseño declarado en pantalla: sin autenticación
  real; al integrar el shell los handlers se reemplazan, no se envuelven;
  la restricción por dominio vive en Supabase/RLS.
- Refinamientos futuros solo por necesidad concreta de producto, no como
  bloqueo de módulos funcionales.

---

## 17. Beyond Module Contract v1 — issue #6 (activo)

Estrategia formalizada: **Modules First, Platform Ready.** No se construye
más Platform en esta iteración; Core y Design System quedan como
foundation.

Decisiones canónicas (detalle en
`beyond-platform:docs/arquitectura/beyond-module-contract-v1.md`, rama
`claude/module-contract-v1`):

- **Proyecto Beyond** = unidad comercial transversal (cliente + propuesta
  + cierre + ejecución + cobranza + O&M). Los módulos lo alimentan; nadie
  crea definiciones incompatibles de proyecto.
- **Ocho dominios iniciales**, taxonomía evolutiva: Growth & Commercial,
  Energy Solutions, Electromobility, Delivery & Operations, Finance &
  Corporate, People & Governance, Intelligence, Platform Core.
- **Manifiesto por módulo** (`beyond-module.json` en la raíz del repo del
  módulo, schema en `docs/arquitectura/manifiestos/module.schema.json`):
  identidad, madurez, superficies, relación con Proyecto Beyond
  (`si`/`no`/`al-integrarse`), entidades propias vs consumidas,
  capabilities requeridas vs previstas, roles interpretados, KPIs con
  unidad+fuente+estado (`estimada`/`conciliada`/`no-aplica`), auth,
  Design System y desviaciones.
- **Estados de madurez**: `standalone` → `platform-ready` →
  `core-integrated` → `platform-native`. Un módulo standalone avanza sin
  esperar a Platform; la coordinación llega al integrarse.
- **Acceso en dimensiones separadas** (identidad, Member Level, acceso a
  módulo, rol de proyecto, capabilities, clearances Alpha/Omega como
  autorizaciones adicionales). Solo se declara; no se implementa aún.
- **Entidades del Core que no se duplican**: identidad, organizaciones,
  membresías, `bp_proyectos`, capacidades, invitaciones, auditoría,
  documentos y el catálogo de conceptos. Membresías, invitaciones,
  capacidades y auditoría no admiten sustituto local.
- Manifiestos de comprobación: `proyectos-de-energia` (real,
  `core-integrated`) y `bitacora-om` (conceptual mínimo, `standalone`).
- Revisión del contrato: adversarial (claude-fable-5, seis vectores del
  issue) y database contra el esquema real; hallazgos corregidos en la
  misma rama.

Siguiente fase acordada tras este checkpoint: volver a
`propuestas-fv`/Proyectos de Energía con un milestone funcional de
negocio (proyecto FV real + propuesta comercial utilizable de extremo a
extremo).

---

## 18. Control maestro — issue #8 (activo)

Desde 2026-09-02 la memoria operativa del proyecto vive en tres
documentos de `docs/operacion/` de este repositorio (canónicos aquí, no
se espejan; los espejos de ESTE contexto sí se mantienen):

- **`control-maestro.md`** — roadmap vivo: TERMINADO / ACTIVO / NEXT /
  LATER / interrupciones / bloqueado / diferido, por producto, con el
  PUNTO DE RETORNO vigente. Hoy: **Proyectos de Energía → Bloque B →
  Bloque C** (`propuestas-fv#2`).
- **`pendientes-historicos.md`** — insumos/datos/referencias que faltan
  (tarifas, tabuladores, datasets, catálogos, decisiones), CONFIRMADOS
  con evidencia y separados de los INFERIDOS.
- **`bitacora-versiones.md`** — índice consolidado de versiones con
  repo/rama/SHA/banderas; la narrativa sigue en el `versiones.json` de
  cada app.

Regla (convenciones §4.1 y §10): todo handoff significativo actualiza el
control maestro; todo cambio de versión, su bitácora; y el cierre de
cada iteración dice qué se cerró, dónde estamos, qué sigue según lo
acordado, y las opciones con recomendación. Los tres documentos
sobreviven a cambios de chat, rama, issue o prioridad.

---

## 19. Reauditoría GDMTH y bloque de decisiones (2026-09-05)

Sesión de `propuestas-fv#9`, rama `claude/mvp-fv-bloque-a`. **Sólo documentación: no se
tocó la app, ni los motores, ni PROD.**

### 19.1 Qué leer, y en qué orden

1. **`docs/analisis/gdmth-v260604-logica-canonica.md`** — canónico y vivo. Las 28 hojas
   clasificadas, el flujo end-to-end, la matriz `GDMTH → financiero.py → roi.js/UI`, el
   registro de decisiones (§17) y lo que no se negocia contra el libro (§16).
2. `docs/analisis/cotizador-gdmth-v260604-auditoria.md` — antecedente del 2026-08-22.
   **Evidencia, no verdad**: varias conclusiones suyas quedaron corregidas.
3. Issue `propuestas-fv#9`, comentarios del 2026-09-05.

SHA del cierre: **`8bdee25`**.

### 19.2 La regla de jerarquía — lo más importante de esta sesión

RG lo fijó explícitamente: **el propuestador GDMTH es REFERENCIA, no verdad absoluta.** Se
usa para recuperar intención y casos, no para arbitrar.

> **Cuando el libro y lo ya construido y validado difieran, MANDA LO CONSTRUIDO.** El libro
> sólo gana si aporta evidencia nueva que resista la misma verificación.

Motivo: reauditar un archivo tan denso empuja a tratarlo como especificación y a «volver» a
él donde el producto ya había avanzado. **Eso es deriva y ya ocurrió en esta misma sesión.**
La lista de lo que no se negocia está en la §16 de
`propuestas-fv:docs/analisis/gdmth-v260604-logica-canonica.md`: motor CFE, recibos,
dimensionamiento, costos, recuperación y producto.

**Lo único que el libro aporta y sí hay que adoptar:** la fórmula exacta de penalización por
factor de potencia de CFE, `3/5 × (90/FP − 1)`, verificada en 12 de 12 renglones. El motor
del repositorio no la tiene: hoy toma el FP como importe observado.

### 19.3 Decisiones cerradas — no volver a preguntarlas

| # | Decisión | Estado |
|---|---|---|
| D0 | Incremento tarifario base **3.70%**; futuro por zona/división CFE | cerrada |
| D1 | **Horizonte del modelo financiero = 30 años** (la app corría 25) | pendiente de aplicar |
| D2 | **Markup único**; la segunda tarifa del libro (36.67%) no se reproduce | cerrada |
| D3 | **Markup por omisión 33.3333% (1/3), editable por proyecto** | pendiente de aplicar |
| D4 | **Reserva de reemplazo sobre COSTO**, con factor de equipo propio | pendiente de aplicar |
| D5 | **Beneficio fiscal siempre**, sin condicionar al régimen | cerrada |
| D6 | **Financiamiento, PPA y EaaS a un módulo aparte**; FV entrega el contrato | cerrada |
| D7 | **FV conserva la Adquisición; publicarla en la propuesta es OPCIONAL** | pendiente de implementar |
| R1 | **Stock de módulos de repuesto, 5–10**, al BoQ como CAPEX | abierta, no existe |
| P1 | **Principio: la propuesta es comercial-técnica**, no al revés | vigente |

### 19.4 Los matices que no pueden perderse al implementarlas

- **D3.** La edición del markup por proyecto **ya existe y funciona**; sólo cambia el valor
  por omisión. Y hay una regla en `precio.js` que hay que conservar: **quien guarda precios
  guarda el resultado, no el default**, para que el precio de un proyecto no se mueva si el
  default cambia en una versión futura.
- **D4.** No es sólo la base. El libro aplica **el mismo +4%** a servicios (O&M) y a la
  **compra de un inversor en 2041**; compuesto catorce años lo multiplica por 1.73. El
  factor de equipo va **separado** y **su valor sigue sin fijarse**: no hay dato verificado
  de precios de inversores a quince años y no se inventa.
- **D5.** Aplicar el beneficio en el flujo y **citar el Art. 34-XIII en el documento** son
  actos distintos. D5 autoriza el primero; la base legal sigue **NO VERIFICADA** y no se
  cita a cliente. El monto se presenta como *recuperación fiscal potencial*.
- **D6.** El módulo **no recalcula el ahorro: lo recibe.** Si lo recalcula reaparece la
  bifurcación `roi.js` / `financiero.py`, ahora entre dos productos que el cliente ve el
  mismo día. El contrato campo por campo está en §17.5 del documento canónico.
- **D7.** **Siempre se calcula, opcionalmente se publica.** Un interruptor que apague el
  *cálculo* deja a quien cotiza sin el número con el que decide si empujar financiamiento.
  Y apagar la recuperación **no** apaga la trazabilidad: pendientes sin costear y clase del
  estimado siguen viajando.
- **R1.** El stock **no es capacidad instalada**: no entra al kWp, ni a la generación, ni al
  denominador del LCOE. Sí al costo directo, al precio y al payback.
- **Nomenclatura.** «contado», «CAPEX» y «adquisición total» son el mismo concepto con tres
  nombres. Para el producto: **«Adquisición»**.

### 19.5 Hallazgos de la reauditoría con consecuencia

Verificados contra los valores vivos del Sheet (2026-08-26). **No hubo acceso al texto de
las fórmulas** —la exportación de Drive falla por tamaño—; la auditoría del 2026-08-22 sí lo
tuvo, y recuperar aquel volcado es la vía barata para cerrar lo que falta.

1. **Con FV el libro lleva la capacidad facturable a CERO.** La tarifa la cobra contra
   `min(demanda medida EN PUNTA, término calculado)` y **la punta del SIN es nocturna**: el
   FV no genera un solo kWh ahí. Es el hallazgo más caro y es de negocio, no de software.
   El motor de la app ya lo hace bien; no portar el atajo.
2. **La inflación del motor no es 3.88% ni 3.9%: es 3.95%**, medida sobre 69 pares. Los dos
   documentos anteriores leyeron la etiqueta en vez de la serie.
3. **`data recibo` conserva a OTRO cliente** —ELAB PRODUCTOS DE BELLEZA— con número de
   servicio y dirección completos. Fuga de datos de un tercero en un archivo que se
   comparte.
4. **Faltan MXN 35,000 de medidor + UVIE + UIIE** en una cotización de 394,091 (**8.9%**)
   mientras la propuesta promete llave en mano.
5. **`cotizacion general` está viva y difiere** de la que se manda en exactamente el renglón
   de viáticos: MXN 8,889 (2.3%).
6. **La ruta de microinversores está arquitectónicamente viva y numéricamente rota**: la
   mano de obra sale al 99% del costo por un error de moneda y de base, y el sistema de 18.4
   kWp se cotiza en MXN 30,277,718.
7. **`motor/financiero.py` está degradado** frente al libro (subestima el mantenimiento
   69%) y tiene **vivo el mismo bug de TIR** que `roi.js` ya documentó y arregló.
8. **El margen por omisión del repositorio no es único**: JS 0.333, Python 0.27 — y
   `apu.json` justifica su 0.27 citando al cotizador, **que corre 33.33%**. La cita es falsa.
9. **`anteproyecto` y `carta poder` están cableadas al caso vivo** y producen documentos con
   `#REF!` visibles y el correo mapeado a la dirección postal.
10. **El linaje del código es una bifurcación, no una cadena.** `motor/financiero.py` no lo
    importa ninguna pantalla y declara otra fuente («Analisis PPA»). Lo que el usuario ve es
    `roi.js`, que es un port fiel y en tres puntos corregido: el caso dorado FMF reproduce
    payback 2.50 exacto y VPN/LCOE dentro del 1%.

### 19.6 Errores propios corregidos en la misma sesión

Tres reviewers independientes —financiero, CFE/tarifario y FV/costos— atacaron las
conclusiones y encontraron errores reales:

- Afirmé que la columna `factor de carga` estaba **rota**. **Es falso**: está en por ciento
  y reproduce al centésimo. Retractado.
- Afirmé que el beneficio fiscal **nunca se duplica**. **Se duplica** con arranque en
  febrero o marzo: 60% del CAPEX.
- Derivé el calendario de mantenimiento de un agregado cuando **la tabla anual estaba en el
  export**; tres calendarios alternativos ajustaban igual de bien, así que aquella
  derivación no probaba nada. Ahora está probado año por año y al peso.

**Lección de método, y aplica a ChatGPT igual que a Claude:** contra una hoja de cálculo,
**la serie es la evidencia; la etiqueta es una opinión sobre la serie.**

### 19.7 Pregunta abierta

**Sólo una:** qué hacer con la ruta de microinversores — rescatarla (implica rehacer el
cálculo, no portarlo), retirarla junto con el selector de `recu_inv`, o dejarla como está,
que es la peor de las tres. **No bloquea** el bloque de definición ni la implementación de
Recuperación.

---

## 20. Cierre bilateral de sesión y estado vigente (RG, 2026-09-05)

Esta sección actualiza cualquier referencia histórica a NEXT o punto de retorno en secciones anteriores.

### 20.1 Regla obligatoria para ChatGPT y Claude

Toda sesión con trabajo material termina con un cierre publicado en el issue activo de GitHub. Cerrar sesión NO equivale a cerrar el bloque ni autorizar el siguiente.

El cierre debe contener:
- autor y fecha; repo, rama, SHA inicial y final;
- qué cambió, qué se revisó y qué NO repetir;
- evidencia separada: pruebas ejecutadas por quien entrega, pruebas reportadas por terceros, revisiones de subagentes y límites de verificación;
- hallazgos resueltos y pendientes, sin presentar verde automático como validación humana;
- bloque activo, punto de retorno, siguiente gate de RG y alcance autorizado;
- responsable del siguiente turno: Claude / ChatGPT / RG;
- enlaces a los documentos actualizados y al cierre anterior que se recibió.

Quien recibe debe sincronizar la rama, leer el cierre del otro y registrar un acuse breve en el issue antes de trabajar: cierre/SHA leído, objetivo entendido y diferencias detectadas. Si hay nuevos commits o instrucciones posteriores, reconciliarlos antes de escribir. Un solo writer por rama/archivo; los subagentes revisan READ-ONLY y su coordinador consolida la evidencia.

No afirmar que el otro agente fue notificado, leyó o arrancó sólo por publicar un comentario. GitHub es el canal persistente; el acuse demuestra recepción. Si no existe conexión que active la sesión de Claude, RG recibe únicamente el enlace y un texto breve para retomarla, no la carga de reconstruir el estado.

ChatGPT deja su revisión y encargo; Claude entrega implementación y evidencia; ChatGPT verifica el delta y la preview; RG valida la experiencia; sólo entonces se autoriza otro bloque. No hay paso automático a Datos.

### 20.2 Roadmap vigente

Shell + Recibos → validación RG → Datos → validación RG → Dimensionamiento → validación RG → Escenarios → validación RG → Costos → validación RG → Recuperación → validación RG.

Propuesta es un bloque posterior independiente. I1 permanece estacionado en `claude/i1-recuperacion-wip`, commit `b8001179a469a1d7ce3b32aa75e435863142dc40`: no continuar ni integrar hasta Recuperación.

### 20.3 Estado al cierre de la revisión S1

- Issue: `rgbeyond/propuestas-fv#9`; rama funcional: `claude/mvp-fv-bloque-a`.
- Entrega revisada: v0.39.0, `5d5b4f5b429d6574cd00578547dbebb5e19266dc`, delta desde `8e7ac26`.
- PR #7 sigue Draft/NO MERGE. Netlify reportó preview success para ese SHA.
- S1 implementado pero NO cerrado ni validado por RG.
- ChatGPT ejecutó las 12 pruebas nuevas de conceptos (PASS) y reprodujo inconsistencia de redondeo en la gráfica. Las 405 pruebas de motor y 78 de navegador son reportadas por Claude; ChatGPT no repitió toda la suite. La preview mostró login: inspección visual autenticada pendiente.
- Revisor de diseño de ChatGPT: revisión estática READ-ONLY, no aprobación visual; detectó restauración incorrecta de desplegables al cambiar tema.
- Pendientes: unificar semántica/redondeo de la curva calculada, preservar abiertos/cerrados por recibo al cambiar tema y resolver la interpretación no aprobada de «medida del periodo» como «punta».
- RG autorizó un pase corto de corrección de S1. Próximo responsable: Claude, después de leer y acusar el encargo en #9. Al entregar vuelve a ChatGPT; RG todavía no está convocado a pruebas.
- Grok queda diferido. El reconocimiento del Design System no autoriza rediseñar login/home en S1.


### 20.4 Cierre ChatGPT de la revisión v0.39.3 (2026-09-05)

Actualiza el estado histórico de §20.3. Acuse de ChatGPT: https://github.com/rgbeyond/propuestas-fv/issues/9#issuecomment-5550103458; cierre recibido de Claude: https://github.com/rgbeyond/propuestas-fv/issues/9#issuecomment-5550090230.

- Revisado delta `393e802 → e0b7dbc76f0502c61b6ccb423bac699aa27bc283` (v0.39.3). Correcciones originales atendidas: criterio consistente de curva calculada e identidad/estado de desplegables.
- Evidencia propia de ChatGPT: 23/23 pruebas de gráfica y análisis por mes PASS; comprobación adicional de decimal GDMTO y null en ambas ramas PASS. Netlify success en SHA funcional; navegador mostró login v0.39.3. No inspección autenticada; no repetición completa de las 430/80 pruebas reportadas por Claude.
- Revisor READ-ONLY de ChatGPT identificó borde menor: restauración asíncrona del año puede reponer estados viejos de otras tarjetas si se interactúa mientras carga. Mecánica reproducida con función real y DOM mínimo simulado, no en preview. Registrar para reproducción enfocada, sin declararlo bloqueo de producto ni pérdida de datos.
- Persisten comentarios técnicos obsoletos sobre tres decimales y término facturado aunque el comportamiento ya está corregido; no usarlos como autoridad sobre código/pruebas.
- Próximo turno: **RG**, aclarar una sola decisión: significado de «demanda medida del periodo». Luego validación visual de S1. ChatGPT no equipara esa frase con punta por inferencia.
- **S1 sigue abierto.** Aceptación técnica acotada no es aceptación visual ni autorización a Datos. Claude espera el siguiente cierre del coordinador; I1 y PROD/main continúan fuera de alcance.

### 20.5 RG confirma las tres series; propuesta visual pendiente (2026-09-05)

Actualiza el siguiente paso de §20.4. RG confirma expresamente que las tres cifras buscadas son **Máxima medida**, **Medida en punta** y **Calculada**. La duda sobre la tercera serie queda cerrada; no volver a preguntarla. Esto no equivale a aprobar visualmente S1.

RG solicita distinguirlas gráficamente y mejorar el diseño, sugiriendo áreas apiladas como posibilidad. Recomendación de ChatGPT, todavía NO decisión aprobada: conservar dos paneles alineados por mes; energía con barras apiladas B/I/P (kWh) y demanda con tres líneas sobre la misma escala (kW), relleno muy tenue sin apilar, estilos y marcadores distinguibles. Las demandas no son sumandos: apilarlas produciría un total ficticio. Comparador por mes al pasar/tocar, con las tres cifras y referencias a distribución/capacidad tomadas del motor existente; candidata calculada no equivale a cobro. Datos faltantes y estimados siguen declarados, sin relleno silencioso ni curvas que inventen picos.

Siguiente paso propuesto: maqueta visual acotada de la gráfica dentro de S1 → aprobación visual de RG → integración por Claude → revisión ChatGPT → validación final RG de S1. La dirección visual propuesta aún requiere aprobación; este cierre no encarga implementar ni habilita Datos, login/home, I1 o cambios tarifarios. Último SHA funcional sigue `e0b7dbc` (v0.39.3); HEAD verificado antes de esta documentación `fd2fc9e`, PR #7 Draft/NO MERGE. No hay handoff posterior al cierre revisado.

Claude debe leer y acusar este cierre al retomar; publicar no prueba recepción. Se mantienen las reservas de §20.4. No se repiten tests por este cambio exclusivamente documental.


---

## 21. OM-EV-ENERLINK — frente paralelo preparado (27 oct 2026, CDMX)

Identificador confirmado por GPT. Writer: sesión Claude de RG en claude.ai, sólo `claude/om-ev-enerlink` de `beyond-platform` y `beyond-om`; GPT conserva coordinación/operación DEV y continúa C3 con su Claude local. **Sólo documentación por ahora; implementación no despachada.** No escribir ramas de otro frente ni main, cloud, Auth o secretos.

Fuentes leídas: registro Platform inicial `28a624ec3440a888124d47dc555eeb354b6e2c16`, actualizado **`0baf9a9a64291cc8e4c782dee87141c251d1a257`**; discovery O&M **`e145a42476c829fb0e6d1d8118e4b771ab0bf0d6`**. Bases `6c459cb` / `aa2bf6a`. [Encargo preparado, convivencia, reviewers y preguntas](https://github.com/rgbeyond/beyond-platform/blob/claude/infra-claude-code/docs/operacion/om-ev-enerlink/coordinacion-y-encargo-2026-10-27.md); bitácora en Platform#8.

Decisiones RG que **sustituyen** criterios previos:

- **O&M antes de Service Delivery** en ruta v2 y hoja de ruta; también en la v3 recomendada. No desplaza cierre de seguridad C3 ni elimina desarrollos existentes.
- **Supabase del entorno, fuente principal de este subsistema; copias exportadas a Drive.** Excepción acotada a la decisión Drive principal del contrato de integración 1.0 citada en el registro. No cambia todas las apps ni acredita conector/cuenta/backup Drive operativos.
- **Estaciones O&M se crean sin proyecto Core obligatorio.** `bp_proyectos` opcional, enlazable desde ambos lados. Sustituye aquí la dependencia de entrega/proyecto; organización y autorización propias obligatorias. Vincular no concede permisos ni mueve historia.
- **RG autoriza datos reales Enerlink en DEV el 27 oct 17:18 CDMX**: sesiones, ventas, uptime, catálogo e histórico desde octubre de 2025. Sustituye pendiente de autorización inicial; no PROD/GitHub/fixtures/pruebas/logs. Carga sólo tras tablas coordinadas y RLS probada; correos finales exclusivamente en tabla restringida y fuera de reportes. Uso mercadotécnico sujeto a revisión del aviso y capability específica. No volver a pedir permiso de carga ya recibido.
- **Frecuencias aceptadas**: estado 5 min; sesiones/ventas 15 min; catálogo 6 h; uptime diario; cierre día 5 a las 06:00 CDMX. Arranque dos semanas a 15/60 min para estado/sesiones. Sustituye frecuencia pendiente. Endpoint de estado y límites siguen por verificar; no habilitar cron ni inventar fuente ahora.

Convivencia: **C3a aplicado o compensado y ledger reconciliado → contrato servidor C3b requerido congelado y dependencias aplicadas → OM modelo/RLS → ingesta/cierres → reportes/copias**. No hace falta esperar toda la UI C3b si sus dependencias de servidor están cubiertas y probadas. Nombres lógicos reservados `om_ev_01_modelo_y_rls`, `om_ev_02_ingesta_y_cierres`, `om_ev_03_reportes_y_copias`; timestamps reales por CLI sólo al abrir ventana. Migraciones canónicas sólo Platform, rama de integración dedicada asignada por GPT; nadie modifica las aplicadas ni reserva ordinal40. **GPT único aplicador DEV**, ventana exclusiva C3/OM, freeze/SHA/respaldo/review/compensación y verificación RLS/JWT antes de carga. Claude externo no aplica. Preparación documental puede avanzar en paralelo ya.

Primer entregable externo: diccionario/modelo (§8 del registro), sin código ni migraciones. Implementación posterior requiere validación del encargo por RG y despacho de GPT. Reviewers asignados por función: database/Supabase, security/accesos, frontend/E2E+funcional y diseño **Fable real**, convocados por GPT/Claude con evidencia de modelo/SHA; no se atribuyen revisiones aún no ejecutadas.

Abiertos: qué uptime mostrar (bruto incluye Faulted; ajustado requiere fórmula/eventos; no declarar cumplimiento NEVI); administrador/destino Drive; matriz de aprobación de reportes y acceso a correos; aviso de privacidad vigente. Cobranza no conciliada sin fuente JSON de ventas/pagos identificada. Nombre visible pendiente. Renombrar proyecto Supabase llamado parametrico-ec (PROD) es petición separada, no ejecutada ni autorizada por esta carga DEV.

Siguiente: **Claude externo, diccionario/modelo; GPT, continuar C3 y coordinar revisión/ventana; RG, validar encargo y decisiones de negocio abiertas.**


---

## 22. C3a DEV — aplicada, regresión legítima verificada (27 oct CDMX)

GPT aplicó sólo DEV la migración servidor `20261028005402_c3a_primera_confirmacion_sin_contrasena`, ledger40, funciónMD5`af025d7e723a3383d7eb22b605aa9d8a`, sobre fuente Claude `cccc10d` (SQLsha256`de1ccfb5ddeb3b50cbe4db82eb85b9937c9fff93af547d6999088fee59eeaf06`). Frontend/deploy C2 sin cambios. [Resultado completo y evidencia](https://github.com/rgbeyond/beyond-platform/blob/claude/infra-claude-code/docs/operacion/shield-01/resultado-c3a-dev-2026-10-27.md).

Prueba distinta y legítima por invitación: baseline antes y candidato después confirmaron, sólo orgA/capacidades vacías; logout global rechazó JWT previo en RPC de publicaciones. Candidato descartó contraseña temporal. Sin password suministrado/signup/password grant; no se recreó arnés rechazado. **attack_tested:false; ataque original E2E no acreditado y PROD bloqueado.** No llamar a esto cierre global P0.

Cierre verificado:3 Auth sintéticos nuevos bloqueados/perfiles inactivos,0sesiones/refresh/permisos/invitaciones vigentes;2orgs de prueba inactivas. Auth11→14 conserva historia, sin borrado duro.27 tablas ajenas a fixture mantienen filas/hashes; Storage78 sin escrituras. CP-PRE-C3 intacto; compensación ensayada no aplicada. Cuentas RG/casos reales/OM/main/PROD intactos.

Reconciliación de código canónico publicada **933975704eb0e6f5d43e01abef302526dca5e5d5**, verificada por GPT contra bytes formales aplicados (SHA256 `5e5137697ab19d0b1e4d4df66c36b797eecacefd6179f4ded323ce4375041ae1`). Siguiente: GPT revisa/congela contrato C3b antes de encargar implementación. No asignar Omega ni inventar N1 por equivalencia legacy. OM continúa documental conforme §21; este resultado no abre aún su ventana DB. RG no requiere intervención de terminal.


---

## 23. C3b B0 — persistencia privada de niveles aplicada sólo DEV (27 oct CDMX)

Migración `20261028032334_c3b_b0_niveles_base`, ledger41, statementSHA256 `b00aaf4c5a44451adf1a13469143c7a9bfd231b22e0a8f2a24002c88429cf156`; código Claude reconciliado `fc3ddf24f1464ef6d760fef1357e9771ab4a5218`, verificado por GPT contra archivo/ledger real. [Resultado, evidencia y retorno](https://github.com/rgbeyond/beyond-platform/blob/claude/infra-claude-code/docs/operacion/shield-01/resultado-c3b-b0-dev-2026-10-27.md).

B0 crea únicamente catálogo privado5niveles(N1/N2/N3/Alpha/Omega) y asignaciones organizacionales VACÍAS. Cero asignaciones reales, sin derivar roles legacy, sin mutadores/API/plantillas/bootstrap/UI. RLS forzada y REVOKE explícito a PUBLIC/anon/authenticated/service_role; cero privilegios efectivos. Nivel común entre apps, permisos por proyecto/recurso separados; no implica capacidades acumulativas ni un N1 sin costos si conserva concesiones previas. No llamar a esto C3b terminado.

Claude14/14B0 y69/69regresiones seleccionadas; baselinePGlite18 excluye3migraciones con plan de datos, no reconstruye40completo. Reviews nativos database/security Sonnet5.5 APTOcondicionado, lecturaestática; GPT revisó delta y probó instalación+compensación REALPG17.6 enROLLBACK antes de aplicar:112funciones/33tablas/Auth/Storage iguales. Trasaplicar33tablas anteriores iguales por hash/filas,Auth14/Storage78,C3aaf02preservada. No cuentas/sesiones/casos cloud nuevos, sin OM/main/PROD/secretos. FrontendC2 y URLDEV conservados, sin deploy.

Tag `backup/pre-c3b-b0-20261028`→9339757 fija código previo; CP-PRE-C3 cifrado y SQLC3a40 preservados. NO es un nuevo backupglobal de datos/Auth. Compensación B0 ensayada y guardada, no aplicada; cualquier retorno exige reconciliar dependencias/ledger y nueva migración, sin reescribir41 ni restaurar globalmente datosviejos.

Siguiente GPT/Claude: **B1, mutador seguro de asignación de nivel y techo propio** (no confundir con fn_asignar_rol legacy), con reviewers. Asignador sin nivel deniega; sin autoelevación. Bootstrap inicial concreto requiere persona/ámbito/capacidades/redundancia de RG cuando esté implementado/revisado; no ahora. Auditoría futura: capability ANDscope ANDjerarquía, eventos estructurados y propiaactividad con proyección mínima; reemplazar política/consumidor directo existentes. Concesiones manuales/plantillas e historial no se resuelven por etiquetas. Frontend/Fable para consola real; ninguna aprobación visual atribuida a B0. RG pide mínima fricción de permisos rutinarios, sin cambios de modos bypass ni autorización PROD implícita. O&M sigue en su otra sesión; no lo implementa este frente. C3aP0E2E y PROD bloqueados siguen abiertos.


---

## 24. C3b B1 — asignación/revocación privadas aplicadas sólo DEV (28 oct CDMX)

Migración `20261028145417_c3b_b1_asignador_nivel`, ledger42; statement/archivo SHA256 `8ea4ff361d22a940431b7eb3e079bbd002aac219ba3bad4733a650921a64daac`. Claude149a702 formal, canónica2bbd433, loader3970f50; GPT cotejó bytes con servidor. [Resultado/evidencia/retorno](https://github.com/rgbeyond/beyond-platform/blob/claude/infra-claude-code/docs/operacion/shield-01/resultado-c3b-b1-dev-2026-10-28.md).

Cuatro funciones nuevas CERRADAS a todo no-dueño, incluso service_role. Asignar/revocar/preview exigen sesión viva C2, perfil y organización activos, membresía organizacional activa, nivel Alpha/Omega y manage_users explícita. Alpha sólo N1–N3; Omega N1–Alpha; nadie se modifica a sí mismo ni modifica pares/superiores; Omega fuera del mutador ordinario. No rol legado→nivel. Sin capacidades otorgadas/retiradas, sin plantillas ni UI. Cero asignaciones reales.

Locks canónico→org antes de autorizar, historial con marca única y piso histórico, path endurecido/consultas cualificadas y defensa temporal sólo de la sesión propia. Auditoría real obligatoria con rollback si falta. Preview no muestra datos de sujetos no administrables ni lista de capacidades; conflicto de costos sólo booleano con manage_capabilities explícita, si no desconocido. El nivel no borra permisos heredados.

37/37B1+14/14B0 locales y56/56regresiones seleccionadas tras ajustar loader, cero skips. Baseline PGlite18 excluye4versiones de plan/dependencia C2; suites dedicadas conservan cortes históricos y shim C2, no se afirma reconstrucción42completa ni transporte JWT real. Reviews database/security Sonnet5.5 READ ONLY APTO con condiciones; GPT revisó los cierres. Ensayo REALPG17.6 antes de aplicar, instalación+compensación enROLLBACK,35tablas/112funciones/Auth/Storage iguales y3entradas sin sesión42501. Post:35tablas y112funciones anteriores idénticas;4nuevas privadas(116total),Auth14/Storage78,0asignaciones. Sin cambios de interfaz ni comandos de deploy por GPT.

Tag `backup/pre-c3b-b1-20261028`→fc3ddf2 fija código previo B0; CP-PRE-C3 cifrado y SQL40/41 preservados. No nuevo backupglobal de datos/Auth. Compensación B1 ensayada, no aplicada, con guardas; retorno posterior por nueva migración y revisión de dependencias, sin reescribir42 ni restauración global antigua.

Siguiente: preparar bootstrap de propietario y política/consumidores de auditoría de terceros. **No ejecutar un bootstrap real ni habilitar B1 antes del cierre de las rutas legacy de auditoría y revisión del flujo frontend/Fable.** La decisión real persona/ámbito/capacidades/redundancia la toma RG ante ficha concreta; su preferencia de mínimos permisos rutinarios no asigna Omega. Plantillas e interfaz completa pendientes. C3a sigue con P0E2E no acreditado y PROD bloqueado. GPT coordina/revisa y opera DEV; Claude implementa; RG sin intervención ahora. O&M sigue con su otra sesión, fuera de esta parcela.


## 25. Compartir contextual y Settings — preparación UX (RG, 28 oct)

- Entrada principal desde el propio recurso, sin pedir seleccionarlo de nuevo. Buscar integrantes de Beyond o escribir correo externo; lista de capacidades delegables según actor/destinatario/recurso. Enlace restringido; una acción final con resultado por persona; concesión y correo separados.
- Settings administra cuenta, niveles N1/N2/N3/Alpha/Omega, roles/capacidades y facultades para invitar. “Shield” es referencia interna, no etiqueta UI. Compartir no asigna/eleva niveles ni roles. Nadie puede invitar con clearance superior al propio; eso no habilita administrar pares, conceder Omega ni delegar capacidades fuera de autoridad.
- Externos hoy sólo publicación técnica curada de lectura; internos legado por contenedor. No prometer permiso aislado de caso cuando se abren hermanos. Directorio autorizado y lista de delegables requieren backend revisado; no fingir implementación mediante casillas.
- Fable real claude-fable-5 dirigió dos presentaciones comparables: A diálogo contextual (recomendada, móvil pantalla completa), B página contextual con regreso al estudio. Frontend real claude-sonnet-5-5 revisó independientemente flujo/casos, sin navegador ni Auth real. Ejecuciones restringidas de lectura con acceso existente; sin fallback. Maquetas aisladas y correcciones documentales en **ae539952baa23ff1d5222cd7b820031fc158f315**. [Entrega](https://github.com/rgbeyond/beyond-platform/blob/49329cf8e1d206c1200953c8520f5b409d84e19c/docs/operacion/shield-01/c3b-ux-2026-10-28/README.md).
- Revisión GPT de B2/B3: falta cerrar captura confiable del nivel anterior, sesión viva en lectores/conteos, paginación/ámbito y ficha inicial vs redundancia antes de implementar. B3 se cierra con código+reviews+pruebas, no por editar contratos. Orden B3→B2→B1 público preservado; B1 sigue privado, cero asignaciones reales. No nueva pantalla en DEV por esta ronda, no deploy ni main/PROD/secretos/O&M.
- Próximo: GPT verifica capturas y RG decide A/B antes de UI; GPT revisa y coordina la implementación posterior. No pedir a RG SQL/temporizadores ni elección de propietario hasta mecanismo concreto revisado. Radar del otro writer O&M permanece separado (issue8 comentario6474096867).


## 26. RG elige B — primera implementación publicada sólo DEV (28 oct)

- RG: «me inclino más por la opción B, adelante». **B sustituye la recomendación visual A** de §25; la decisión no cambia el modelo de autorización. Página contextual, recurso fijo a izquierda en escritorio/arriba en móvil, regreso seguro vigente.
- **C3b-UI-B01** código final **c31b849bcb1f5069cb2ae2f770dbbeae77066e13**, Netlify **6ae263d2616af63281a2b0c4** ready en https://ui-01--beyond-platform-dev.netlify.app/ . Presentación real sobre C2, no maqueta. Cambió sólo Compartir/estilos/prueba; no API, niveles o Settings. Correo externo/vista previa/huella/idempotencia/revocación/aviso se conservan.
-31/31casos iniciales y4/4responsive finales reportados por Claude, sin sumar repeticiones como casos únicos; GPT build final y114/114publicables por HTTP.109archivos de apps y fuentes3Functions preservados. Fable real claude-fable-5 y frontend claude-sonnet-5-5 APTO sobre670b40e; GPT verificó cierres finales y capturas. No Auth/RLS real acreditado por mocks; C3a P0 y PROD bloqueados permanecen.
- Respaldo de código backup/pre-c3b-ui-b-20261028→ae539952baa23ff1d5222cd7b820031fc158f315, composición963f0eb conservada. No nuevo backup global. Sin main/PROD/migraciones/secretos/Auth ni niveles/permisos reales cambiados, sin tocar ramas O&M.
- **Pendiente, no perdido:** directorio descubrible, capacidades delegables/alcance de recurso y administración de niveles en Settings. GPT coordina con Claude B3 antes de B2/B1 público y el siguiente encargo servidor. No controles falsos ni directorio global. RG sólo revisa producto; no intervención técnica ahora.
- [Resultado canónico](https://github.com/rgbeyond/beyond-platform/blob/claude/infra-claude-code/docs/operacion/shield-01/c3b-ui-b01/resultado-2026-10-28.md). Las alternativas/maquetas de §25 quedan como comparación histórica, sin pedir de nuevo A/B.


## 27. Retro RG: Compartir es la interfaz de la app con permisos, no resumen (28 oct)

- RG esperaba la misma interfaz, datos/secciones/acciones no autorizados ausentes; no le sirve la publicación de unos indicadores. La elección B fue visual, no aceptación del alcance C2. GPT reconoce reducción de producto sin validación suficiente; reviewers/tests acotados no acreditan la intención de RG.
- RG probó correo personal: invitación no recibida y acceso no logrado. Dirección no registrada; causa no diagnosticada. Dar acceso no manda automáticamente el aviso en el flujo actual; solicitud no acredita entrega. No presumir SMTP/spam ni reenviar o revocar su ensayo sin encargo.
- UI-B01 permanece en DEV con su evidencia visual/técnica, pero Compartir NO tiene aceptación funcional de RG. Claude estaba idle; no se despacha implementación B3/directorio u otra dependiente hasta validar alcance y demostración concretos. No rollback ni cambios de datos/permisos/Auth/PROD/O&M por esta retro.
- Objetivo: interfaz reconocible de la app y recurso, sólo datos/acciones autorizados; servidor no envía información prohibida (no esconder JSON íntegro con CSS), sin acceso a hermanos. Directorio/capacidades, invitación/login/retorno/revocación deben demostrarse. Acceso vivo vs versión fija y edición/descarga requieren decisión, no inferencia. GPT recomienda caso actualizado para Workspace; no implementado.
- Antes de código GPT muestra ficha corta: resultado visible emisor/receptor, incluido/excluido, demostración con datos de ejemplo, aceptación E2E, tamaño/dependencias/riesgos concretos. RG valida producto una vez; luego autonomía operativa y mínimas confirmaciones. Cambio material de alcance vuelve a RG antes de consumir implementación. No estimaciones de tokens inventadas.
- [Realineación canónica](https://github.com/rgbeyond/beyond-platform/blob/claude/infra-claude-code/docs/operacion/shield-01/compartir-realineacion-rg-2026-10-28.md). Siguiente: GPT concreta ficha/experiencia del receptor; incidencia de correo separada de diagnóstico de lectura.


## 28. Dos frentes coordinados: ficha Compartir y relevo local O&M (RG, 28 oct)

- RG confirmó correo no recibido tampoco en spam. Solicitó ficha y otra sesión Claude para continuar O&M desde este chat; consultará al writer anterior antes de cerrar allá. No autoriza implementar una ficha todavía no validada ni dos writers en las mismas ramas.
- [Ficha Compartir](https://github.com/rgbeyond/beyond-platform/blob/claude/infra-claude-code/docs/operacion/shield-01/ficha-compartir-interfaz-2026-10-28.md): propuesta de interfaz de la app con datos/acciones limitados, EV como piloto recomendado (puede cambiar RG), visualización inicial del caso actualizado al abrir/recargar; edición/descargas/apps adicionales fuera del primer bloque propuesto, por validar. Invitación→login→recurso→revocación se prueban, no basta preview. No estimación inventada de horas/tokens. B visual sigue elegida. Implementación Compartir espera validación del alcance/demostración.
- Nueva sesión **beyond-om-enerlink**, Herdrw5:pB, modo plan/restringido, MCP vacío, acceso existente; Agent expuesto y4definiciones database/security/frontend/UX Fable cargadas, no ejecutadas. Árbol local om-01/beyond-om sigue claude/om-01-core aa2bf6a; sólo fetch de referencia EV. Acuse completado por lectura; no cambios de código, datos reales, secretos o nube.
- SHAs de recepción O&M: beyond-platform claude/om-ev-enerlink **6fa05940dc3e49daaf7e6e3b4fdf699ce43b311b**, registro hasta§16/decisiones34–36; beyond-om misma rama **acbb7414b20425ca9d48872c2319fef5b6386f81**. Nuevo contexto incluye UI EV local, catálogo/bajas, expediente universal exp_, datos bancarios restringidos propuestos, comisión16% única y contrato/facturación pendiente Legal/contador. No se acredita Supabase/DEV por esos documentos.
- Writer de claude.ai NO liberado: antes de escribir, debe publicar SHAs finales, cambios sin publicar, decisiones/pendientes y referencias privadas sin datos, y liberar escritura. Nueva sesión acusa delta si hay commits nuevos. GPT define encargo mínimo y ventana compartida; no exp_/migraciones/importación/deploy implícitos. No acceso automático al historial del otro chat.
- Dos frentes en este chat con escritor/ramas separados: Core/Compartir/C3 (beyond-b3-claude) y O&M/Enerlink/alta (beyond-om-enerlink después del relevo). GPT coordina/contexto/issue8/reviewers y una cola para Supabase/publicación DEV; RG producto. Mantener ambos chats abiertos como consulta es compatible, pero no dos escritores sobre la misma rama.
- [Relevo para cotejar desde el otro chat](https://github.com/rgbeyond/beyond-platform/blob/claude/infra-claude-code/docs/operacion/om-ev-enerlink/relevo-sesion-local-2026-10-28.md). Siguiente responsables: RG valida ficha y pide relevo a sesión antigua; GPT reconcilia SHAs finales y encargo; Claude nuevo espera sin implementar.
