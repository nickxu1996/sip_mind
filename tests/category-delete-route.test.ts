import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, parseBasicAuthHeader } from '../src/server/app';
import { createDatabase } from '../src/server/storage';

const tempDirs: string[] = [];

function makeDbPath() {
  const directory = mkdtempSync(join(tmpdir(), 'sip-mind-http-test-'));
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
  generateRecommendations: async () => []
};

function basic(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

describe('admin inventory category deletion route', () => {
  it('parses Basic auth passwords containing colons', () => {
    expect(parseBasicAuthHeader(basic('admin', 'pa:ss'))).toEqual({ username: 'admin', password: 'pa:ss' });
  });

  it('deletes a category and moves inventory items to uncategorized', async () => {
    const database = createDatabase(makeDbPath());
    const userId = database.createUser({ username: 'category-route-test', password: 'test' });
    database.addInventoryCategory('syrup/sweet');
    database.setInventory(userId, [
      { id: 'grenadine', name: 'Grenadine', amount: 100, unit: 'ml', category: 'syrup/sweet' }
    ]);

    const app = createApp(database, ai as any, { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'pa:ss' });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');

      const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/inventory/categories`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: basic('admin', 'pa:ss')
        },
        body: JSON.stringify({ name: 'syrup/sweet' })
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.categories).not.toContain('syrup/sweet');
      const inventory = database.getInventory(userId) as any[];
      expect(inventory.find(item => item.id === 'grenadine')?.category).toBe('uncategorized');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });
});
