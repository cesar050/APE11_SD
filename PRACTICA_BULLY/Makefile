IMAGE = bully-peer
COMPOSE = docker compose
COMPOSE_FILE = docker-compose.generated.yml

.PHONY: build up down restart logs kill run image clean

COMPOSE_RUN = $(COMPOSE) -f $(COMPOSE_FILE)

build:
	@./generate-compose.sh > $(COMPOSE_FILE)
	$(COMPOSE_RUN) build

up:
	@./generate-compose.sh > $(COMPOSE_FILE)
	$(COMPOSE_RUN) up

down:
	$(COMPOSE_RUN) down 2>/dev/null; true

restart: down up

logs:
	$(COMPOSE_RUN) logs -f

kill:
	@[ "$(N)" ] && docker kill bully-peer$(N) || echo "Uso: make kill N=<id>"

run:
	@[ "$(ID)" ] && ./run-peer.sh --id $(ID) || echo "Uso: make run ID=2"

image:
	docker build -t $(IMAGE) .

ui:
	@node backend/server.js

clean: down
	-rm -f $(COMPOSE_FILE)
	-docker rmi $(IMAGE) 2>/dev/null; true
