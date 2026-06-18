#!/bin/bash
set -e

# Uso: ./run-peer.sh --id <N>
# Ejemplo: ./run-peer.sh --id 2
# Configurar nodos bizantinos en peers.env: BIZANTINOS=1,3

if [ $# -ne 2 ] || [ "$1" != "--id" ]; then
    echo "Uso: $0 --id <N>"
    echo "  N = 1, 2, 3...  (posicion en el arreglo PEERS del .env)"
    echo "  Bizantinos se configuran en peers.env: BIZANTINOS=1,3"
    exit 1
fi

ID="$2"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[run-peer] Iniciando P$ID en LAN..."
echo "[run-peer] Usando peers.env: $DIR/backend/peers.env"

docker run --rm \
    --network host \
    --name "bully-peer$ID" \
    --env-file "$DIR/backend/peers.env" \
    -v "$DIR/backend/state:/app/state" \
    "bully-peer:latest" \
    --id "$ID"
