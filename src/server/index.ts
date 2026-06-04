import dotenv from 'dotenv';
import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiProvider } from './aiProvider.js';
import { createApp } from './app.js';
import { createDatabase } from './storage.js';

const projectRoot = process.cwd();
const envPath = resolve(projectRoot, '.env');
dotenv.config({ path: envPath });

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
const dbPath = process.env.DATABASE_PATH ?? 'sip-mind.sqlite';
const db = createDatabase(dbPath);

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
db.db.prepare('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)').run(adminUsername, adminPass, 'admin');
db.setUserPassword(adminUsername, adminPass, 'admin');
console.log(`[Sip Mind] Admin account synchronized from ${envPath}: ${adminUsername}`);

const ai = createAiProvider(process.env as Record<string, string>);
const app = createApp(db, ai, process.env);

const publicDir = resolve(projectRoot, 'dist');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/.*/, (_request, response) => {
    response.sendFile(join(publicDir, 'index.html'));
  });
}

app.listen(port, host, () => {
  console.log(`Sip Mind listening on http://${host}:${port}`);
});
