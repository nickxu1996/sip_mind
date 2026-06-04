import { z } from 'zod';

export const inventoryItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  amount: z.preprocess((value) => value === null ? undefined : value, z.coerce.number().nonnegative().optional()),
  unit: z.string().trim().min(1).default('ml'),
  category: z.string().trim().min(1).default('uncategorized')
});

const preferenceOptionSchema = z.enum(['any', 'high', 'low', 'none']);

export const preferenceSchema = z.object({
  alcohol: preferenceOptionSchema,
  caffeine: preferenceOptionSchema,
  temperature: z.enum(['any', 'hot', 'room', 'cold']),
  calories: z.enum(['any', 'high', 'medium', 'low', 'very-low']),
  frugalMode: z.boolean(),
  independentDrinks: z.boolean().default(false),
  requiredIngredientIds: z.array(z.string()),
  recommendationCount: z.coerce.number().int().min(1).max(10)
});

export const recommendationRequestSchema = z
  .object({
    inventory: z.array(inventoryItemSchema).min(1),
    preferences: preferenceSchema,
    language: z.enum(['en', 'zh']).default('en')
  })
  .superRefine((request, context) => {
    if (request.preferences.frugalMode && !request.preferences.independentDrinks && request.preferences.recommendationCount < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preferences', 'recommendationCount'],
        message: 'Frugal mode requires at least 2 recommendations'
      });
    }

    const inventoryIds = new Set(request.inventory.map((item) => item.id));
    const missingRequiredIds = request.preferences.requiredIngredientIds.filter((id) => !inventoryIds.has(id));
    if (missingRequiredIds.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['preferences', 'requiredIngredientIds'],
        message: `Required ingredients are not in inventory: ${missingRequiredIds.join(', ')}`
      });
    }
  });

export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;

export const recommendationOutputSchema = z.object({
  order: z.coerce.number().int().positive(),
  name: z.string().min(1),
  ingredients: z.array(z.string().min(1)).default([]),
  steps: z.array(z.string().min(1)).default([]),
  alcohol: preferenceOptionSchema.exclude(['any']),
  caffeine: preferenceOptionSchema.exclude(['any']),
  temperature: z.enum(['hot', 'room', 'cold']),
  volumeMl: z.coerce.number().nonnegative(),
  calories: z.coerce.number().nonnegative(),
  reason: z.string().min(1),
  score: z.object({
    total: z.coerce.number().min(0).max(100),
    dimensions: z.array(z.object({
      label: z.string().min(1),
      value: z.coerce.number().min(0).max(10)
    })).min(1).max(5)
  }),
  remainingIngredients: z.array(z.string().min(1)).default([])
});

export type RecommendationOutput = z.infer<typeof recommendationOutputSchema>;

export function validateRecommendationRequest(input: unknown) {
  return recommendationRequestSchema.safeParse(input);
}

export function normalizeRecommendationOutput(input: unknown, fallbackOrder = 1): RecommendationOutput | null {
  if (!input || typeof input !== 'object') return null;

  const record = input as Record<string, unknown>;
  const result = recommendationOutputSchema.safeParse({
    order: record.order ?? record.number ?? fallbackOrder,
    name: record.name ?? record.drinkName ?? record.title,
    ingredients: normalizeStringList(record.ingredients),
    steps: normalizeStringList(record.steps),
    alcohol: normalizePreferenceLevel(record.alcohol ?? record.alcoholLevel),
    caffeine: normalizePreferenceLevel(record.caffeine ?? record.caffeineLevel),
    temperature: normalizeTemperature(record.temperature),
    volumeMl: normalizeVolume(record.volumeMl ?? record.volume ?? record.totalVolume),
    calories: normalizeCalories(record.calories ?? record.estimatedCalories),
    reason: record.reason ?? record.why ?? record.description ?? record.evaluation ?? 'Matches the selected inventory and preferences.',
    score: normalizeScore(record.score ?? record.scoring ?? record.rating),
    remainingIngredients: normalizeStringList(record.remainingIngredients ?? record.leftovers ?? record.remaining)
  });

  return result.success ? result.data : null;
}

export function applyRemainingIngredientRules(recommendations: RecommendationOutput[], request: RecommendationRequest): RecommendationOutput[] {
  return recommendations.map((recommendation) => ({
    ...recommendation,
    remainingIngredients: calculateRemainingIngredients(recommendation, request)
  }));
}

function calculateRemainingIngredients(recommendation: RecommendationOutput, request: RecommendationRequest) {
  return request.inventory
    .filter((item) => item.amount !== undefined)
    .map((item) => {
      const usedAmount = findUsedAmount(item, recommendation.ingredients);
      if (usedAmount === null) return null;
      const remaining = Math.max(0, Number(item.amount) - usedAmount);
      return `${formatAmount(remaining)} ${item.unit} ${item.name}`;
    })
    .filter((item): item is string => Boolean(item));
}

