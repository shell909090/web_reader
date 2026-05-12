.PHONY: fmt lint build unittest test

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

test: unittest
	bash scripts/smoke.sh
