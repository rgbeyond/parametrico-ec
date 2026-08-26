#!/usr/bin/env bash
# PreToolUse sobre Edit|Write — impide que una credencial entre al repositorio.
#
# Por qué existe: el CLAUDE.md decía "la service_role no entra al repositorio"
# y eso es texto persuasivo, no un control. Un hook sí lo es.
#
# Barato a propósito: lee el JSON de stdin, revisa dos cosas con grep y sale.
# Sin red, sin dependencias más allá de python3 para leer el JSON.
#
# Contrato: exit 0 deja pasar; exit 2 bloquea y stderr le explica a Claude.
set -uo pipefail

entrada=$(cat)
ruta=$(printf '%s' "$entrada" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")
cuerpo=$(printf '%s' "$entrada" | python3 -c "
import sys,json
d=json.load(sys.stdin).get('tool_input',{})
print(d.get('content','') or d.get('new_string','') or '')
" 2>/dev/null || echo "")

# 1. Archivos que nunca se escriben desde aquí.
#    Las plantillas SI se permiten: .env.example es justamente lo que hay que
#    escribir para documentar que variables hacen falta, con marcadores de
#    posicion en lugar de valores.
case "$ruta" in
  *.env.example|*.env.template|*.env.sample|*.env.ejemplo)
    : ;;
  *.env|*.env.*|*/.env|*/.env.*|*id_rsa|*id_ed25519|*.pem|*.p12|*.pfx|*.key)
    echo "BLOQUEADO: '$ruta' es un archivo de credenciales. Las variables de entorno se configuran en Netlify y en el panel de Supabase, no en el repositorio. Si necesitas documentar cuáles hacen falta, usa .env.example con marcadores de posición." >&2
    exit 2 ;;
esac

# 2. Cadenas con forma de credencial en el contenido.
#    JWT de Supabase, llaves privadas, tokens de proveedor, y la palabra
#    service_role acompañada de algo que parezca un valor.
if printf '%s' "$cuerpo" | grep -qE 'eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}'; then
  echo "BLOQUEADO: el contenido trae algo con forma de JWT. La llave anonima de Supabase es publica por diseno y va en una variable VITE_, no escrita en un archivo del repositorio. La service_role no va a ningun lado." >&2
  exit 2
fi
if printf '%s' "$cuerpo" | grep -qE 'BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY'; then
  echo "BLOQUEADO: el contenido trae una llave privada." >&2
  exit 2
fi
if printf '%s' "$cuerpo" | grep -qEi '(service_role|SUPABASE_SERVICE_ROLE)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9._-]{20,}'; then
  echo "BLOQUEADO: parece un valor de service_role. Esa llave nunca entra al repositorio, ni a un chat, ni a una variable con prefijo VITE_." >&2
  exit 2
fi
if printf '%s' "$cuerpo" | grep -qE 'VITE_[A-Z_]*(TOKEN|SECRET|SERVICE_ROLE|PASSWORD)'; then
  echo "BLOQUEADO: una variable con prefijo VITE_ se incrusta en el paquete de JavaScript y viaja al navegador. Una credencial ahi queda publicada. Quitale el prefijo y leela desde una funcion de Netlify, como hace BANXICO_TOKEN." >&2
  exit 2
fi

exit 0
