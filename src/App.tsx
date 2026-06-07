import { useMemo, useState, useEffect, useRef } from 'react';
import { DndContext, useDraggable, useDroppable, DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { en } from './i18n/en';
import { zh } from './i18n/zh';

type Language = 'en' | 'zh';
type InventoryItem = { id: string; name: string; amount?: number; unit: string; category: string; sharePublicFoodLibrary?: boolean; };
type FoodLibraryItem = { id: number; name: string; category: string; is_public?: number; };
type InventoryCategory = { name: string; label_zh: string; label_en: string };
type User = { id: number; username?: string; role: string; type: 'account' | 'invite'; };
type AuthCredentials = { username: string; password: string };
type StoredAuthSession = { user: User; token?: string; credentials?: AuthCredentials };
type PreferenceKey = 'alcohol' | 'caffeine' | 'temperature' | 'calories';
type OptionKey = 'any' | 'high' | 'low' | 'none' | 'hot' | 'room' | 'cold' | 'medium' | 'very-low';
type GenerationPreferences = {
  alcohol: string;
  caffeine: string;
  temperature: string;
  calories: string;
  frugalMode: boolean;
  independentDrinks: boolean;
  ignoreInventory: boolean;
  recommendationCount: number;
  requiredIngredientIds: string[];
};

const defaultCategories: InventoryCategory[] = [
  { name: 'coffee', label_zh: '\u5496\u5561', label_en: 'Coffee' },
  { name: 'alcohol', label_zh: '\u9152\u7c7b', label_en: 'Alcohol' },
  { name: 'soft', label_zh: '\u8f6f\u996e', label_en: 'Soft Drinks' },
  { name: 'milk', label_zh: '\u5976\u7c7b', label_en: 'Dairy' },
  { name: 'powder', label_zh: '\u7c89\u672b', label_en: 'Powder' },
  { name: 'fruit', label_zh: '\u6c34\u679c', label_en: 'Fruit' },
  { name: 'tea', label_zh: '\u8336', label_en: 'Tea' },
  { name: 'uncategorized', label_zh: '\u672a\u5206\u7c7b', label_en: 'Uncategorized' }
];
const authStorageKey = 'sip_mind_user';
const deviceStorageKey = 'sip_mind_device_id';
const guestInventoryStoragePrefix = 'sip_mind_guest_inventory';
const recommendationsStoragePrefix = 'sip_mind_recommendations';
const foodHintStoragePrefix = 'sip_mind_food_hint';
const preferencesStoragePrefix = 'sip_mind_preferences';
const introTextStoragePrefix = 'sip_mind_intro_text';
const defaultIntroTexts: Record<Language, string> = {
  zh: '\u9009\u62e9\u5bb6\u4e2d\u5e93\u5b58\u548c\u504f\u597d\uff0c\u667a\u80fd\u63a8\u8350\u996e\u54c1\u914d\u65b9\u3002',
  en: 'Choose your home inventory and preferences for smart drink recipe recommendations.'
};
const defaultFoodHintTexts: Record<Language, string> = {
  zh: '\u5355\u51fb\u5e93\u5b58\u4f1a\u8bbe\u4e3a AI \u6bcf\u4e2a\u63a8\u8350\u90fd\u5fc5\u987b\u5305\u542b\u7684\u539f\u6599\uff1b\u53cc\u51fb\u53ef\u4fee\u6539\uff0c\u6309\u4f4f\u53ef\u62d6\u52a8\u3002\n\u70b9\u51fb\u98df\u54c1\u5e93\u5373\u53ef\u8f7b\u677e\u9009\u62e9\u3002',
  en: 'Click inventory to require it in every AI recommendation. Double-click to edit; hold and drag to move.\nClick the food library to choose quickly.'
};
let apiReadyPromise: Promise<void> | null = null;

const laneId = (category: string) => `category-lane:${category}`;

const categoryIcons: Record<string, string> = {
  coffee: '☕',
  alcohol: '⚗',
  soft: '▣',
  milk: '▤',
  powder: '◫',
  fruit: '◎',
  tea: '♧',
  solid: '▥',
  uncategorized: '◇'
};

function getCategoryIcon(category: string) {
  return categoryIcons[category] ?? '○';
}

function normalizeCategory(category: string | Partial<InventoryCategory>): InventoryCategory {
  if (typeof category === 'string') {
    const fallback = defaultCategories.find(item => item.name === category);
    return fallback ?? { name: category, label_zh: category, label_en: category };
  }
  const name = String(category.name ?? '').trim();
  return {
    name,
    label_zh: String(category.label_zh ?? category.name ?? '').trim() || name,
    label_en: String(category.label_en ?? category.name ?? '').trim() || name
  };
}

function orderInventoryCategories(categories: (string | Partial<InventoryCategory>)[]) {
  const seen = new Set<string>();
  const normalized = categories.map(normalizeCategory).filter(category => category.name);
  const ordered = normalized.filter(category => {
    if (!category.name || category.name === 'uncategorized' || seen.has(category.name)) return false;
    seen.add(category.name);
    return true;
  });

  const uncategorized = normalized.find(category => category.name === 'uncategorized') ?? normalizeCategory('uncategorized');
  return [...ordered, uncategorized];
}

function readStoredAuthSession(): StoredAuthSession | null {
  const saved = localStorage.getItem(authStorageKey);
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved);
    if (parsed?.user) return parsed as StoredAuthSession;
    if (parsed?.id) return { user: parsed as User };
  } catch (error) {
    console.error(error);
  }

  return null;
}

function getRecommendationsStorageKey(userId: number) {
  return `${recommendationsStoragePrefix}:${userId}`;
}

