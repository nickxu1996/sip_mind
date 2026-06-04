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
  it('accepts the frontend request body, returns recommendations, and saves history', async () => {
    const database = createDatabase(makeDbPath());
    const userId = database.createUser({ username: 'recommendation-route-test', password: 'test' });
    const app = createApp(database, ai);
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');

      const response = await fetch(`http://127.0.0.1:${address.port}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
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
});
