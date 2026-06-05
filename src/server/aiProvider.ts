import { GoogleGenerativeAI } from '@google/generative-ai';

export type AiProvider = {
  name: string;
  model: string;
  generateRecommendations: (prompt: string) => Promise<unknown>;
};

export function createAiProvider(env: Record<string, string | undefined>): AiProvider {
  const geminiKey = env.GEMINI_API_KEY;
  const preferredProvider = env.AI_PROVIDER;
  const preferredModel = env.AI_MODEL;

  if (geminiKey && (!preferredProvider || preferredProvider === 'gemini')) {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const modelName = preferredModel ?? 'gemini-2.5-flash';
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' }
    });

    return {
      name: 'gemini',
      model: modelName,
      async generateRecommendations(prompt: string) {
        let lastError: unknown;
        let activePrompt = prompt;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const result = await model.generateContent(activePrompt);
            const responseText = result.response.text();
            return parseJsonResponse(responseText);
          } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            if (!isTransientAiError(message) || attempt === 2) {
              throw new Error(message.includes('JSON') || message.includes('Expected')
                ? `AI provider returned invalid JSON: ${message}`
                : message);
            }
            if (message.includes('JSON') || message.includes('Expected') || message.includes('Unexpected')) {
              activePrompt = `${prompt}\n\nYour previous response was invalid JSON. Regenerate the full response from scratch. Return only a single valid JSON object. Use double quotes for every string, include commas between all array items and object properties, and do not include markdown or comments.`;
            }
            await delay(800 * (attempt + 1));
          }
        }

        throw lastError;
      }
    };
  }

  return {
    name: preferredProvider ?? 'unconfigured',
    model: preferredModel ?? 'unconfigured',
    async generateRecommendations(_prompt: string) {
      throw new Error('AI provider is not configured. Set GEMINI_API_KEY and AI_PROVIDER=gemini.');
    }
  };
}

export function parseJsonResponse(responseText: string) {
  const cleaned = stripInvisibleControlChars(responseText).trim();
  const fencedMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : cleaned;
  const jsonText = extractJsonSubstring(candidate);
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    return JSON.parse(repairCommonJsonIssues(jsonText));
  }
}

function stripInvisibleControlChars(input: string) {
  return input.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

function extractJsonSubstring(input: string) {
  const firstBrace = input.indexOf('{');
  const lastBrace = input.lastIndexOf('}');
  const firstBracket = input.indexOf('[');
  const lastBracket = input.lastIndexOf(']');

  const objectSlice = firstBrace >= 0 && lastBrace > firstBrace ? input.slice(firstBrace, lastBrace + 1) : '';
  const arraySlice = firstBracket >= 0 && lastBracket > firstBracket ? input.slice(firstBracket, lastBracket + 1) : '';

  if (objectSlice && (firstBracket < 0 || firstBrace <= firstBracket)) return objectSlice;
  if (arraySlice) return arraySlice;
  return input;
}

function repairCommonJsonIssues(input: string) {
  return input
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/"\s+(?=")/g, '",');
}

function isTransientAiError(message: string) {
  return /\b(429|500|502|503|504)\b|high demand|temporar|timeout|fetch|JSON|Expected ','|Unexpected token|unterminated/i.test(message);
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