function readStoredRecommendations(userId: number) {
  const saved = localStorage.getItem(getRecommendationsStorageKey(userId));
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function storeRecommendations(userId: number, recommendations: unknown[]) {
  localStorage.setItem(getRecommendationsStorageKey(userId), JSON.stringify(recommendations));
}

function createClientId(prefix = 'id') {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readOrCreateDeviceId() {
  const existing = localStorage.getItem(deviceStorageKey);
  if (existing) return existing;
  const id = createClientId('device');
  localStorage.setItem(deviceStorageKey, id);
  return id;
}

function getGuestInventoryStorageKey(deviceId: string) {
  return `${guestInventoryStoragePrefix}:${deviceId}`;
}

function readStoredGuestInventory(deviceId: string): InventoryItem[] {
  const saved = localStorage.getItem(getGuestInventoryStorageKey(deviceId));
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function storeGuestInventory(deviceId: string, inventory: InventoryItem[]) {
  localStorage.setItem(getGuestInventoryStorageKey(deviceId), JSON.stringify(inventory));
}

function getPreferencesStorageKey(userId: number | string) {
  return `${preferencesStoragePrefix}:${userId}`;
}

function readStoredPreferences(userId: number | string) {
  const saved = localStorage.getItem(getPreferencesStorageKey(userId));
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function storePreferences(userId: number | string, preferences: unknown) {
  localStorage.setItem(getPreferencesStorageKey(userId), JSON.stringify(preferences));
}

function getFoodHintStorageKey(userId: number | 'guest', language: Language) {
  return `${foodHintStoragePrefix}:${userId}:${language}`;
}

function readStoredFoodHint(userId: number | 'guest', language: Language) {
  const saved = localStorage.getItem(getFoodHintStorageKey(userId, language));
  if (!saved) return null;

  try {
    const parsed = JSON.parse(saved);
    if (typeof parsed?.text === 'string') return { text: parsed.text };
    if (typeof parsed?.first === 'string' && typeof parsed?.second === 'string') return parsed;
  } catch (error) {
    console.error(error);
  }

  return null;
}

function storeFoodHint(userId: number | 'guest', language: Language, hint: { text: string }) {
  localStorage.setItem(getFoodHintStorageKey(userId, language), JSON.stringify(hint));
}

function getIntroTextStorageKey(language: Language) {
  return `${introTextStoragePrefix}:${language}`;
}

function readStoredIntroText(language: Language) {
  const saved = localStorage.getItem(getIntroTextStorageKey(language));
  if (saved) return saved;
  if (language === 'zh') {
    const legacy = localStorage.getItem(introTextStoragePrefix);
    if (legacy) return legacy;
  }
  return defaultIntroTexts[language];
}

function storeIntroText(language: Language, text: string) {
  localStorage.setItem(getIntroTextStorageKey(language), text);
}

function readStoredTextDrafts(reader: (language: Language) => string) {
  return { zh: reader('zh'), en: reader('en') };
}

function DraggableChip({ item, isRequired, onToggle, onDelete, onEdit }: { item: InventoryItem, isRequired: boolean, onToggle: () => void, onDelete: () => void, onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: item.id,
    data: { type: 'inventory-item', itemId: item.id }
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 100 } : undefined;

  return (
    <div ref={setNodeRef} style={style} className="chip-wrapper">
      <button 
        className={isRequired ? 'chip selected' : 'chip'} 
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        onDoubleClick={(e) => { e.stopPropagation(); onEdit(); }}
        {...listeners} {...attributes}
      >
        {item.name} {item.amount ? `(${item.amount}${item.unit})` : ''}
      </button>
      <button className="delete-btn" aria-label={`Delete ${item.name}`} onClick={(e) => { e.stopPropagation(); onDelete(); }}>X</button>
    </div>
  );
}

function CategoryLane({ id, title, items, requiredIds, onToggle, onDelete, onEdit }: { id: string, title: string, items: InventoryItem[], requiredIds: string[], onToggle: (id: string) => void, onDelete: (id: string) => void, onEdit: (item: InventoryItem) => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: laneId(id),
    data: { type: 'category-lane', category: id }
  });
  
  return (
    <div className="category-row">
      <h3>
        <span className="category-icon" aria-hidden="true">{getCategoryIcon(id)}</span>
        <span className="category-title">{title}</span>
        <span className="category-count">{items.length}</span>
      </h3>
      <div ref={setNodeRef} className={`category-drop-zone ${isOver ? 'over' : ''}`}>
        {items.map(item => (
          <DraggableChip 
            key={item.id} 
            item={item} 
            isRequired={requiredIds.includes(item.id)} 
            onToggle={() => onToggle(item.id)} 
            onDelete={() => onDelete(item.id)} 
            onEdit={() => onEdit(item)}
          />
        ))}
      </div>
    </div>
  );
}

export function App() {
  const [language, setLanguage] = useState<Language>('zh');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [preferences, setPreferences] = useState({
    alcohol: 'any' as string, caffeine: 'any' as string, temperature: 'any' as string, calories: 'any' as string,
    frugalMode: false, independentDrinks: false, ignoreInventory: false, recommendationCount: 2, requiredIngredientIds: [] as string[]
  });
  const [preferencesStorageReady, setPreferencesStorageReady] = useState(false);
  const [inventoryName, setInventoryName] = useState('');
  const [inventoryAmount, setInventoryAmount] = useState('');
  const [shareFoodLibraryPublicly, setShareFoodLibraryPublicly] = useState(true);
  const [categories, setCategories] = useState<InventoryCategory[]>(() => orderInventoryCategories(defaultCategories));
  const [newCategoryZh, setNewCategoryZh] = useState('');
  const [newCategoryEn, setNewCategoryEn] = useState('');
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [leftoverRecommendations, setLeftoverRecommendations] = useState<any[]>([]);
  const [selectedRecommendationIds, setSelectedRecommendationIds] = useState<string[]>([]);
  const [foodLibrary, setFoodLibrary] = useState<FoodLibraryItem[]>([]);
  const [foodLibraryOpen, setFoodLibraryOpen] = useState(true);
  const [foodLibrarySearch, setFoodLibrarySearch] = useState('');
  const [foodHintOverride, setFoodHintOverride] = useState<{ text: string } | null>(null);
  const [foodHintDrafts, setFoodHintDrafts] = useState<Record<Language, string>>({ zh: '', en: '' });
  const [introTexts, setIntroTexts] = useState<Record<Language, string>>(() => readStoredTextDrafts(readStoredIntroText));
  const [introTextDrafts, setIntroTextDrafts] = useState<Record<Language, string>>(() => readStoredTextDrafts(readStoredIntroText));
  const [deviceId] = useState(readOrCreateDeviceId);
  const [generationLimits, setGenerationLimits] = useState({
    daily_limit_global: '200',
    daily_limit_user: '50',
    daily_limit_guest: '10',
    daily_limit_contact_global: '10',
    daily_limit_contact_user: '3'
  });
  const [guestDailyLimit, setGuestDailyLimit] = useState('10');
  const inventoryLanesRef = useRef<HTMLDivElement | null>(null);
  const generationAreaRef = useRef<HTMLDivElement | null>(null);
  const favoriteSignaturesRef = useRef<Set<string>>(new Set());
  const [inventoryLanesHeight, setInventoryLanesHeight] = useState(0);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [favoriteToast, setFavoriteToast] = useState('');
  const [selectedFavorite, setSelectedFavorite] = useState<any | null>(null);
  const [favoriteEditDraft, setFavoriteEditDraft] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [flashingNoLeftoverId, setFlashingNoLeftoverId] = useState<string | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [contactStatus, setContactStatus] = useState('');

  // Auth & UI States
  const [showLogin, setShowLogin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');

  const [authTab, setAuthTab] = useState<'account' | 'invite' | 'register'>('account');
  const [user, setUser] = useState<User | null>(() => readStoredAuthSession()?.user ?? null);
  const [authToken, setAuthToken] = useState<string>(() => readStoredAuthSession()?.token ?? '');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginInvite, setLoginInvite] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captchaChallenge, setCaptchaChallenge] = useState<{ id: string; question: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [inviteCodes, setInviteCodes] = useState<any[]>([]);
  const [lastInviteCode, setLastInviteCode] = useState('');

  const t = language === 'en' ? en : zh;
  const cardLabels = language === 'en'
    ? {
      save: 'Save',
      calories: 'Calories',
      caffeine: 'Caffeine',
      alcohol: 'Alcohol',
      temperature: 'Temperature',
      score: 'Score',
      intro: 'Summary',
      ingredients: 'Ingredients',
      steps: 'Steps',
      kcal: 'kcal'
    }
    : {
      save: '\u6536\u85cf',
      calories: '\u70ed\u91cf',
      caffeine: '\u5496\u5561\u56e0',
      alcohol: '\u9152\u7cbe',
      temperature: '\u6e29\u5ea6',
      score: '\u5206\u6570',
      intro: '\u7b80\u4ecb',
      ingredients: '\u539f\u6599',
      steps: '\u505a\u6cd5',
      kcal: 'kcal'
    };

  const uiLabels = language === 'en'
    ? {
      foodLibrary: 'Food library',
      foodHint: 'Click inventory to require it in every AI recommendation. Double-click to edit; hold and drag to move.',
      foodHintSecond: 'Click the food library to choose quickly.',
      foodHintSettings: 'Food library note',
      introTextSettings: 'Intro text',
      saveIntroText: 'Save intro',
      resetIntroText: 'Reset intro',
      saveFoodHint: 'Save note',
      resetFoodHint: 'Reset note',
      clearFoodLibrary: 'Clear food library',
      quickGenerate: 'Quick generate',
      quickGenerateHint: 'No setup needed. Click quick generate to try it.',
      favoriteDuplicate: 'This drink is already saved.',
      favoriteDetails: 'Favorite details',
      deleteFavorite: 'Delete',
      deleteFavoriteConfirm: 'Delete this favorite?',
      saveChanges: 'Save changes',
      shareFoodLibrary: 'I agree to share this food to the public food library.',
      shareFoodLibraryHint: '. If unchecked, it will only appear in your personal food library.',
      guestDailyLimit: (count: string) => `Guest users can generate ${count} free recommendations per day.`,
      independentDrinks: 'Independent drinks: ingredients are independent between options',
      ignoreInventory: 'Ignore inventory: randomly generate drinks.',
      ignoreInventoryAuto: 'Automatically used when inventory has fewer than 3 items.',
      useRemaining: 'Use remaining ingredients',
      selected: 'Selected',
      selectLeftovers: 'Select leftovers',
      noMeasurableLeftovers: 'No measurable leftovers',
      remaining: 'Remaining ingredients',
      save: 'Save',
      calories: 'Calories',
      caffeine: 'Caffeine',
      alcohol: 'Alcohol',
      temperature: 'Temperature',
      score: 'Score',
      intro: 'Summary',
      ingredients: 'Ingredients',
      steps: 'Steps',
      kcal: 'kcal'
    }
    : {
      foodLibrary: '\u98df\u54c1\u5e93',
      foodHint: '\u5355\u51fb\u5e93\u5b58\u4f1a\u8bbe\u4e3a AI \u6bcf\u4e2a\u63a8\u8350\u90fd\u5fc5\u987b\u5305\u542b\u7684\u539f\u6599\uff1b\u53cc\u51fb\u53ef\u4fee\u6539\uff0c\u6309\u4f4f\u53ef\u62d6\u52a8\u3002',
      foodHintSecond: '\u70b9\u51fb\u98df\u54c1\u5e93\u5373\u53ef\u8f7b\u677e\u9009\u62e9\u3002',
      foodHintSettings: '\u98df\u54c1\u5e93\u4e0b\u65b9\u8bf4\u660e',
      introTextSettings: '\u4ecb\u7ecd\u6587\u5b57',
      saveIntroText: '\u4fdd\u5b58\u4ecb\u7ecd',
      resetIntroText: '\u6062\u590d\u9ed8\u8ba4',
      saveFoodHint: '\u4fdd\u5b58\u8bf4\u660e',
      resetFoodHint: '\u6062\u590d\u9ed8\u8ba4',
      clearFoodLibrary: '\u6e05\u7a7a\u98df\u54c1\u5e93',
      quickGenerate: '\u5feb\u901f\u751f\u6210',
      quickGenerateHint: '\u65e0\u9700\u4efb\u4f55\u914d\u7f6e\uff0c\u70b9\u51fb\u5feb\u901f\u751f\u6210\u4f53\u9a8c\u5427~',
      favoriteDuplicate: '\u8be5\u996e\u54c1\u5df2\u6536\u85cf\uff01',
      favoriteDetails: '\u6536\u85cf\u8be6\u60c5',
      deleteFavorite: '\u5220\u9664',
      deleteFavoriteConfirm: '\u786e\u5b9a\u5220\u9664\u8fd9\u4e2a\u6536\u85cf\u5417\uff1f',
      saveChanges: '\u4fdd\u5b58\u4fee\u6539',
      shareFoodLibrary: '\u6211\u540c\u610f\u5c06\u8be5\u98df\u54c1\u5171\u4eab\u5230\u516c\u5f00\u98df\u54c1\u5e93\u3002',
      shareFoodLibraryHint: '\u82e5\u4e0d\u52fe\u9009\uff0c\u5219\u53ea\u51fa\u73b0\u5728\u4e2a\u4eba\u98df\u54c1\u5e93\u3002',
      guestDailyLimit: (count: string) => `\u672a\u767b\u5f55\u7528\u6237\u6bcf\u65e5\u53ef\u514d\u8d39\u751f\u6210${count}\u6b21`,
      independentDrinks: '\u72ec\u7acb\u996e\u54c1\uff1a\u5404\u9009\u9879\u4e4b\u95f4\u98df\u6750\u72ec\u7acb',
      ignoreInventory: '\u65e0\u89c6\u5e93\u5b58\uff1a\u4e0d\u8003\u8651\u5e93\u5b58\u60c5\u51b5\u968f\u673a\u751f\u6210',
      ignoreInventoryAuto: '\u5e93\u5b58\u4ea7\u54c1\u5c11\u4e8e 3 \u4e2a\u65f6\u4f1a\u81ea\u52a8\u6309\u6b64\u89c4\u5219\u751f\u6210\u3002',
      useRemaining: '\u5229\u7528\u5269\u4f59\u98df\u6750',
      selected: '\u5df2\u9009\u62e9',
      selectLeftovers: '\u9009\u62e9\u5269\u4f59',
      noMeasurableLeftovers: '\u65e0\u53ef\u8ba1\u91cf\u5269\u4f59',
      remaining: '\u5269\u4f59\u539f\u6599',
      save: '\u6536\u85cf',
      calories: '\u70ed\u91cf',
      caffeine: '\u5496\u5561\u56e0',
      alcohol: '\u9152\u7cbe',
      temperature: '\u6e29\u5ea6',
      score: '\u5206\u6570',
      intro: '\u7b80\u4ecb',
      ingredients: '\u539f\u6599',
      steps: '\u505a\u6cd5',
      kcal: 'kcal'
    };  const foodHintText = foodHintOverride?.text ?? defaultFoodHintTexts[language];
  const introText = introTexts[language] ?? defaultIntroTexts[language];
  const hasMeasurableInventory = inventory.some(item => item.amount !== undefined);
  const autoIgnoreInventory = inventory.length < 3;
  const effectiveIgnoreInventory = preferences.ignoreInventory || autoIgnoreInventory;
  const effectiveFrugalMode = preferences.frugalMode && !effectiveIgnoreInventory && hasMeasurableInventory;
  const contactLabels = language === 'en'
    ? {
      action: 'Contact us',
      title: 'Contact us',
      message: 'Message',
      info: 'If you would like to receive our reply, please leave your contact information',
      optional: 'Optional',
      send: 'Send',
      sent: 'Sent. Thank you.',
      failed: 'Contact is not configured yet.'
    }
    : {
      action: '\u8054\u7cfb\u6211\u4eec',
      title: '\u8054\u7cfb\u6211\u4eec',
      message: '\u7559\u8a00',
      info: '\u5982\u679c\u4f60\u5e0c\u671b\u6536\u5230\u6211\u4eec\u7684\u56de\u590d\uff0c\u8bf7\u7559\u4e0b\u8054\u7cfb\u65b9\u5f0f',
      optional: '\u53ef\u9009',
      send: '\u53d1\u9001',
      sent: '\u5df2\u53d1\u9001\uff0c\u8c22\u8c22\u3002',
      failed: '\u8054\u7cfb\u529f\u80fd\u6682\u672a\u914d\u7f6e\u3002'
    };  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const randomOptions: Record<PreferenceKey, OptionKey[]> = {
    alcohol: ['any', 'high', 'low', 'none'],
    caffeine: ['any', 'high', 'low', 'none'],
    temperature: ['any', 'hot', 'room', 'cold'],
    calories: ['any', 'high', 'medium', 'low', 'very-low']
  };

  useEffect(() => {
    fetchCategories();
    fetchPublicConfig();
  }, []);

  useEffect(() => {
    const element = inventoryLanesRef.current;
    if (!element) return;

    const updateHeight = () => setInventoryLanesHeight(element.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    window.addEventListener('resize', updateHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [categories.length, inventory.length]);

  useEffect(() => {
    const keyUserId = user?.id ?? 'guest';
    const saved = readStoredFoodHint(keyUserId, language);
    const normalized = saved ? { text: saved.text ?? `${saved.first}\n${saved.second}` } : null;
    setFoodHintOverride(normalized);
    const zhSaved = readStoredFoodHint(keyUserId, 'zh');
    const enSaved = readStoredFoodHint(keyUserId, 'en');
    setFoodHintDrafts({
      zh: zhSaved?.text ?? defaultFoodHintTexts.zh,
      en: enSaved?.text ?? defaultFoodHintTexts.en
    });
  }, [user?.id, language]);

  useEffect(() => {
    if (showSettings && user?.role === 'admin') {
      loadInviteCodes();
      loadGenerationLimits();
    }
  }, [showSettings, user?.role]);

  useEffect(() => {
    if (!flashingNoLeftoverId) return;
    const clear = () => setFlashingNoLeftoverId(null);
    window.addEventListener('click', clear);
    return () => window.removeEventListener('click', clear);
  }, [flashingNoLeftoverId]);

  useEffect(() => {
    if (!favoriteToast) return;
    const timeout = window.setTimeout(() => setFavoriteToast(''), 1600);
    const clear = () => setFavoriteToast('');
    window.addEventListener('click', clear);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('click', clear);
    };
  }, [favoriteToast]);

  useEffect(() => {
    favoriteSignaturesRef.current = new Set(favorites.map(getFavoriteSignature));
  }, [favorites]);

  useEffect(() => {
    setPreferencesStorageReady(false);
    if (user) {
      localStorage.setItem(authStorageKey, JSON.stringify({ user, token: authToken }));
      setRecommendations(readStoredRecommendations(user.id));
      const savedPreferences = readStoredPreferences(user.id);
      if (savedPreferences) setPreferences(prev => ({ ...prev, ...savedPreferences, requiredIngredientIds: prev.requiredIngredientIds }));
      fetchUserData();
    } else {
      localStorage.removeItem(authStorageKey);
      setAuthToken('');
      setFavorites([]); setRecommendations([]); setLeftoverRecommendations([]); setSelectedRecommendationIds([]);
      setInventory(readStoredGuestInventory(deviceId));
      const savedPreferences = readStoredPreferences('guest');
      if (savedPreferences) setPreferences(prev => ({ ...prev, ...savedPreferences }));
      fetchPublicFoodLibrary();
    }
    setPreferencesStorageReady(true);
  }, [user, authToken, deviceId]);

  useEffect(() => {
    if (!preferencesStorageReady) return;
    const persistedPreferences = user ? { ...preferences, requiredIngredientIds: [] } : preferences;
    storePreferences(user?.id ?? 'guest', persistedPreferences);
  }, [user, preferences, preferencesStorageReady]);

  async function fetchUserData() {
    if (!user) return;
    try {
      const res = await fetchWithRetry('/api/user/data', { headers: getUserAuthorizationHeaders() });
      if (res.ok) {
        const data = await res.json();
        setInventory(data.inventory);
        setFavorites(data.favorites);
        setFoodLibrary(Array.isArray(data.foodLibrary) ? data.foodLibrary : []);
      } else if (res.status === 401) {
        setUser(null);
        setAuthToken('');
      }
    } catch (e) { console.error(e); }
  }

  async function fetchPublicFoodLibrary() {
    try {
      const res = await fetchWithRetry('/api/food-library/public');
      if (res.ok) {
        const data = await res.json();
        setFoodLibrary(Array.isArray(data.foodLibrary) ? data.foodLibrary : []);
      }
    } catch (e) { console.error(e); }
  }

  async function fetchPublicConfig() {
    try {
      const res = await fetchWithRetry('/api/public/config');
      if (res.ok) {
        const data = await res.json();
        setGuestDailyLimit(String(data.daily_limit_guest ?? '10'));
      }
    } catch (e) { console.error(e); }
  }

  async function fetchCategories() {
    try {
      const res = await fetchWithRetry('/api/inventory/categories');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(orderInventoryCategories(data.categories));
        }
      }
    } catch (e) { console.error(e); }
  }

  const isInventoryCategory = (value: unknown): value is string =>
    typeof value === 'string' && categories.some(category => category.name === value);
  const getItemCategory = (item: InventoryItem): string =>
    isInventoryCategory(item.category) ? item.category : 'uncategorized';
  const getCategoryTitle = (category: string) => {
    const record = categories.find(item => item.name === category);
    if (record) return language === 'en' ? record.label_en : record.label_zh;
    const labels = t.categories as Record<string, string>;
    return labels[category] ?? category;
  };

  async function handleLogin() {
    try {
      if (authTab === 'register') {
        return handleRegister();
      }
      const body = authTab === 'account' ? { username: loginUsername, password: loginPassword } : { inviteCode: loginInvite };
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        const data = await res.json();
        setAuthToken(data.token ?? '');
        setUser(data.user);
        setShowLogin(false);
      } else { alert(t.loginFailed); }
    } catch (e) { console.error(e); }
  }

  async function fetchCaptchaChallenge() {
    const res = await fetch('/api/captcha');
    if (res.ok) {
      setCaptchaChallenge(await res.json());
      setCaptchaAnswer('');
    }
  }

  async function handleRegister() {
    if (loginPassword !== registerConfirmPassword) {
      alert(language === 'en' ? 'Passwords do not match.' : '\u4e24\u6b21\u8f93\u5165\u7684\u5bc6\u7801\u4e0d\u4e00\u81f4\u3002');
      return;
    }

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginUsername,
        password: loginPassword,
        confirmPassword: registerConfirmPassword,
        captcha: captchaChallenge ? { id: captchaChallenge.id, answer: captchaAnswer } : undefined
      })
    });

    if (res.ok) {
      const data = await res.json();
      setAuthToken(data.token ?? '');
      setUser(data.user);
      setShowLogin(false);
      setCaptchaChallenge(null);
      setCaptchaAnswer('');
      return;
    }

    const data = await res.json().catch(() => null);
    if (res.status === 403 && data?.captchaRequired) {
      await fetchCaptchaChallenge();
      alert(language === 'en' ? 'Please complete the verification code.' : '\u8bf7\u5b8c\u6210\u9a8c\u8bc1\u7801\u3002');
      return;
    }
    alert(data?.error ?? (language === 'en' ? 'Registration failed.' : '\u6ce8\u518c\u5931\u8d25\u3002'));
  }

  async function addInventoryCategory() {
    const label_zh = newCategoryZh.trim();
    const label_en = newCategoryEn.trim();
    if (!label_zh && !label_en) return;
    const authHeader = getAdminAuthorizationHeader();
    if (!authHeader) return;
    const res = await fetch('/api/admin/inventory/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ label_zh, label_en })
    });
    if (res.ok) {
      const data = await res.json();
      setCategories(orderInventoryCategories(data.categories));
      setNewCategoryZh('');
      setNewCategoryEn('');
    }
  }

  async function removeInventoryCategory(name: string) {
    const authHeader = getAdminAuthorizationHeader();
    if (!authHeader) return;
    const res = await fetch('/api/admin/inventory/categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      const data = await res.json();
      setCategories(orderInventoryCategories(data.categories));
      fetchUserData();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? (language === 'en' ? 'Category delete failed' : '\u5220\u9664\u5206\u7c7b\u5931\u8d25'));
    }
  }

  function getAdminAuthorizationHeader() {
    if (authToken && user?.role === 'admin') return `Bearer ${authToken}`;
    if (!loginUsername || !loginPassword) {
      setAuthTab('account');
      setShowLogin(true);
      alert(language === 'en' ? 'Please sign in again as admin.' : '\u8bf7\u91cd\u65b0\u4ee5\u7ba1\u7406\u5458\u8eab\u4efd\u767b\u5f55\u3002');
      return null;
    }

    return `Basic ${encodeBasicCredentials({ username: loginUsername, password: loginPassword })}`;
  }

  function getUserAuthorizationHeaders(extra: Record<string, string> = {}) {
    return authToken ? { ...extra, Authorization: `Bearer ${authToken}` } : extra;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const itemId = active.data.current?.itemId;
    const newCategory = over?.data.current?.category;
    if (typeof itemId !== 'string' || !isInventoryCategory(newCategory)) return;

    const draggedItem = inventory.find(item => item.id === itemId);
    if (!draggedItem || draggedItem.category === newCategory) return;

    const next = inventory.map(item => item.id === itemId ? { ...item, category: newCategory } : item);
    setInventory(next);
    saveInventory(next);
  }

  function addInventoryItem() {
    if (!inventoryName.trim()) return;
    const match = inventoryAmount.match(/^(\d+\.?\d*)\s*(.*)$/);
    const amount = match ? parseFloat(match[1]) : undefined;
    const unit = match ? match[2].trim() || 'ml' : 'ml';
    
    const next = [...inventory, { id: createClientId('inventory'), name: inventoryName, amount, unit, category: 'uncategorized', sharePublicFoodLibrary: shareFoodLibraryPublicly }];
    setInventory(next); setInventoryName(''); setInventoryAmount('');
    saveInventory(next);
  }

  async function removeInventoryItem(id: string) {
    const next = inventory.filter(p => p.id !== id);
    setInventory(next);
    setPreferences(prev => ({...prev, requiredIngredientIds: prev.requiredIngredientIds.filter(rid => rid !== id)}));
    saveInventory(next);
  }

  function startEdit(item: InventoryItem) {
    setEditingItem(item);
    setEditName(item.name);
    setEditAmount(item.amount ? `${item.amount}${item.unit}` : '');
  }

  async function saveEdit() {
    if (!editingItem) return;
    const match = editAmount.match(/^(\d+\.?\d*)\s*(.*)$/);
    const amount = match ? parseFloat(match[1]) : undefined;
    const unit = match ? match[2].trim() || 'ml' : 'ml';
    
    const next = inventory.map(item => item.id === editingItem.id ? { ...item, name: editName, amount, unit } : item);
    setInventory(next);
    setEditingItem(null);
    saveInventory(next);
  }

  async function generateRecommendations(overridePreferences?: Partial<GenerationPreferences>) {
    const requestPreferences = { ...preferences, ...overridePreferences };
    const requestIgnoreInventory = requestPreferences.ignoreInventory || (!overridePreferences && autoIgnoreInventory);
    const requestFrugalMode = Boolean(requestPreferences.frugalMode && !requestIgnoreInventory && hasMeasurableInventory && !requestPreferences.independentDrinks);
    setLoading(true);
    setGenerationStatus(language === 'zh' ? '\u6b63\u5728\u9a8c\u8bc1\u8f93\u5165...' : 'Validating input...');
    try {
      await nextPaint();
      setGenerationStatus(language === 'zh' ? '\u6b63\u5728\u8c03\u7528 AI...' : 'Calling AI...');
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: getUserAuthorizationHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ inventory: requestIgnoreInventory ? [] : inventory, preferences: {
          ...requestPreferences,
          ignoreInventory: requestIgnoreInventory,
          frugalMode: requestFrugalMode,
          requiredIngredientIds: requestIgnoreInventory ? [] : requestPreferences.requiredIngredientIds
        }, language, deviceId })
      });
      if (res.ok) {
        const data = await res.json();
        setGenerationStatus(language === 'zh' ? '\u6b63\u5728\u4fdd\u5b58\u5386\u53f2...' : 'Saving history...');
        await nextPaint();
        setRecommendations(data.recommendations);
        setLeftoverRecommendations([]);
        setSelectedRecommendationIds([]);
        if (user) storeRecommendations(user.id, data.recommendations);
        setGenerationStatus(language === 'zh' ? '\u5b8c\u6210' : 'Done');
      } else if (res.status === 429) {
        setGenerationStatus(language === 'zh' ? '\u9519\u8bef\uff1a\u5df2\u8fbe\u5230\u4eca\u65e5\u751f\u6210\u4e0a\u9650' : 'Error: daily limit reached');
        alert('Limit reached');
      } else {
        const data = await res.json().catch(() => null);
        console.error('Recommendation generation failed', { status: res.status, body: data });
        setGenerationStatus(data?.message ? data.message : data?.error ? String(data.error) : (language === 'zh' ? '\u751f\u6210\u5931\u8d25' : 'Generation failed'));
      }
    } catch (e) {
      console.error(e);
      setGenerationStatus(language === 'zh' ? '\u9519\u8bef\uff1a\u7f51\u7edc\u6216\u670d\u52a1\u5f02\u5e38' : 'Error: network or service failure');
    } finally {
      setLoading(false);
    }
  }

  async function quickGenerateRecommendations() {
    const generationTask = generateRecommendations({
      ignoreInventory: true,
      frugalMode: false,
      independentDrinks: true,
      recommendationCount: 3,
      requiredIngredientIds: []
    });
    await nextPaint();
    generationAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'center' });
    return generationTask;
  }

  async function saveAsFavorite(rec: any) {
    if (!user) {
      setShowLogin(true);
      return;
    }
    const favorite = buildFavoriteFromRecommendation(rec, favorites);
    const signature = getFavoriteSignature(favorite);
    if (favoriteSignaturesRef.current.has(signature)) {
      setFavoriteToast(uiLabels.favoriteDuplicate);
      return;
    }
    favoriteSignaturesRef.current.add(signature);

    const optimisticId = -Date.now();
    const optimisticFavorite = { ...favorite, id: optimisticId, created_at: new Date().toISOString() };
    setFavorites(prev => sortFavorites([optimisticFavorite, ...prev]));

    try {
      const response = await fetchWithRetry('/api/user/favorites', {
        method: 'POST',
        headers: getUserAuthorizationHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ favorite })
      });
      if (!response.ok) throw new Error('Favorite save failed');
      const data = await response.json();
      setFavorites(prev => sortFavorites(prev.map(item => item.id === optimisticId ? { ...optimisticFavorite, id: data.id } : item)));
    } catch (e) {
      console.error(e);
      favoriteSignaturesRef.current.delete(signature);
      setFavorites(prev => prev.filter(item => item.id !== optimisticId));
    }
  }

  function openFavorite(favorite: any) {
    setSelectedFavorite(favorite);
    setFavoriteEditDraft(createFavoriteEditDraft(favorite));
  }

  async function deleteFavorite(favorite: any) {
    if (!user || !favorite?.id) return;
    if (!window.confirm(uiLabels.deleteFavoriteConfirm)) return;
    const previous = favorites;
    setFavorites(prev => prev.filter(item => item.id !== favorite.id));
    if (selectedFavorite?.id === favorite.id) {
      setSelectedFavorite(null);
      setFavoriteEditDraft(null);
    }
    try {
      const response = await fetchWithRetry(`/api/user/favorites/${favorite.id}`, {
        method: 'DELETE',
        headers: getUserAuthorizationHeaders()
      });
      if (!response.ok) throw new Error('Favorite delete failed');
    } catch (error) {
      console.error(error);
      setFavorites(previous);
    }
  }

  async function saveFavoriteEdits() {
    if (!user || !favoriteEditDraft || !selectedFavorite?.id) return;
    const updated = favoriteFromEditDraft(selectedFavorite, favoriteEditDraft);
    setSelectedFavorite(updated);
    setFavorites(prev => sortFavorites(prev.map(item => item.id === updated.id ? updated : item)));
    try {
      const response = await fetchWithRetry('/api/user/favorites', {
        method: 'POST',
        headers: getUserAuthorizationHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ favorite: updated })
      });
      if (!response.ok) throw new Error('Favorite update failed');
    } catch (error) {
      console.error(error);
      fetchUserData();
    }
  }

  function randomize() {
    setPreferences(prev => ({
      ...prev,
      alcohol: pickRandom(['any', 'high', 'low', 'none']),
      caffeine: pickRandom(['any', 'high', 'low', 'none']),
      temperature: pickRandom(['any', 'hot', 'room', 'cold']),
      calories: pickRandom(['any', 'high', 'medium', 'low', 'very-low'])
    }));
  }

  async function saveInventory(next: InventoryItem[]) {
    if (!user) {
      storeGuestInventory(deviceId, next);
      return;
    }
    await fetch('/api/user/inventory', { method: 'POST', headers: getUserAuthorizationHeaders({'Content-Type':'application/json'}), body: JSON.stringify({ items: next })});
    fetchUserData();
  }

  function clearInventory() {
    setInventory([]);
    setPreferences(prev => ({ ...prev, requiredIngredientIds: [] }));
    saveInventory([]);
  }

  function addFoodLibraryItem(item: FoodLibraryItem) {
    const exists = inventory.some(inv => inv.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase() && getItemCategory(inv) === item.category);
    if (exists) return;
    const next = [...inventory, { id: createClientId('inventory'), name: item.name, unit: 'ml', category: item.category, sharePublicFoodLibrary: shareFoodLibraryPublicly }];
    setInventory(next);
    saveInventory(next);
  }

  async function deleteFoodLibraryItem(id: number) {
    if (!user || user.role !== 'admin') return;
    const authHeader = getAdminAuthorizationHeader();
    if (!authHeader) return;
    const res = await fetch(`/api/admin/food-library/${id}?userId=${user.id}`, { method: 'DELETE', headers: { 'Authorization': authHeader } });
    if (res.ok) {
      const data = await res.json();
      setFoodLibrary(data.foodLibrary);
    }
  }

  async function clearFoodLibrary() {
    if (!user || user.role !== 'admin') return;
    const authHeader = getAdminAuthorizationHeader();
    if (!authHeader) return;
    const res = await fetch(`/api/admin/food-library?userId=${user.id}`, { method: 'DELETE', headers: { 'Authorization': authHeader } });
    if (res.ok) setFoodLibrary([]);
  }

  async function loadInviteCodes() {
    if (!user || user.role !== 'admin') return;
    const authHeader = getAdminAuthorizationHeader();
    if (!authHeader) return;
    const res = await fetch('/api/admin/invites', { headers: { 'Authorization': authHeader } });
    if (res.ok) {
      setInviteCodes(await res.json());
    }
  }

  async function loadGenerationLimits() {
    if (!user || user.role !== 'admin') return;
    const authHeader = getAdminAuthorizationHeader();
    if (!authHeader) return;
    const res = await fetch('/api/admin/config', { headers: { 'Authorization': authHeader } });
    if (res.ok) {
      const data = await res.json();
      setGenerationLimits({
        daily_limit_global: String(data.daily_limit_global ?? '200'),
        daily_limit_user: String(data.daily_limit_user ?? '50'),
        daily_limit_guest: String(data.daily_limit_guest ?? '10'),
        daily_limit_contact_global: String(data.daily_limit_contact_global ?? '10'),
        daily_limit_contact_user: String(data.daily_limit_contact_user ?? '3')
      });
    }
  }

  async function saveGenerationLimits() {
    if (!user || user.role !== 'admin') return;
    const authHeader = getAdminAuthorizationHeader();
    if (!authHeader) return;
    await fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify(generationLimits)
    });
    await loadGenerationLimits();
    await fetchPublicConfig();
  }

  async function generateInviteCode() {
    if (!user || user.role !== 'admin') return;
    const authHeader = getAdminAuthorizationHeader();
    if (!authHeader) return;
    const res = await fetch('/api/admin/invites', {
      method: 'POST',
      headers: {'Content-Type':'application/json','Authorization':authHeader},
      body: JSON.stringify({adminId: user.id})
    });
    if (res.ok) {
      const data = await res.json();
      setLastInviteCode(data.code);
      await loadInviteCodes();
    }
  }

  function getRecommendationId(group: 'main' | 'leftover', rec: any, index: number) {
    return `${group}:${rec.order ?? index}:${rec.name ?? index}`;
  }

  async function logout() {
    const token = authToken;
    setUser(null);
    setAuthToken('');
    if (token) {
      await fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    }
  }

  function toggleRecommendationSelection(id: string) {
    setSelectedRecommendationIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  }

  function handleRecommendationSelection(id: string, rec: any) {
    if ((rec.remainingIngredients ?? []).length === 0) {
      setFlashingNoLeftoverId(id);
      window.setTimeout(() => setFlashingNoLeftoverId(current => current === id ? null : current), 900);
      return;
    }
    toggleRecommendationSelection(id);
  }

  async function generateFromRemainingIngredients() {
    if (selectedRecommendationIds.length === 0) return;
    const selected = recommendations.filter((rec, index) => selectedRecommendationIds.includes(getRecommendationId('main', rec, index)));
    const leftoverInventory = selected.flatMap((rec, recIndex) => (rec.remainingIngredients ?? []).map((text: string, index: number) => parseRemainingIngredient(text, recIndex, index)));
    if (leftoverInventory.length === 0) return;

    setLoading(true);
    setGenerationStatus(language === 'zh' ? '\u6b63\u5728\u5229\u7528\u5269\u4f59\u98df\u6750...' : 'Using remaining ingredients...');
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: getUserAuthorizationHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          inventory: leftoverInventory,
          preferences: { ...preferences, frugalMode: false, independentDrinks: true, requiredIngredientIds: [], recommendationCount: Math.min(3, Math.max(1, leftoverInventory.length)) },
          language,
          deviceId
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLeftoverRecommendations(data.recommendations);
        setGenerationStatus(language === 'zh' ? '\u5b8c\u6210' : 'Done');
      } else {
        const data = await res.json().catch(() => null);
        setGenerationStatus(data?.message ? data.message : data?.error ? String(data.error) : (language === 'zh' ? '\u751f\u6210\u5931\u8d25' : 'Generation failed'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function submitContact() {
    if (!contactMessage.trim()) return;
    setContactStatus(language === 'en' ? 'Sending...' : '\u6b63\u5728\u53d1\u9001...');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: contactMessage, contactInfo, page: window.location.href })
      });
      if (res.ok) {
        setContactMessage('');
        setContactInfo('');
        setContactStatus(contactLabels.sent);
      } else {
        setContactStatus(contactLabels.failed);
      }
    } catch (error) {
      console.error(error);
      setContactStatus(contactLabels.failed);
    }
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="top-bar-branding">
          <div className="brand-name-stack">
            <h1>Sip Mind</h1>
            <strong>{'\u676f\u4e2d\u7075\u611f'}</strong>
          </div>
        </div>
        <div className="top-bar-intro">
          <p>{introText}</p>
          <p>{uiLabels.guestDailyLimit(guestDailyLimit)}</p>
        </div>
        <div className="settings-bar">
          <button
            type="button"
            className="language-toggle"
            aria-label={t.language}
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
          >
            <span className={language === 'zh' ? 'active' : ''}>中</span>
            <span className="language-divider">|</span>
            <span className={language === 'en' ? 'active' : ''}>En</span>
          </button>
          <button onClick={() => setShowContact(true)}>{contactLabels.action}</button>
          {user ? <button onClick={logout}>{user.username || t.inviteCode} ({t.logout})</button> : <button onClick={() => setShowLogin(true)}>{t.login}</button>}
          <button onClick={() => setShowSettings(true)}>{t.settings}</button>
        </div>
      </header>

      {showContact && (
        <div className="modal-backdrop">
          <div className="modal contact-modal">
            <div className="modal-title-row">
              <h2>{contactLabels.title}</h2>
              <button className="modal-close" onClick={() => setShowContact(false)}>x</button>
            </div>
            <div className="form-grid">
              <label>{contactLabels.message}
                <textarea value={contactMessage} onChange={e => setContactMessage(e.target.value)} maxLength={3000} />
              </label>
              <label>{contactLabels.info}
                <input value={contactInfo} onChange={e => setContactInfo(e.target.value)} placeholder={contactLabels.optional} maxLength={300} />
              </label>
            </div>
            {contactStatus && <p className="contact-status">{contactStatus}</p>}
            <div className="modal-actions">
              <button onClick={() => setShowContact(false)}>{t.cancel}</button>
              <button className="primary-action" style={{marginTop: 0, width: 'auto'}} onClick={submitContact}>{contactLabels.send}</button>
            </div>
          </div>
        </div>
      )}

      {favoriteToast && <div className="toast-message">{favoriteToast}</div>}

      {selectedFavorite && favoriteEditDraft && (
        <div className="modal-backdrop" onClick={() => { setSelectedFavorite(null); setFavoriteEditDraft(null); }}>
          <div className="modal favorite-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title-row">
              <h2>{uiLabels.favoriteDetails}</h2>
              <button className="modal-close-button" onClick={() => { setSelectedFavorite(null); setFavoriteEditDraft(null); }} aria-label={t.close}>x</button>
            </div>
            <div className="form-grid favorite-edit-grid">
              <label>{language === 'en' ? 'Name' : '\u540d\u79f0'}
                <input value={favoriteEditDraft.name} onChange={e => setFavoriteEditDraft({ ...favoriteEditDraft, name: e.target.value })} />
              </label>
              <label>{uiLabels.intro}
                <textarea value={favoriteEditDraft.reason} onChange={e => setFavoriteEditDraft({ ...favoriteEditDraft, reason: e.target.value })} />
              </label>
              <label>{uiLabels.ingredients}
                <textarea value={favoriteEditDraft.ingredientsText} onChange={e => setFavoriteEditDraft({ ...favoriteEditDraft, ingredientsText: e.target.value })} />
              </label>
              <label>{uiLabels.steps}
                <textarea value={favoriteEditDraft.stepsText} onChange={e => setFavoriteEditDraft({ ...favoriteEditDraft, stepsText: e.target.value })} />
              </label>
            </div>
            <div className="favorite-detail-meta">
              <span>{formatRecipeVolume(selectedFavorite.metadata?.volumeMl)}</span>
              <span>{selectedFavorite.metadata?.calories ?? '--'} {uiLabels.kcal}</span>
              <span>{uiLabels.score}: {selectedFavorite.metadata?.score?.total ?? selectedFavorite.rating ?? '--'}</span>
            </div>
            <div className="modal-actions">
              <button onClick={() => deleteFavorite(selectedFavorite)}>{uiLabels.deleteFavorite}</button>
              <button className="primary-action" style={{marginTop:0, width:'auto'}} onClick={saveFavoriteEdits}>{uiLabels.saveChanges}</button>
            </div>
          </div>
        </div>
      )}

      {showLogin && (
        <div className="modal-backdrop">
           <div className="modal">
              <div className="auth-tabs">
                 <button className={`auth-tab ${authTab === 'account' ? 'active' : ''}`} onClick={() => setAuthTab('account')}>{t.loginTabAccount}</button>
                 <button className={`auth-tab ${authTab === 'invite' ? 'active' : ''}`} onClick={() => setAuthTab('invite')}>{t.loginTabInvite}</button>
                  <button className={`auth-tab ${authTab === 'register' ? 'active' : ''}`} onClick={() => setAuthTab('register')}>{language === 'en' ? 'Register' : '\u6ce8\u518c'}</button>
              </div>
              <div className="form-grid">
                 {authTab === 'account' || authTab === 'register' ? (
                    <>
                       <label>{t.username} <input value={loginUsername} onChange={e => setLoginUsername(e.target.value)} /></label>
                       <label>{t.password}
                         <span className="password-field">
                           <input type={showLoginPassword ? 'text' : 'password'} value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                           <button type="button" onClick={() => setShowLoginPassword(prev => !prev)}>{showLoginPassword ? (language === 'en' ? 'Hide' : '\u9690\u85cf') : (language === 'en' ? 'Show' : '\u663e\u793a')}</button>
                         </span>
                       </label>
                       {authTab === 'register' && (
                         <>
                           <label>{language === 'en' ? 'Confirm password' : '\u786e\u8ba4\u5bc6\u7801'}
                             <span className="password-field">
                               <input type={showConfirmPassword ? 'text' : 'password'} value={registerConfirmPassword} onChange={e => setRegisterConfirmPassword(e.target.value)} />
                               <button type="button" onClick={() => setShowConfirmPassword(prev => !prev)}>{showConfirmPassword ? (language === 'en' ? 'Hide' : '\u9690\u85cf') : (language === 'en' ? 'Show' : '\u663e\u793a')}</button>
                             </span>
                           </label>
                           {captchaChallenge && (
                              <label>{language === 'en' ? 'Verification code' : '\u9a8c\u8bc1\u7801'}
                               <span className="captcha-question">{captchaChallenge.question}</span>
                               <input value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} />
                               <button type="button" className="text-button" onClick={fetchCaptchaChallenge}>{language === 'en' ? 'Refresh' : '\u5237\u65b0'}</button>
                             </label>
                           )}
                         </>
                       )}
                    </>
                 ) : <label>{t.inviteCode} <input value={loginInvite} onChange={e => setLoginInvite(e.target.value)} /></label>}
              </div>
              <div className="modal-actions">
                 <button onClick={() => setShowLogin(false)}>{t.cancel}</button>
                 <button className="primary-action" style={{marginTop:0, width:'auto'}} onClick={handleLogin}>{t.login}</button>
              </div>
           </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
           <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title-row">
                <h2>{t.settings}</h2>
                <button className="modal-close-button" onClick={() => setShowSettings(false)} aria-label={t.close}>x</button>
              </div>
              {user?.role === 'admin' ? (
                 <div className="admin-zone">
                    <section className="settings-section">
                      <div className="settings-section-heading">
                        <h3>{language === 'en' ? 'Invite Codes' : '\u9080\u8bf7\u7801'}</h3>
                      </div>
                      <button onClick={generateInviteCode}>{t.generateInvite}</button>
                      {lastInviteCode && (
                        <div className="invite-code-latest">
                          <span>{language === 'en' ? 'New invite code' : '\u65b0\u9080\u8bf7\u7801'}</span>
                          <strong>{lastInviteCode}</strong>
                        </div>
                      )}
                      <div className="invite-code-list">
                         {inviteCodes.length === 0 && <div className="invite-code-empty">{language === 'en' ? 'No invite codes yet.' : '\u6682\u65e0\u9080\u8bf7\u7801'}</div>}
                         {inviteCodes.map(c => (
                           <div key={c.code} className="invite-code-row">
                             <strong>{c.code}</strong>
                             <span>{c.created_at}</span>
                              <span>{c.is_used ? (language === 'en' ? 'Used' : '\u5df2\u4f7f\u7528') : (language === 'en' ? 'Available' : '\u53ef\u7528')}</span>
                           </div>
                         ))}
                      </div>
                    </section>

                    <section className="settings-section">
                      <div className="settings-section-heading">
                        <h3>{language === 'en' ? 'Inventory Categories' : '\u5e93\u5b58\u5206\u7c7b'}</h3>
                      </div>
                      <div className="inline-form settings-inline-form">
                        <input value={newCategoryZh} onChange={e => setNewCategoryZh(e.target.value)} placeholder={language === 'en' ? 'Chinese name' : '\u4e2d\u6587\u540d\u79f0'} />
                        <input value={newCategoryEn} onChange={e => setNewCategoryEn(e.target.value)} placeholder={language === 'en' ? 'English name' : '\u82f1\u6587\u540d\u79f0'} />
                        <button onClick={addInventoryCategory}>{t.add}</button>
                      </div>
                      <div className="settings-scroll-list">
                        {categories.map(category => (
                          <div key={category.name} className="category-settings-row">
                            <span>{language === 'en' ? category.label_en : category.label_zh}</span>
                            <button
                              className="text-button"
                              disabled={category.name === 'uncategorized'}
                              onClick={() => removeInventoryCategory(category.name)}
                            >
                              {language === 'en' ? 'Delete' : '\u5220\u9664'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="settings-section">
                      <div className="settings-section-heading">
                        <h3>{uiLabels.foodLibrary}</h3>
                      </div>
                      <button className="text-button" onClick={clearFoodLibrary}>{uiLabels.clearFoodLibrary}</button>
                    </section>

                    <section className="settings-section">
                      <div className="settings-section-heading">
                        <h3>{language === 'en' ? 'Daily generation limits' : '\u6bcf\u65e5\u751f\u6210\u989d\u5ea6'}</h3>
                      </div>
                      <div className="settings-limit-grid">
                        <label>
                          <span>{language === 'en' ? 'Whole site' : '\u5168\u7ad9'}</span>
                          <input
                            type="number"
                            min="0"
                            value={generationLimits.daily_limit_global}
                            onChange={e => setGenerationLimits(prev => ({ ...prev, daily_limit_global: e.target.value }))}
                          />
                        </label>
                        <label>
                          <span>{language === 'en' ? 'Single user' : '\u5355\u4e2a\u7528\u6237'}</span>
                          <input
                            type="number"
                            min="0"
                            value={generationLimits.daily_limit_user}
                            onChange={e => setGenerationLimits(prev => ({ ...prev, daily_limit_user: e.target.value }))}
                          />
                        </label>
                        <label>
                          <span>{language === 'en' ? 'Guest IP/device' : '\u672a\u767b\u5f55 IP/\u8bbe\u5907'}</span>
                          <input
                            type="number"
                            min="0"
                            value={generationLimits.daily_limit_guest}
                            onChange={e => setGenerationLimits(prev => ({ ...prev, daily_limit_guest: e.target.value }))}
                          />
                        </label>
                        <label>
                          <span>{language === 'en' ? 'Contact site' : '\u8054\u7cfb\u5168\u7ad9'}</span>
                          <input
                            type="number"
                            min="0"
                            value={generationLimits.daily_limit_contact_global}
                            onChange={e => setGenerationLimits(prev => ({ ...prev, daily_limit_contact_global: e.target.value }))}
                          />
                        </label>
                        <label>
                          <span>{language === 'en' ? 'Contact user/IP' : '\u8054\u7cfb\u7528\u6237/IP'}</span>
                          <input
                            type="number"
                            min="0"
                            value={generationLimits.daily_limit_contact_user}
                            onChange={e => setGenerationLimits(prev => ({ ...prev, daily_limit_contact_user: e.target.value }))}
                          />
                        </label>
                      </div>
                      <button onClick={saveGenerationLimits}>{language === 'en' ? 'Save limits' : '\u4fdd\u5b58\u989d\u5ea6'}</button>
                    </section>

                    <section className="settings-section settings-note-editor">
                      <h3>{uiLabels.introTextSettings}</h3>
                      <label>
                        <span>{language === 'en' ? 'Chinese' : '\u4e2d\u6587'}</span>
                        <textarea value={introTextDrafts.zh} onChange={e => setIntroTextDrafts(prev => ({ ...prev, zh: e.target.value }))} />
                      </label>
                      <label>
                        <span>{language === 'en' ? 'English' : '\u82f1\u6587'}</span>
                        <textarea value={introTextDrafts.en} onChange={e => setIntroTextDrafts(prev => ({ ...prev, en: e.target.value }))} />
                      </label>
                      <div className="modal-actions">
                        <button onClick={() => {
                          localStorage.removeItem(getIntroTextStorageKey('zh'));
                          localStorage.removeItem(getIntroTextStorageKey('en'));
                          setIntroTexts(defaultIntroTexts);
                          setIntroTextDrafts(defaultIntroTexts);
                        }}>{uiLabels.resetIntroText}</button>
                        <button onClick={() => {
                          const next = {
                            zh: introTextDrafts.zh.trim() || defaultIntroTexts.zh,
                            en: introTextDrafts.en.trim() || defaultIntroTexts.en
                          };
                          storeIntroText('zh', next.zh);
                          storeIntroText('en', next.en);
                          setIntroTexts(next);
                          setIntroTextDrafts(next);
                        }}>{uiLabels.saveIntroText}</button>
                      </div>
                    </section>
                 </div>
               ) : <p>{t.adminZone} ({t.loginTabAccount} {language === 'en' ? 'Required' : '\u5fc5\u9700'})</p>}
              <section className="settings-section settings-note-editor">
                <h3>{uiLabels.foodHintSettings}</h3>
                <label>
                  <span>{language === 'en' ? 'Chinese' : '\u4e2d\u6587'}</span>
                  <textarea value={foodHintDrafts.zh} onChange={e => setFoodHintDrafts(prev => ({ ...prev, zh: e.target.value }))} />
                </label>
                <label>
                  <span>{language === 'en' ? 'English' : '\u82f1\u6587'}</span>
                  <textarea value={foodHintDrafts.en} onChange={e => setFoodHintDrafts(prev => ({ ...prev, en: e.target.value }))} />
                </label>
                <div className="modal-actions">
                  <button onClick={() => {
                    const keyUserId = user?.id ?? 'guest';
                    localStorage.removeItem(getFoodHintStorageKey(keyUserId, 'zh'));
                    localStorage.removeItem(getFoodHintStorageKey(keyUserId, 'en'));
                    setFoodHintOverride(null);
                    setFoodHintDrafts(defaultFoodHintTexts);
                  }}>{uiLabels.resetFoodHint}</button>
                  <button onClick={() => {
                    const keyUserId = user?.id ?? 'guest';
                    const next = {
                      zh: { text: foodHintDrafts.zh.trim() || defaultFoodHintTexts.zh },
                      en: { text: foodHintDrafts.en.trim() || defaultFoodHintTexts.en }
                    };
                    storeFoodHint(keyUserId, 'zh', next.zh);
                    storeFoodHint(keyUserId, 'en', next.en);
                    setFoodHintOverride(next[language]);
                  }}>{uiLabels.saveFoodHint}</button>
                </div>
              </section>
           </div>
        </div>
      )}

      {editingItem && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>{language === 'zh' ? '\u7f16\u8f91\u5e93\u5b58' : 'Edit Item'}</h2>
            <div className="form-grid">
               <label>{t.itemName} <input value={editName} onChange={e => setEditName(e.target.value)} /></label>
               <label>{t.volumePlaceholder} <input value={editAmount} onChange={e => setEditAmount(e.target.value)} /></label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setEditingItem(null)}>{t.cancel}</button>
              <button className="primary-action" style={{marginTop: 0, width: 'auto'}} onClick={saveEdit}>
                {language === 'zh' ? '\u4fdd\u5b58' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="quick-generate-block mobile-quick-generate">
        <button className="primary-action quick-generate-button" onClick={quickGenerateRecommendations} disabled={loading}>
          {loading ? (language === 'en' ? 'Generating...' : '\u6b63\u5728\u751f\u6210...') : uiLabels.quickGenerate}
        </button>
        <small>{uiLabels.quickGenerateHint}</small>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <section className="inventory-strip">
          <div className="section-heading">
            <div className="inventory-heading-main">
              <h2><span className="section-index">1.</span>{t.inventory}<small className="inventory-random-note">{language === 'en' ? '(random generation works without inventory)' : '\uff08\u4e0d\u8bbe\u7f6e\u5e93\u5b58\u4e5f\u53ef\u4ee5\u968f\u673a\u751f\u6210\u54e6~\uff09'}</small></h2>
            </div>
            <div className="quick-generate-block desktop-quick-generate">
              <button className="primary-action quick-generate-button" onClick={quickGenerateRecommendations} disabled={loading}>
                {loading ? (language === 'en' ? 'Generating...' : '\u6b63\u5728\u751f\u6210...') : uiLabels.quickGenerate}
              </button>
              <small>{uiLabels.quickGenerateHint}</small>
            </div>
            <div className="inventory-heading-side">
              <button className="text-button" onClick={clearInventory}>{t.clear}</button>
            </div>
          </div>
          <div className="inventory-library-layout">
            <div className="inventory-lanes" ref={inventoryLanesRef}>
              {categories.map(category => (
                <CategoryLane 
                  key={category.name} 
                  id={category.name} 
                  title={getCategoryTitle(category.name)}
                  items={inventory.filter(i => getItemCategory(i) === category.name)} 
                  requiredIds={preferences.requiredIngredientIds}
                  onToggle={(id) => {
                     const next = preferences.requiredIngredientIds.includes(id) ? preferences.requiredIngredientIds.filter(x=>x!==id) : [...preferences.requiredIngredientIds, id];
                     setPreferences({...preferences, requiredIngredientIds: next});
                  }}
                  onDelete={removeInventoryItem}
                  onEdit={startEdit}
                />
              ))}
            </div>
            <div className="food-library" style={foodLibraryOpen && inventoryLanesHeight > 0 ? { height: inventoryLanesHeight } : undefined}>
              <div className="food-library-head">
                <button className="food-library-toggle" onClick={() => setFoodLibraryOpen(prev => !prev)}>
                  <span>{foodLibraryOpen ? 'v' : '>'}</span>
                  <strong>{uiLabels.foodLibrary}</strong>
                </button>
                <label className="food-library-search">
                  <input
                    value={foodLibrarySearch}
                    onChange={e => setFoodLibrarySearch(e.target.value)}
                    placeholder={language === 'en' ? 'Search foods...' : '\u641c\u7d22\u98df\u7269\u540d\u79f0...'}
                  />
                  <span aria-hidden="true">⌕</span>
                </label>
              </div>
              {foodLibraryOpen && (
                <div className="food-library-body">
                  {categories.map(category => {
                    const keyword = foodLibrarySearch.trim().toLocaleLowerCase();
                    const items = foodLibrary.filter(item => item.category === category.name && (!keyword || item.name.toLocaleLowerCase().includes(keyword)));
                    if (items.length === 0) return null;
                    return (
                      <div key={category.name} className="food-library-group">
                        <h4>{getCategoryTitle(category.name)}</h4>
                        <div className="food-library-items">
                          {items.map(item => (
                            <span key={item.id} className="food-library-item">
                              <button onClick={() => addFoodLibraryItem(item)}>{item.name}</button>
                              {user?.role === 'admin' && <button className="mini-delete" onClick={() => deleteFoodLibraryItem(item.id)}>x</button>}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <p className="inventory-help">{foodHintText}</p>
          <div className="inventory-action-row">
            <div className="inline-form inventory-add-form">
              <input
                value={inventoryName}
                onChange={e => setInventoryName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addInventoryItem();
                }}
                placeholder={t.itemName}
              />
              <input
                value={inventoryAmount}
                onChange={e => setInventoryAmount(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addInventoryItem();
                }}
                placeholder={t.volumePlaceholder}
              />
              <button onClick={addInventoryItem}>{t.add}</button>
            </div>
          </div>
          <label className="food-share-consent">
            <input type="checkbox" checked={shareFoodLibraryPublicly} onChange={e => setShareFoodLibraryPublicly(e.target.checked)} />
            <span>{uiLabels.shareFoodLibrary}</span>
            <small>{uiLabels.shareFoodLibraryHint}</small>
          </label>
        </section>
      </DndContext>

      <div className="content-grid" ref={generationAreaRef}>
         <aside className="panel settings-panel">
            <div className="section-heading">
              <h2><span className="section-index">2.</span>{t.preferences}</h2>
              <button type="button" className="text-button" onClick={randomize}>{t.randomize}</button>
            </div>
            <div className="form-grid">
               {(['alcohol', 'caffeine', 'temperature', 'calories'] as PreferenceKey[]).map(key => (
                 <label key={key}>{t.preferenceLabels[key]}<select value={preferences[key]} onChange={e => setPreferences({...preferences, [key]: e.target.value})}>
                   {randomOptions[key].map(o => <option key={o} value={o}>{t.options[o]}</option>)}
                 </select></label>
               ))}
            </div>
            <div className="compact-generate-controls">
              <div className="compact-switch-row">
                 <input type="checkbox" id="independent" checked={preferences.independentDrinks} onChange={e => setPreferences({...preferences, independentDrinks: e.target.checked, frugalMode: e.target.checked ? false : preferences.frugalMode})} />
                 <label htmlFor="independent">{uiLabels.independentDrinks}</label>
              </div>
              <div className="compact-switch-row">
                 <input type="checkbox" id="frugal" disabled={preferences.independentDrinks || effectiveIgnoreInventory || !hasMeasurableInventory} checked={!preferences.independentDrinks && effectiveFrugalMode} onChange={e => setPreferences({...preferences, frugalMode: e.target.checked})} />
                 <label htmlFor="frugal">{t.frugalMode}</label>
              </div>
              <div className="compact-switch-row">
                 <input type="checkbox" id="ignoreInventory" checked={preferences.ignoreInventory} onChange={e => setPreferences({...preferences, ignoreInventory: e.target.checked})} />
                 <label htmlFor="ignoreInventory">{language === 'en' ? uiLabels.ignoreInventory : '\u65e0\u89c6\u5e93\u5b58\uff1a\u4e0d\u8003\u8651\u5e93\u5b58\u60c5\u51b5\u968f\u673a\u751f\u6210'}</label>
              </div>
              {autoIgnoreInventory && <div className="compact-help-text">{uiLabels.ignoreInventoryAuto}</div>}
              <label className="compact-number-row">
                <span>{language === 'en' ? 'Count' : '\u6570\u91cf'}</span>
                <input type="number" value={preferences.recommendationCount} onChange={e => setPreferences({...preferences, recommendationCount: Number(e.target.value)})} />
              </label>
              <button className="primary-action compact-generate-button" onClick={() => generateRecommendations()} disabled={loading}>{loading ? '\u6b63\u5728\u751f\u6210...' : t.generate}</button>
            </div>
            {generationStatus && <div className="generation-status" role="status" aria-live="polite">{generationStatus}</div>}
         </aside>

         <section className="panel main-panel">
            <h2><span className="section-index">3.</span>{t.generate}</h2>
            <div className={`results-area result-count-${Math.min(Math.max(recommendations.length, 1), 3)}`}>
               {recommendations.length === 0 && <p className="placeholder-text">{t.recommendationPlaceholder}</p>}
               {recommendations.map((rec, i) => (
                 <article key={getRecommendationId('main', rec, i)} className="recommendation-card">
                   <button className="favorite-action corner-favorite" onClick={() => saveAsFavorite(rec)}>{uiLabels.save}</button>
                   <div className="recipe-number">{String(i + 1).padStart(2, '0')}</div>
                   <h3>{rec.name}</h3>
                  <div className="calorie-row"><strong>{formatRecipeVolume(rec.volumeMl)} · {rec.calories} {uiLabels.kcal}</strong></div>
                   <div className="recipe-tags icon-tags">
                     {renderPreferenceTag(rec.temperature, uiLabels.temperature, language, t)}
                     {renderPreferenceTag(rec.caffeine, uiLabels.caffeine, language, t)}
                     {renderPreferenceTag(rec.alcohol, uiLabels.alcohol, language, t)}
                   </div>
                   {rec.score && (
                     <div className="score-block">
                       <div className="total-score">
                         <span>{uiLabels.score}</span>
                         <strong>{rec.score.total}</strong>
                         <small>/100</small>
                       </div>
                       <div className="dimension-scores">
                         {getScoreDimensions(rec.score, language).map((dimension: { label: string; value: number }, index: number) => (
                           <span key={`${dimension.label}-${index}`}>
                             <span className="dimension-label">{dimension.label}</span>
                             <strong>{dimension.value}/10</strong>
                           </span>
                         ))}
                       </div>
                     </div>
                   )}
                   <section className="recipe-section">
                     <h4>{uiLabels.intro}</h4>
                     <p>{rec.reason}</p>
                   </section>
                   <section className="recipe-section">
                     <h4>{uiLabels.ingredients}</h4>
                     <ul>
                       {(rec.ingredients ?? []).map((ingredient: string, index: number) => <li key={index}>{ingredient}</li>)}
                     </ul>
                   </section>
                   <section className="recipe-section">
                     <h4>{uiLabels.steps}</h4>
                     <ol>
                       {(rec.steps ?? []).map((step: string, index: number) => <li key={index}>{formatStepText(step)}</li>)}
                     </ol>
                   </section>
                   <section className={`recipe-section ${(rec.remainingIngredients ?? []).length === 0 ? 'no-leftovers-section' : ''} ${flashingNoLeftoverId === getRecommendationId('main', rec, i) ? 'flash' : ''}`}>
                     <h4>{uiLabels.remaining}</h4>
                     {(rec.remainingIngredients ?? []).length > 0
                       ? <ul>{rec.remainingIngredients.map((ingredient: string, index: number) => <li key={index}>{ingredient}</li>)}</ul>
                       : <p className="no-leftovers-text">{uiLabels.noMeasurableLeftovers}</p>}
                   </section>
                   <button
                     className={`select-recipe ${(rec.remainingIngredients ?? []).length === 0 ? 'no-leftovers' : ''} ${selectedRecommendationIds.includes(getRecommendationId('main', rec, i)) ? 'selected' : ''}`}
                     onClick={() => handleRecommendationSelection(getRecommendationId('main', rec, i), rec)}
                   >
                     {selectedRecommendationIds.includes(getRecommendationId('main', rec, i)) ? uiLabels.selected : uiLabels.selectLeftovers}
                   </button>
                 </article>
               ))}
            </div>
            <button className="primary-action leftover-action" onClick={generateFromRemainingIngredients} disabled={selectedRecommendationIds.length === 0 || loading}>
              {uiLabels.useRemaining}
            </button>
            {leftoverRecommendations.length > 0 && (
              <div className={`results-area leftover-results result-count-${Math.min(Math.max(leftoverRecommendations.length, 1), 3)}`}>
                {leftoverRecommendations.map((rec, i) => (
                  <article key={getRecommendationId('leftover', rec, i)} className="recommendation-card">
                    <button className="favorite-action corner-favorite" onClick={() => saveAsFavorite(rec)}>{uiLabels.save}</button>
                    <div className="recipe-number">{String(i + 1).padStart(2, '0')}</div>
                    <h3>{rec.name}</h3>
                    <div className="calorie-row"><strong>{formatRecipeVolume(rec.volumeMl)} · {rec.calories} {uiLabels.kcal}</strong></div>
                    <div className="recipe-tags icon-tags">
                      {renderPreferenceTag(rec.temperature, uiLabels.temperature, language, t)}
                      {renderPreferenceTag(rec.caffeine, uiLabels.caffeine, language, t)}
                      {renderPreferenceTag(rec.alcohol, uiLabels.alcohol, language, t)}
                    </div>
                    {rec.score && (
                      <div className="score-block">
                        <div className="total-score"><span>{uiLabels.score}</span><strong>{rec.score.total}</strong><small>/100</small></div>
                        <div className="dimension-scores">
                          {getScoreDimensions(rec.score, language).map((dimension: { label: string; value: number }, index: number) => (
                            <span key={`${dimension.label}-${index}`}>
                              <span className="dimension-label">{dimension.label}</span>
                              <strong>{dimension.value}/10</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <section className="recipe-section"><h4>{uiLabels.intro}</h4><p>{rec.reason}</p></section>
                    <section className="recipe-section"><h4>{uiLabels.ingredients}</h4><ul>{(rec.ingredients ?? []).map((ingredient: string, index: number) => <li key={index}>{ingredient}</li>)}</ul></section>
                    <section className="recipe-section"><h4>{uiLabels.steps}</h4><ol>{(rec.steps ?? []).map((step: string, index: number) => <li key={index}>{formatStepText(step)}</li>)}</ol></section>
                    <section className="recipe-section">
                      <h4>{uiLabels.remaining}</h4>
                      {(rec.remainingIngredients ?? []).length > 0 ? <ul>{rec.remainingIngredients.map((ingredient: string, index: number) => <li key={index}>{ingredient}</li>)}</ul> : <p>{uiLabels.noMeasurableLeftovers}</p>}
                    </section>
                  </article>
                ))}
              </div>
            )}
         </section>

         <aside className="panel history-panel">
            <h2><span className="section-index">4.</span>{t.favorites}</h2>
            <div className="history-list">
               {favorites.map(f => (
                  <div key={f.id} className="history-item favorite-history-item">
                     <button className="history-open-button" onClick={() => openFavorite(f)}>
                       <div className="history-thumb">{String(getFavoriteDisplayName(f, favorites) ?? '?').slice(0, 1)}</div>
                       <div className="history-main">
                         <span className="history-recipe">{getFavoriteDisplayName(f, favorites)}</span>
                         <span className="history-meta">
                           {formatRecipeVolume(f.metadata?.volumeMl)} · {f.metadata?.calories ?? '--'} {uiLabels.kcal}
                         </span>
                       </div>
                       <strong className="history-score">{f.metadata?.score?.total ?? f.rating ?? '--'}</strong>
                     </button>
                     <button className="history-delete-button" onClick={() => deleteFavorite(f)} aria-label={uiLabels.deleteFavorite}>x</button>
                  </div>
               ))}
            </div>
         </aside>
      </div>
    </main>
  );
}

function buildFavoriteFromRecommendation(rec: any, existingFavorites: any[]) {
  const baseName = String(rec.name ?? '').trim() || 'Untitled drink';
  const baseFavorite = {
    name: baseName,
    rating: normalizeDisplayScore(rec.score?.total ?? rec.rating ?? 5),
    ingredients: normalizeRecipeTextArray(rec.ingredients),
    steps: normalizeRecipeTextArray(rec.steps),
    metadata: {
      alcohol: rec.alcohol,
      caffeine: rec.caffeine,
      temperature: rec.temperature,
      calories: rec.calories,
      volumeMl: rec.volumeMl,
      score: rec.score,
      reason: rec.reason ?? rec.intro ?? '',
      favoriteBaseName: baseName
    }
  };
  const signature = getFavoriteSignature(baseFavorite);
  const sameBaseFavorites = existingFavorites.filter(favorite => getFavoriteBaseName(favorite) === baseName);
  const distinctSameBase = new Set(sameBaseFavorites.map(getFavoriteSignature));
  const favoriteVersion = distinctSameBase.has(signature) ? getFavoriteVersion(sameBaseFavorites.find(item => getFavoriteSignature(item) === signature)) : distinctSameBase.size + 1;
  return {
    ...baseFavorite,
    metadata: {
      ...baseFavorite.metadata,
      favoriteSignature: signature,
      favoriteVersion
    }
  };
}

function createFavoriteEditDraft(favorite: any) {
  return {
    name: getFavoriteBaseName(favorite),
    reason: String(favorite?.metadata?.reason ?? ''),
    ingredientsText: normalizeRecipeTextArray(favorite?.ingredients).join('\n'),
    stepsText: normalizeRecipeTextArray(favorite?.steps).join('\n')
  };
}

function favoriteFromEditDraft(favorite: any, draft: any) {
  const baseName = String(draft.name ?? '').trim() || getFavoriteBaseName(favorite);
  const { favoriteSignature: _oldSignature, ...metadataWithoutSignature } = favorite.metadata ?? {};
  const updated = {
    ...favorite,
    name: baseName,
    ingredients: splitMultilineRecipeText(draft.ingredientsText),
    steps: splitMultilineRecipeText(draft.stepsText),
    metadata: {
      ...metadataWithoutSignature,
      reason: String(draft.reason ?? '').trim(),
      favoriteBaseName: baseName
    }
  };
  return {
    ...updated,
    metadata: {
      ...updated.metadata,
      favoriteSignature: getFavoriteSignature(updated)
    }
  };
}

function splitMultilineRecipeText(value: unknown) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeRecipeTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map(item => String(item ?? '').trim()).filter(Boolean);
  if (typeof value === 'string') return splitMultilineRecipeText(value);
  return [];
}

function getFavoriteBaseName(favorite: any) {
  return String(favorite?.metadata?.favoriteBaseName ?? favorite?.name ?? '').replace(/\s+V\d+$/i, '').trim();
}

function getFavoriteVersion(favorite: any) {
  const version = Number(favorite?.metadata?.favoriteVersion);
  return Number.isFinite(version) && version > 0 ? version : 1;
}

function getFavoriteDisplayName(favorite: any, allFavorites: any[]) {
  const baseName = getFavoriteBaseName(favorite);
  const sameBase = allFavorites.filter(item => getFavoriteBaseName(item) === baseName);
  const distinctSignatures = new Set(sameBase.map(getFavoriteSignature));
  if (distinctSignatures.size > 1 || getFavoriteVersion(favorite) > 1) {
    return `${baseName} V${getFavoriteVersion(favorite)}`;
  }
  return baseName;
}

function getFavoriteSignature(favorite: any) {
  if (favorite?.metadata?.favoriteSignature) return String(favorite.metadata.favoriteSignature);
  const metadata = favorite?.metadata ?? {};
  return JSON.stringify({
    name: getFavoriteBaseName(favorite),
    reason: String(metadata.reason ?? '').trim(),
    ingredients: normalizeRecipeTextArray(favorite?.ingredients),
    steps: normalizeRecipeTextArray(favorite?.steps),
    calories: metadata.calories ?? null,
    volumeMl: metadata.volumeMl ?? null,
    alcohol: metadata.alcohol ?? null,
    caffeine: metadata.caffeine ?? null,
    temperature: metadata.temperature ?? null,
    score: metadata.score ?? null
  });
}

function sortFavorites(items: any[]) {
  return [...items].sort((left, right) => {
    const rightScore = Number(right?.metadata?.score?.total ?? right?.rating ?? 0);
    const leftScore = Number(left?.metadata?.score?.total ?? left?.rating ?? 0);
    if (rightScore !== leftScore) return rightScore - leftScore;
    return String(right?.created_at ?? '').localeCompare(String(left?.created_at ?? ''));
  });
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function nextPaint() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit, attempts = 3) {
  if (typeof input === 'string' && input.startsWith('/api/')) {
    await waitForApiReady();
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await delay(300 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

function delay(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms));
}

function formatCardOption(value: unknown, language: Language, t: typeof en) {
  const key = String(value ?? '');
  const label = (t.options as Record<string, string>)[key];
  if (label) return label;
  if (language === 'zh' && key === 'room') return '\u5e38\u6e29';
  return key;
}

function getScoreDimensions(score: any, language: Language) {
  if (Array.isArray(score?.dimensions)) {
    return score.dimensions
      .map((dimension: any) => ({
        label: String(dimension.label ?? dimension.name ?? ''),
        value: normalizeDisplayScore(dimension.value ?? dimension.score)
      }))
      .filter((dimension: { label: string; value: number }) => dimension.label);
  }

  const legacyDimensions = score?.dimensions ?? {};
  const labels = language === 'en'
    ? {
      tasteBalance: 'Taste',
      inventoryFit: 'Inventory',
      preferenceMatch: 'Preference',
      simplicity: 'Simple',
      frugality: 'Frugal'
    }
    : {
      tasteBalance: '\u53e3\u5473\u5e73\u8861',
      inventoryFit: '\u5e93\u5b58\u5339\u914d',
      preferenceMatch: '\u504f\u597d\u5339\u914d',
      simplicity: '\u5236\u4f5c\u7b80\u6613',
      frugality: '\u8282\u4fed\u5229\u7528'
    };

  return Object.entries(labels).map(([key, label]) => ({
    label,
    value: normalizeDisplayScore(legacyDimensions[key])
  }));
}

function normalizeDisplayScore(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function formatStepText(step: string) {
  return String(step)
    .trim()
    .replace(/^(?:步骤\s*)?\d+[\s.。)、:：-]+/i, '')
    .trim();
}

function formatRecipeVolume(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) return '-- ml';
  return `${Number.isInteger(numberValue) ? numberValue : numberValue.toFixed(1)} ml`;
}

function renderPreferenceTag(value: unknown, label: string, language: Language, t: typeof en) {
  const optionLabel = formatCardOption(value, language, t);
  return (
    <span className="text-tag" title={`${label}: ${optionLabel}`}>
      <span>{label}</span>
      <strong>{optionLabel}</strong>
    </span>
  );
}

function parseRemainingIngredient(text: string, recIndex: number, index: number): InventoryItem {
  const trimmed = String(text ?? '').trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(ml|g|oz|kg|l|杯|份|克|毫升|升)\s*(.*)$/i);
  return {
    id: `remaining-${recIndex}-${index}`,
    name: match?.[3]?.trim() || trimmed,
    amount: match ? Number(match[1]) : undefined,
    unit: match?.[2]?.trim() || 'ml',
    category: 'uncategorized'
  };
}
function getApiHealthUrl() {
  const isLocalVite = ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port === '5173';
  return isLocalVite ? 'http://127.0.0.1:8787/api/health' : '/api/health';
}

function waitForApiReady() {
  apiReadyPromise ??= retryApiHealth();
  return apiReadyPromise;
}

async function retryApiHealth(attempts = 20) {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(getApiHealthUrl());
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  apiReadyPromise = null;
  throw lastError ?? new Error('API is not ready');
}

function encodeBasicCredentials(credentials: AuthCredentials) {
  const bytes = new TextEncoder().encode(`${credentials.username}:${credentials.password}`);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}




