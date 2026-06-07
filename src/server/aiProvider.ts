import { GoogleGenerativeAI } from '@google/generative-ai';

export type AiProvider = {
  name: string;
  model: string;
  generateRecommendations: (prompt: string) => Promise<unknown>;
};

const HIGH_DEMAND_RETRY_DELAY_MS = 3000;
const HIGH_DEMAND_RETRY_COUNT = 3;
const DEFAULT_TRANSIENT_RETRY_COUNT = 2;

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
        let completedRetries = 0;

        while (true) {
          try {
            const result = await model.generateContent(activePrompt);
            const responseText = result.response.text();
            return parseJsonResponse(responseText);
          } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            if (!shouldRetryAiError(message, completedRetries)) {
              throw new Error(message.includes('JSON') || message.includes('Expected')
                ? `AI provider returned invalid JSON: ${message}`
                : message);
            }
            if (message.includes('JSON') || message.includes('Expected') || message.includes('Unexpected')) {
              activePrompt = `${prompt}\n\nYour previous response was invalid JSON. Regenerate the full response from scratch. Return only a single valid JSON object. Use double quotes for every string, include commas between all array items and object properties, and do not include markdown or comments.`;
            }
            completedRetries += 1;
            await delay(getAiRetryDelayMs(message, completedRetries));
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

export function isHighDemandAiError(message: string) {
  return /high demand/i.test(message);
}

export function shouldRetryAiError(message: string, completedRetries: number) {
  if (!isTransientAiError(message)) return false;
  const retryLimit = isHighDemandAiError(message) ? HIGH_DEMAND_RETRY_COUNT : DEFAULT_TRANSIENT_RETRY_COUNT;
  return completedRetries < retryLimit;
}

export function getAiRetryDelayMs(message: string, retryNumber: number) {
  if (isHighDemandAiError(message)) return HIGH_DEMAND_RETRY_DELAY_MS;
  return 800 * retryNumber;
}

export function simplifyAiErrorMessage(input: unknown) {
  const message = input instanceof Error ? input.message : String(input ?? '');
  const clean = message.replace(/\s+/g, ' ').trim();

  if (/high demand/i.test(clean)) {
    return 'Currently experiencing high demand. Please try again later.';
  }

  if (/\b(429|rate limit|too many requests)\b/i.test(clean)) {
    return 'Too many requests. Please try again later.';
  }

  if (/\b(503|service unavailable)\b/i.test(clean)) {
    return 'Service is temporarily unavailable. Please try again later.';
  }

  if (/\b(500|502|504)\b|temporar/i.test(clean)) {
    return 'AI service is temporarily unavailable. Please try again later.';
  }

  if (/timeout|timed out/i.test(clean)) {
    return 'AI request timed out. Please try again later.';
  }

  if (/invalid JSON|Expected|Unexpected token|unterminated|JSON/i.test(clean)) {
    return 'AI returned an invalid response. Please try again.';
  }

  if (/not configured|GEMINI_API_KEY|API key/i.test(clean)) {
    return 'AI provider is not configured.';
  }

  return 'AI generation failed. Please try again later.';
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
