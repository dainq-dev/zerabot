.PHONY: install dev dev-all dev-web dev-api build clean setup

install:
	bun install

# Start api-bridge + web-control only
dev:
	bun run dev

# Start zeroclaw + api-bridge + web-control
dev-all:
	bun run dev:all

dev-web:
	bun run dev:web

dev-api:
	bun run dev:api

build:
	bun run build

clean:
	bun run clean

# Setup ZeraBot config directory
setup:
	mkdir -p .config
	cp .env.example .env
	@echo "✓ .config directory created"
	@echo "✓ .env file created — edit it with your API keys"

# Start ZeroClaw binary (must be in PATH)
zeroclaw:
	zeroclaw --config .config/zerabot.toml

# Run migrations
migrate-db:
	bun run --filter api-bridge db:migrate

# Lint all
lint:
	bun run lint
