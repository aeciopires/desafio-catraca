# Catraca — harness commands. Run `make help` for the list.
# Every target delegates to scripts/*.sh so the same behaviour is available without make.

SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

export COMPOSE_PROJECT_NAME ?= catraca
export APP_PORT ?= 8080
export GRAFANA_PORT ?= 3000
export PROMETHEUS_PORT ?= 9090
export JAEGER_UI_PORT ?= 16686
export LOKI_PORT ?= 3100
export OBSERVABILITY ?= 1

SERVICE ?= app
COMPOSE := docker compose -p $(COMPOSE_PROJECT_NAME)

.PHONY: help check-os check-dependencies check-ports install build build-multiarch up down restart clean \
	logs ps seed psql lint typecheck test test-unit test-integration gates toc toc-check check-spec \
	check-reports check-final evaluator-flow

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

check-os: ## Check the OS/architecture against the supported matrix
	@bash scripts/check-os.sh

check-dependencies: ## Check Docker, Compose, Colima (macOS), git, make, mise
	@bash scripts/check-deps.sh

check-ports: ## Check that every host port used by the stack is free
	@bash scripts/check-ports.sh

install: ## Install mise (user scope) + project tools + npm deps (no Docker, no sudo)
	@bash scripts/install.sh

build: ## Build the images for the local architecture
	@bash scripts/check-os.sh && $(COMPOSE) --profile '*' build

build-multiarch: ## Build the app image for linux/amd64 and linux/arm64 (buildx)
	@docker buildx build --platform linux/amd64,linux/arm64 -f docker/app.Dockerfile --target runtime -t catraca-app:multiarch .

up: ## Start everything (build, migrations, seed, observability) and print URLs/credentials
	@bash scripts/up.sh

down: ## Stop everything that `up` started (all profiles)
	@bash scripts/down.sh

restart: down up ## down + up

clean: ## down and remove the database volume (asks for confirmation)
	@read -r -p "Remover o volume do banco do projeto $(COMPOSE_PROJECT_NAME)? [s/N] " ans; \
	if [ "$$ans" = "s" ] || [ "$$ans" = "S" ]; then bash scripts/down.sh --volumes; else echo "Cancelado."; fi

logs: ## Follow logs of a service (SERVICE=app|worker|migrate|postgres|...)
	@$(COMPOSE) --profile '*' logs -f --tail 100 $(SERVICE)

ps: ## Show project containers
	@$(COMPOSE) --profile '*' ps -a

seed: ## Re-run migrations + seed (idempotent)
	@$(COMPOSE) run --rm migrate

psql: ## Open psql in the database
	@$(COMPOSE) exec postgres psql -U catraca -d catraca

lint: ## Lint + format check (in container)
	@SKIP_UP=1 KEEP_UP=1 bash scripts/run-tests.sh static

typecheck: lint ## Typecheck (runs together with lint)

test-unit: ## up -> unit tests -> down, with summary
	@bash scripts/run-tests.sh unit

test-integration: ## up -> integration tests -> down, with summary
	@bash scripts/run-tests.sh integration

test: ## up -> lint, typecheck, unit and integration tests -> down
	@bash scripts/run-tests.sh all

gates: ## All gates: spec, reports, TOC, lint, typecheck, unit, integration
	@bash scripts/gates.sh

toc: ## Generate/update the TOC of every Markdown file (idempotent)
	@node scripts/gen-toc.mjs

toc-check: ## Fail if any TOC is outdated
	@node scripts/gen-toc.mjs --check

check-spec: ## Validate PRD x graph x contracts consistency
	@node scripts/check-spec.mjs

check-reports: ## Validate immutable reports and the project state file
	@bash scripts/check-reports.sh

check-final: ## Delivery check: every feature done with an approved report
	@bash scripts/check-reports.sh --final

evaluator-flow: ## Run the evaluator flow (curl) against the running stack
	@bash scripts/evaluator-flow.sh
