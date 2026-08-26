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
    echo "Tocaste el esquema. Antes de pegarlo en Supabase: bash scripts/validar-sql.sh (aplica cada archivo en una sola transaccion, como el editor de Supabase)." ;;
  src/lib/app.js)
    echo "app.js son ~1076 lineas SIN NINGUNA PRUEBA. Compuerta minima: npm run build, y verifica a mano la pestana que tocaste. Si el cambio es de calculo, considera escribir primero la prueba dorada del caso Atlacomulco." ;;
  src/*|index.html)
    echo "Compuerta antes de comitear: npm run build" ;;
esac
exit 0
