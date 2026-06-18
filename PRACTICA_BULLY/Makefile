IMAGE = bully-peer
COMPOSE = docker compose

.PHONY: build up down restart logs kill run image clean

build:
	$(COMPOSE) build

# Uso: make up [B1=--bizantino] [B2=--bizantino]
up:
	B1=$(B1) B2=$(B2) $(COMPOSE) up

down:
	$(COMPOSE) down

restart: down up

logs:
	$(COMPOSE) logs -f

kill:
	@[ "$(N)" ] && docker kill bully-peer$(N) || echo "Uso: make kill N=4"

run:
	@[ "$(ID)" ] && ./run-peer.sh --id $(ID) $(if $(BIZ),--bizantino) || echo "Uso: make run ID=2 [BIZ=1]"

image:
	docker build -t $(IMAGE) .

clean: down
	-docker rmi $(IMAGE) 2>/dev/null; true
