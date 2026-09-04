# Fases 0 y 0.1 — Capa de ingeniería de Claude Code (paramétrico)

**Fecha:** 2026-08-27 · **Rama:** `claude/phase0-clean`, sobre `main` ·
**Alcance:** configuración. **Cero cambios de comportamiento de ejecución.**

El informe completo, con la trazabilidad de los dos repositorios, vive en el
portafolio: `propuestas-fv/docs/claude-engineering-phase0.md`. Aquí queda lo
propio de este repositorio.

---

## Qué cambió aquí

| | Antes | Después |
|---|---:|---:|
| `CLAUDE.md` | 352 L · 19,495 B | **162 L · 6,665 B** (−66%) |
| Reglas de carga condicional | 0 | 3 · 229 L, solo entran al abrir un archivo que les toca |

**Creado:**

```
.claude/
├── settings.json                     permisos y hooks
├── rules/
│   ├── motor-ec.md                   src/lib/app.js, datos.js, catalogo.json
│   ├── supabase.md                   supabase/**, sesion.js, supabase.js
│   └── ui.md                         src/ui/**, src/styles/**, index.html
├── agents/
│   ├── code-critic.md                revisor de solo lectura
│   └── normative-researcher.md       investigación regulatoria
└── hooks/
    ├── guardia-secretos.sh           PreToolUse Edit|Write
    ├── guardia-destructivo.py        PreToolUse Bash
    ├── guardia-commit.py             PreToolUse Bash, revisa el índice
    ├── comprobar-guardias.sh         SessionStart, avisa si los guardias no corren
    ├── verifica-por-ruta.sh          PostToolUse Edit|Write
    └── probar-guardias.py            suite de los guardias, 135 casos
scripts/
└── verificar-referencias.py          rutas citadas en la configuración
```

Los cuatro guardias de seguridad son **byte a byte idénticos** a los del
portafolio. Es deliberado: dos copias de un analizador de comandos divergen, y
la divergencia es donde aparecen las fugas. Lo único que difiere por repositorio
es `verifica-por-ruta.sh`, que nombra compuertas distintas porque las compuertas
son distintas.

**Conservado sin tocar:** `.claude/launch.json`. Es configuración de depuración
de VS Code con una ruta de Windows, ajena a Claude Code, y no hay `.vscode/` en
el repositorio. Parece sin uso, pero eso no lo prueba: puede servir en otra
máquina. **Requiere confirmación humana antes de retirarlo.**

## Dónde quedó cada instrucción

| Guía original | Nueva ubicación |
|---|---|
| NOM-001-SEDE-2012, criterio del 125% | `rules/motor-ec.md` |
| Transformador contra demanda de diseño, `FP_DIM` 0.80 | `rules/motor-ec.md` |
| Reserva de balanceo y su dependencia de `GE-001` | `rules/motor-ec.md` |
| Balance en kVA, tensiones declaradas | `rules/motor-ec.md` |
| Depósito de garantía sobre demanda contratada | `rules/motor-ec.md` |
| Piso de demanda contratada | `rules/motor-ec.md` |
| Cobro medido contra calculado | `rules/motor-ec.md` |
| Motor de cantidades pendiente de validar | `rules/motor-ec.md` |
| Citas regulatorias sin verificar, con su advertencia | `rules/motor-ec.md` |
| Especificación de cable RHW-2 / XHHW-2 | `rules/motor-ec.md` |
| Quién actualiza precios del maestro | `rules/supabase.md` |
| Validación de SQL y el error 55P04 del enum | `rules/supabase.md` |
| Carga diferida de `app.js` | `rules/ui.md` |
| La llave de datos `grupos` no se renombra | `rules/ui.md` |
| Versión, bitácora y pie del documento | `rules/ui.md` |
| Tabla de roles | **CLAUDE.md** — se consulta en casi toda sesión |
| Caso Atlacomulco | **CLAUDE.md**, condensado |
| «Supabase en proceso de configuración» | **Eliminado: obsoleto** |
| Estado del catálogo con conteos | **Eliminado del contexto** |

## Particularidades de este repositorio

**No tiene pruebas automatizadas.** Es su mayor hueco y condiciona todo lo
demás:

- El hook `verifica-por-ruta.sh` no puede correr ninguna. Lo único honesto que
  hace es nombrar la compuerta real de cada tipo de archivo. Cuando existan
  pruebas, ahí se conectan.
- El `code-critic` de este repositorio lleva un invariante extra: revisar
  sabiendo que un cambio en `app.js` **no tiene red**.
- `settings.json` no incluye `npm test` en `allow` porque no existe.

**`src/lib/app.js` son 1,076 líneas sin pruebas.** El CLAUDE.md original ya
pedía dividirlo. El orden correcto es pruebas primero, y el caso Atlacomulco es
el candidato natural a prueba dorada: entradas conocidas, salidas conocidas.

## Lo que NO está en esta rama, y se dice donde importa

`main` no tiene `04_ambitos.sql`, `05_vendedor.sql`, `diagnostico.sql` ni
`scripts/validar-sql.sh`. Los cuatro viven en
`claude/solar-proposal-skill-iwp1oi`.

Eso obligó a un ajuste que parece menor y no lo es: `verifica-por-ruta.sh`
mandaba a correr `scripts/validar-sql.sh` al tocar SQL. En esta rama ese script
**no existe**, así que el aviso se cumplía con un «command not found» y dejaba
la sensación de haber validado. Ahora comprueba si el archivo está y, si no,
dice de qué rama traerlo y por qué importa.

## ⚠ La base desplegada está por delante de esta rama

**El hallazgo más importante, y no es de configuración.** El proyecto de
Supabase en producción tiene aplicadas migraciones que `main` no contiene:
`conceptos.ambitos`, el rol `vendedor`, `fn_conceptos_de`, `fn_articulos_de`.

Las migraciones dejaron de ser la fuente de verdad para este repositorio. Quien
clone `main` y aplique `supabase/` a una base nueva obtiene un esquema
**distinto** del que corre en producción.

No se arregló aquí. Reconciliarlo obliga a decidir si los nueve commits de la
rama designada entran a `main`, y esos incluyen el `vendedor` que la decisión
de producto es **retirar**. Es Fase 1. Está escrito en `rules/supabase.md`, que
es donde lo va a leer quien esté a punto de escribir una migración.

## Sobre la base de esta rama

`claude/phase0-clean` sale de **`main`** (`7561395`), no de
`claude/solar-proposal-skill-iwp1oi`. Es un cambio respecto de la Fase 0, que sí
partió de la rama designada.

La razón: meter el rol `vendedor` a producción como parte de una fase de
configuración sería exactamente lo contrario de la decisión de producto, que es
retirarlo. Los nueve commits **no se descartan, no se reescriben y no se empujan
a la fuerza**: siguen intactos en `origin/claude/solar-proposal-skill-iwp1oi`
(`22bbebf`). Su integración es una decisión aparte.

`claude/phase0-engineering-layer` (`948c80b`) también queda intacta en el
remoto, como registro de la Fase 0.
