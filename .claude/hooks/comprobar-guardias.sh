#!/usr/bin/env bash
# SessionStart — aviso temprano de que los guardias pueden correr.
#
# ESTO NO ES LA FRONTERA DE SEGURIDAD, y conviene tenerlo claro.
#
# SessionStart no bloquea nada: lo unico que puede hacer es escribir en el
# contexto de la sesion. Quien no lea el aviso trabaja igual. La frontera real
# es `ejecutar-guardia.sh`, el envoltorio de PreToolUse, que sale 2 y NO invoca
# la operacion protegida cuando falta python3 o falta el guardia.
#
# Este hook sigue existiendo porque el aviso llega en el primer turno, que es
# cuando todavia se corrige, en vez de al primer comando bloqueado. Aviso
# temprano y control son dos cosas distintas y hacen falta las dos.
set -uo pipefail
raiz="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks"
faltas=()

command -v python3 >/dev/null 2>&1 || faltas+=(
  "python3 NO esta disponible. Los guardias de Python no pueden correr. El
   envoltorio ejecutar-guardia.sh BLOQUEARA toda operacion de Bash hasta que
   se instale: es lo correcto, pero vas a chocar con ello en el primer
   comando.")

for g in ejecutar-guardia.sh guardia-destructivo.py guardia-commit.py \
         guardia-secretos.sh verifica-por-ruta.sh beyond_guard.py \
         explain_permission.py; do
  if [ ! -f "$raiz/$g" ]; then
    faltas+=("$g no existe en .claude/hooks/")
  elif [ ! -x "$raiz/$g" ]; then
    faltas+=("$g existe pero no tiene permiso de ejecucion (chmod +x)")
  fi
done

if [ ${#faltas[@]} -gt 0 ]; then
  echo "AVISO DE SEGURIDAD: la capa de guardias de este repositorio esta incompleta."
  for f in "${faltas[@]}"; do echo "  - $f"; done
  echo "  Comprueba con: python3 .claude/hooks/probar-guardias.py"
  echo "  El envoltorio de PreToolUse falla cerrado, asi que lo mas probable es que las operaciones de Bash empiecen a bloquearse. Arregla esto antes de seguir."
fi
exit 0
