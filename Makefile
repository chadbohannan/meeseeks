.PHONY: dev dev-server dev-web build build-server build-web start test test-watch typecheck clean install

# Development
dev:
	npm run dev

dev-server:
	npm run dev:server

dev-web:
	npm run dev:web

# Build
build:
	npm run build

build-server:
	npm run build:server

build-web:
	npm run build:web

# Production
start:
	npm run start

# Testing
test:
	npm run test

test-watch:
	npm run test:watch

# Type checking
typecheck:
	npm run typecheck

# Dependencies
install:
	npm install

# Cleanup
clean:
	rm -rf dist node_modules
