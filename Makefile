SHELL := /bin/sh
.DEFAULT_GOAL := all

TRIVY ?= trivy
SECURITY_REPORT_DIR ?= tmp/security

.PHONY: all quality fmt lint build unittest coverage complexity maintainability security clean install bundle

fmt:
	npx prettier --write "**/*.ts" "**/*.js" "**/*.mjs" --ignore-path .gitignore

lint:
	npx tsc --noEmit
	npx eslint .

build:
	npx tsc --noEmit

unittest: coverage

coverage:
	@test_files=$$(find test \( -name '*.test.ts' -o -name '*.test.mjs' \) 2>/dev/null | sort | tr '\n' ' '); \
	if [ -z "$$test_files" ]; then \
		echo "No test files found." >&2; exit 1; \
	else \
		npx c8 --all --include=lib.ts --include=read.ts --include='plugins/**/*.ts' \
			--check-coverage --lines=51 --statements=51 --functions=51 --branches=51 \
			--reporter=text-summary --reporter=html node --test --import tsx $$test_files; \
	fi

clean:
	rm -rf node_modules/ coverage/ data/ dist/ tmp/security/

install: clean
	npm install
	npm link
	@echo "Installed: web_reader command is now available globally"

bundle:
	@mkdir -p dist
	npx esbuild read.ts \
		--bundle \
		--platform=node \
		--target=node24 \
		--format=esm \
		--outfile=dist/web_reader.js \
		--external:@mozilla/readability \
		--external:jsdom \
		--external:cheerio \
		--external:turndown \
		--external:undici \
		--external:@modelcontextprotocol/sdk
	@echo "Bundle: dist/web_reader.js (deps still required in node_modules)"
	@echo "For a self-contained build use: npm pack"

all: build

complexity:
	npx eslint --config eslint.complexity.js lib.ts read.ts plugins

maintainability:
	node scripts/maintainability.mjs

security:
	@command -v "$(TRIVY)" >/dev/null 2>&1 || { echo 'Trivy is required: https://trivy.dev/' >&2; exit 1; }
	mkdir -p "$(SECURITY_REPORT_DIR)"
	$(TRIVY) fs --scanners vuln --include-dev-deps --list-all-pkgs --exit-code 0 \
		--skip-dirs node_modules --skip-dirs coverage --skip-dirs dist --skip-dirs data \
		--skip-dirs tmp --skip-dirs "$(SECURITY_REPORT_DIR)" \
		--format json --output "$(SECURITY_REPORT_DIR)/source.json" .
	node scripts/security-report.mjs "$(SECURITY_REPORT_DIR)/source.json"

# unittest already runs coverage, so the aggregate executes tests only once.
quality: build lint unittest complexity maintainability security
