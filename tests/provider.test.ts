import { describe, expect, it } from 'vitest';
import { createAiProvider, parseJsonResponse, simplifyAiErrorMessage } from '../src/server/aiProvider';

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

describe('AI error message simplification', () => {
  it('reduces Google high-demand errors to a short user-facing message', () => {
    const raw = 'Error: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [503 Service Unavailable] This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.';

    expect(simplifyAiErrorMessage(new Error(raw))).toBe('Currently experiencing high demand. Please try again later.');
  });

  it('reduces invalid JSON errors to a short retry message', () => {
    expect(simplifyAiErrorMessage(new Error("AI provider returned invalid JSON: Expected ',' or ']' after array element"))).toBe('AI returned an invalid response. Please try again.');
  });
});
