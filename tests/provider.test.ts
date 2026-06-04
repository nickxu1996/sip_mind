import { describe, expect, it } from 'vitest';
import { createAiProvider } from '../src/server/aiProvider';

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
