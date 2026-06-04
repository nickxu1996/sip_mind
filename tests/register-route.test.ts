import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app';
import { createDatabase } from '../src/server/storage';

const tempDirs: string[] = [];

function makeDbPath() {
  const directory = mkdtempSync(join(tmpdir(), 'sip-mind-register-route-test-'));
  tempDirs.push(directory);
  return join(directory, 'sip-mind.sqlite');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const ai = {
  name: 'test-ai',
  model: 'test-model',
  async generateRecommendations() {
    return [];
  }
};

describe('registration route', () => {
  it('creates an account and requires password confirmation', async () => {
    const database = createDatabase(makeDbPath());
    const app = createApp(database, ai);
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');

      const mismatch = await fetch(`http://127.0.0.1:${address.port}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'new-user', password: 'secret1', confirmPassword: 'secret2' })
      });
      expect(mismatch.status).toBe(400);

      const response = await fetch(`http://127.0.0.1:${address.port}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'new-user', password: 'secret1', confirmPassword: 'secret1' })
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.user.username).toBe('new-user');
      expect(body.token).toBeTruthy();
      const savedUser = database.getUserByUsername('new-user') as any;
      expect(savedUser).toBeTruthy();
      expect(savedUser.password).not.toBe('secret1');

      const dataResponse = await fetch(`http://127.0.0.1:${address.port}/api/user/data`, {
        headers: { Authorization: `Bearer ${body.token}` }
      });
      expect(dataResponse.status).toBe(200);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });

  it('requires captcha after three registration attempts from the same IP', async () => {
    const database = createDatabase(makeDbPath());
    const app = createApp(database, ai);
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');

      for (let index = 0; index < 3; index += 1) {
        const response = await fetch(`http://127.0.0.1:${address.port}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: `captcha-user-${index}`, password: 'secret1', confirmPassword: 'secret1' })
        });
        expect(response.status).toBe(200);
      }

      const blocked = await fetch(`http://127.0.0.1:${address.port}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'captcha-user-4', password: 'secret1', confirmPassword: 'secret1' })
      });
      const body = await blocked.json();
      expect(blocked.status).toBe(403);
      expect(body.error).toBe('CAPTCHA_REQUIRED');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });
});
