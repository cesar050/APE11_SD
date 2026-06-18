#!/bin/bash
# generate-compose.sh
# Lee peers.env y genera docker-compose.generated.yml dinamicamente.
# Asi no hay que editar el compose al agregar/quitar peers.

ENV_FILE="${1:-backend/peers.env}"
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE no encontrado"
    exit 1
fi

# Extraer PEERS del .env (ignorando comentarios y vacios)
PEERS_LINE=$(grep -E '^PEERS=' "$ENV_FILE" | tail -1 | sed 's/^PEERS=//')
if [ -z "$PEERS_LINE" ]; then
    echo "Error: PEERS no definido en $ENV_FILE"
    exit 1
fi

IFS=',' read -ra PEER_LIST <<< "$PEERS_LINE"
N=${#PEER_LIST[@]}

# --- Generar docker-compose ---
cat <<COMPOSE_HEADER
# Generado automaticamente por generate-compose.sh desde $ENV_FILE
# NO editar este archivo manualmente.

services:
COMPOSE_HEADER

PORTS_START=9000
for i in $(seq 1 $N); do
    id=$i
    host_port=$((PORTS_START + i - 1))

    cat <<SERVICE
  peer${id}:
    build:
      context: .
    container_name: bully-peer${id}
    command: --id ${id}
    env_file: ${ENV_FILE}
    ports:
      - "${host_port}:9000/udp"
    volumes:
      - ./backend/state:/app/state
SERVICE

    # depends_on: solo al siguiente peer (controla orden de arranque)
    if [ $i -lt $N ]; then
        echo "    depends_on:"
        echo "      - peer$((i + 1))"
    fi
    echo ""
done

cat <<COMPOSE_FOOTER
networks:
  default:
    driver: bridge
COMPOSE_FOOTER
