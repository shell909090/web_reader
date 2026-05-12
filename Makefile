.PHONY: fmt lint build unittest clean install bundle

fmt:
	npx prettier --write "**/*.ts" "**/*.js" --ignore-path .gitignore

lint:
	npx tsc --noEmit
	npx eslint .

build:
	npx tsc --noEmit

unittest:
	@test_files=$$(find test -name '*.test.ts' 2>/dev/null | sort | tr '\n' ' '); \
	if [ -z "$$test_files" ]; then \
		echo "No test files found."; \
	else \
		npx c8 --reporter=text-summary node --test --import tsx $$test_files; \
	fi

clean:
	rm -rf node_modules/ coverage/ data/ dist/

install: clean
	npm install
	npm link
	@echo "Installed: web_reader command is now available globally"

bundle:
	@mkdir -p dist
	npx esbuild read.ts \
		--bundle \
		--platform=node \
		--target=node20 \
		--format=esm \
		--outfile=dist/web_reader.js \
		--external:@mozilla/readability \
		--external:jsdom \
		--external:cheerio \
		--external:turndown \
		--external:@modelcontextprotocol/sdk
	@echo "Bundle: dist/web_reader.js (deps still required in node_modules)"
	@echo "For a self-contained build use: npm pack"
