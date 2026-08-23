.PHONY: help install dev dev-tailnet dev-local dev-server dev-web build build-server build-web \
       start test test-watch typecheck clean distclean \
       wiki-lint wiki-links

SERVER_SRC := $(shell find src/server src/storage src/shared -name '*.ts' 2>/dev/null)
WEB_SRC    := $(shell find src/web -name '*.ts' -o -name '*.tsx' -o -name '*.css' 2>/dev/null)

# The excludes name every directory the running server writes into. Without
# them a ticket move, a prompt run, or an agent editing the wiki restarts the
# server under the user. `boards/` is gone since the workflow collapse; the
# directories that replaced it have to be listed by their new names, and
# `*.pre-migrate/**` covers the backups the migration leaves behind.
DEV_SERVER := npx tsx watch --exclude 'workflows/**' --exclude 'prompts/**' --exclude 'projects/**' --exclude '*.pre-migrate/**' --exclude 'wiki/**' --exclude '**/.claude/**' src/server/index.ts
DEV_WEB    := npx vite
DEV_BOTH   := npx concurrently -n server,web -c blue,magenta "$(DEV_SERVER)" "$(DEV_WEB)"

# Looked up when the target runs, not when the Makefile is parsed, so an
# address change is picked up by the next `make dev-tailnet` and unrelated
# targets never shell out to tailscale.
TAILSCALE_IP = $(shell tailscale ip -4 2>/dev/null | head -1)

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Dependencies ────────────────────────────────────────────────

node_modules: package.json package-lock.json
	npm ci
	@touch $@

install: node_modules ## Install dependencies (npm ci)

# ── Development ─────────────────────────────────────────────────

dev: node_modules ## Run server + web dev concurrently
	@echo "Meeseeks dev UI on every interface — http://localhost:5173, http://$$(hostname):5173,"
	@echo "  or this host's tailnet address. No authentication: the network is the boundary."
	@echo "  Narrow it with MEESEEKS_DEV_HOST=<address>, e.g. \$$(tailscale ip -4) for tailnet-only."
	$(DEV_BOTH)

# Both of these are `dev` with the bind narrowed. Narrowing costs something:
# binding one address means the other names for this machine stop working —
# localhost is not the tailnet address, and the bare hostname resolves to
# 127.0.1.1 — and a tailnet address that changes needs a restart, since it is
# read once at startup.
dev-tailnet: node_modules ## Run dev servers on the tailnet address only
	@test -n "$(TAILSCALE_IP)" || { \
		echo "no tailscale IPv4 address on this host — is tailscaled running?" >&2; exit 1; }
	@echo "Meeseeks dev UI: http://$(TAILSCALE_IP):5173  (tailnet only, unauthenticated)"
	@echo "  localhost and http://$$(hostname):5173 will NOT work with this bind"
	MEESEEKS_DEV_HOST=$(TAILSCALE_IP) $(DEV_BOTH)

dev-local: node_modules ## Run dev servers on loopback only
	@echo "Meeseeks dev UI: http://localhost:5173  (this machine only)"
	MEESEEKS_DEV_HOST=127.0.0.1 $(DEV_BOTH)

dev-server: node_modules ## Run server in watch mode
	$(DEV_SERVER)

dev-web: node_modules ## Run Vite dev server
	$(DEV_WEB)

# ── Build ───────────────────────────────────────────────────────

dist/server: $(SERVER_SRC) tsconfig.server.json node_modules
	npx tsc -p tsconfig.server.json
	@touch $@

dist/web: $(WEB_SRC) vite.config.ts node_modules
	npx vite build
	@touch $@

build-server: dist/server ## Build server (TypeScript → dist/)
build-web: dist/web ## Build web (Vite → dist/)
build: build-server build-web ## Build everything

# ── Production ──────────────────────────────────────────────────

start: dist/server dist/web ## Build and start production server
	node dist/server/index.js

# ── Testing ─────────────────────────────────────────────────────

test: node_modules ## Run tests once
	npx vitest run

test-watch: node_modules ## Run tests in watch mode
	npx vitest

# ── Type checking ───────────────────────────────────────────────

typecheck: node_modules ## Type-check server + web
	npx tsc -p tsconfig.json --noEmit
	npx tsc -p tsconfig.web.json --noEmit

# ── Wiki ────────────────────────────────────────────────────────

wiki-lint: ## Check wiki markdown for broken internal links
	@echo "Checking wiki internal links..."
	@cd wiki/meeseeks-wiki && \
	  find . -name '*.md' -exec grep -oEh '\[[^]]*\]\([^)]+\)' {} + | \
	  sed -n 's/.*](\([^)#]*\).*/\1/p' | \
	  grep -v '^https\{0,1\}://' | sort -u | \
	  while read -r target; do \
	    [ -n "$$target" ] && [ ! -f "$$target" ] && echo "  BROKEN: $$target"; \
	  done; true

wiki-links: ## List all wiki pages not referenced in index.md
	@echo "Wiki pages missing from index.md:"
	@cd wiki/meeseeks-wiki && \
	  find . -name '*.md' ! -name 'index.md' ! -name 'log.md' | sed 's|.*/||' | \
	  while read -r page; do \
	    grep -q "$$page" index.md 2>/dev/null || echo "  $$page"; \
	  done

# ── Cleanup ─────────────────────────────────────────────────────

clean: ## Remove build artifacts
	rm -rf dist

distclean: clean ## Remove build artifacts and node_modules
	rm -rf node_modules
