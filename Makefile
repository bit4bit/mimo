.PHONY: ensure-dirs up daemon down restart logs ps

UID := $(shell id -u)
GID := $(shell id -g)

ensure-dirs:
	mkdir -p ~/.mimo-container ~/.mimo-agent-container ~/.claude

up:
	$(MAKE) ensure-dirs
	UID=$(UID) GID=$(GID) docker compose up --build

daemon:
	$(MAKE) ensure-dirs
	UID=$(UID) GID=$(GID) docker compose up --build -d

down:
	UID=$(UID) GID=$(GID) docker compose down

restart:
	$(MAKE) ensure-dirs
	UID=$(UID) GID=$(GID) docker compose down
	UID=$(UID) GID=$(GID) docker compose up --build -d

logs:
	UID=$(UID) GID=$(GID) docker compose logs -f

ps:
	UID=$(UID) GID=$(GID) docker compose ps
