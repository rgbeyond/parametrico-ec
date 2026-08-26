#!/usr/bin/env bash
# PostToolUse sobre Edit|Write — recordatorio acotado a la ruta.
#
# Este repositorio NO tiene pruebas automatizadas, asi que el hook no puede
# correr ninguna. Lo unico honesto que puede hacer es decir cual es la compuerta
# real de cada tipo de archivo. Cuando existan pruebas, aqui se conectan.
set -uo pipefail
ruta=$(cat | python3 -c "import sys,json;print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")
[ -n "$ruta" ] || exit 0
rel="${ruta#"${CLAUDE_PROJECT_DIR:-.}"/}"
case "$rel" in
  docs/*|*.md) exit 0 ;;
  supabase/*.sql)
    if [ -f "${CLAUDE_PROJECT_DIR:-.}/scripts/validar-sql.sh" ]; then
      echo "Tocaste el esquema. Antes de pegarlo en Supabase: bash scripts/validar-sql.sh (aplica cada archivo en una sola transaccion, como el editor de Supabase)."
    else
      # En esta rama el validador NO existe: vive en claude/solar-proposal-skill-iwp1oi.
      # Mandar a correr un script ausente es peor que no decir nada: el aviso se
      # cumple con un "command not found" y queda la sensacion de haber validado.
      echo "Tocaste el esquema y en esta rama NO existe scripts/validar-sql.sh: vive en la rama claude/solar-proposal-skill-iwp1oi. Traelo antes de aplicar SQL. Importa porque aplica cada archivo en UNA SOLA transaccion, como el editor de Supabase, y hay errores -55P04, usar un valor de enum recien agregado- que solo aparecen asi. Ademas: la base desplegada esta por delante de esta rama; comprueba contra que esquema estas escribiendo."
    fi ;;
  src/lib/app.js)
    echo "app.js son ~1076 lineas SIN NINGUNA PRUEBA. Compuerta minima: npm run build, y verifica a mano la pestana que tocaste. Si el cambio es de calculo, considera escribir primero la prueba dorada del caso Atlacomulco." ;;
  src/*|index.html)
    echo "Compuerta antes de comitear: npm run build" ;;
esac
exit 0
