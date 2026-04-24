# Common Verification Commands

Use this reference only after confirming the project's actual commands from the repo. Do not assume the examples below are correct for every codebase.

## Verification command rules

1. Discover commands from project files first.
2. Record the exact commands chosen.
3. Run verification with shell-safe exit handling.
4. After any fix, re-run **all selected targets**, not just the previously failing one.

Shell-safe wrapper:

```bash
mkdir -p .runway/tmp
set -o pipefail
{command} 2>&1 | tee ".runway/tmp/qa-round-{N}.txt"
status=$?
echo "Exit: $status"
exit $status
```

Without `pipefail`, `tee` can hide a failing verification command.

## Discovery order for an unknown project

Check in this order:
1. `package.json` / workspace config (`npm`, `pnpm`, `yarn`, `turbo`, `nx`) for scripts and package scope
2. `Makefile` / `justfile` / task runner config
3. `README.md` or docs for local verification commands
4. language-specific config (`pyproject.toml`, `go.mod`, `Cargo.toml`, etc.)
5. CI config (`.github/workflows/`, internal CI files) for the authoritative command shape

If it is a monorepo, record whether commands run from:
- repo root;
- a package directory; or
- a workspace runner command.

## Node.js / TypeScript

```bash
# Tests
npm test
npm run test:unit
npm run test:integration
npx jest --coverage

# Build
npm run build

# Lint
npm run lint
npx eslint src/
npx prettier --check src/

# Type check
npx tsc --noEmit
```

Workspace variants:

```bash
npm --workspace <pkg> test
pnpm --filter <pkg> test
yarn workspace <pkg> test
turbo run test --filter=<pkg>
```

## Python

```bash
# Tests
pytest
pytest --cov=src tests/
python -m pytest -v

# Lint
flake8 src/
pylint src/
ruff check src/

# Type check
mypy src/
pyright src/
```

## Go

```bash
# Tests
go test ./...
go test -race ./...
go test -coverprofile=coverage.out ./...

# Build
go build ./...

# Lint
golangci-lint run
go vet ./...
```

## Java / Kotlin

```bash
# Tests + build
./gradlew test
./mvnw test

# Lint
./gradlew ktlintCheck
./mvnw checkstyle:check
```

## Failure-signature reminder

When a target fails, normalize the failure before comparing rounds:
- **Tests:** failing test names + error type
- **Build:** compiler/build tool error type + first failing module/file
- **Lint:** rule ID + file path
- **Typecheck:** diagnostic code/type error + file path

Do not compare raw timestamps or line numbers when deciding whether the same failure repeated.
