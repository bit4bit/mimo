.PHONY: up daemon down restart logs ps

UID := $(shell id -u)
GID := $(shell id -g)

up:
	UID=$(UID) GID=$(GID) docker compose up --build

daemon:
	UID=$(UID) GID=$(GID) docker compose up --build -d

down:
	UID=$(UID) GID=$(GID) docker compose down

restart:
	UID=$(UID) GID=$(GID) docker compose down
	UID=$(UID) GID=$(GID) docker compose up --build -d

logs:
	UID=$(UID) GID=$(GID) docker compose logs -f

ps:
	UID=$(UID) GID=$(GID) docker compose ps
