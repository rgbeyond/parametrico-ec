#!/usr/bin/env bash
# SessionStart — comprueba que los guardias pueden correr.
#
# POR QUE HACE FALTA. Claude Code trata un hook que sale con un codigo distinto
# de 2 como un error no bloqueante: lo registra y sigue. Si `python3` no esta en
# la maquina, guardia-destructivo.py y guardia-commit.py salen 127 y TODO pasa,
# en silencio. Es el mismo modo de fallo del heredoc de la Fase 0: el guardia
# parecia instalado y no revisaba nada.
#
# Este hook no puede impedirlo -SessionStart no bloquea nada- pero si puede
# hacerlo VISIBLE en el primer turno, que es cuando todavia se puede corregir.
# Lo que imprime en stdout entra al contexto de la sesion.
set -uo pipefail
raiz="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks"
faltas=()

command -v python3 >/dev/null 2>&1 || faltas+=(
  "python3 NO esta disponible: guardia-destructivo.py y guardia-commit.py
   saldrian 127 y Claude Code lo trataria como error no bloqueante. Sin
   python3, esta sesion NO tiene guardias.")

for g in guardia-destructivo.py guardia-commit.py guardia-secretos.sh \
         verifica-por-ruta.sh; do
  if [ ! -f "$raiz/$g" ]; then
    faltas+=("$g no existe en .claude/hooks/")
  elif [ ! -x "$raiz/$g" ]; then
    faltas+=("$g existe pero no tiene permiso de ejecucion (chmod +x)")
  fi
done

if [ ${#faltas[@]} -gt 0 ]; then
  echo "AVISO DE SEGURIDAD: los guardias de este repositorio no estan operativos."
  for f in "${faltas[@]}"; do echo "  - $f"; done
  echo "  Comprueba con: python3 .claude/hooks/probar-guardias.py"
  echo "  Mientras tanto, NO des por hecho que un commit peligroso sera detenido."
fi
exit 0
