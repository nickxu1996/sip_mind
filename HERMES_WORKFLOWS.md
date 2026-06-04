# Hermes Workflows

## Startup Checklist

1. Read global project rules first.
2. Read local project files:
   - `PROJECT_BRIEF.md`
   - `REQUIREMENTS_INBOX.md`
   - `PROJECT_PROFILE.md`
   - `HERMES_WORKFLOWS.md`
3. Run `git status` before code changes.
4. Do not touch `.env` files.
5. Do not expose secrets.
6. Do not run `git push` unless explicitly asked.
7. Do not deploy unless explicitly asked.
8. Use English for internal project content.
9. Keep Chinese UI text in localization files.

## Safe Code Change

1. Run `git status`.
2. Identify relevant files.
3. Make a minimal change.
4. Run tests or a basic sanity check.
5. Run build if frontend or TypeScript files changed.
6. Show changed files and a diff summary.
7. Do not commit automatically.
8. Do not push.

## Test Commands

```bash
npm test
npm run build
```

## Local Development

```bash
npm install
npm run dev
```

API scaffold:

```bash
npm run server:dev
```

## Deployment Workflow

Deployment is a separate step. Before deployment:

1. Confirm GitHub repository URL.
2. Confirm target branch.
3. Confirm Vultr host.
4. Confirm server project path.
5. Confirm systemd service name.
6. Run local tests and build.
7. Ask for explicit confirmation before deployment.