function findUsedAmount(item: RecommendationRequest['inventory'][number], ingredients: string[]) {
  const itemName = escapeRegExp(item.name);
  const unit = escapeRegExp(item.unit);
  const patterns = [
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}\\s*${itemName}`, 'i'),
    new RegExp(`${itemName}[^\\d]*(\\d+(?:\\.\\d+)?)\\s*${unit}`, 'i')
  ];

  for (const ingredient of ingredients) {
    for (const pattern of patterns) {
      const match = ingredient.match(pattern);
      if (match) return Number(match[1]);
    }
  }

  return null;
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeScore(input: unknown) {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};

  return {
    total: normalizeNumericScore(record.total ?? record.totalScore ?? record.overall ?? record.overallScore, 80),
    dimensions: normalizeScoreDimensions(record.dimensions ?? record)
  };
}

function normalizeScoreDimensions(input: unknown) {
  if (Array.isArray(input)) {
    const dimensions = input
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const label = String(record.label ?? record.name ?? record.dimension ?? '').trim();
        if (!label) return null;
        return { label, value: normalizeNumericScore(record.value ?? record.score ?? record.points, 8) };
      })
      .filter((item): item is { label: string; value: number } => Boolean(item))
      .slice(0, 5);

    if (dimensions.length > 0) return dimensions;
  }

  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return [
    { label: 'Taste balance', value: normalizeNumericScore(record.tasteBalance ?? record.taste ?? record.balance, 8) },
    { label: 'Inventory fit', value: normalizeNumericScore(record.inventoryFit ?? record.inventory ?? record.ingredientFit, 8) },
    { label: 'Preference match', value: normalizeNumericScore(record.preferenceMatch ?? record.preferences ?? record.preference, 8) },
    { label: 'Simplicity', value: normalizeNumericScore(record.simplicity ?? record.ease ?? record.easyToMake, 8) },
    { label: 'Frugality', value: normalizeNumericScore(record.frugality ?? record.frugalUse ?? record.inventoryUse, 8) }
  ];
}

function normalizeNumericScore(input: unknown, fallback: number) {
  if (typeof input === 'number') return input;
  const match = String(input ?? '').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function normalizeStringList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map(normalizeListItem)
      .filter(Boolean);
  }

  if (typeof input === 'string' && input.trim()) return [input.trim()];

  return [];
}

function normalizeListItem(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (!input || typeof input !== 'object') return String(input ?? '').trim();

  const record = input as Record<string, unknown>;
  const name = record.name ?? record.ingredient ?? record.item ?? record.step ?? record.instruction;
  const amount = record.amount ?? record.quantity;
  const unit = record.unit;

  if (name && amount && unit) return `${amount} ${unit} ${name}`.trim();
  if (name && amount) return `${amount} ${name}`.trim();
  if (name) return String(name).trim();

  return String(record.text ?? record.description ?? '').trim();
}

function normalizePreferenceLevel(input: unknown) {
  const value = String(input ?? '').trim().toLowerCase();
  if (value.includes('high')) return 'high';
  if (value.includes('low') || value.includes('medium')) return 'low';
  if (value.includes('none') || value.includes('non') || value === '0') return 'none';
  return input;
}

function normalizeTemperature(input: unknown) {
  const value = String(input ?? '').trim().toLowerCase();
  if (value.includes('hot') || value.includes('warm')) return 'hot';
  if (value.includes('room') || value.includes('ambient')) return 'room';
  if (value.includes('cold') || value.includes('ice') || value.includes('chill')) return 'cold';
  return input;
}

function normalizeCalories(input: unknown) {
  if (typeof input === 'number') return input;
  const match = String(input ?? '').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : input;
}

function normalizeVolume(input: unknown) {
  if (typeof input === 'number') return input;
  const match = String(input ?? '').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : input;
}

export function normalizeRecommendationOutputs(input: unknown): RecommendationOutput[] {
  const source = Array.isArray(input)
    ? input
    : input && typeof input === 'object' && Array.isArray((input as { recommendations?: unknown }).recommendations)
      ? (input as { recommendations: unknown[] }).recommendations
      : input && typeof input === 'object' && Array.isArray((input as { recipes?: unknown }).recipes)
        ? (input as { recipes: unknown[] }).recipes
        : input && typeof input === 'object' && Array.isArray((input as { drinks?: unknown }).drinks)
          ? (input as { drinks: unknown[] }).drinks
      : [];

  return source
    .map((recommendation, index) => normalizeRecommendationOutput(recommendation, index + 1))
    .filter((recommendation): recommendation is RecommendationOutput => Boolean(recommendation))
    .map((recommendation, index) => ({ ...recommendation, order: index + 1 }));
}

export function buildRecommendationPrompt(request: RecommendationRequest): string {
  const requiredNames = request.preferences.requiredIngredientIds
    .map((id) => request.inventory.find((item) => item.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  const inventoryText = request.inventory
    .map((item) => {
      const amountText = item.amount === undefined ? 'amount unspecified' : `${item.amount} ${item.unit}`;
      return `- ${item.name}: ${amountText}; category ${item.category}; id ${item.id}`;
    })
    .join('\n');

  const frugalText = request.preferences.frugalMode
    ? 'Frugal mode is on: try to reduce measurable leftovers across the recommended set, but never sacrifice taste, balance, or golden-ratio drink proportions. Good taste is the first priority. Leaving unused ingredients is acceptable when it improves the drink.'
    : 'Frugal mode is off: prioritize good taste, balance, and golden-ratio drink proportions.';
  const sharingText = request.preferences.independentDrinks
    ? 'Independent drinks is on: each recommendation is a separate option and does not need to share inventory with the other options. Treat the available inventory as available for each option independently.'
    : 'Independent drinks is off: recommendations are a set of options that may share the same inventory pool. If frugal mode is on, consider the combined use across the set, but do not force bad-tasting drinks.';
  const coffeeDimensions = request.language === 'zh'
    ? ['甜度平衡', '苦味顺滑度', '香气/风味感', '口感厚度/滑顺度', '整体协调度']
    : ['Sweetness balance', 'Bitterness smoothness', 'Aroma/flavor presence', 'Body/smoothness', 'Overall harmony'];
  const alcoholDimensions = request.language === 'zh'
    ? ['酒精感平衡', '甜度/酸度平衡', '香气', '口感顺滑度', '整体协调感']
    : ['Alcohol balance', 'Sweetness/acidity balance', 'Aroma', 'Smoothness', 'Overall harmony'];
  const responseLanguageName = request.language === 'zh' ? 'Simplified Chinese' : 'English';
  const localizedCoffeeDimensions = request.language === 'zh'
    ? ['甜度平衡', '苦味顺滑度', '香气/风味感', '口感厚度/滑顺度', '整体协调度']
    : ['Sweetness balance', 'Bitterness smoothness', 'Aroma/flavor presence', 'Body/smoothness', 'Overall harmony'];
  const localizedAlcoholDimensions = request.language === 'zh'
    ? ['酒精感平衡', '甜度/酸度平衡', '香气', '口感顺滑度', '整体协调感']
    : ['Alcohol balance', 'Sweetness/acidity balance', 'Aroma', 'Smoothness', 'Overall harmony'];

  return [
    'You are Sip Mind, an AI drink recommendation assistant.',
    `Response language: ${responseLanguageName}.`,
    `All user-facing JSON string values must be written in ${responseLanguageName}: drink name, ingredients, steps, reason/evaluation, score dimension labels, and remainingIngredients.`,
    'Only these metadata enum values stay in English because the app parser requires them: alcohol, caffeine, temperature.',
    'Do not mix languages. Preserve exact inventory item names when they are ingredient names, but write the surrounding recipe text in the response language.',
    `Return exactly ${request.preferences.recommendationCount} drink recommendations, ordered by recommendation level (best match first).`,
    'Return only valid JSON. Do not include markdown, prose, or comments.',
    'All JSON strings must be properly quoted and escaped. Do not use trailing commas, smart quotes, unescaped line breaks, or comments.',
    'The JSON shape must be exactly: {"recommendations":[{"order":1,"name":"string","ingredients":["amount ingredient"],"steps":["string"],"alcohol":"high|low|none","caffeine":"high|low|none","temperature":"hot|room|cold","volumeMl":0,"calories":0,"reason":"one or two sentence evaluation","score":{"total":0,"dimensions":[{"label":"string","value":0}]},"remainingIngredients":["amount ingredient left"]}]}',
    'Use numeric estimated calories. Keep ingredients and steps as arrays of strings so the existing recipe cards and favorites can save them directly.',
    'Use numeric estimated total drink volume in milliliters as volumeMl.',
    'Every recommendation must include remainingIngredients. For each drink, list only ingredients that are actually used in that drink and have a numeric inventory amount. Calculate each item as inventory amount for that item minus the amount used by this drink. Do not list unused inventory. If a used ingredient has no numeric inventory amount, do not include it in remainingIngredients. If nothing qualifies, return an empty array.',
    'Ingredients with unspecified amount should not be considered for frugal exhaustion or remainingIngredients, but they may still be used for taste.',
    'Score total from 0 to 100. Score each dimension value from 0 to 10.',
    `For non-alcohol coffee/caffeine drinks, use these five dimension labels exactly: ${localizedCoffeeDimensions.join(', ')}.`,
    `For alcoholic drinks, use these five dimension labels exactly: ${localizedAlcoholDimensions.join(', ')}.`,
    'If a drink contains both coffee/caffeine and alcohol, use the alcoholic drink dimension labels.',
    'The reason field must briefly explain the score in one or two sentences.',
    '',
    'Inventory:',
    inventoryText,
    '',
    'Preferences:',
    `- Alcohol: ${request.preferences.alcohol}`,
    `- Caffeine: ${request.preferences.caffeine}`,
    `- Temperature: ${request.preferences.temperature}`,
    `- Calories: ${request.preferences.calories}`,
    `- Required ingredients: ${requiredNames.length > 0 ? requiredNames.join(', ') : 'none'}`,
    `- Frugal mode: ${request.preferences.frugalMode ? 'on' : 'off'}`,
    `- Independent drinks: ${request.preferences.independentDrinks ? 'on' : 'off'}`,
    '',
    sharingText,
    '',
    frugalText
  ].join('\n');
}
