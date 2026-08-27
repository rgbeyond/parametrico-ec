#!/usr/bin/env bash
# Envoltorio de arranque para los guardias escritos en Python.
#
# EL PROBLEMA QUE RESUELVE
# ------------------------
# Los guardias de Python fallan cerrado una vez que corren. El hueco estaba
# ANTES de eso: si `python3` no esta en la maquina, el hook sale 127. Claude
# Code trata cualquier codigo distinto de 2 como error NO BLOQUEANTE -lo
# registra y sigue-, asi que la operacion protegida se ejecuta igual. Un
# interprete ausente desarmaba toda la capa, en silencio.
#
# `comprobar-guardias.sh` (SessionStart) lo hace VISIBLE en el primer turno.
# Eso es aviso temprano, no una frontera de seguridad: no bloquea nada, y quien
# no lea el aviso trabaja sin guardias sin enterarse.
#
# QUE HACE, Y QUE NO
# ------------------
# Comprueba tres cosas y nada mas: que le pasaron un guardia, que el archivo
# existe, y que hay un `python3` ejecutable. Si algo falla, sale 2 y NO invoca
# nada. Si todo esta, ejecuta el guardia y devuelve su codigo tal cual.
#
# NO reimplementa ni una sola regla de seguridad. Esa es la razon de que sea
# tan corto: dos copias de la logica divergen, y la copia en Bash seria la que
# nadie prueba. Python sigue siendo la implementacion; esto solo garantiza que
# la implementacion de verdad corre.
#
# Uso:  ejecutar-guardia.sh <ruta-del-guardia.py>
# Contrato: exit 0 deja pasar; exit 2 bloquea y stderr le explica a Claude.

set -uo pipefail

fallo() {
  echo "BLOQUEADO: $1" >&2
  echo "  Este envoltorio existe para que un guardia ausente no se confunda con un guardia que aprueba. Comprueba con: python3 .claude/hooks/probar-guardias.py" >&2
  exit 2
}

# 1. Invocacion. Exactamente un argumento: la ruta del guardia.
if [ "$#" -ne 1 ]; then
  fallo "ejecutar-guardia.sh recibio $# argumentos y espera exactamente 1 (la ruta del guardia de Python). Revisa el bloque hooks de .claude/settings.json."
fi

guardia="$1"

if [ -z "${guardia//[[:space:]]/}" ]; then
  fallo "la ruta del guardia llego vacia. Revisa el bloque hooks de .claude/settings.json; probablemente \${CLAUDE_PROJECT_DIR} no se expandio."
fi

# 2. El guardia tiene que existir y ser legible.
if [ ! -f "$guardia" ]; then
  fallo "no existe el guardia '$guardia'. Un hook configurado que apunta a un archivo ausente no protege nada, y hasta ahora eso salia 127 y se trataba como error no bloqueante."
fi

if [ ! -r "$guardia" ]; then
  fallo "el guardia '$guardia' existe pero no se puede leer."
fi

# 3. Tiene que haber un interprete. Es el hueco original.
if ! command -v python3 >/dev/null 2>&1; then
  fallo "python3 NO esta disponible en esta maquina, asi que el guardia '$guardia' no puede correr. Sin el, esta operacion pasaria SIN revision. Instala python3 o no trabajes con estos repositorios desde este entorno."
fi

# 4. Se ejecuta el guardia de verdad y se devuelve SU codigo, sin tocarlo.
#    `exec` deja que el proceso de Python herede stdin, stdout y stderr y que su
#    codigo de salida sea el de este script. Nada de este envoltorio se
#    interpone entre el guardia y Claude Code.
exec python3 "$guardia"
