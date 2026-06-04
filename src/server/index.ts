import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiProvider } from './aiProvider';
import { createApp } from './app';
import { createDatabase } from './storage';

const serverDir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(serverDir, '..', '..', '.env');
dotenv.config({ path: envPath, override: true });

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DATABASE_PATH ?? 'sip-mind.sqlite';
const db = createDatabase(dbPath);

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
db.db.prepare('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)').run(adminUsername, adminPass, 'admin');
db.db.prepare('UPDATE users SET password = ?, role = ? WHERE username = ?').run(adminPass, 'admin', adminUsername);
console.log(`[Sip Mind] Admin account synchronized from ${envPath}: ${adminUsername}`);

const ai = createAiProvider(process.env as Record<string, string>);
const app = createApp(db, ai, process.env);

app.listen(port, '127.0.0.1', () => {
  console.log(`Sip Mind API listening on http://127.0.0.1:${port}`);
});
