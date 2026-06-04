import { describe, expect, it } from 'vitest';
import {
  applyRemainingIngredientRules,
  buildRecommendationPrompt,
  normalizeRecommendationOutputs,
  type RecommendationRequest,
  validateRecommendationRequest
} from '../src/server/recommendation';

const baseRequest: RecommendationRequest = {
  inventory: [
    { id: 'rum', name: 'White rum', amount: 150, unit: 'ml', category: 'alcohol' },
    { id: 'lime', name: 'Lime juice', amount: 40, unit: 'ml', category: 'fruit' }
  ],
  preferences: {
    alcohol: 'low',
    caffeine: 'none',
    temperature: 'cold',
    calories: 'low',
    frugalMode: true,
    independentDrinks: false,
    requiredIngredientIds: ['rum'],
    recommendationCount: 3
  },
  language: 'en'
};

describe('recommendation request validation', () => {
  it('requires more than one recommendation when frugal mode is enabled', () => {
    const result = validateRecommendationRequest({
      ...baseRequest,
      preferences: { ...baseRequest.preferences, recommendationCount: 1 }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Frugal mode requires at least 2 recommendations');
    }
  });

  it('accepts optional inventory amounts', () => {
    const result = validateRecommendationRequest({
      ...baseRequest,
      inventory: [{ id: 'tea', name: 'Oolong tea', unit: 'ml', category: 'tea' }],
      preferences: { ...baseRequest.preferences, requiredIngredientIds: [] }
    });

    expect(result.success).toBe(true);
  });

  it('accepts current frontend inventory fields with custom units and stored null amounts', () => {
    const result = validateRecommendationRequest({
      ...baseRequest,
      inventory: [
        { id: 'espresso', name: 'Espresso', amount: 0, unit: 'shot', category: 'coffee' },
        { id: 'syrup', name: 'Vanilla syrup', amount: null, unit: 'oz', category: 'syrup' }
      ],
      preferences: {
        ...baseRequest.preferences,
        requiredIngredientIds: ['espresso'],
        recommendationCount: '2'
      }
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inventory[1]?.amount).toBeUndefined();
      expect(result.data.preferences.recommendationCount).toBe(2);
    }
  });
});

describe('recommendation prompt builder', () => {
  it('includes inventory, filters, required ingredients, and frugal constraints', () => {
    const prompt = buildRecommendationPrompt(baseRequest);

    expect(prompt).toContain('White rum: 150 ml');
    expect(prompt).toContain('category alcohol');
    expect(prompt).toContain('Alcohol: low');
    expect(prompt).toContain('Caffeine: none');
    expect(prompt).toContain('Temperature: cold');
    expect(prompt).toContain('Calories: low');
    expect(prompt).toContain('Required ingredients: White rum');
    expect(prompt).toContain('Frugal mode is on');
    expect(prompt).toContain('Return exactly 3 drink recommendations');
    expect(prompt).toContain('"recommendations"');
    expect(prompt).toContain('"ingredients":["amount ingredient"]');
    expect(prompt).toContain('"score"');
    expect(prompt).toContain('"volumeMl":0');
    expect(prompt).toContain('"dimensions":[{"label":"string","value":0}]');
    expect(prompt).toContain('Score total from 0 to 100');
    expect(prompt).toContain('If a drink contains both coffee/caffeine and alcohol, use the alcoholic drink dimension labels.');
  });
});

describe('recommendation output normalization', () => {
  it('produces the deterministic card shape from common AI field aliases', () => {
    const recommendations = normalizeRecommendationOutputs({
      recommendations: [
        {
          drinkName: 'Oolong Cooler',
          ingredients: ['120 ml oolong tea'],
          steps: ['Shake with ice'],
          alcoholLevel: 'none',
          caffeineLevel: 'low',
          temperature: 'cold',
          totalVolume: '120 ml',
          estimatedCalories: '25',
          reason: 'Uses the selected tea.'
        }
      ]
    });

    expect(recommendations).toEqual([
      {
        order: 1,
        name: 'Oolong Cooler',
        ingredients: ['120 ml oolong tea'],
        steps: ['Shake with ice'],
        alcohol: 'none',
        caffeine: 'low',
        temperature: 'cold',
        volumeMl: 120,
        calories: 25,
        reason: 'Uses the selected tea.',
        remainingIngredients: [],
        score: {
          total: 80,
          dimensions: [
            { label: 'Taste balance', value: 8 },
            { label: 'Inventory fit', value: 8 },
            { label: 'Preference match', value: 8 },
            { label: 'Simplicity', value: 8 },
            { label: 'Frugality', value: 8 }
          ]
        }
      }
    ]);
  });

  it('accepts common loose AI response shapes without dropping usable cards', () => {
    const recommendations = normalizeRecommendationOutputs({
      recipes: [
        {
          title: 'Warm Citrus Tea',
          ingredients: [{ amount: 120, unit: 'ml', name: 'oolong tea' }],
          steps: [{ instruction: 'Stir with lemon.' }],
          alcoholLevel: 'None',
          caffeineLevel: 'Low caffeine',
          temperature: 'warm',
          totalVolume: '120 ml',
          estimatedCalories: 'about 35 calories'
        }
      ]
    });

    expect(recommendations).toEqual([
      {
        order: 1,
        name: 'Warm Citrus Tea',
        ingredients: ['120 ml oolong tea'],
        steps: ['Stir with lemon.'],
        alcohol: 'none',
        caffeine: 'low',
        temperature: 'hot',
        volumeMl: 120,
        calories: 35,
        reason: 'Matches the selected inventory and preferences.',
        remainingIngredients: [],
        score: {
          total: 80,
          dimensions: [
            { label: 'Taste balance', value: 8 },
            { label: 'Inventory fit', value: 8 },
            { label: 'Preference match', value: 8 },
            { label: 'Simplicity', value: 8 },
            { label: 'Frugality', value: 8 }
          ]
        }
      }
    ]);
  });
});

describe('remaining ingredient rules', () => {
  it('lists only used measurable ingredients and subtracts drink usage from item capacity', () => {
    const recommendations = applyRemainingIngredientRules([
      {
        order: 1,
        name: 'Milk Coffee',
        ingredients: ['120 ml Milk', 'Coffee capsule'],
        steps: ['Mix'],
        alcohol: 'none',
        caffeine: 'low',
        temperature: 'cold',
        volumeMl: 180,
        calories: 80,
        reason: 'Balanced.',
        score: {
          total: 80,
          dimensions: [{ label: 'Sweetness balance', value: 8 }]
        },
        remainingIngredients: []
      }
    ], {
      ...baseRequest,
      inventory: [
        { id: 'milk', name: 'Milk', amount: 200, unit: 'ml', category: 'milk' },
        { id: 'capsule', name: 'Coffee capsule', unit: 'piece', category: 'coffee' },
        { id: 'rum', name: 'Rum', amount: 100, unit: 'ml', category: 'alcohol' }
      ],
      preferences: { ...baseRequest.preferences, requiredIngredientIds: [] }
    });

    expect(recommendations[0].remainingIngredients).toEqual(['80 ml Milk']);
  });
});
