# Contributing to happy-lunch

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js >= 18
- npm
- A Telegram Bot Token (for integration testing)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/luongnv89/happy-lunch.git
cd happy-lunch

# Install dependencies
npm install

# Copy config templates
cp .env.example .env
cp config.json.example config.json

# Edit .env with your bot token and config.json with your settings

# Run in development mode
npm run dev

# Run tests
npm test
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot reload (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm test` | Run test suite once |
| `npm run test:watch` | Run tests in watch mode |

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/luongnv89/happy-lunch/issues) to avoid duplicates
2. Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
3. Include steps to reproduce, expected vs actual behavior, and your environment

### Suggesting Features

1. Open an issue using the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md)
2. Describe the problem, proposed solution, and use cases

### Submitting Changes

1. Fork the repository
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```
3. Make your changes
4. Add or update tests as needed
5. Ensure all tests pass: `npm test`
6. Commit your changes (see commit conventions below)
7. Push and open a Pull Request against `main`

## Branching Strategy

- `main` — Stable, release-ready code
- `feat/*` — New features
- `fix/*` — Bug fixes
- `docs/*` — Documentation changes
- `refactor/*` — Code refactoring (no behavior change)

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]
```

Types:
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation only
- `refactor` — Code change that neither fixes a bug nor adds a feature
- `test` — Adding or updating tests
- `chore` — Maintenance (dependencies, tooling, etc.)

Examples:
```
feat: add /help command to bot
fix: prevent path traversal via encoded slashes
docs: add deployment guide
test: add workspace symlink escape test
```

## Coding Standards

- **TypeScript strict mode** — All code must compile with `strict: true`
- **No `any`** — Use proper types; narrow with type guards when needed
- **Zod for validation** — Use Zod schemas for external data (config, user input)
- **Error handling** — Return typed error objects instead of throwing where possible
- **Security** — Never allow arbitrary command execution; validate all paths and inputs

## Testing Requirements

- All new features must include tests
- All bug fixes should include a regression test
- Tests use [Vitest](https://vitest.dev)
- Run the full suite before submitting: `npm test`
- Test files go in `tests/` with the naming pattern `*.test.ts`

## Pull Request Process

1. Fill out the PR template completely
2. Ensure tests pass
3. Keep PRs focused — one feature or fix per PR
4. Update documentation if your change affects user-facing behavior
5. A maintainer will review your PR and may request changes

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Questions?

Open an issue with the question label, or start a discussion.
