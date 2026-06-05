import { describe, expect, it } from 'vitest';
import { createAiProvider, parseJsonResponse } from '../src/server/aiProvider';

describe('AI provider selection', () => {
  it('uses Gemini first when a Gemini key is available', () => {
    const provider = createAiProvider({ GEMINI_API_KEY: 'test-key', AI_PROVIDER: undefined, AI_MODEL: undefined });

    expect(provider.name).toBe('gemini');
    expect(provider.model).toBe('gemini-2.5-flash');
  });

  it('returns an explicit unconfigured provider when Gemini is not configured', async () => {
    const provider = createAiProvider({ GEMINI_API_KEY: undefined, AI_PROVIDER: undefined, AI_MODEL: undefined });

    expect(provider.name).toBe('unconfigured');
    await expect(provider.generateRecommendations('test')).rejects.toThrow('AI provider is not configured');
  });
});

describe('AI JSON response parsing', () => {
  it('repairs a missing comma between array string elements', () => {
    const parsed = parseJsonResponse('{"recommendations":[{"name":"Drink","ingredients":["Milk" "Coffee"]}]}');

    expect((parsed as any).recommendations[0].ingredients).toEqual(['Milk', 'Coffee']);
  });

  it('repairs trailing commas before closing brackets', () => {
    const parsed = parseJsonResponse('{"recommendations":[{"name":"Drink","ingredients":["Milk",],}]}');

    expect((parsed as any).recommendations[0].ingredients).toEqual(['Milk']);
  });
});
