.PHONY: ensure-dirs up daemon down restart logs ps

UID := $(shell id -u)
GID := $(shell id -g)

# Base compose files; optionally add agent-claude via ENABLE_CLAUDE=1
COMPOSE_FILES := -f docker-compose.yml
ifeq ($(ENABLE_CLAUDE),1)
COMPOSE_FILES += -f docker-compose.claude.yml
endif

ensure-dirs:
	mkdir -p ~/.mimo-container ~/.mimo-agent-container ~/.claude

up:
	$(MAKE) ensure-dirs
	UID=$(UID) GID=$(GID) docker compose $(COMPOSE_FILES) up --build

daemon:
	$(MAKE) ensure-dirs
	UID=$(UID) GID=$(GID) docker compose $(COMPOSE_FILES) up --build -d

down:
	UID=$(UID) GID=$(GID) docker compose $(COMPOSE_FILES) down

restart:
	$(MAKE) ensure-dirs
	UID=$(UID) GID=$(GID) docker compose $(COMPOSE_FILES) down
	UID=$(UID) GID=$(GID) docker compose $(COMPOSE_FILES) up --build -d

logs:
	UID=$(UID) GID=$(GID) docker compose $(COMPOSE_FILES) logs -f

ps:
	UID=$(UID) GID=$(GID) docker compose $(COMPOSE_FILES) ps
