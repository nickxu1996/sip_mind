import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app';
import { createDatabase } from '../src/server/storage';

const tempDirs: string[] = [];

function makeDbPath() {
  const directory = mkdtempSync(join(tmpdir(), 'sip-mind-recommendations-route-test-'));
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
  async generateRecommendations(prompt: string) {
    expect(prompt).toContain('Return exactly 2 drink recommendations');
    expect(prompt).toContain('category tea');
    expect(prompt).toContain('Return only valid JSON');
    return [
      {
        name: 'Iced Tea Cooler',
        ingredients: ['Oolong tea'],
        steps: ['Shake with ice'],
        alcohol: 'none',
        caffeine: 'low',
        temperature: 'cold',
        volumeMl: 180,
        calories: 30,
        reason: 'Uses the selected tea.',
        score: {
          total: 88,
          dimensions: [
            { label: 'Sweetness balance', value: 9 },
            { label: 'Bitterness smoothness', value: 9 },
            { label: 'Aroma/flavor presence', value: 8 },
            { label: 'Body/smoothness', value: 9 },
            { label: 'Overall harmony', value: 8 }
          ]
        }
      }
    ];
  }
};

describe('recommendation generation route', () => {
  it('allows guest generation with a device id and enforces the guest daily limit', async () => {
    const database = createDatabase(makeDbPath());
    database.setConfig('daily_limit_guest', '1');
    const app = createApp(database, ai);
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');

      const body = {
        deviceId: 'guest-device-one',
        inventory: [{ id: 'tea', name: 'Oolong tea', amount: null, unit: 'oz', category: 'tea' }],
        preferences: {
          alcohol: 'none',
          caffeine: 'low',
          temperature: 'cold',
          calories: 'low',
          frugalMode: false,
          requiredIngredientIds: ['tea'],
          recommendationCount: '2'
        },
        language: 'en'
      };

      const response = await fetch(`http://127.0.0.1:${address.port}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      expect(response.status).toBe(200);

      const overLimit = await fetch(`http://127.0.0.1:${address.port}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      expect(overLimit.status).toBe(429);
      await expect(overLimit.json()).resolves.toMatchObject({ error: 'GUEST_DAILY_LIMIT_REACHED' });
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });

  it('accepts the frontend request body, returns recommendations, and saves history', async () => {
    const database = createDatabase(makeDbPath());
    const userId = database.createUser({ username: 'recommendation-route-test', password: 'test' });
    const token = database.createSession(userId);
    const app = createApp(database, ai);
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');

      const response = await fetch(`http://127.0.0.1:${address.port}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          inventory: [{ id: 'tea', name: 'Oolong tea', amount: null, unit: 'oz', category: 'tea' }],
          preferences: {
            alcohol: 'none',
            caffeine: 'low',
            temperature: 'cold',
            calories: 'low',
            frugalMode: true,
            requiredIngredientIds: ['tea'],
            recommendationCount: '2'
          },
          language: 'en'
        })
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.recommendations[0]?.name).toBe('Iced Tea Cooler');
      expect(body.recommendations[0]?.order).toBe(1);

      const history = database.listRecommendationHistory(10);
      expect(history).toHaveLength(1);
      expect(history[0].provider).toBe('test-ai');
      expect(history[0].model).toBe('test-model');
      expect(history[0].recommendations[0]?.name).toBe('Iced Tea Cooler');
      expect(history[0].request.inventory[0]?.amount).toBeUndefined();
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });

  it('returns a JSON error without saving fake history when AI output cannot be normalized into cards', async () => {
    const database = createDatabase(makeDbPath());
    const userId = database.createUser({ username: 'empty-ai-route-test', password: 'test' });
    const token = database.createSession(userId);
    const app = createApp(database, {
      name: 'test-ai',
      model: 'test-model',
      async generateRecommendations() {
        return { recommendations: [{ name: '' }] };
      }
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');

      const response = await fetch(`http://127.0.0.1:${address.port}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          inventory: [{ id: 'tea', name: 'Oolong tea', amount: null, unit: 'oz', category: 'tea' }],
          preferences: {
            alcohol: 'none',
            caffeine: 'low',
            temperature: 'cold',
            calories: 'low',
            frugalMode: false,
            requiredIngredientIds: ['tea'],
            recommendationCount: '1'
          },
          language: 'en'
        })
      });

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body.error).toBe('AI_RESPONSE_UNUSABLE');
      expect(body.recommendations).toBeUndefined();
      expect(database.listRecommendationHistory(10)).toHaveLength(0);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });

  it('returns a simplified AI provider error message', async () => {
    const database = createDatabase(makeDbPath());
    const userId = database.createUser({ username: 'ai-error-route-test', password: 'test' });
    const token = database.createSession(userId);
    const app = createApp(database, {
      name: 'test-ai',
      model: 'test-model',
      async generateRecommendations() {
        throw new Error('[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [503 Service Unavailable] This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.');
      }
    });
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');

      const response = await fetch(`http://127.0.0.1:${address.port}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          inventory: [],
          preferences: {
            alcohol: 'any',
            caffeine: 'any',
            temperature: 'any',
            calories: 'any',
            frugalMode: false,
            independentDrinks: true,
            ignoreInventory: true,
            requiredIngredientIds: [],
            recommendationCount: '1'
          },
          language: 'en'
        })
      });

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body).toMatchObject({
        error: 'AI_GENERATION_FAILED',
        message: 'Currently experiencing high demand. Please try again later.'
      });
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });

  it('enforces configurable global and per-user daily generation limits', async () => {
    const database = createDatabase(makeDbPath());
    const firstUserId = database.createUser({ username: 'limit-user-one', password: 'test' });
    const secondUserId = database.createUser({ username: 'limit-user-two', password: 'test' });
    const firstToken = database.createSession(firstUserId);
    const secondToken = database.createSession(secondUserId);
    database.setConfig('daily_limit_global', '2');
    database.setConfig('daily_limit_user', '1');
    const app = createApp(database, ai);
    const server = app.listen(0);

    const requestBody = () => ({
      inventory: [{ id: 'tea', name: 'Oolong tea', amount: null, unit: 'oz', category: 'tea' }],
      preferences: {
        alcohol: 'none',
        caffeine: 'low',
        temperature: 'cold',
        calories: 'low',
        frugalMode: false,
        requiredIngredientIds: ['tea'],
        recommendationCount: '2'
      },
      language: 'en'
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');
      const url = `http://127.0.0.1:${address.port}/api/recommendations`;

      const first = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firstToken}` },
        body: JSON.stringify(requestBody())
      });
      expect(first.status).toBe(200);

      const sameUserAgain = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firstToken}` },
        body: JSON.stringify(requestBody())
      });
      expect(sameUserAgain.status).toBe(429);
      await expect(sameUserAgain.json()).resolves.toMatchObject({ error: 'USER_DAILY_LIMIT_REACHED' });

      const second = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secondToken}` },
        body: JSON.stringify(requestBody())
      });
      expect(second.status).toBe(200);

      database.setConfig('daily_limit_user', '5');
      const globalExceeded = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firstToken}` },
        body: JSON.stringify(requestBody())
      });
      expect(globalExceeded.status).toBe(429);
      await expect(globalExceeded.json()).resolves.toMatchObject({ error: 'GLOBAL_DAILY_LIMIT_REACHED' });
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.db.close();
    }
  });
});
