#!/bin/bash
set -e

# Uso: ./run-peer.sh --id <N> [--bizantino]
# Ejemplo: ./run-peer.sh --id 2 --bizantino

if [ $# -lt 2 ]; then
    echo "Uso: $0 --id <N> [--bizantino]"
    echo "  N = 1, 2, 3, 4  (posicion en el arreglo PEERS del .env)"
    echo "  --bizantino  (opcional) activa modo bizantino"
    exit 1
fi

ID=""
EXTRA=""

while [ $# -gt 0 ]; do
    case "$1" in
        --id)
            ID="$2"
            shift 2
            ;;
        --bizantino)
            EXTRA="--bizantino"
            shift
            ;;
        *)
            echo "Argumento desconocido: $1"
            exit 1
            ;;
    esac
done

if [ -z "$ID" ]; then
    echo "Debe especificar --id <N>"
    exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[run-peer] Iniciando P$ID en LAN..."
echo "[run-peer] Usando peers.env: $DIR/peers.env"
echo "[run-peer] Red: --network host (UDP directo en la LAN)"

docker run --rm \
    --network host \
    --name "bully-peer$ID" \
    --env-file "$DIR/peers.env" \
    "bully-peer:latest" \
    --id "$ID" $EXTRA
