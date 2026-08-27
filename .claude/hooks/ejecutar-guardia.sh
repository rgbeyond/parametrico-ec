#!/usr/bin/env bash
# Envoltorio de arranque para los guardias de PreToolUse.
#
# EL PROBLEMA QUE RESUELVE
# ------------------------
# Los guardias fallan cerrado una vez que corren. El hueco estaba ANTES de eso:
# si `python3` no esta en la maquina, el hook sale 127. Claude Code trata
# cualquier codigo distinto de 2 como error NO BLOQUEANTE -lo registra y
# sigue-, asi que la operacion protegida se ejecuta igual. Un interprete
# ausente desarmaba toda la capa, en silencio.
#
# `comprobar-guardias.sh` (SessionStart) lo hace visible en el primer turno.
# Eso es aviso temprano, no una frontera: no bloquea nada.
#
# EL SEGUNDO HUECO, QUE LA PRIMERA VERSION DE ESTE ARCHIVO NO CERRABA
# --------------------------------------------------------------------
# La revision independiente lo encontro y se reprodujo: comprobar que el
# guardia EXISTA no basta, porque un guardia que existe pero no puede decidir
# sale 1, y 1 tampoco bloquea. Cuatro formas de conseguirlo, las cuatro
# dejaban pasar un `git push --force origin main`:
#
#   guardia con error de sintaxis   -> python3 sale 1
#   guardia que no es Python        -> python3 sale 1
#   import roto o archivo truncado  -> python3 sale 1
#   guardia que sale con otro codigo-> ese codigo
#
# El hueco solo se habia movido una casilla: de «guardia ausente aprueba» a
# «guardia inservible aprueba».
#
# La regla ahora es explicita: EL GUARDIA SOLO PUEDE DECIR DOS COSAS. 0 es
# «pasa» y 2 es «bloquea». Cualquier otro codigo significa que no llego a
# decidir, y eso se traduce a 2. Incluye las muertes por senal (128+n) y el
# fallo de `exec`.
#
# QUE NO HACE
# -----------
# NO reimplementa ni una sola regla de seguridad. Por eso es tan corto: dos
# copias de la logica divergen, y la copia en Bash seria la que nadie prueba.
# El guardia sigue siendo la implementacion; esto garantiza que corre y que su
# respuesta es interpretable.
#
# LO QUE ESTE ENVOLTORIO NO PUEDE CUBRIR, Y HAY QUE SABERLO
# ----------------------------------------------------------
# No puede protegerse a si mismo. Si ESTE archivo falta, pierde el bit de
# ejecucion, o `${CLAUDE_PROJECT_DIR}` no se expande, el shell sale 127 y la
# operacion pasa. Ningun envoltorio cierra su propio arranque. Lo que reduce
# ese riesgo esta fuera: el bit de ejecucion se comitea (100755, verificado en
# el indice de los dos repositorios) y `comprobar-guardias.sh` avisa en el
# primer turno si el archivo no esta.
#
# Uso:  ejecutar-guardia.sh <ruta-del-guardia>
#       Acepta .py (lo corre python3) y .sh (lo corre bash).
# Contrato: exit 0 deja pasar; exit 2 bloquea y stderr le explica a Claude.

set -uo pipefail

fallo() {
  echo "BLOQUEADO: $1" >&2
  echo "  Este envoltorio existe para que un guardia que no puede decidir no se confunda con un guardia que aprueba. Comprueba con: python3 .claude/hooks/probar-guardias.py" >&2
  exit 2
}

# 1. Invocacion: exactamente un argumento.
if [ "$#" -ne 1 ]; then
  fallo "ejecutar-guardia.sh recibio $# argumentos y espera exactamente 1 (la ruta del guardia). Revisa el bloque hooks de .claude/settings.json; si la ruta lleva espacios, tiene que ir entre comillas."
fi

guardia="$1"

if [ -z "${guardia//[[:space:]]/}" ]; then
  fallo "la ruta del guardia llego vacia. Revisa el bloque hooks de .claude/settings.json; probablemente \${CLAUDE_PROJECT_DIR} no se expandio."
fi

# 2. El guardia tiene que existir y poder leerse.
[ -f "$guardia" ] || fallo "no existe el guardia '$guardia'. Un hook que apunta a un archivo ausente no protege nada."
[ -r "$guardia" ] || fallo "el guardia '$guardia' existe pero no se puede leer."

# 3. Tiene que haber interprete. Es el hueco original.
case "$guardia" in
  *.py)
    interprete=python3
    ayuda="Instala python3 o no trabajes con estos repositorios desde este entorno." ;;
  *.sh)
    interprete=bash
    ayuda="Sin bash no hay shell; algo esta muy mal en esta maquina." ;;
  *)
    fallo "no se sabe con que ejecutar '$guardia': se esperaba .py o .sh." ;;
esac

command -v "$interprete" >/dev/null 2>&1 || fallo \
  "$interprete NO esta disponible, asi que el guardia '$guardia' no puede correr. Sin el, esta operacion pasaria SIN revision. $ayuda"

# 4. Se ejecuta el guardia y se INTERPRETA su respuesta.
#
#    No se usa `exec`: haria falta que el codigo de salida llegara tal cual, y
#    justamente lo que hace falta es mirarlo antes de devolverlo.
"$interprete" "$guardia"
codigo=$?

case "$codigo" in
  0) exit 0 ;;                      # el guardia dijo que pasa
  2) exit 2 ;;                      # el guardia dijo que no
  *)
    # Ni 0 ni 2: el guardia NO decidio. Un error de sintaxis, un import roto,
    # un archivo truncado, una senal. Se traduce a bloqueo.
    echo "BLOQUEADO: el guardia '$guardia' termino con codigo $codigo, que no es ni 0 (pasa) ni 2 (bloquea). Eso significa que NO llego a decidir: error de sintaxis, dependencia rota, archivo truncado o muerte por senal." >&2
    echo "  Se bloquea porque un guardia que no decide no puede aprobar. Corre '$interprete $guardia' a mano para ver el error, o .claude/hooks/probar-guardias.py." >&2
    exit 2 ;;
esac
