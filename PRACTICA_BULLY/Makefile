IMAGE = bully-peer
COMPOSE = docker compose

.PHONY: build up down restart logs kill run image clean

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up

down:
	$(COMPOSE) down

restart: down up

logs:
	$(COMPOSE) logs -f

kill:
	@[ "$(N)" ] && docker kill bully-peer$(N) || echo "Uso: make kill N=4"

run:
	@[ "$(ID)" ] && ./run-peer.sh --id $(ID) || echo "Uso: make run ID=2"

image:
	docker build -t $(IMAGE) .

clean: down
	-docker rmi $(IMAGE) 2>/dev/null; true
