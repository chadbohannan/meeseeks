.PHONY: help install dev dev-tailnet dev-server dev-web build build-server build-web \
       start test test-watch typecheck clean distclean \
       wiki-lint wiki-links

SERVER_SRC := $(shell find src/server src/storage src/shared -name '*.ts' 2>/dev/null)
WEB_SRC    := $(shell find src/web -name '*.ts' -o -name '*.tsx' -o -name '*.css' 2>/dev/null)

DEV_SERVER := npx tsx watch --exclude 'boards/**' --exclude 'wiki/**' src/server/index.ts
DEV_WEB    := npx vite
DEV_BOTH    = npx concurrently -n server,web -c blue,magenta "$(DEV_SERVER)" "$(DEV_WEB)"

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

dev: node_modules ## Run server + web dev concurrently (localhost only)
	$(DEV_BOTH)

# Binds the UI to this host's tailnet address and nothing else — not 0.0.0.0,
# which would also expose it on whatever LAN the machine is on. Meeseeks has no
# authentication, so anyone who can reach it can start agents on this machine;
# a tailnet is a reasonable trust boundary for that, a coffee-shop network is not.
dev-tailnet: node_modules ## Run dev servers on this host's tailnet address
	@test -n "$(TAILSCALE_IP)" || { \
		echo "no tailscale IPv4 address on this host — is tailscaled running?" >&2; exit 1; }
	@echo "Meeseeks dev UI: http://$(TAILSCALE_IP):5173  (tailnet only, unauthenticated)"
	@echo "  from other tailnet devices: http://$$(hostname):5173"
	@echo "  the bare hostname may resolve to 127.0.1.1 on this machine — use the address above here"
	MEESEEKS_DEV_HOST=$(TAILSCALE_IP) $(DEV_BOTH)

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
