# Sip Mind

Sip Mind is a public web app for AI drink recipe recommendations based on inventory, preferences, saved food-library items, favorites, and admin-managed usage limits.

Public URL: https://sipmind.xyz/

## Local Development

```bash
npm install
npm run server:dev
npm run dev
```

The Vite frontend runs on `http://127.0.0.1:5173` and proxies API calls to `http://127.0.0.1:8787`.

## Checks

```bash
npm test
npm run build
```

## Production Notes

- Secrets belong in `.env` only and must not be committed.
- The public service runs behind Nginx on Vultr and proxies `sipmind.xyz` to the local API service on port `8787`.
- Use `upload_github.bat` to push to GitHub.
- Use `pull_to_vultr.bat` only when the latest local changes should be deployed to the public server.
