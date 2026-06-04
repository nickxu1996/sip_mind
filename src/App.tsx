import { useMemo, useState, useEffect } from 'react';
import { DndContext, useDraggable, useDroppable, DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { en } from './i18n/en';
import { zh } from './i18n/zh';

type Language = 'en' | 'zh';
type InventoryItem = { id: string; name: string; amount?: number; unit: string; category: string; };
type FoodLibraryItem = { id: number; name: string; category: string; };
type User = { id: number; username?: string; role: string; type: 'account' | 'invite'; };
type AuthCredentials = { username: string; password: string };
type StoredAuthSession = { user: User; credentials?: AuthCredentials };
type PreferenceKey = 'alcohol' | 'caffeine' | 'temperature' | 'calories';
type OptionKey = 'any' | 'high' | 'low' | 'none' | 'hot' | 'room' | 'cold' | 'medium' | 'very-low';

const defaultCategories = ['coffee', 'alcohol', 'soft', 'milk', 'powder', 'fruit', 'tea', 'uncategorized'];
const authStorageKey = 'sip_mind_user';
const recommendationsStoragePrefix = 'sip_mind_recommendations';
const foodHintStoragePrefix = 'sip_mind_food_hint';
const preferencesStoragePrefix = 'sip_mind_preferences';
const introTextStorageKey = 'sip_mind_intro_text';
const defaultIntroText = '选择家中库存和偏好，智能推荐饮品配方。';
let apiReadyPromise: Promise<void> | null = null;

const laneId = (category: string) => `category-lane:${category}`;

function orderInventoryCategories(categories: string[]) {
  const seen = new Set<string>();
  const ordered = categories.filter(category => {
    if (!category || category === 'uncategorized' || seen.has(category)) return false;
    seen.add(category);
    return true;
  });

  return [...ordered, 'uncategorized'];
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

function getPreferencesStorageKey(userId: number) {
  return `${preferencesStoragePrefix}:${userId}`;
}

function readStoredPreferences(userId: number) {
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

function storePreferences(userId: number, preferences: unknown) {
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

function readStoredIntroText() {
  return localStorage.getItem(introTextStorageKey) || defaultIntroText;
}

function storeIntroText(text: string) {
  localStorage.setItem(introTextStorageKey, text);
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
      <h3>{title}</h3>
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
    frugalMode: false, independentDrinks: false, recommendationCount: 2, requiredIngredientIds: [] as string[]
  });
  const [inventoryName, setInventoryName] = useState('');
  const [inventoryAmount, setInventoryAmount] = useState('');
  const [categories, setCategories] = useState<string[]>(() => orderInventoryCategories(defaultCategories));
  const [newCategoryName, setNewCategoryName] = useState('');
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [leftoverRecommendations, setLeftoverRecommendations] = useState<any[]>([]);
  const [selectedRecommendationIds, setSelectedRecommendationIds] = useState<string[]>([]);
  const [foodLibrary, setFoodLibrary] = useState<FoodLibraryItem[]>([]);
  const [foodLibraryOpen, setFoodLibraryOpen] = useState(true);
  const [foodHintOverride, setFoodHintOverride] = useState<{ text: string } | null>(null);
  const [foodHintDraft, setFoodHintDraft] = useState('');
  const [introText, setIntroText] = useState(readStoredIntroText);
  const [introTextDraft, setIntroTextDraft] = useState(readStoredIntroText);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');

  // Auth & UI States
  const [showLogin, setShowLogin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');

  const [authTab, setAuthTab] = useState<'account' | 'invite' | 'register'>('account');
  const [user, setUser] = useState<User | null>(() => readStoredAuthSession()?.user ?? null);
  const [authCredentials, setAuthCredentials] = useState<AuthCredentials | null>(() => readStoredAuthSession()?.credentials ?? null);
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
      save: '收藏',
      calories: '热量',
      caffeine: '咖啡因',
      alcohol: '酒精',
      temperature: '温度',
      score: '分数',
      intro: '简介',
      ingredients: '原料',
      steps: '做法',
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
      independentDrinks: 'Independent drinks: ingredients are independent between options',
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
      foodLibrary: '食品库',
      foodHint: '单击库存会设为 AI 每个推荐都必须包含的原料；双击可修改，按住可拖动。',
      foodHintSecond: '点击食品库即可轻松选择。',
      foodHintSettings: '食品库下方说明',
      introTextSettings: '介绍文字',
      saveIntroText: '保存介绍',
      resetIntroText: '恢复默认',
      saveFoodHint: '保存说明',
      resetFoodHint: '恢复默认',
      clearFoodLibrary: '清空食品库',
      independentDrinks: '独立饮品：各选项之间食材独立',
      useRemaining: '利用剩余食材',
      selected: '已选择',
      selectLeftovers: '选择剩余',
      noMeasurableLeftovers: '无可计量剩余',
      remaining: '剩余原料',
      save: '收藏',
      calories: '热量',
      caffeine: '咖啡因',
      alcohol: '酒精',
      temperature: '温度',
      score: '分数',
      intro: '简介',
      ingredients: '原料',
      steps: '做法',
      kcal: 'kcal'
    };
  const foodHintText = foodHintOverride?.text ?? `${uiLabels.foodHint}\n${uiLabels.foodHintSecond}`;

  const sensors = useSensors(
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
  }, []);

  useEffect(() => {
    const keyUserId = user?.id ?? 'guest';
    const saved = readStoredFoodHint(keyUserId, language);
    const normalized = saved ? { text: saved.text ?? `${saved.first}\n${saved.second}` } : null;
    setFoodHintOverride(normalized);
    setFoodHintDraft(normalized?.text ?? `${uiLabels.foodHint}\n${uiLabels.foodHintSecond}`);
  }, [user?.id, language]);

  useEffect(() => {
    if (showSettings && user?.role === 'admin') {
      loadInviteCodes();
    }
  }, [showSettings, user?.role]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(authStorageKey, JSON.stringify({ user, credentials: authCredentials }));
      setRecommendations(readStoredRecommendations(user.id));
      const savedPreferences = readStoredPreferences(user.id);
      if (savedPreferences) setPreferences(prev => ({ ...prev, ...savedPreferences, requiredIngredientIds: prev.requiredIngredientIds }));
      fetchUserData();
    } else {
      localStorage.removeItem(authStorageKey);
      setAuthCredentials(null);
      setInventory([]); setFavorites([]); setRecommendations([]); setFoodLibrary([]); setLeftoverRecommendations([]); setSelectedRecommendationIds([]);
    }
  }, [user, authCredentials]);

  useEffect(() => {
    if (user) {
      const { requiredIngredientIds, ...persistedPreferences } = preferences;
      storePreferences(user.id, persistedPreferences);
    }
  }, [user, preferences]);

  async function fetchUserData() {
    if (!user) return;
    try {
      const res = await fetchWithRetry(`/api/user/data?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setInventory(data.inventory);
        setFavorites(data.favorites);
        setFoodLibrary(Array.isArray(data.foodLibrary) ? data.foodLibrary : []);
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
    typeof value === 'string' && categories.includes(value);
  const getItemCategory = (item: InventoryItem): string =>
    isInventoryCategory(item.category) ? item.category : 'uncategorized';
  const getCategoryTitle = (category: string) => {
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
        setAuthCredentials(authTab === 'account' ? { username: loginUsername, password: loginPassword } : null);
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
      alert(language === 'en' ? 'Passwords do not match.' : '两次输入的密码不一致。');
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
      setAuthCredentials({ username: loginUsername, password: loginPassword });
      setUser(data.user);
      setShowLogin(false);
      setCaptchaChallenge(null);
      setCaptchaAnswer('');
      return;
    }

    const data = await res.json().catch(() => null);
    if (res.status === 403 && data?.captchaRequired) {
      await fetchCaptchaChallenge();
      alert(language === 'en' ? 'Please complete the verification code.' : '请完成验证码。');
      return;
    }
    alert(data?.error ?? (language === 'en' ? 'Registration failed.' : '注册失败。'));
  }

  async function addInventoryCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const authHeader = getAdminAuthorizationHeader();
    if (!authHeader) return;
    const res = await fetch('/api/admin/inventory/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      const data = await res.json();
      setCategories(orderInventoryCategories(data.categories));
      setNewCategoryName('');
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
      alert(data?.error ?? (language === 'en' ? 'Category delete failed' : '删除分类失败'));
    }
  }

  function getAdminAuthorizationHeader() {
    const credentials = authCredentials ?? (loginUsername && loginPassword ? { username: loginUsername, password: loginPassword } : null);
    if (!credentials) {
      setAuthTab('account');
      setShowLogin(true);
      alert(language === 'en' ? 'Please sign in again as admin.' : '请重新以管理员身份登录。');
      return null;
    }

    return `Basic ${encodeBasicCredentials(credentials)}`;
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
    
    const next = [...inventory, { id: crypto.randomUUID(), name: inventoryName, amount, unit, category: 'uncategorized' }];
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

  async function generateRecommendations() {
    if (!user) { setShowLogin(true); return; }
    setLoading(true);
    setGenerationStatus(language === 'zh' ? '正在验证输入...' : 'Validating input...');
    try {
      await nextPaint();
      setGenerationStatus(language === 'zh' ? '正在调用 AI...' : 'Calling AI...');
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory, preferences, language, userId: user.id })
      });
      if (res.ok) {
        const data = await res.json();
        setGenerationStatus(language === 'zh' ? '正在保存历史...' : 'Saving history...');
        await nextPaint();
        setRecommendations(data.recommendations);
        setLeftoverRecommendations([]);
        setSelectedRecommendationIds([]);
        storeRecommendations(user.id, data.recommendations);
        setGenerationStatus(language === 'zh' ? '完成' : 'Done');
      } else if (res.status === 429) {
        setGenerationStatus(language === 'zh' ? '错误：已达到今日生成上限' : 'Error: daily limit reached');
        alert('Limit reached');
      } else {
        const data = await res.json().catch(() => null);
        console.error('Recommendation generation failed', { status: res.status, body: data });
        setGenerationStatus(data?.message ? `Error: ${data.message}` : data?.error ? `Error: ${data.error}` : (language === 'zh' ? '错误：生成失败' : 'Error: generation failed'));
      }
    } catch (e) {
      console.error(e);
      setGenerationStatus(language === 'zh' ? '错误：网络或服务异常' : 'Error: network or service failure');
    } finally {
      setLoading(false);
    }
  }

  async function saveAsFavorite(rec: any) {
    if (!user) return;
    try {
      const fav = { name: rec.name, rating: 5, ingredients: rec.ingredients, steps: rec.steps, metadata: {alcohol: rec.alcohol, caffeine: rec.caffeine, calories: rec.calories, score: rec.score} };
      await fetch('/api/user/favorites', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({userId: user.id, favorite: fav})});
      fetchUserData();
    } catch (e) { console.error(e); }
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
    if (!user) return;
    await fetch('/api/user/inventory', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({userId: user.id, items: next})});
    fetchUserData();
  }

  function addFoodLibraryItem(item: FoodLibraryItem) {
    const exists = inventory.some(inv => inv.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase() && getItemCategory(inv) === item.category);
    if (exists) return;
    const next = [...inventory, { id: crypto.randomUUID(), name: item.name, unit: 'ml', category: item.category }];
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

  function toggleRecommendationSelection(id: string) {
    setSelectedRecommendationIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  }

  async function generateFromRemainingIngredients() {
    if (!user || selectedRecommendationIds.length === 0) return;
    const selected = recommendations.filter((rec, index) => selectedRecommendationIds.includes(getRecommendationId('main', rec, index)));
    const leftoverInventory = selected.flatMap((rec, recIndex) => (rec.remainingIngredients ?? []).map((text: string, index: number) => parseRemainingIngredient(text, recIndex, index)));
    if (leftoverInventory.length === 0) return;

    setLoading(true);
    setGenerationStatus(language === 'zh' ? '正在利用剩余食材...' : 'Using remaining ingredients...');
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory: leftoverInventory,
          preferences: { ...preferences, frugalMode: false, independentDrinks: true, requiredIngredientIds: [], recommendationCount: Math.min(3, Math.max(1, leftoverInventory.length)) },
          language,
          userId: user.id
        })
      });
      if (res.ok) {
        const data = await res.json();
        setLeftoverRecommendations(data.recommendations);
        setGenerationStatus(language === 'zh' ? '完成' : 'Done');
      } else {
        const data = await res.json().catch(() => null);
        setGenerationStatus(data?.message ? `Error: ${data.message}` : data?.error ? `Error: ${data.error}` : (language === 'zh' ? '生成失败' : 'Generation failed'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="top-bar-branding">
          <div className="brand-title-line">
            <div className="brand-name-stack">
              <h1>Sip Mind</h1>
              <strong>杯中灵感</strong>
            </div>
            <p>{introText}</p>
          </div>
        </div>
        <div className="settings-bar">
          <label>{t.language}
            <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </label>
          {user ? <button onClick={() => setUser(null)}>{user.username || t.inviteCode} ({t.logout})</button> : <button onClick={() => setShowLogin(true)}>{t.login}</button>}
          <button onClick={() => setShowSettings(true)}>{t.settings}</button>
        </div>
      </header>

      {showLogin && (
        <div className="modal-backdrop">
           <div className="modal">
              <div className="auth-tabs">
                 <button className={`auth-tab ${authTab === 'account' ? 'active' : ''}`} onClick={() => setAuthTab('account')}>{t.loginTabAccount}</button>
                 <button className={`auth-tab ${authTab === 'invite' ? 'active' : ''}`} onClick={() => setAuthTab('invite')}>{t.loginTabInvite}</button>
                 <button className={`auth-tab ${authTab === 'register' ? 'active' : ''}`} onClick={() => setAuthTab('register')}>{language === 'en' ? 'Register' : '注册'}</button>
              </div>
              <div className="form-grid">
                 {authTab === 'account' || authTab === 'register' ? (
                    <>
                       <label>{t.username} <input value={loginUsername} onChange={e => setLoginUsername(e.target.value)} /></label>
                       <label>{t.password}
                         <span className="password-field">
                           <input type={showLoginPassword ? 'text' : 'password'} value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                           <button type="button" onClick={() => setShowLoginPassword(prev => !prev)}>{showLoginPassword ? (language === 'en' ? 'Hide' : '隐藏') : (language === 'en' ? 'Show' : '显示')}</button>
                         </span>
                       </label>
                       {authTab === 'register' && (
                         <>
                           <label>{language === 'en' ? 'Confirm password' : '确认密码'}
                             <span className="password-field">
                               <input type={showConfirmPassword ? 'text' : 'password'} value={registerConfirmPassword} onChange={e => setRegisterConfirmPassword(e.target.value)} />
                               <button type="button" onClick={() => setShowConfirmPassword(prev => !prev)}>{showConfirmPassword ? (language === 'en' ? 'Hide' : '隐藏') : (language === 'en' ? 'Show' : '显示')}</button>
                             </span>
                           </label>
                           {captchaChallenge && (
                             <label>{language === 'en' ? 'Verification code' : '验证码'}
                               <span className="captcha-question">{captchaChallenge.question}</span>
                               <input value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} />
                               <button type="button" className="text-button" onClick={fetchCaptchaChallenge}>{language === 'en' ? 'Refresh' : '刷新'}</button>
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
                <button className="modal-close-button" onClick={() => setShowSettings(false)} aria-label={t.close}>×</button>
              </div>
              {user?.role === 'admin' ? (
                 <div className="admin-zone">
                    <section className="settings-section">
                      <div className="settings-section-heading">
                        <h3>{language === 'en' ? 'Invite Codes' : '邀请码'}</h3>
                      </div>
                      <button onClick={generateInviteCode}>{t.generateInvite}</button>
                      {lastInviteCode && (
                        <div className="invite-code-latest">
                          <span>{language === 'en' ? 'New invite code' : '新邀请码'}</span>
                          <strong>{lastInviteCode}</strong>
                        </div>
                      )}
                      <div className="invite-code-list">
                         {inviteCodes.length === 0 && <div className="invite-code-empty">{language === 'en' ? 'No invite codes yet.' : '暂无邀请码'}</div>}
                         {inviteCodes.map(c => (
                           <div key={c.code} className="invite-code-row">
                             <strong>{c.code}</strong>
                             <span>{c.created_at}</span>
                             <span>{c.is_used ? (language === 'en' ? 'Used' : '已使用') : (language === 'en' ? 'Available' : '可用')}</span>
                           </div>
                         ))}
                      </div>
                    </section>

                    <section className="settings-section">
                      <div className="settings-section-heading">
                        <h3>{language === 'en' ? 'Inventory Categories' : '库存分类'}</h3>
                      </div>
                      <div className="inline-form settings-inline-form">
                        <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder={language === 'en' ? 'Category name' : '分类名称'} />
                        <button onClick={addInventoryCategory}>{t.add}</button>
                      </div>
                      <div className="settings-scroll-list">
                        {categories.map(category => (
                          <div key={category} className="category-settings-row">
                            <span>{getCategoryTitle(category)}</span>
                            <button
                              className="text-button"
                              disabled={category === 'uncategorized'}
                              onClick={() => removeInventoryCategory(category)}
                            >
                              {language === 'en' ? 'Delete' : '删除'}
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

                    <section className="settings-section settings-note-editor">
                      <h3>{uiLabels.introTextSettings}</h3>
                      <textarea value={introTextDraft} onChange={e => setIntroTextDraft(e.target.value)} />
                      <div className="modal-actions">
                        <button onClick={() => {
                          localStorage.removeItem(introTextStorageKey);
                          setIntroText(defaultIntroText);
                          setIntroTextDraft(defaultIntroText);
                        }}>{uiLabels.resetIntroText}</button>
                        <button onClick={() => {
                          const next = introTextDraft.trim() || defaultIntroText;
                          storeIntroText(next);
                          setIntroText(next);
                          setIntroTextDraft(next);
                        }}>{uiLabels.saveIntroText}</button>
                      </div>
                    </section>
                 </div>
              ) : <p>{t.adminZone} ({t.loginTabAccount} {language === 'en' ? 'Required' : '必选'})</p>}
              <section className="settings-section settings-note-editor">
                <h3>{uiLabels.foodHintSettings}</h3>
                <textarea value={foodHintDraft} onChange={e => setFoodHintDraft(e.target.value)} />
                <div className="modal-actions">
                  <button onClick={() => {
                    const next = `${uiLabels.foodHint}\n${uiLabels.foodHintSecond}`;
                    const keyUserId = user?.id ?? 'guest';
                    localStorage.removeItem(getFoodHintStorageKey(keyUserId, language));
                    setFoodHintOverride(null);
                    setFoodHintDraft(next);
                  }}>{uiLabels.resetFoodHint}</button>
                  <button onClick={() => {
                    const next = { text: foodHintDraft.trim() };
                    const keyUserId = user?.id ?? 'guest';
                    storeFoodHint(keyUserId, language, next);
                    setFoodHintOverride(next);
                  }}>{uiLabels.saveFoodHint}</button>
                </div>
              </section>
           </div>
        </div>
      )}

      {editingItem && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>{language === 'zh' ? '编辑库存' : 'Edit Item'}</h2>
            <div className="form-grid">
               <label>{t.itemName} <input value={editName} onChange={e => setEditName(e.target.value)} /></label>
               <label>{t.volumePlaceholder} <input value={editAmount} onChange={e => setEditAmount(e.target.value)} /></label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setEditingItem(null)}>{t.cancel}</button>
              <button className="primary-action" style={{marginTop: 0, width: 'auto'}} onClick={saveEdit}>
                {language === 'zh' ? '保存' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <section className="inventory-strip">
          <div className="section-heading">
            <h2>{t.inventory}</h2>
            <button className="text-button" onClick={() => {setInventory([]); if(user) fetch('/api/user/inventory', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({userId: user.id, items: []})});}}>{t.clear}</button>
          </div>
          <div className="inventory-library-layout">
            <div className="inventory-lanes">
              {categories.map(cat => (
                <CategoryLane 
                  key={cat} 
                  id={cat} 
                  title={getCategoryTitle(cat)}
                  items={inventory.filter(i => getItemCategory(i) === cat)} 
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
            <div className="food-library">
              <button className="food-library-toggle" onClick={() => setFoodLibraryOpen(prev => !prev)}>
                <span>{foodLibraryOpen ? 'v' : '>'}</span>
                {uiLabels.foodLibrary}
              </button>
              {foodLibraryOpen && (
                <div className="food-library-body">
                  {categories.map(category => {
                    const items = foodLibrary.filter(item => item.category === category);
                    if (items.length === 0) return null;
                    return (
                      <div key={category} className="food-library-group">
                        <h4>{getCategoryTitle(category)}</h4>
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
          <div className="inline-form">
            <input value={inventoryName} onChange={e => setInventoryName(e.target.value)} placeholder={t.itemName} />
            <input value={inventoryAmount} onChange={e => setInventoryAmount(e.target.value)} placeholder={t.volumePlaceholder} />
            <button onClick={addInventoryItem}>{t.add}</button>
          </div>
        </section>
      </DndContext>

      <div className="content-grid">
         <aside className="panel settings-panel">
            <div className="section-heading">
              <h2>{t.preferences}</h2>
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
                 <input type="checkbox" id="frugal" disabled={preferences.independentDrinks} checked={!preferences.independentDrinks && preferences.frugalMode} onChange={e => setPreferences({...preferences, frugalMode: e.target.checked})} />
                 <label htmlFor="frugal">{t.frugalMode}</label>
              </div>
              <label className="compact-number-row">
                <span>{language === 'en' ? 'Count' : '数量'}</span>
                <input type="number" value={preferences.recommendationCount} onChange={e => setPreferences({...preferences, recommendationCount: Number(e.target.value)})} />
              </label>
              <button className="primary-action compact-generate-button" onClick={generateRecommendations} disabled={loading}>{loading ? '正在生成...' : t.generate}</button>
            </div>
            {generationStatus && <div className="generation-status" role="status" aria-live="polite">{generationStatus}</div>}
         </aside>

         <section className="panel main-panel">
            <h2>{t.generate}</h2>
            <div className="results-area">
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
                           <span key={`${dimension.label}-${index}`}>{dimension.label} {dimension.value}/10</span>
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
                       {(rec.steps ?? []).map((step: string, index: number) => <li key={index}>{step}</li>)}
                     </ol>
                   </section>
                   <section className="recipe-section">
                     <h4>{uiLabels.remaining}</h4>
                     {(rec.remainingIngredients ?? []).length > 0
                       ? <ul>{rec.remainingIngredients.map((ingredient: string, index: number) => <li key={index}>{ingredient}</li>)}</ul>
                       : <p>{uiLabels.noMeasurableLeftovers}</p>}
                   </section>
                   <button
                     className={`select-recipe ${selectedRecommendationIds.includes(getRecommendationId('main', rec, i)) ? 'selected' : ''}`}
                     onClick={() => toggleRecommendationSelection(getRecommendationId('main', rec, i))}
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
              <div className="results-area leftover-results">
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
                            <span key={`${dimension.label}-${index}`}>{dimension.label} {dimension.value}/10</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <section className="recipe-section"><h4>{uiLabels.intro}</h4><p>{rec.reason}</p></section>
                    <section className="recipe-section"><h4>{uiLabels.ingredients}</h4><ul>{(rec.ingredients ?? []).map((ingredient: string, index: number) => <li key={index}>{ingredient}</li>)}</ul></section>
                    <section className="recipe-section"><h4>{uiLabels.steps}</h4><ol>{(rec.steps ?? []).map((step: string, index: number) => <li key={index}>{step}</li>)}</ol></section>
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
            <h2>{t.favorites}</h2>
            <div className="history-list">
               {favorites.map(f => (
                  <div key={f.id} className="history-item">
                     <span className="history-recipe">{f.name}</span>
                     <div style={{fontSize: '0.75rem', color: '#999'}}>{'★'.repeat(f.rating)}</div>
                  </div>
               ))}
            </div>
         </aside>
      </div>
    </main>
  );
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
  if (language === 'zh' && key === 'room') return '常温';
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
      tasteBalance: '口味平衡',
      inventoryFit: '库存匹配',
      preferenceMatch: '偏好匹配',
      simplicity: '制作简易',
      frugality: '节俭利用'
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
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z%]+|ml|g|oz|杯|克|毫升|个|份)?\s*(.*)$/);
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
