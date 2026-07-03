// ============================================================
//  Chibi Mafia Boss — Этап 1-3 (каркас, поведение, меню)
// ============================================================

const EXT_PATH = new URL('.', import.meta.url).href;
// ============================================================
//  ЗВУКИ
// ============================================================
function playSound(name) {
    try {
        const audio = new Audio(EXT_PATH + 'sounds/' + name);
        audio.volume = 0.5; // громкость 0.0–1.0, настрой под себя
        audio.play().catch(e => console.warn('[ChibiBoss] не удалось проиграть звук:', name, e));
    } catch (e) {
        console.warn('[ChiboBoss] ошибка загрузки звука:', name, e);
    }
}
// проигрывает заранее загруженный звук (без подвисаний на старте анимации)
function playCachedSound(audioObj) {
    if (!audioObj) return;
    try {
        audioObj.currentTime = 0;   // перематываем в начало
        audioObj.play().catch(e => console.warn('[ChibiBoss] звук не проигрался:', e));
    } catch (e) {
        console.warn('[ChibiBoss] ошибка проигрывания кэш-звука:', e);
    }
}


// ------------------------------------------------------------
//  ПОДГОНКА: смещение босса при работе за столом
//  Босс встаёт по центру стола. Если нужно опустить/сдвинуть
//  рабочий спрайт — меняй эти числа (в пикселях).
//   WORK_OFFSET_X: + вправо / - влево
//   WORK_OFFSET_Y: + вниз  / - вверх
// ------------------------------------------------------------

const WORK_OFFSET_X = 0;
const WORK_OFFSET_Y = 0;

const CHAIR_OFFSET_X = 0;
const CHAIR_OFFSET_Y = 0;

// ------------------------------------------------------------
//  СИСТЕМЫ: стресс и привязанность
// ------------------------------------------------------------
// Привязанность (0–100)
const AFFECTION_DECAY_PER_HOUR = 5;        // падает на 5% в час без взаимодействия
const AFFECTION_GAIN_PER_PET = 2;          // +2% за каждую секунду поглаживания

// Стресс (0–100)
const STRESS_THRESHOLD_NORMAL = 40;        // выше 40% начинает нервничать
const STRESS_THRESHOLD_HIGH = 70;          // выше 70% нервничает очень часто
const STRESS_FROM_WORK_PER_MIN = 3;        // +3% стресса за минуту работы
const STRESS_RELIEF_FROM_PET_PER_SEC = 2; // -2% стресса за секунду поглаживания


// Интервалы систем (мс)
const SYSTEM_TICK_INTERVAL = 30000;        // проверка систем каждые 30 сек
const PET_TICK_INTERVAL = 1000;            // обновление при поглаживании каждую секунду


// ------------------------------------------------------------
//  КОНФИГ АНИМАЦИЙ
// ------------------------------------------------------------
const ANIMATIONS = {
    idle_front:       { type: 'apng' },
    idle_half_left:   { type: 'apng' },
    idle_half_right:  { type: 'apng' },
    idle_left:        { type: 'apng' },
    idle_right:       { type: 'apng' },
    idle_back:        { type: 'apng' },

    walk_left:        { type: 'apng' },
    walk_right:       { type: 'apng' },
    walk_up:          { type: 'apng' },
    walk_down:        { type: 'apng' },

    grab_left:        { type: 'frames', count: 4, fps: 20, loop: false },
    grab_right:       { type: 'frames', count: 4, fps: 20, loop: false },
    dragging_left:    { type: 'apng' },
    dragging_right:   { type: 'apng' },
    release_left:     { type: 'frames', count: 4, fps: 20, loop: false },
    release_right:    { type: 'frames', count: 4, fps: 20, loop: false },

    smoke_start_right:{ type: 'frames', count: 14, fps: 7, loop: false },
    smoke_loop_right: { type: 'apng' },
    smoke_start_left: { type: 'frames', count: 14, fps: 7, loop: false },
    smoke_loop_left:  { type: 'apng' },

    phone_start_right:{ type: 'frames', count: 27, fps: 7, loop: false },
    phone_loop_right: { type: 'apng' },
    phone_end_right:  { type: 'frames', count: 8, fps: 7, loop: false },
    phone_start_left: { type: 'frames', count: 27, fps: 7, loop: false },
    phone_loop_left:  { type: 'apng' },
    phone_end_left:   { type: 'frames', count: 8, fps: 7, loop: false },

    pet_loop:         { type: 'apng' },
    work:             { type: 'apng' },
    stress:           { type: 'apng' },

    chair_sit:        { type: 'apng' },
    chair_sip:        { type: 'frames', count: 9, fps: 7, loop: false },

    // ← НОВЫЕ АНИМАЦИИ: падение и сидение
    fall_right:       { type: 'frames', count: 8, fps: 7, loop: false },
    fall_left:        { type: 'frames', count: 8, fps: 7, loop: false },
    sit_right:        { type: 'apng' },
    sit_left:         { type: 'apng' },
    standup_right:    { type: 'frames', count: 2, fps: 10, loop: false },
    standup_left:     { type: 'frames', count: 2, fps: 10, loop: false },
};


// ------------------------------------------------------------
//  НАСТРОЙКИ
// ------------------------------------------------------------
const SETTINGS_KEY = 'chibiBoss_settings';
const POS_KEY      = 'chibiBoss_pos';

const defaultSettings = {
    enabled: true,
    name: 'Boss',
    tempo: 'normal',
    deskEnabled: true,
    chairEnabled: true,      // ← ДОБАВЬ ЭТУ СТРОКУ
    affection: 60,
    stress: 20,
    lastUpdate: Date.now(),
    gameDifficulty: 'normal',
};




function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
    } catch (e) {
        return { ...defaultSettings };
    }
}

// ------------------------------------------------------------
//  РАСЧЁТ СИСТЕМ: привязанность и стресс
// ------------------------------------------------------------

// обновить системы на основе прошедшего времени
function updateSystems() {
    if (!settings.enabled) return; // ← НОВАЯ СТРОКА: если персонаж выключен — ничего не делаем

    const now = Date.now();
    let elapsed = now - (settings.lastUpdate || now);


    // ЗАЩИТА: если прошло больше 2 минут — значит вкладка была неактивна.
    // Не засчитываем это время (иначе онлайн/стрики накрутятся за время отсутствия).
    const MAX_ELAPSED = 2 * 60 * 1000; // 2 минуты в миллисекундах
    if (elapsed > MAX_ELAPSED) {
        elapsed = SYSTEM_TICK_INTERVAL; // засчитываем только один обычный тик
    }

    const hoursElapsed = elapsed / (1000 * 60 * 60);

    // падение привязанности со временем
    settings.affection = Math.max(0, settings.affection - AFFECTION_DECAY_PER_HOUR * hoursElapsed);

    // рост стресса при низкой привязанности.
    const bossWorking = behavior && behavior.busy && behavior.lastAction === 'work';
    const bossResting = behavior && behavior.busy && behavior.lastAction === 'chair';

    if (bossWorking) {
        // стресс растёт постепенно, пока босс работает за столом
        const workMinutes = elapsed / (1000 * 60);
        settings.stress = Math.min(100, settings.stress + STRESS_FROM_WORK_PER_MIN * workMinutes);
    } else if (!bossResting) {
        // обычная логика (в кресле стресс снижают глотки, поэтому кресло пропускаем)
        if (settings.affection < 30) {
            settings.stress = Math.min(100, settings.stress + hoursElapsed * 8);
        } else if (settings.affection < 50) {
            settings.stress = Math.min(100, settings.stress + hoursElapsed * 4);
        } else {
            settings.stress = Math.max(0, settings.stress - hoursElapsed * 2);
        }
    }


    settings.lastUpdate = now;
    saveSettings(settings);

    // ПРОВЕРКА СМЕНЫ ДНЯ для workToday
    const today = getTodayStr();
    if (progress.workTodayDate !== today) {
        progress.workToday = 0;
        progress.workTodayDate = today;
    }

    // стрики и онлайн-время (уже с безопасным elapsed)
    updateStreaks(elapsed);
    progress.totalOnlineSeconds += elapsed / 1000;
    saveProgress();
    checkGiftProgress();
}





// тик систем каждые 30 сек
function startSystemsLoop() {
    setInterval(() => {
        updateSystems();
        if (menuOpen) updateIndicators();
    }, SYSTEM_TICK_INTERVAL);
}


// поглаживание: +привязанность, -стресс
let petTimer = null;
let petAudio = null;

function startPetTick() {
    if (petTimer) return;
    petTimer = setInterval(() => {
        if (pettingDown) {
            settings.affection = Math.min(100, settings.affection + AFFECTION_GAIN_PER_PET);
            settings.stress = Math.max(0, settings.stress - STRESS_RELIEF_FROM_PET_PER_SEC);
            saveSettings(settings);
            progress.petSeconds++;
            saveProgress();
        }
    }, PET_TICK_INTERVAL);
}

// работа: +стресс за каждую минуту
function applyWorkStress(durationMs) {
    const minutes = durationMs / (1000 * 60);
    settings.stress = Math.min(100, settings.stress + STRESS_FROM_WORK_PER_MIN * minutes);
    saveSettings(settings);
}
// игры: снижают стресс (отвлекают босса)
const STRESS_RELIEF_PER_MOVE = 0.5; // -0.5% за каждый ход в игре
const STRESS_RELIEF_PER_GAME = 3;   // -3% за завершённую партию


function relieveStressFromGame(amount) {
    settings.stress = Math.max(0, settings.stress - amount);
    saveSettings(settings);
    if (menuOpen) updateIndicators(); // обновить индикатор, если меню открыто
}

function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function loadPos() {
    try {
        const raw = localStorage.getItem(POS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function savePos(x, y) {
    localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
}

let settings = loadSettings();

// ============================================================
//  ХРАНИЛИЩЕ: подарки и письма
// ============================================================
const GIFTS_KEY   = 'chibiBoss_gifts';
const LETTERS_KEY = 'chibiBoss_letters';

// определения всех 25 подарков
const GIFT_DEFS = [
    { id:1,  name:'Коробка с роскошными сладостями', hint:'Держи стресс < 10% два часа подряд', desc:'Трюфели из тёмного шоколада. Кондитер плакал, делая их, но это были слёзы счастья. Наверное.' },
    { id:2,  name:'Подвеска с гравировкой', hint:'Погладь босса 50 раз', desc:'Золото, твоё имя, и тонкий намёк, что теперь ты официально под защитой Семьи. Носи не снимая.' },
    { id:3,  name:'Старая фотография в рамке', hint:'Выиграй 3 партии в шашки', desc:'Серебряная рамка, гравировка «Только ты». Снимок сделан без твоего ведома, но из самых нежных побуждений.' },
    { id:4,  name:'Набор редкого чая', hint:'Привязанность > 80% три часа подряд', desc:'Чай с острова, название которого нельзя произносить вслух. Достали его... скажем так, по знакомству.' },
    { id:5,  name:'Шкатулка из оливкового дерева', hint:'Отправь на работу 10 раз', desc:'Тёплая, пахнет деревом, с твоими инициалами. Внутри пусто. Пока. Босс знает, чем её наполнить.' },
    { id:6,  name:'Блокнот ручной работы', hint:'Выиграй крестики-нолики 5 раз', desc:'Кожаная обложка. На первой странице: «Пиши сюда желания. Исполню любое. Вопросы решаемы».' },
    { id:7,  name:'Футляр с духами', hint:'Стресс < 20% шесть часов подряд', desc:'Аромат создан под тебя одну. Парфюмер подписал бумагу о неразглашении. Так, на всякий случай.' },
    { id:8,  name:'Перчатки из тончайшей замши', hint:'Суммарно 5 часов онлайн', desc:'Мягче, чем взгляд босса, когда он думает, что ты не смотришь. Шёлковая подкладка прилагается.' },
    { id:9,  name:'Швейцарские часы Vacheron Constantin', hint:'Сыграй 20 партий любой игры', desc:'В сапфирах. Идут точнее, чем планы Семьи. Теперь ты всегда будешь знать, сколько ждать босса.' },
    { id:10, name:'Браслет с жемчугом и бриллиантами', hint:'Привязанность 100%', desc:'Застёжка-цветок, три ряда камней. Сияет в темноте — чтобы босс находил тебя даже с закрытыми глазами.' },
    { id:11, name:'Сумка Hermès Birkin', hint:'Поглаживание: 30 минут суммарно', desc:'Единственный экземпляр в мире. Лист ожидания на такую — десять лет. У босса свои методы.' },
    { id:12, name:'Пальто из кашемира и соболя', hint:'Выиграй 10 партий суммарно', desc:'Сшито в одном экземпляре. В нём ты выглядишь как человек, которому не задают лишних вопросов.' },
    { id:13, name:'Кольцо с изумрудом', hint:'Стресс < 10% один час подряд', desc:'Камень чистейшей воды в жёлтом золоте. Босс уверяет, что добыл его честно. Босс часто так говорит.' },
    { id:14, name:'Антикварная шкатулка из палисандра', hint:'Привязанность > 90% два часа подряд', desc:'С потайным отделением, инкрустация перламутром. Идеально для секретов. У вас ведь теперь общие.' },
    { id:15, name:'Кабриолет Bentley Continental', hint:'Отправь на работу 3 раза за день', desc:'Твой любимый цвет, именные номера. Босс лично проследил, чтобы в багажнике было... просторно.' },
    { id:16, name:'Шуба из песца и норки', hint:'10 часов онлайн суммарно', desc:'В пол, с капюшоном, отделка серебром. В ней холодно только врагам. А у тебя их теперь нет.' },
    { id:17, name:'Ожерелье от Graff', hint:'Босс сам пошёл работать 5 раз', desc:'Столько каратов, что освещает комнату. И заодно лица всех, кто посмел косо взглянуть.' },
    { id:18, name:'Картина импрессиониста', hint:'Увидь стресс-анимацию 10 раз', desc:'Гений, о котором забыли. На аукционе из-за неё едва не подрались. Босс предложил аргумент повесомее.' },
    { id:19, name:'Винный погреб из 100 бутылок', hint:'Суммарно 20 часов онлайн', desc:'Каждая бутылка с историей, половина историй — с моралью «не переходи дорогу Семье».' },
    { id:20, name:'Чистокровный жеребец', hint:'Выиграй 5 партий в шашки на сложном', desc:'Арабских кровей, с конюшней и конюхом. Зовут его... как захочешь. Босс уже всё уладил с документами.' },
    { id:21, name:'Остров в Карибском море', hint:'Привязанность > 80% десять часов подряд', desc:'Свой пляж, своя вилла, оформлен на тебя. На карте его нет. Так спокойнее, поверь.' },
    { id:22, name:'Частный самолёт Gulfstream', hint:'Выиграй крестики-нолики на сложном 10 раз', desc:'Салон из розового дерева, спальня на борту. Летит туда, куда скажешь. И не задаёт вопросов.' },
    { id:23, name:'Яхта', hint:'7 дней онлайн суммарно', desc:'Вертолётная площадка, команда из десяти человек. Все они немногословны и преданы. Как и положено.' },
    { id:24, name:'Дом в центре Парижа', hint:'Погладь босса 100 раз', desc:'Особняк на набережной, отремонтирован до последнего гвоздя. Прежний владелец... съехал. Внезапно.' },
    { id:25, name:'Бриллиант «Красное Сердце»', hint:'Выиграй 5 партий в шашки и 5 в крестики на сложном', desc:'50 карат, огранка в форме сердца. Босс не дарит сердце — он его отдаёт. Ключ от сейфа спрятан там, где ищут в последнюю очередь.' },
];




function loadGifts() {
    try {
        const raw = localStorage.getItem(GIFTS_KEY);
        // { unlocked: { [id]: dateStr }, pending: [id] }
        return raw ? JSON.parse(raw) : { unlocked: {}, pending: [] };
    } catch (e) { return { unlocked: {}, pending: [] }; }
}

function saveGifts(g) {
    localStorage.setItem(GIFTS_KEY, JSON.stringify(g));
}

function loadLetters() {
    try {
        const raw = localStorage.getItem(LETTERS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}

function saveLetters(arr) {
    localStorage.setItem(LETTERS_KEY, JSON.stringify(arr.slice(-200)));
}


let giftsData  = loadGifts();
let lettersData = loadLetters();


// ============================================================
//  НАСТРОЙКИ API (подключение + комментирование + письма)
// ============================================================
const API_SETTINGS_KEY = 'chibiBoss_api';

const defaultApiSettings = {
    mode: 'off',
    url: '',
    key: '',
    model: '',
    models: [],

    // --- профиль ST ---
    stProfile: '',

    // --- комментирование РП ---
    commentEnabled: false,       // босс комментирует ролевую
    personality: 'calm',         // 'calm' | 'possessive' | 'obsessed'
    contextDepth: 4,             // сколько последних сообщений РП брать в контекст
    frequency: 8,                // комментировать раз в N сообщений
    maxTokens: 200,              // максимальная длина ответа
    customCommentPrompt: '',     // свой промпт для КОММЕНТАРИЕВ (пусто = из comments.md)
    commentMemory: 3,            // сколько последних комментариев помнить

    // --- контекст для комментариев ---
    includePersona: false,               // учитывать описание персоны юзера
    includeCharacterDescription: false,  // учитывать карточку бота

    // --- письма ---
    lettersEnabled: false,       // босс генерирует письма
    customLetterPrompt: '',      // свой промпт для ПИСЕМ (пусто = из letters.md)
    letterMemory: 3,             // сколько последних писем помнить
};



function loadApiSettings() {
    try {
        const raw = localStorage.getItem(API_SETTINGS_KEY);
        return raw ? { ...defaultApiSettings, ...JSON.parse(raw) } : { ...defaultApiSettings };
    } catch (e) {
        return { ...defaultApiSettings };
    }
}

function saveApiSettings() {
    localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(apiSettings));
}

let apiSettings = loadApiSettings();
// ============================================================
//  ЗАГРУЗКА ПРОМПТОВ ИЗ ФАЙЛОВ prompts/
// ============================================================
const PROMPTS_CACHE = {}; // сюда сохраняются загруженные промпты, чтобы не грузить каждый раз

/**
 * Загружает текст промпта.
 * type = 'letter'  → берёт prompts/letters.md
 * type = 'comment' → берёт prompts/comments.md
 * Если пользователь задал свой промпт в настройках — используется он.
 */
async function loadPromptTemplate(type) {
    // 1. Если задан свой промпт — используем его
    const customKey = type === 'letter' ? 'customLetterPrompt' : 'customCommentPrompt';
    if (apiSettings[customKey] && apiSettings[customKey].trim()) {
        return apiSettings[customKey].trim();
    }

    // 2. Если уже загружали раньше — берём из кэша
    if (PROMPTS_CACHE[type]) {
        return PROMPTS_CACHE[type];
    }

    // 3. Загружаем из файла
    const filename = type === 'letter' ? 'letters.md' : 'comments.md';
    try {
        const response = await fetch(`${EXT_PATH}prompts/${filename}?v=${Date.now()}`);
        if (!response.ok) throw new Error('Не удалось загрузить файл');
        const text = await response.text();
        PROMPTS_CACHE[type] = text;
        return text;
    } catch (e) {
        console.warn(`[ChibiBoss] не удалось загрузить промпт ${filename}:`, e);
        return ''; // запасной пустой вариант
    }
}

// ============================================================
//  КОММЕНТИРОВАНИЕ РП
// ============================================================
const CHAT_SELECTOR = '#chat';   // окно сообщений ST; поменяй, если иное

let commentMsgCount = 0;         // счётчик новых сообщений с прошлого комментария
let commentTarget = 0;           // на каком счётчике сработать (берётся из frequency)
let commentInProgress = false;   // идёт цикл комментирования
let commentBubbleSticky = false; // пузырёк "залип" на долгое время

// выбрать порог срабатывания с лёгкой случайностью (±1 для живости)
function rollCommentTarget() {
    const base = Math.max(2, apiSettings.frequency || 8);
    const jitter = Math.floor(Math.random() * 3) - 1; // -1, 0 или +1
    commentTarget = Math.max(2, base + jitter);
}

// описание характера босса (универсальное для комментариев и писем)
function getPersonalityLine(type = 'comment') {
    const lines = {
        possessive: {
            comment: 'You are POSSESSIVE. You watch the user\'s roleplay closely and get jealous when they grow close to anyone in it. Romance in their RP irritates you; danger to them alarms you.',
            letter: 'You are POSSESSIVE: you watch over the user closely, you get visibly jealous, you dislike when they grow close to anyone else in their roleplay.'
        },
        obsessed: {
            comment: 'You are OBSESSED. Your devotion is unhealthy and total. Any affection the user shows toward an RP character wounds you deeply; you fixate, you sulk, you cling.',
            letter: 'You are OBSESSED: your devotion borders on unhealthy, you fixate on every detail about the user, jealousy and longing bleed into everything you write.'
        },
        calm: {
            comment: 'You are CALM. Composed, dry-humored, hard to rattle. You comment with detached irony and only real danger to the user truly moves you.',
            letter: 'You are CALM: composed and dry-humored, your affection shows through subtle remarks rather than open displays.'
        }
    };

    const personality = apiSettings.personality || 'calm';
    return lines[personality]?.[type] || lines.calm[type];
}

// ============================================================
//  ID ТЕКУЩЕГО ЧАТА (для отдельной памяти на каждый чат)
// ============================================================
function getCurrentChatId() {
    try {
        const ctx = SillyTavern.getContext();

        // Пробуем несколько способов получить ID чата
        if (ctx.chatId) return String(ctx.chatId);
        if (ctx.chat_metadata?.chat_id) return String(ctx.chat_metadata.chat_id);
        if (ctx.sessionId) return String(ctx.sessionId);

        // Групповой чат
        if (ctx.groupId) return 'group_' + String(ctx.groupId);

        // Одиночный чат — комбинируем имя персонажа + ID
        if (ctx.characterId !== undefined) {
            const char = ctx.characters?.[ctx.characterId];
            const charName = char?.name || char?.avatar || ctx.name2 || '';
            if (charName) return 'char_' + charName.replace(/\s+/g, '_');
        }

        return 'default';
    } catch (e) {
        console.warn('[ChibiBoss] ошибка getCurrentChatId:', e);
        return 'default';
    }
}


// ============================================================
//  БЛОК ПАМЯТИ — ЧТО БОСС ГОВОРИЛ/ПИСАЛ В ПРОШЛЫЙ РАЗ
// ============================================================

function buildBossMemoryBlock(type = 'comment') {
    const memorySize = type === 'letter'
        ? (apiSettings.letterMemory ?? 3)
        : (apiSettings.commentMemory ?? 3);

    const n = Math.max(0, memorySize);
    if (!n) return '';

    let filtered;

    if (type === 'letter') {
        // Для писем — берём ВСЕ письма (без фильтра по чату)
        filtered = lettersData.filter(l => l.type === 'letter');
    } else {
        // Для комментариев — фильтруем по текущему чату
        const currentChat = getCurrentChatId();
        filtered = lettersData.filter(l => l.type === 'comment' && l.chatId === currentChat);
    }

    console.log(`[ChibiBoss] buildBossMemoryBlock(${type}): найдено записей=${filtered.length}, нужно последних=${n}`);

    const recent = filtered.slice(-n);
    if (!recent.length) return '';

    const lines = recent.map(l => `- "${l.text.replace(/\s+/g, ' ').trim()}"`).join('\n');
    const label = type === 'comment'
        ? 'Your recent remarks (do NOT repeat them, keep continuity, evolve the mood):'
        : 'Your recent letters (do NOT repeat their content or phrasing, say something new):';

    return `\n\n<your_recent_output>\n${label}\n${lines}\n</your_recent_output>`;
}




// ============================================================
//  СИСТЕМНЫЙ ПРОМПТ (усиленный, с раскрытием персоны)
// ============================================================
async function buildSystemPrompt(type = 'comment') {
    // Загружаем шаблон промпта (из файла или из своих настроек)
    const template = await loadPromptTemplate(type);
    if (!template) {
        console.warn('[ChibiBoss] промпт пустой — использую запасной');
        return type === 'comment'
            ? 'You are a tiny mafia boss. Comment on the roleplay in one short line in Russian.'
            : 'You are a tiny mafia boss. Write a short letter to the user in Russian.';
    }

    const name = settings.name || 'Boss';
    const personalityLine = getPersonalityLine(type);

    // Настроение по стрессу/привязанности (подставляется в {{mood_adjective}})
    let moodAdj = 'neutral';
    if (settings.stress > 70) moodAdj = 'tense, sharp';
    else if (settings.stress > 40) moodAdj = 'irritable';
    else if (settings.affection > 80) moodAdj = 'warm, possessive';
    else if (settings.affection < 30) moodAdj = 'cold, distant';

    let personaBlock = '';
    let charBlock = '';

    try {
        const ctx = SillyTavern.getContext();

        // Персона: в письмах всегда, в комментариях — по галочке
        if (type === 'letter' || apiSettings.includePersona) {
            let personaText = resolveSTMacro(ctx, '{{user_persona}}');

            // Дополнительная попытка: прямой доступ к описанию персоны
            if (!personaText || !personaText.trim()) {
                try {
                    const charId = ctx.characterId;
                    if (ctx.characters && ctx.characters[charId]) {
                        // это карточка бота, не персона — пропускаем
                    }
                    // Ищем персону через глобальные переменные ST
                    if (typeof power_user !== 'undefined' && power_user.personas) {
                        const key = power_user.default_persona || ctx.name1 || '';
                        const val = power_user.personas[key];
                        personaText = typeof val === 'string' ? val : val?.description || '';
                    }
                } catch(e2) {}
            }

            const personaName = ctx.name1 || 'User';
            if (personaText && personaText.trim()) {
                personaBlock = `<user_persona name="${personaName}">\n${personaText.trim()}\n</user_persona>`;
                console.log('[ChibiBoss] Персона найдена:', personaText.slice(0, 80));
            } else {
                console.warn('[ChibiBoss] Персона НЕ найдена. name1:', ctx.name1);
            }
        }

        // Карточка бота: только в комментариях и только по галочке
        if (type === 'comment' && apiSettings.includeCharacterDescription) {
            const charName = ctx.characterName || ctx.name2 || 'Character';
            let charDesc = '';

            if (ctx.characters && ctx.characterId !== undefined) {
                const char = ctx.characters[ctx.characterId];
                charDesc = char?.description || char?.data?.description || '';
            }

            if (charDesc && charDesc.trim()) {
                charBlock = `<character name="${charName}">\n${charDesc.trim()}\n</character>`;
                console.log('[ChibiBoss] Карточка бота найдена:', charDesc.slice(0, 80));
            } else {
                console.warn('[ChibiBoss] Карточка бота НЕ найдена. name2:', charName);
            }
        }
    } catch (e) {
        console.warn('[ChibiBoss] не удалось получить контекст ST для промпта:', e);
    }


    // Подставляем значения в шаблон вместо {{...}}
    const result = template
        .replace(/{{boss_name}}/g, name)
        .replace(/{{personality_line}}/g, personalityLine)
        .replace(/{{mood_adjective}}/g, moodAdj)
        .replace(/{{persona_block}}/g, personaBlock)
        .replace(/{{char_block}}/g, charBlock);

    return result;
}



// ============================================================
//  РАСКРЫТИЕ МАКРОСОВ SILLYTAVERN
// ============================================================
function resolveSTMacro(context, macro) {
    // 1. Пробуем родной substituteParams
    if (typeof context.substituteParams === 'function') {
        try {
            const resolved = context.substituteParams(macro);
            if (resolved && resolved !== macro && resolved.trim()) return resolved;
        } catch (e) {
            console.warn('[ChibiBoss] substituteParams failed for', macro, e);
        }
    }

    // 2. Фоллбэки
    try {
        if (macro === '{{user_persona}}' || macro === '{{persona}}') {
            // Способ 1: через name1 и persona description (самый надёжный)
            if (context.persona) return context.persona;

            // Способ 2: через powerUser.personas
            const pu = context.powerUser;
            if (pu && pu.personas) {
                const activeKey = pu.default_persona || context.name1 || '';
                if (activeKey && pu.personas[activeKey]) {
                    const desc = typeof pu.personas[activeKey] === 'string'
                        ? pu.personas[activeKey]
                        : pu.personas[activeKey]?.description;
                    if (desc) return desc;
                }
                // Запасной: первая персона с описанием
                for (const key of Object.keys(pu.personas)) {
                    const val = pu.personas[key];
                    const desc = typeof val === 'string' ? val : val?.description;
                    if (desc && desc.trim()) return desc;
                }
            }

            // Способ 3: через substituteParams с другим макросом
            if (typeof context.substituteParams === 'function') {
                for (const alt of ['{{persona}}', '{{user}}']) {
                    try {
                        const r = context.substituteParams(alt);
                        if (r && r !== alt && r.trim()) return r;
                    } catch(e) {}
                }
            }
        }

        if (macro === '{{authornote}}') {
            const cm = context.chatMetadata;
            if (cm) {
                if (cm.note_to_self && typeof cm.note_to_self === 'object' && cm.note_to_self.note) {
                    return cm.note_to_self.note;
                }
                if (cm.note_to_self && typeof cm.note_to_self === 'string' && cm.note_to_self.trim()) {
                    return cm.note_to_self;
                }
                if (cm.authornote_prompt && typeof cm.authornote_prompt === 'string') {
                    return cm.authornote_prompt;
                }
            }
            const es = context.extensionSettings;
            if (es?.note_to_self) {
                if (typeof es.note_to_self === 'object') {
                    return es.note_to_self.default_note || es.note_to_self.note || es.note_to_self.content || '';
                }
                if (typeof es.note_to_self === 'string') return es.note_to_self;
            }
            return '';
        }
    } catch (e) {
        console.warn('[ChibiBoss] Fallback macro resolution failed for', macro, e);
    }

    return '';
}


// ============================================================
//  ОЧИСТКА РП-СООБЩЕНИЙ ДЛЯ КОНТЕКСТА
// ============================================================

// Очистить одно сообщение РП перед вставкой в промпт
function cleanRpMessage(text) {
    if (!text) return '';
    let s = cleanAiText(text);

    // ← НОВОЕ: подставить макросы ST, чтобы модель не видела {{user}}/{{char}}
    try {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.substituteParams === 'function') {
            s = ctx.substituteParams(s);
        }
    } catch (e) {
        // Контекст недоступен — не критично, идём дальше
    }

    return s.trim();
}


// собрать пользовательскую часть (лог РП)
function buildCommentUserPrompt() {
    let log = '';
    try {
        const ctx = SillyTavern.getContext();
        const depth = Math.max(1, apiSettings.contextDepth || 4);
        const recent = (ctx.chat || []).slice(-depth);
        log = recent
            .map(m => `[${m.is_user ? 'User' : (m.name || 'Char')}]: ${cleanRpMessage(m.mes)}`)
            .filter(line => line.replace(/^\[[^\]]+\]:\s*/, '').trim())
            .join('\n\n');
    } catch (e) {
        log = '';
    }

    const now = new Date();
    const currentTime = now.toLocaleString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    if (!log) return `CURRENT TIME: ${currentTime}\n\nThe roleplay log is empty. Mutter something fitting about the quiet.` +
                     buildBossMemoryBlock('comment');

    const base = `CURRENT TIME: ${currentTime}\n\nHere is the recent roleplay you are secretly watching:\n\n` + log +
                 '\n\nNow give your single spoken remark.';
    return base + buildBossMemoryBlock('comment');
}


// ============================================================
//  УНИВЕРСАЛЬНАЯ ОЧИСТКА ТЕКСТА ОТ МУСОРА
// ============================================================
// Вырезает thinking/reasoning-теги, любой HTML, служебные обёртки,
// markdown-заборы и лишние кавычки. Используется и для ответов ИИ,
// и для чистки контекста РП перед отправкой в модель.
function cleanAiText(raw) {
    if (!raw) return '';
    let s = String(raw);

    // 1. Вырезать блоки размышлений вместе с содержимым
    s = s.replace(/<(thinking|think|thought|reasoning|reason|antml:thinking)>[\s\S]*?<\/\1>/gi, '');

    // 2. Вырезать любые одиночные/парные HTML/XML-теги (<doctrine html>, <p>, </div> и т.п.)
    s = s.replace(/<\/?[a-z][^>]*>/gi, '');

    // 3. Убрать markdown-заборы кода
    s = s.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '');

    // 4. Срезать строки формата [Имя]: ... (если модель вернула диалог)
    s = s.replace(/^\s*\[[^\]]+\]:\s*/gm, '');

    // 5. Декодировать HTML-сущности (&quot; &amp; и т.д.)
    const txt = document.createElement('textarea');
    txt.innerHTML = s;
    s = txt.value;

    // 6. Убрать кавычки-обёртки по краям и лишние пробелы
    s = s.replace(/^["'«»`\s]+/, '').replace(/["'«»`\s]+$/, '').trim();

    return s;
}

// очистить ответ модели (комментарий)
function cleanCommentResponse(raw) {
    const s = cleanAiText(raw);
    return s || null;
}

// извлечь текст письма из ответа ИИ
function parseLetterResponse(raw) {
    const s = cleanAiText(raw);
    if (!s) return null;
    return { text: s };
}


// влияние увиденного РП на стресс/привязанность, зависит от характера
function applyCommentMood() {
    const log = buildCommentUserPrompt().toLowerCase();

    // грубые маркеры: опасность для юзера и романтика с ботом
    const danger = /(умир|кров|нож|пистолет|стрел|убь|опасн|ранен|угроз|напал|спаса)/.test(log);
    const romance = /(люблю|любовь|поцелу|обня|нежн|сердце|милый|дорогой|страст|желани)/.test(log);

    let dStress = 0, dAff = 0;

    if (apiSettings.personality === 'calm') {
        // спокойный: почти не реагирует, кроме реальной опасности
        if (danger) dStress += 6;
    } else if (apiSettings.personality === 'possessive') {
        // собственнический: опасность + ревность к романтике
        if (danger) dStress += 10;
        if (romance) { dStress += 8; dAff -= 3; }
    } else if (apiSettings.personality === 'obsessed') {
        // одержимый: реагирует сильнее на всё
        if (danger) dStress += 14;
        if (romance) { dStress += 14; dAff -= 6; }
        if (!danger && !romance) dStress += 2; // фоновая тревожность
    }

    if (dStress || dAff) {
        settings.stress = Math.max(0, Math.min(100, settings.stress + dStress));
        settings.affection = Math.max(0, Math.min(100, settings.affection + dAff));
        saveSettings(settings);
    }
}
// координаты у нижнего края окна чата (куда идёт босс)
function getChatTargetPos() {
    const chatEl = document.querySelector(CHAT_SELECTOR);
    if (!chatEl) return clampToScreen(window.innerWidth / 2 - 62, window.innerHeight - 150);
    const r = chatEl.getBoundingClientRect();
    return clampToScreen(r.right - 140, r.bottom - 140);
}

// залипающий пузырёк с коллбэком — не исчезает при перетаскивании
let commentBubbleActive = false;
let commentBubbleTimer  = null;

function showStickyCommentBubble(text, durationMs, onDone) {
    if (!bubbleEl) {
        bubbleEl = document.createElement('div');
        bubbleEl.id = 'chibiBoss-bubble';
        document.getElementById('chibiBoss-layer').appendChild(bubbleEl);
    }
    clearTimeout(bubbleTimer);
    clearTimeout(commentBubbleTimer);
    commentBubbleActive = true;
    bubbleEl.textContent = text;

    // ← КРИТИЧНО: позиционируем ПОСЛЕ того, как браузер пересчитал высоту
    requestAnimationFrame(() => {
        positionCommentBubble();
        bubbleEl.classList.add('show');
    });

    commentBubbleTimer = setTimeout(() => {
        bubbleEl.classList.remove('show');
        commentBubbleActive = false;
        if (onDone) onDone();
    }, durationMs);
}


function positionCommentBubble() {
    if (!bubbleEl || !commentBubbleActive) return;
    const x = parseFloat(actorEl.style.left) || 0;
    const y = parseFloat(actorEl.style.top) || 0;

    // ← Ждём, пока браузер рассчитает высоту (может быть 0 на первом кадре)
    const bubbleH = bubbleEl.offsetHeight || 80;  // увеличен запасной размер
    const top = Math.max(4, y - bubbleH - 14);

    bubbleEl.style.left      = (x + 62) + 'px';
    bubbleEl.style.top       = top + 'px';
    bubbleEl.style.transform = 'translateX(-50%)';
}


// полный цикл: прерваться → идти к чату → спиной → генерить → пузырёк → вернуться
async function runCommentCycle(force = false) {
    if (!apiIsConnected()) return;
    if (!force && !apiSettings.commentEnabled) return;
    if (commentInProgress) {
        console.warn('[ChibiBoss] комментарий уже идёт — пропускаю запуск');
        return;
    }
    commentInProgress = true;

    let prevAction = null;
    let wasIdle = true;

try {
    prevAction = behavior?.lastAction;
    wasIdle = !behavior?.busy;
    if (behavior) behavior.leaveChairMode();
    if (behavior) {
        clearTimeout(behavior.timer);
        clearTimeout(behavior.holdTimer);
        if (behavior.walkRaf) {
            cancelAnimationFrame(behavior.walkRaf);
            behavior.walkRaf = null;
        }
        behavior.busy = true;
        behavior.paused = false;
    }

    // ← НОВОЕ: ждём один кадр после leaveChairMode, чтобы браузер зафиксировал сброс
    await new Promise(resolve => requestAnimationFrame(resolve));

    const target = getChatTargetPos();
    // принудительно запускаем анимацию ходьбы ПЕРЕД walkTo
    const curX = parseFloat(actorEl.style.left) || 0;
    const curY = parseFloat(actorEl.style.top) || 0;
    const dx = target.x - curX;
    const dy = target.y - curY;
    animator.play(walkAnimFor(dx, dy));

    await new Promise(resolve => behavior ? behavior.walkTo(target.x, target.y, resolve) : resolve());



        animator.play('idle_back');
        applyCommentMood();

        await new Promise(r => setTimeout(r, 3000));

        console.log('[ChibiBoss] запрашиваю комментарий у API...');
    const raw = await apiGenerateWithRetry(
        await buildSystemPrompt('comment'),
        buildCommentUserPrompt(),
        150,
        2
    );



        console.log('[ChibiBoss] RAW ОТВЕТ:', raw);

        const text = cleanCommentResponse(raw);

        if (!text) {
            console.warn('[ChibiBoss] комментарий пустой — отмена (счётчик НЕ сбрасываем)');
            return;
        }

        commentMsgCount = 0;
        rollCommentTarget();

        console.log('[ChibiBoss] комментарий готов:', text.slice(0, 60));

        showStickyCommentBubble(text, randomBetween(20000, 40000), () => {
            addLetter(text, 'comment');
        });

    } catch (e) {
        console.error('[ChibiBoss] ошибка цикла комментария:', e);
} finally {
    commentInProgress = false;

    // ← НОВОЕ: сбрасываем кнопку тестирования комментария
    const testCommentBtn = document.getElementById('cb-api-test-comment');
    if (testCommentBtn) testCommentBtn.disabled = false;

    if (!behavior) return;

    behavior.busy = false;
    if (!wasIdle && prevAction && prevAction !== 'pet') {
        switch (prevAction) {
            case 'smoke':  behavior.doSmoke();  break;
            case 'phone':  behavior.doPhone();  break;
            case 'stress': behavior.doStress(); break;
            case 'work':   behavior.resume();   break;
            case 'chair':  behavior.resume();   break;
            default:       behavior.resume();
        }
    } else {
        behavior.resume();
    }
}
}

// слушатель сообщений ST
function initCommentListener() {
    let es = null;
    let evt = null;

    try {
        const ctx = SillyTavern.getContext();
        es  = ctx.eventSource || (typeof eventSource !== 'undefined' ? eventSource : null);
        evt = ctx.eventTypes || ctx.event_types || (typeof event_types !== 'undefined' ? event_types : null);
    } catch (e) {
        es  = (typeof eventSource !== 'undefined') ? eventSource : null;
        evt = (typeof event_types !== 'undefined') ? event_types : null;
    }

    if (!es) {
        console.warn('[ChibiBoss] eventSource не найден — комментирование недоступно.');
        return;
    }

    // ОТПИСЫВАЕМСЯ ОТ СТАРОГО СЛУШАТЕЛЯ (если был)
    if (commentListener && evt) {
        const eventNames = [
            'MESSAGE_RECEIVED',
            'message_received',
            'CHARACTER_MESSAGE_RENDERED',
            'character_message_rendered',
        ];
        for (const name of eventNames) {
            const eventKey = evt[name];
            if (eventKey) {
                try {
                    es.off(eventKey, commentListener);
                } catch (e) {
                    // игнорируем ошибку отписки
                }
            }
        }
    }

    rollCommentTarget();
    console.log('[ChibiBoss] стартовая цель комментария:', commentTarget);

    // реагируем на ответ ИИ
    const onNewMessage = () => {
        if (!settings.enabled) return; // ← НОВАЯ СТРОКА: проверка включен ли персонаж
        if (!apiSettings.commentEnabled || !apiIsConnected()) return;
        if (commentInProgress) return;
        commentMsgCount++;
        console.log('[ChibiBoss] сообщение №', commentMsgCount, 'из', commentTarget);
        if (commentMsgCount >= commentTarget) {
            console.log('[ChibiBoss] ▶ запускаю комментарий');
            runCommentCycle();
        }
    };

    // СОХРАНЯЕМ ССЫЛКУ НА СЛУШАТЕЛЬ
    commentListener = onNewMessage;

    // пробуем все возможные названия события
    const eventNames = [
        'MESSAGE_RECEIVED',
        'message_received',
        'CHARACTER_MESSAGE_RENDERED',
        'character_message_rendered',
    ];

    let subscribed = false;
    for (const name of eventNames) {
        const eventKey = evt?.[name];
        if (eventKey) {
            console.log('[ChibiBoss] подписка на событие:', name, '→', eventKey);
            es.on(eventKey, commentListener);
            subscribed = true;
            break;
        }
    }

    if (!subscribed) {
        console.warn('[ChibiBoss] не удалось найти событие нового сообщения. Доступные события:', evt);
        console.warn('[ChibiBoss] комментирование работать НЕ будет.');
    } else {
        console.log('[ChibiBoss] слушатель комментариев подключён.');
    }
}


// удобный флаг: есть ли рабочее подключение
function apiIsConnected() {
    if (apiSettings.mode === 'st') {
        return !!(apiSettings.stProfile && getBossProfile(apiSettings.stProfile));
    }
    return apiSettings.mode === 'api' && !!(apiSettings.url && apiSettings.model);
}

// базовый URL от пользователя (без /v1, /models и т.д.)
function apiUserBase() {
    return (apiSettings.url || '').trim().replace(/\/+$/, ''); // убираем слэши справа
}

// варианты ПОЛНОГО адреса для СПИСКА МОДЕЛЕЙ (GET)
function apiModelsCandidates() {
    const u = apiUserBase();
    // всегда убираем /v1 /v2 и т.д. с конца — добавим сами в нужном порядке
    const base = u.replace(/\/v\d+$/, '').replace(/\/openai$/, '');
    const list = [];
    if (apiSettings.resolvedModelsUrl) list.push(apiSettings.resolvedModelsUrl); // рабочий первым
    list.push(base + '/openai/models');    // OnlySQ (OpenAI-совместимый)
    list.push(base + '/v1/models');        // самый стандартный
    list.push(base + '/models');           // без v1
    list.push(base + '/openai/v1/models'); // запасной вариант
    return [...new Set(list)];
}


// варианты ПОЛНОГО адреса для ЧАТА (POST)
function apiChatCandidates() {
    const u = apiUserBase();
    const base = u.replace(/\/v\d+$/, '').replace(/\/openai$/, '');
    const list = [];

    // Рабочий адрес (если найден ранее) — пробуем первым
    if (apiSettings.resolvedChatUrl) list.push(apiSettings.resolvedChatUrl);

    // OnlySQ (БЕЗ v1 — документация подтверждает)
    list.push(base + '/openai/chat/completions');

    // LinkAPI и стандарт OpenAI
    list.push(base + '/v1/chat/completions');
    list.push(base + '/chat/completions');

    // Запасной вариант (на случай нестандартных провайдеров)
    list.push(base + '/openai/v1/chat/completions');

    return [...new Set(list)];
}


// заголовки для запроса к своему API
function apiHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (apiSettings.key) h['Authorization'] = 'Bearer ' + apiSettings.key;
    return h;
}

// ----- ТЕСТ СОЕДИНЕНИЯ -----
// возвращает { ok: bool, message: string }
async function apiTestConnection() {
    // ---- Режим профиля таверны ----
    if (apiSettings.mode === 'st') {
        if (!apiSettings.stProfile) {
            return { ok: false, message: 'Профиль не выбран.' };
        }
        const profile = getBossProfile(apiSettings.stProfile);
        if (!profile) {
            return { ok: false, message: `Профиль "${apiSettings.stProfile}" не найден.` };
        }
        try {
            const ctx = SillyTavern.getContext();
            if (!ctx.ConnectionManagerRequestService) {
                return { ok: false, message: 'Сервис профилей недоступен.' };
            }
            return { ok: true, message: `Профиль "${profile.name}" подключён (${profile.api || '—'}, модель: ${profile.model || '—'}).` };
        } catch (e) {
            return { ok: false, message: 'Ошибка проверки профиля: ' + e.message };
        }
    }


    // ---- Режим прямого API ----
    if (apiSettings.mode === 'off') {
        return { ok: false, message: 'Подключение выключено.' };
    }
    if (!apiSettings.url) {
        return { ok: false, message: 'Укажите URL.' };
    }

    let lastError = '';
    for (const modelsUrl of apiModelsCandidates()) {
        try {
            const res = await fetch(modelsUrl, {
                method: 'GET',
                headers: apiHeaders(),
            });
            if (res.ok) {
                apiSettings.resolvedModelsUrl = modelsUrl;
                saveApiSettings();
                return { ok: true, message: 'Соединение успешно.' };
            }
            lastError = `Ошибка ${res.status}: ${res.statusText}`;
        } catch (e) {
            lastError = 'Не удалось подключиться: ' + e.message;
        }
    }
    return { ok: false, message: lastError || 'Не удалось подключиться.' };
}



// извлекает текст ответа из ЛЮБОГО формата:
// обычный JSON ИЛИ потоковый ответ (SSE, склеивает кусочки)
function extractApiText(rawBody) {
    if (!rawBody) return null;
    const body = String(rawBody).trim();

    // --- случай 1: потоковый ответ (строки вида "data: {...}") ---
    if (body.includes('data:')) {
        let acc = '';
        const lines = body.split('\n');
        for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
                const obj = JSON.parse(payload);
                const piece =
                    obj?.choices?.[0]?.delta?.content ??
                    obj?.choices?.[0]?.message?.content ??
                    obj?.choices?.[0]?.text ?? '';
                if (piece) acc += piece;
            } catch (e) { /* битый кусок — пропускаем */ }
        }
        if (acc.trim()) return acc;
    }

    // --- случай 2: обычный цельный JSON ---
    try {
        const data = JSON.parse(body);
        return (
            data?.choices?.[0]?.message?.content ??
            data?.choices?.[0]?.text ??
            data?.choices?.[0]?.delta?.content ??
            data?.content ??
            data?.response ??
            null
        );
    } catch (e) {
        // вообще не JSON — вернём как есть
        return body || null;
    }
}

async function apiGenerate(systemPrompt, userPrompt, maxTokens = 200) {
    // ---- Режим профиля таверны ----
    if (apiSettings.mode === 'st') {
        if (!apiSettings.stProfile) {
            console.warn('[ChibiBoss] профиль не выбран');
            return null;
        }
        try {
            return await generateViaBossProfile(systemPrompt, userPrompt, maxTokens);
        } catch (e) {
            console.error('[ChibiBoss] ошибка генерации через профиль:', e);
            return null;
        }
    }




    // ---- СТАРАЯ ВЕТКА: прямое API ----
    if (apiSettings.mode === 'off') {
        console.warn('[ChibiBoss] API выключен');
        return null;
    }
    if (!apiSettings.url || !apiSettings.model) {
        console.warn('[ChibiBoss] Неполные настройки API:', {
            url: apiSettings.url,
            model: apiSettings.model
        });
        return null;
    }


    const payload = {
        model: apiSettings.model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.9,
    };

    // ВЕСЬ список адресов, который реально будет перебираться
    const candidates = apiChatCandidates();
    console.log('[ChibiBoss] СПИСОК АДРЕСОВ ЧАТА (' + candidates.length + ' шт.):', candidates);

    for (const chatUrl of candidates) {
        try {
            console.log('[ChibiBoss] Пробую адрес чата:', chatUrl);
            const res = await fetch(chatUrl, {
                method: 'POST',
                headers: apiHeaders(),
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                console.error('[ChibiBoss] ❌ ОШИБКА СЕРВЕРА:', chatUrl,
                    '| статус:', res.status, '| ответ:', errText.slice(0, 400));

                // Если сломался ЗАПОМНЕННЫЙ адрес — забываем его,
                // чтобы он не лез первым в следующий раз.
                if (chatUrl === apiSettings.resolvedChatUrl) {
                    console.warn('[ChibiBoss] забываю плохой сохранённый адрес чата:', chatUrl);
                    apiSettings.resolvedChatUrl = '';
                    saveApiSettings();
                }
                continue; // пробуем следующий вариант
            }

            // читаем тело КАК ТЕКСТ — работает и для JSON, и для потокового (SSE) ответа
            const rawBody = await res.text();
            console.log('[ChibiBoss] СЫРОЕ ТЕЛО ОТВЕТА:', rawBody.slice(0, 800));
            const text = extractApiText(rawBody);

            if (!text || !String(text).trim()) {
                // Сервер ответил 200 OK, но текст пустой (например, поток
                // оборвался). НЕ забываем рабочий адрес — он может быть верным.
                console.warn('[ChibiBoss] пустой ответ от', chatUrl, rawBody.slice(0, 200));
                continue;
            }


            // успех — запоминаем рабочий адрес
            apiSettings.resolvedChatUrl = chatUrl;
            saveApiSettings();
            console.log('[ChibiBoss] ✅ Ответ получен с адреса:', chatUrl);
            console.log('[ChibiBoss] Текст:', String(text).slice(0, 100));
            return String(text).trim();

        } catch (e) {
            console.warn('[ChibiBoss] ошибка на адресе', chatUrl, e);
            if (chatUrl === apiSettings.resolvedChatUrl) {
                apiSettings.resolvedChatUrl = '';
                saveApiSettings();
            }
        }
    }

    console.error('[ChibiBoss] ни один адрес чата не сработал');
    return null;
}





// генерация с повтором: пробует несколько раз, ждёт между попытками
async function apiGenerateWithRetry(systemPrompt, userPrompt, maxTokens = 200, retries = 2) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const gen = apiGenerate(systemPrompt, userPrompt, maxTokens);
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 60000)
            );
            const raw = await Promise.race([gen, timeout]);
            if (raw && String(raw).trim()) return raw;
            console.warn(`[ChibiBoss] попытка ${attempt}/${retries}: пустой ответ`);
        } catch (e) {
            console.warn(`[ChibiBoss] попытка ${attempt}/${retries} не удалась:`, e.message);
        }
        if (attempt < retries) {
            await new Promise(r => setTimeout(r, 2500)); // пауза перед повтором
        }
    }
    return null;
}
// ============================================================
//  ЧЕРЕЗ ПРОФИЛЬ ТАВЕРНЫ
// ============================================================

// Получить профиль по имени
function getBossProfile(profileName) {
    if (!profileName) return null;
    try {
        const ctx = SillyTavern.getContext();
        const cm = ctx.extensionSettings?.connectionManager;
        if (!cm?.profiles?.length) return null;
        return cm.profiles.find(p => p.name === profileName) || null;
    } catch {
        return null;
    }
}

// Извлечь текст из ответа профиля (любой формат)
function extractBossResponse(resp) {
    if (!resp) return null;
    if (typeof resp === 'string') return resp;

    // Массив блоков контента
    if (Array.isArray(resp)) {
        const texts = resp.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text);
        if (texts.length) return texts.join('\n');
    }

    // Anthropic/OpenAI формат
    if (resp.content !== undefined && resp.content !== null) {
        if (typeof resp.content === 'string') return resp.content;
        if (Array.isArray(resp.content)) {
            const texts = resp.content.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text);
            if (texts.length) return texts.join('\n');
        }
    }

    // OpenAI choices формат
    if (resp.choices?.[0]?.message?.content) {
        const c = resp.choices[0].message.content;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) {
            const texts = c.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text);
            if (texts.length) return texts.join('\n');
        }
    }

    // Запасные варианты
    if (typeof resp.text === 'string') return resp.text;
    if (typeof resp.message === 'string') return resp.message;
    if (resp.message?.content && typeof resp.message.content === 'string') return resp.message.content;

    return null;
}

// Генерация через выбранный профиль (не меняет активные настройки таверны)
async function generateViaBossProfile(systemPrompt, userPrompt, maxTokens) {
    const profile = getBossProfile(apiSettings.stProfile);
    if (!profile) throw new Error(`Профиль "${apiSettings.stProfile}" не найден`);

    const ctx = SillyTavern.getContext();
    if (!ctx.ConnectionManagerRequestService) {
        throw new Error('Сервис запросов профиля недоступен');
    }

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];

    try {
        const response = await ctx.ConnectionManagerRequestService.sendRequest(
            profile.id,
            messages,
            maxTokens,
            {
                stream: false,
                extractData: true,
                includePreset: false,    // не используем текущий пресет таверны
                includeInstruct: false,  // не используем текущие инструкции
            }
        );

        const text = extractBossResponse(response);
        if (text == null) throw new Error('Неверный формат ответа');
        return text.trim();
    } catch (e) {
        console.error('[ChibiBoss] ошибка генерации через профиль:', e);
        throw e;
    }
}

// Заполнить выпадашку профилей
function populateBossProfiles() {
    const select = document.getElementById('cb-boss-profile');
    if (!select) return;

    select.innerHTML = '<option value="">— выберите профиль —</option>';
    try {
        const ctx = SillyTavern.getContext();
        const profiles = ctx.extensionSettings?.connectionManager?.profiles || [];
        profiles.forEach(p => {
            if (!p?.name) return;
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            if (apiSettings.stProfile === p.name) opt.selected = true;
            select.appendChild(opt);
        });
    } catch (e) {
        console.warn('[ChibiBoss] ошибка загрузки профилей:', e);
    }
}


// ----- СПИСОК МОДЕЛЕЙ -----
// возвращает массив строк-id моделей
async function apiFetchModels() {
    if (apiSettings.mode !== 'api' || !apiSettings.url) return [];
    // перебираем варианты адреса моделей, пока не получим список
    for (const modelsUrl of apiModelsCandidates()) {
        try {
            const res = await fetch(modelsUrl, {
                method: 'GET',
                headers: apiHeaders(),
            });
            if (!res.ok) continue;
            const data = await res.json();
            // формат OpenAI: { data: [ { id: '...' }, ... ] }
            const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
            const models = list.map(m => (typeof m === 'string' ? m : m.id)).filter(Boolean);
            if (models.length) {
                apiSettings.resolvedModelsUrl = modelsUrl; // запомнили рабочий адрес
                saveApiSettings();
                return models;
            }
        } catch (e) {
            console.warn('[ChibiBoss] вариант не подошёл:', modelsUrl, e);
        }
    }
    return [];
}





// ============================================================
//  ПРОГРЕСС для разблокировки подарков
// ============================================================
const PROGRESS_KEY = 'chibiBoss_progress';

const defaultProgress = {
    petCount: 0,            // сколько раз начато поглаживание
    petSeconds: 0,          // суммарно секунд поглаживания
    workCount: 0,           // отправлен работать (вручную)
    autoWorkCount: 0,       // сам пошёл работать
    workToday: 0,           // отправлен работать сегодня
    workTodayDate: '',      // дата для сброса workToday
    tttWins: 0,             // победы в крестики-нолики
    tttWinsHard: 0,         // победы в кр-нолики на сложном
    checkersWins: 0,        // победы в шашки
    checkersWinsHard: 0,    // победы в шашки на сложном
    chessWins: 0,           // победы в шахматы
    chessWinsHard: 0,       // победы в шахматы на сложном
    totalGames: 0,          // всего сыграно партий
    totalWins: 0,           // всего побед
    stressCatch: 0,         // поймал стресс-анимацию (клик во время stress)
    stressAnimSeen: 0,      // увидел стресс-анимацию (просто наблюдал)    
    petDuringStress: 0,     // погладил во время стресс-анимации
    // таймеры «держать показатель N времени подряд» (мс накоплено)
    lowStressStreak: 0,     // стресс < 10%
    stress20Streak: 0,      // стресс < 20%
    zeroStressStreak: 0,    // стресс == 0
    highAffStreak: 0,       // привязанность > 80%
    aff90Streak: 0,         // привязанность > 90%
    aff100Streak: 0,        // привязанность == 100%
    lastStreakUpdate: Date.now(),
    totalOnlineSeconds: 0,  // суммарно онлайн за всё время
};


function loadProgress() {
    try {
        const raw = localStorage.getItem(PROGRESS_KEY);
        return raw ? { ...defaultProgress, ...JSON.parse(raw) } : { ...defaultProgress };
    } catch (e) { return { ...defaultProgress }; }
}

function saveProgress() {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

let progress = loadProgress();
// проверить и выдать все выполненные подарки
function checkGiftProgress() {
    const t = progress.totalOnlineSeconds;
    const conditions = {
        1:  progress.lowStressStreak  >= 2 * 3600 * 1000,           // стресс < 10%, 2 часа
        2:  progress.petCount         >= 50,                        // 50 поглаживаний
        3:  progress.checkersWins     >= 3,                         // 3 победы в шашки
        4:  progress.highAffStreak    >= 3 * 3600 * 1000,           // привязанность > 80%, 3 часа
        5:  progress.workCount        >= 10,                        // отправлен работать 10 раз
        6:  progress.tttWins          >= 5,                         // 5 побед в крестики
        7:  progress.stress20Streak   >= 6 * 3600 * 1000,           // стресс < 20%, 6 часов
        8:  t >= 5  * 3600,                                         // 5 часов онлайн
        9:  progress.totalGames       >= 20,                        // 20 партий любой игры
        10: settings.affection        >= 100,                       // привязанность 100%
        11: progress.petSeconds       >= 30 * 60,                   // 30 минут поглаживания
        12: progress.totalWins        >= 10,                        // 10 побед суммарно
        13: progress.lowStressStreak  >= 1 * 3600 * 1000,           // стресс < 10%, 1 час
        14: progress.aff90Streak      >= 2 * 3600 * 1000,           // привязанность > 90%, 2 часа
        15: progress.workToday        >= 3,                         // 3 раза работать за день
        16: t >= 10 * 3600,                                         // 10 часов онлайн
        17: progress.autoWorkCount    >= 5,                         // босс сам пошёл работать 5 раз
        18: progress.stressAnimSeen   >= 10,                        // увидел стресс-анимацию 10 раз
        19: t >= 20 * 3600,                                         // 20 часов онлайн
        20: progress.checkersWinsHard >= 5,                         // 5 побед в шашки на сложном
        21: progress.highAffStreak    >= 10 * 3600 * 1000,          // привязанность > 80%, 10 часов
        22: progress.tttWinsHard      >= 10,                        // 10 побед в крестики на сложном
        23: t >= 7 * 24 * 3600,                                     // 7 дней онлайн
        24: progress.petCount         >= 100,                       // 100 поглаживаний
        25: progress.checkersWinsHard >= 5 && progress.tttWinsHard >= 5, // 5+5 побед на сложном
    };
    Object.entries(conditions).forEach(([id, met]) => {
        if (met) awardGift(Number(id));
    });
}


// обновить стрик-таймеры (вызывается из updateSystems)
function updateStreaks(elapsedMs) {
    // накапливать или сбросить каждый стрик
    if (settings.stress < 10)  progress.lowStressStreak  += elapsedMs;
    else                        progress.lowStressStreak   = 0;

    if (settings.stress < 20)  progress.stress20Streak   += elapsedMs;
    else                        progress.stress20Streak    = 0;

    if (settings.stress === 0) progress.zeroStressStreak += elapsedMs;
    else                        progress.zeroStressStreak  = 0;

    if (settings.affection > 80)  progress.highAffStreak += elapsedMs;
    else                           progress.highAffStreak  = 0;

    if (settings.affection > 90)  progress.aff90Streak   += elapsedMs;
    else                           progress.aff90Streak    = 0;

    if (settings.affection >= 100) progress.aff100Streak  += elapsedMs;
    else                            progress.aff100Streak   = 0;

    progress.lastStreakUpdate = Date.now();
}


// ------------------------------------------------------------
//  ДВИЖОК АНИМАЦИЙ
// ------------------------------------------------------------
class Animator {
    constructor(imgEl) {
        this.img = imgEl;
        this.current = null;
        this.frames = [];
        this.frameIndex = 0;
        this.fps = 10;
        this.loop = true;
        this.acc = 0;
        this.lastTime = 0;
        this.onComplete = null;
        this.rafId = null;
        this._tickBound = this._tick.bind(this);
    }

    play(name, onComplete = null) {
        const cfg = ANIMATIONS[name];
        if (!cfg) {
            console.warn('[ChibiBoss] нет анимации:', name);
            return;
        }

        if (this.current === name && cfg.type === 'apng') return;

        this.stop();
        this.current = name;
        this.onComplete = onComplete;

        if (cfg.type === 'apng') {
            const src = EXT_PATH + 'assets/boss/' + name + '.png';
            if (this.img.getAttribute('src') !== src) {
                this.img.src = src;
            }
        } else {
            this.frames = [];
            for (let i = 0; i < cfg.count; i++) {
                this.frames.push(EXT_PATH + 'assets/boss/' + name + '/' + i + '.png');
            }
            this.fps = cfg.fps || 10;
            this.loop = !!cfg.loop;
            this.frameIndex = 0;
            this.acc = 0;
            this.lastTime = performance.now();
            this.img.src = this.frames[0];
            this.rafId = requestAnimationFrame(this._tickBound);
        }
    }

    _tick(now) {
        const dt = now - this.lastTime;
        this.lastTime = now;
        this.acc += dt;
        const frameDur = 1000 / this.fps;

        while (this.acc >= frameDur) {
            this.acc -= frameDur;
            this.frameIndex++;

            if (this.frameIndex >= this.frames.length) {
                if (this.loop) {
                    this.frameIndex = 0;
                } else {
                    this.frameIndex = this.frames.length - 1;
                    this.img.src = this.frames[this.frameIndex];
                    const cb = this.onComplete;
                    this.current = null;
                    this.rafId = null;
                    if (cb) cb();
                    return;
                }
            }
            this.img.src = this.frames[this.frameIndex];
        }
        this.rafId = requestAnimationFrame(this._tickBound);
    }

    stop() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
}

// ------------------------------------------------------------
//  ПРЕДЗАГРУЗКА
// ------------------------------------------------------------
function preloadAll() {
    const priority = [
        'idle_front', 'idle_half_left', 'idle_half_right',
        'walk_left', 'walk_right', 'walk_up', 'walk_down',
        'grab_left', 'grab_right', 'dragging_left', 'dragging_right',
        'release_left', 'release_right',
        'chair_sit', 'chair_sip',
        'fall_left', 'fall_right',          // ← НОВОЕ: падение
        'sit_left', 'sit_right',            // ← НОВОЕ: сидение
        'standup_left', 'standup_right',    // ← НОВОЕ: вставание
    ];


    priority.forEach(name => {
        const cfg = ANIMATIONS[name];
        if (!cfg) return;
        if (cfg.type === 'frames') {
            for (let i = 0; i < cfg.count; i++) {
                const im = new Image();
                im.src = EXT_PATH + 'assets/boss/' + name + '/' + i + '.png';
            }
        } else {
            const im = new Image();
            im.src = EXT_PATH + 'assets/boss/' + name + '.png';
        }
    });
}


// ------------------------------------------------------------
//  ПОВЕДЕНИЕ БОССА
// ------------------------------------------------------------
function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function walkAnimFor(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx < 0 ? 'walk_left' : 'walk_right';
    }
    return dy < 0 ? 'walk_up' : 'walk_down';
}

class Behavior {
    constructor() {
        this.paused = false;
        this.busy = false;
        this.timer = null;
        this.holdTimer = null;
        this.walkRaf = null;
        this.walkSpeed = 110;
        this.lastAction = null;
        this.menuFrozen = false;
    }

    start() {
        this.paused = false;
        this.scheduleNext();
        this.followTimer = null;
        this.followTarget = { x: 0, y: 0 };
        this.setupStressFollow();
    }

    delayRange() {
        switch (settings.tempo) {
            case 'high': return [2000, 6000];      // быстрый: 2–6 сек
            case 'low':  return [12000, 24000];    // медленный: 12–24 сек
            case 'normal':
            default:     return [5000, 12000];     // средний: 5–12 сек
        }
    }

    holdRange() {
        switch (settings.tempo) {
            case 'high': return [30000, 50000];    // быстрый: 30–50 сек
            case 'low':  return [60000, 100000];   // медленный: 60–100 сек
            case 'normal':
            default:     return [40000, 70000];    // средний: 40–70 сек
        }
    }



scheduleNext() {
    if (this.paused || this.menuFrozen) return;
    const [min, max] = this.delayRange();
    this.timer = setTimeout(() => {
        // Защита: если busy застрял — сбросить
        if (this.busy && this.lastAction !== 'work' && this.lastAction !== 'pet') {
            console.warn('[ChibiBoss] busy застрял — сбрасываю');
            this.busy = false;
        }
        this.pickAction();
    }, randomBetween(min, max));
}

pickAction() {
    if (this.paused || this.menuFrozen || this.busy) return;
    let action = this.rollAction();
    if (action === this.lastAction) {
        action = this.rollAction();
    }
    switch (action) {
        case 'walk':     this.doWalk();     break;
        case 'pose':     this.doIdlePose(); break;
        case 'smoke':    this.doSmoke();    break;
        case 'phone':    this.doPhone();    break;
        case 'stress':   this.doStress();   break;
        case 'autowork': this.doAutoWork(); break;
        case 'autochair': this.doAutoChair(); break;
        case 'fall':     this.doFall();     break;  // ← НОВОЕ
    }
}



rollAction() {
    const r = Math.random();

    // Стресс-анимация при высоком стрессе
    if (settings.stress > 90 && r < 0.60) return 'stress';
    if (settings.stress > STRESS_THRESHOLD_HIGH && r < 0.45) return 'stress';
    if (settings.stress > STRESS_THRESHOLD_NORMAL && r < 0.25) return 'stress';

    // Автоматическая работа (если стол включён)
    const deskAvailable = settings.deskEnabled && deskEl && deskEl.style.display !== 'none';
    if (deskAvailable && r < 0.08) return 'autowork';  // 8%

    // Автоматическое кресло (если включено) — чаще, чем работа
    const chairAvailable = settings.chairEnabled && chairEl && chairEl.style.display !== 'none';
    if (chairAvailable && r < 0.18) return 'autochair';  // 10%

    // ← НОВОЕ: падение (5% шанс)
    if (r < 0.23) return 'fall';  // 5%

    // Остальные действия — упор на ходьбу
    if (r < 0.63) return 'walk';   // ~40%
    if (r < 0.73) return 'pose';   // 10%
    if (r < 0.86) return 'smoke';  // 13%
    return 'phone';                 // 14%
}


    doIdlePose() {
        this.lastAction = 'pose';
        const poses = [
            'idle_front', 'idle_front',
            'idle_half_left', 'idle_half_right',
            'idle_left', 'idle_right', 'idle_back',
        ];
        const pose = poses[Math.floor(Math.random() * poses.length)];
        animator.play(pose);
        this.scheduleNext();
    }

    doWalk() {
        this.busy = true;
        this.lastAction = 'walk';
        const maxX = window.innerWidth - 124;
        const maxY = window.innerHeight - 124;
        const tx = Math.round(randomBetween(0, Math.max(0, maxX)));
        const ty = Math.round(randomBetween(0, Math.max(0, maxY)));
        this.walkTo(tx, ty, () => {
            animator.play('idle_front');
            this.busy = false;
            this.scheduleNext();
        });
    }

    walkTo(tx, ty, onDone) {
        const startX = parseFloat(actorEl.style.left) || 0;
        const startY = parseFloat(actorEl.style.top) || 0;
        animator.play(walkAnimFor(tx - startX, ty - startY));

        let last = performance.now();
        const step = (now) => {
        if (this.paused || this.menuFrozen) {
            this.walkRaf = null;
            if (onDone) onDone();  // ← ВЫЗЫВАЕМ КОЛЛБЭК
            return;
        }


            const dt = now - last;
            last = now;

            const x = parseFloat(actorEl.style.left) || 0;
            const y = parseFloat(actorEl.style.top) || 0;
            const dx = tx - x;
            const dy = ty - y;
            const dist = Math.hypot(dx, dy);

            if (dist <= 2) {
                actorEl.style.left = tx + 'px';
                actorEl.style.top = ty + 'px';
                savePos(tx, ty);
                this.walkRaf = null;
                onDone();
                return;
            }

            const move = Math.min(this.walkSpeed * dt / 1000, dist);
            const nx = x + (dx / dist) * move;
            const ny = y + (dy / dist) * move;

            actorEl.style.left = Math.round(nx) + 'px';
            actorEl.style.top = Math.round(ny) + 'px';

            // обновить позиции иконок во время ходьбы
            positionGiftAlert();
            positionLetterAlert();
            positionCommentBubble();

            this.walkRaf = requestAnimationFrame(step);
        };
        this.walkRaf = requestAnimationFrame(step);
    }


    doSmoke() {
        this.busy = true;
        this.lastAction = 'smoke';
        const side = Math.random() < 0.5 ? 'left' : 'right';
        const [hMin, hMax] = this.holdRange();
        animator.play('smoke_start_' + side, () => {
            if (this.paused) return;
            animator.play('smoke_loop_' + side);
            this.hold(randomBetween(hMin, hMax), () => {
                animator.play(side === 'left' ? 'idle_half_left' : 'idle_half_right');
                this.busy = false;
                this.scheduleNext();
            });
        });
    }

    doPhone() {
        this.busy = true;
        this.lastAction = 'phone';
        const side = Math.random() < 0.5 ? 'left' : 'right';
        const [hMin, hMax] = this.holdRange();
        animator.play('phone_start_' + side, () => {
            if (this.paused) return;
            animator.play('phone_loop_' + side);
            this.hold(randomBetween(hMin, hMax), () => {
                animator.play('phone_end_' + side, () => {
                    animator.play('idle_front');
                    this.busy = false;
                    this.scheduleNext();
                });
            });
        });
    }

    hold(ms, cb) {
        this.holdTimer = setTimeout(() => {
            if (!this.paused) cb();
        }, ms);
    }

    pause() {
        this.paused = true;
        this.busy = false;
        clearTimeout(this.timer);
        clearTimeout(this.holdTimer);
        if (this.walkRaf) {
            cancelAnimationFrame(this.walkRaf);
            this.walkRaf = null;
        }
    }

    resume() {
        this.paused = false;
        animator.play('idle_front');
        this.scheduleNext();
    }

freezeForMenu() {
    this.menuFrozen = true;
    clearTimeout(this.timer);
    if (this.walkRaf) {
        if (commentInProgress) return;
        cancelAnimationFrame(this.walkRaf);
        this.walkRaf = null;
        this.busy = false;
        animator.play('idle_front');
    }
}

    unfreezeFromMenu() {
        this.menuFrozen = false;
        if (!this.busy) this.scheduleNext();
    }

    enablePetting() {
        this.busy = true;
        this.lastAction = 'pet';
        clearTimeout(this.timer);
        clearTimeout(this.holdTimer);
        if (this.walkRaf) {
            cancelAnimationFrame(this.walkRaf);
            this.walkRaf = null;
        }
        animator.play('idle_front');
    }

    disablePetting() {
        animator.play('idle_front');
        this.busy = false;
        this.scheduleNext();
    }

    // отправить работать: идёт к центру стола → анимация work → встаёт → отходит
goToWork(durationMs) {
    if (!deskEl || deskEl.style.display === 'none') return;

    this.busy = true;
    this.lastAction = 'work';
    clearTimeout(this.timer);
    clearTimeout(this.holdTimer);
    if (this.walkRaf) {
        cancelAnimationFrame(this.walkRaf);
        this.walkRaf = null;
    }

    // Если чибик сидел в кресле — выходим
    this.leaveChairMode();

    deskLocked = true;


        const center = getDeskCenter();
        // учитываем текущий масштаб (на разных экранах/зумах scale ≠ 1)
        const zoom = (window.devicePixelRatio || 1) / baseDPR;
        const scale = 1 / zoom;
        const half = 62 * scale;  // половина босса В ВИДИМЫХ пикселях
        const tx = center.x - half + WORK_OFFSET_X;
        const ty = center.y - half + WORK_OFFSET_Y;
        const c = clampToScreen(Math.round(tx), Math.round(ty));

        this.walkTo(c.x, c.y, () => {
            animator.play('work');
            this.holdTimer = setTimeout(() => {
                deskLocked = false;  // разблокировали стол

                // ОТХОДИМ от стола в случайную сторону, чтобы не «стоять на столе»
                const curX = parseFloat(actorEl.style.left) || 0;
                const curY = parseFloat(actorEl.style.top) || 0;
                const dist = randomBetween(150, 260);           // как далеко отойти
                const angle = randomBetween(0, Math.PI * 2);    // случайное направление
                const away = clampToScreen(
                    Math.round(curX + Math.cos(angle) * dist),
                    Math.round(curY + Math.sin(angle) * dist)
                );

                this.walkTo(away.x, away.y, () => {
                    animator.play('idle_front');
                    this.busy = false;
                    this.scheduleNext();
                });
            }, durationMs);
        });
    }


    // отправить в кресло: идёт к креслу → анимация сидения с глотками → встаёт → отходит
goToChair(durationMs) {
    if (!chairEl || chairEl.style.display === 'none') return;

    this.busy = true;
    this.lastAction = 'chair';
    clearTimeout(this.timer);
    clearTimeout(this.holdTimer);
    if (this.walkRaf) {
        cancelAnimationFrame(this.walkRaf);
        this.walkRaf = null;
    }

    // ← НОВОЕ: принудительно останавливаем режим преследования курсора
    if (this.followRaf) {
        cancelAnimationFrame(this.followRaf);
        this.followRaf = null;
        this.followAnim = null;
    }

    chairLocked = true;


const center = getChairCenter();
const zoom = (window.devicePixelRatio || 1) / baseDPR;
const scale = 1 / zoom;
const half = 62 * scale;
const tx = center.x - half + CHAIR_OFFSET_X;
const ty = center.y - half + CHAIR_OFFSET_Y;
const c = clampToScreen(Math.round(tx), Math.round(ty));

// ← НОВОЕ: принудительно запускаем анимацию ходьбы к креслу
const curX = parseFloat(actorEl.style.left) || 0;
const curY = parseFloat(actorEl.style.top) || 0;
const dx = c.x - curX;
const dy = c.y - curY;
animator.play(walkAnimFor(dx, dy));

this.walkTo(c.x, c.y, () => {

            // СНАЧАЛА меняем размер
            actorEl.classList.add('chair-mode');

            // ПОТОМ пересчитываем позицию под новый размер (кресло 106×130)
            const center = getChairCenter();
            const zoom = (window.devicePixelRatio || 1) / baseDPR;
            const scale = 1 / zoom;
            const halfW = 53 * scale;   // половина ШИРИНЫ 106px
            const halfH = 65 * scale;   // половина ВЫСОТЫ 130px
            const cx = center.x - halfW + CHAIR_OFFSET_X;
            const cy = center.y - halfH + CHAIR_OFFSET_Y;
            const corrected = clampToScreen(Math.round(cx), Math.round(cy), 106);
            actorEl.style.left = corrected.x + 'px';
            actorEl.style.top = corrected.y + 'px';

            // начинаем сидеть
            this.chairSitCycle(durationMs);
        });

    }

    // цикл сидения: 70% времени сидит спокойно, 30% делает глоток
    chairSitCycle(remainingMs) {
        if (this.paused || this.lastAction !== 'chair') return;

        animator.play('chair_sit');

        // случайный интервал сидения (70% времени)
        const sitDuration = randomBetween(3000, 8000);

        this.holdTimer = setTimeout(() => {
            // проверяем, осталось ли время
            const nextRemaining = remainingMs - sitDuration;
            if (nextRemaining <= 0) {
                // время вышло — встаём и отходим
                this.finishChair();
                return;
            }

            // делаем глоток: покадровая анимация chair_sip
            animator.play('chair_sip', () => {
                // коллбэк: анимация глотка закончилась

                // снизить стресс за каждый глоток
                settings.stress = Math.max(0, settings.stress - 1);
                saveSettings(settings);

                // сколько времени заняла анимация глотка (9 кадров / 8 fps ≈ 1125ms)
                const sipDuration = (1000 / 8) * 9;

                // продолжаем цикл
                const afterSip = nextRemaining - sipDuration;
                if (afterSip <= 0) {
                    this.finishChair();
                } else {
                    this.chairSitCycle(afterSip);
                }
            });

        }, sitDuration);
    }

// Корректный выход из режима кресла:
// снимает класс, возвращает размер 124×124 и ПЕРЕЗАГРУЖАЕТ спрайт,
// чтобы браузер не оставил старый кадр кресла растянутым.
leaveChairMode() {
    if (!actorEl.classList.contains('chair-mode')) return;

    // Принудительный сброс: очищаем src перед сменой размера
    const img = actorEl.querySelector('img');
    const tempSrc = img.src;
    img.src = '';  // ← пустой src сбрасывает кэш браузера

    // Снимаем класс (меняем размер контейнера)
    actorEl.classList.remove('chair-mode');
    chairLocked = false;
    clearTimeout(behavior?.holdTimer);

    // Останавливаем аниматор и восстанавливаем src
    animator.stop();
    animator.current = null;

    // Ждём один кадр (чтобы браузер зафиксировал пустой src), потом загружаем idle
    requestAnimationFrame(() => {
        animator.play('idle_front');
    });
}


finishChair() {
    // корректно выходим из кресла (размер + спрайт)
    this.leaveChairMode();

    const curX = parseFloat(actorEl.style.left) || 0;
    const curY = parseFloat(actorEl.style.top) || 0;
    const dist = randomBetween(150, 260);
    const angle = randomBetween(0, Math.PI * 2);
    const away = clampToScreen(
        Math.round(curX + Math.cos(angle) * dist),
        Math.round(curY + Math.sin(angle) * dist)
    );

    // ждём один кадр, чтобы спрайт 124×124 успел отрисоваться, потом идём
    requestAnimationFrame(() => {
        this.walkTo(away.x, away.y, () => {
            animator.play('idle_front');
            this.busy = false;
            this.scheduleNext();
        });
    });
}





    // нервничает (анимация stress)
    doStress() {
        this.busy = true;
        this.lastAction = 'stress';
        animator.play('stress');

        progress.stressAnimSeen++;  // ← добавь
        saveProgress();             // ← добавь

        let duration;
        if (settings.stress > STRESS_THRESHOLD_HIGH) {
            duration = randomBetween(8000, 15000);
        } else {
            duration = randomBetween(4000, 8000);
        }

        this.hold(duration, () => {
            animator.play('idle_front');
            this.busy = false;
            this.scheduleNext();
        });
    }

// падает и сидит на полу
doFall() {
    this.busy = true;
    this.lastAction = 'fall';

    // Выбираем случайную сторону (право или лево)
    const side = Math.random() < 0.5 ? 'left' : 'right';

    // Время сидения зависит от темпа
    const [hMin, hMax] = this.holdRange();

    // 1. Анимация падения (8 кадров, 7 fps)
    animator.play('fall_' + side, () => {
        if (this.paused) return;

        // 2. Анимация сидения на полу (зацикленная apng)
        animator.play('sit_' + side);

        // 3. Сидим заданное время
        this.hold(randomBetween(hMin, hMax), () => {
            // 4. Анимация вставания (2 кадра, 10 fps)
            animator.play('standup_' + side, () => {
                // 5. Возвращаемся в idle с той же стороны
                const idleAnim = side === 'left' ? 'idle_half_left' : 'idle_half_right';
                animator.play(idleAnim);
                this.busy = false;
                this.scheduleNext();
            });
        });
    });
}

    doAutoWork() {
        if (!deskEl || deskEl.style.display === 'none') {
            this.doWalk();
            return;
        }

        // тайминги работы зависят от темпа
        let minMs, maxMs;
        switch (settings.tempo) {
            case 'high':
                minMs = 2 * 60 * 1000;   // 2 минуты
                maxMs = 2 * 60 * 1000;
                break;
            case 'low':
                minMs = 7 * 60 * 1000;   // 7 минут
                maxMs = 7 * 60 * 1000;
                break;
            case 'normal':
            default:
                minMs = 4 * 60 * 1000;   // 4 минуты
                maxMs = 4 * 60 * 1000;
        }

        const dur = randomBetween(minMs, maxMs);
        progress.autoWorkCount++; saveProgress();
        this.goToWork(dur);
    }

    // сам решает посидеть в кресле
    doAutoChair() {
        if (!chairEl || chairEl.style.display === 'none') {
            this.doWalk();
            return;
        }

        // тайминги сидения зависят от темпа
        let minMs, maxMs;
        switch (settings.tempo) {
            case 'high':
                minMs = 2 * 60 * 1000;   // 2 минуты
                maxMs = 2 * 60 * 1000;
                break;
            case 'low':
                minMs = 7 * 60 * 1000;   // 7 минут
                maxMs = 7 * 60 * 1000;
                break;
            case 'normal':
            default:
                minMs = 4 * 60 * 1000;   // 4 минуты
                maxMs = 4 * 60 * 1000;
        }

        const dur = randomBetween(minMs, maxMs);
        this.goToChair(dur);
    }

    // следование за курсором при очень высоком стрессе
    setupStressFollow() {
        this.followRaf = null;
        this.followLastTime = 0;
        this.followAnim = null;

        document.addEventListener('pointermove', (e) => {
            // выключенный персонаж не реагирует на мышь
            if (!settings.enabled) return;
            if (settings.stress < 80 || this.busy || this.paused || this.menuFrozen
                || commentInProgress || commentBubbleActive) return;

            this.followTarget.x = e.clientX - 62;
            this.followTarget.y = e.clientY - 62;

            if (!this.followRaf) {
                this.followLastTime = performance.now();
                this.followAnim = null;
                this.followRaf = requestAnimationFrame(this._followStep.bind(this));
            }
        });
    }


    // один кадр преследования курсора
    _followStep(now) {
        // условия выхода из режима следования
        if (!settings.enabled || settings.stress < 80 || this.busy || this.paused || this.menuFrozen
            || commentInProgress || commentBubbleActive) {
            this.followRaf = null;
            this.followAnim = null;
            animator.play('idle_front');
            return;
        }


        const dt = now - this.followLastTime;
        this.followLastTime = now;

        const cx = parseFloat(actorEl.style.left) || 0;
        const cy = parseFloat(actorEl.style.top) || 0;
        const dx = this.followTarget.x - cx;
        const dy = this.followTarget.y - cy;
        const dist = Math.hypot(dx, dy);

        if (dist <= 4) {
            // дошёл до курсора — встаёт лицом
            if (this.followAnim !== 'idle_front') {
                animator.play('idle_front');
                this.followAnim = 'idle_front';
            }
            this.followRaf = requestAnimationFrame(this._followStep.bind(this));
            return;
        }

        // выбираем анимацию ходьбы по направлению (и меняем только если сменилась)
        const wantAnim = walkAnimFor(dx, dy);
        if (this.followAnim !== wantAnim) {
            animator.play(wantAnim);
            this.followAnim = wantAnim;
        }

        // плавное движение, привязанное к времени кадра
        const speed = 70; // скорость преследования (пикс/сек) — меняй при желании
        const move = Math.min(speed * dt / 1000, dist);
        const nx = cx + (dx / dist) * move;
        const ny = cy + (dy / dist) * move;
        const c = clampToScreen(nx, ny);
        actorEl.style.left = Math.round(c.x) + 'px';
        actorEl.style.top = Math.round(c.y) + 'px';

        positionGiftAlert();
        positionLetterAlert();
        positionCommentBubble();

        this.followRaf = requestAnimationFrame(this._followStep.bind(this));
    }
}

let behavior = null;
let grabAudio = null;
let releaseAudio = null;
let commentListener = null;  


// ------------------------------------------------------------
//  СОЗДАНИЕ БОССА
// ------------------------------------------------------------
let actorEl, animator;
let baseDPR = 1;  // всегда нормализуем к 100% зума


function applyZoomCompensation() {
    const zoom = (window.devicePixelRatio || 1) / baseDPR;
    const scale = 1 / zoom;
    if (actorEl) actorEl.style.transform = `scale(${scale})`;
    if (deskEl)  deskEl.style.transform  = `scale(${scale})`;
    if (chairEl) chairEl.style.transform = `scale(${scale})`;

    // иконки и пузырёк должны следовать за боссом после смены масштаба
    positionGiftAlert();
    positionLetterAlert();
    positionCommentBubble();
}


function startZoomWatcher() {
    let lastDPR = window.devicePixelRatio || 1;
    let saveTimer = null;  // для debounce сохранения

    const check = () => {
        const now = window.devicePixelRatio || 1;
        if (now !== lastDPR) {
            lastDPR = now;
            applyZoomCompensation();

            // если босс работает за столом — пересаживаем его точно по центру
            const working = behavior && behavior.busy &&
                            behavior.lastAction === 'work' &&
                            animator.current === 'work' &&
                            deskEl && deskEl.style.display !== 'none';

            if (working) {
                const center = getDeskCenter();
                const zoom = (window.devicePixelRatio || 1) / baseDPR;
                const scale = 1 / zoom;
                const half = 62 * scale;
                const c = clampToScreen(
                    Math.round(center.x - half + WORK_OFFSET_X),
                    Math.round(center.y - half + WORK_OFFSET_Y)
                );
                actorEl.style.left = c.x + 'px';
                actorEl.style.top  = c.y + 'px';
            } else if (behavior && behavior.busy &&
                       behavior.lastAction === 'chair' &&
                       (animator.current === 'chair_sit' || animator.current === 'chair_sip') &&
                       chairEl && chairEl.style.display !== 'none') {
                const center = getChairCenter();
                const zoom = (window.devicePixelRatio || 1) / baseDPR;
                const scale = 1 / zoom;
                // реальные габариты контейнера в кресле (106×130), а не 124×124
                const halfW = actorEl.offsetWidth  * scale / 2;
                const halfH = actorEl.offsetHeight * scale / 2;
                const c = clampToScreen(
                    Math.round(center.x - halfW + CHAIR_OFFSET_X),
                    Math.round(center.y - halfH + CHAIR_OFFSET_Y),
                    actorEl.offsetWidth
                );
                actorEl.style.left = c.x + 'px';
                actorEl.style.top  = c.y + 'px';
            } else if (actorEl) {


                // обычный случай — просто возвращаем босса в видимую область
                const bc = clampToScreen(
                    parseFloat(actorEl.style.left) || 0,
                    parseFloat(actorEl.style.top)  || 0
                );
                actorEl.style.left = bc.x + 'px';
                actorEl.style.top  = bc.y + 'px';
            }

            // вернуть стол в видимую область
            if (deskEl) {
                const dc = clampToScreen(
                    parseFloat(deskEl.style.left) || 0,
                    parseFloat(deskEl.style.top)  || 0,
                    162
                );
                deskEl.style.left = dc.x + 'px';
                deskEl.style.top  = dc.y + 'px';
            }
            // вернуть кресло в видимую область
            if (chairEl) {
                const cc = clampToScreen(
                    parseFloat(chairEl.style.left) || 0,
                    parseFloat(chairEl.style.top)  || 0,
                    130  // ← правильный размер
                );
                chairEl.style.left = cc.x + 'px';
                chairEl.style.top  = cc.y + 'px';
            }

            // DEBOUNCE: сохраняем позиции только через 150ms после последнего изменения
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                if (actorEl) {
                    const bx = parseFloat(actorEl.style.left) || 0;
                    const by = parseFloat(actorEl.style.top) || 0;
                    savePos(bx, by);
                }
                if (deskEl) {
                    const dx = parseFloat(deskEl.style.left) || 0;
                    const dy = parseFloat(deskEl.style.top) || 0;
                    saveDeskPos(dx, dy);
                }
                                if (chairEl) {
                    const cx = parseFloat(chairEl.style.left) || 0;
                    const cy = parseFloat(chairEl.style.top) || 0;
                    saveChairPos(cx, cy);
                }

            }, 150);
        }
        requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
}


// ограничить координаты границами экрана (с учётом размера объекта)
function clampToScreen(x, y, objectSize = 124) {
    const maxX = window.innerWidth - objectSize;
    const maxY = window.innerHeight - objectSize;
    return {
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY)),
    };
}

function createBoss() {
    grabAudio = new Audio(EXT_PATH + 'sounds/grab.ogg');
    grabAudio.volume = 0.5;
    releaseAudio = new Audio(EXT_PATH + 'sounds/release.ogg');
    releaseAudio.volume = 0.5;

    const layer = document.createElement('div');
    layer.id = 'chibiBoss-layer';

    actorEl = document.createElement('div');
    actorEl.id = 'chibiBoss-actor';

    const img = document.createElement('img');
    img.alt = 'Chibi Boss';
    img.draggable = false;
    actorEl.appendChild(img);

    layer.appendChild(actorEl);
    document.body.appendChild(layer);

    animator = new Animator(img);

    const saved = loadPos();
    let startX, startY;
    if (saved) {
        const c = clampToScreen(saved.x, saved.y);
        startX = c.x;
        startY = c.y;
    } else {
        startX = window.innerWidth - 180;
        startY = window.innerHeight - 180;
    }
    actorEl.style.left = startX + 'px';
    actorEl.style.top = startY + 'px';

    applyZoomCompensation();
    startZoomWatcher();    
    animator.play('idle_front');
    behavior = new Behavior();
    behavior.start();

    setupDragging();
    setupMenu();
    setupPetting();
    createDesk();
    createChair();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            applyZoomCompensation();

            // вернуть босса в видимую область
            const bx = parseFloat(actorEl.style.left) || 0;
            const by = parseFloat(actorEl.style.top) || 0;
            const bc = clampToScreen(bx, by);
            actorEl.style.left = bc.x + 'px';
            actorEl.style.top  = bc.y + 'px';
            savePos(bc.x, bc.y);

            // вернуть стол в видимую область
            if (deskEl) {
                const dx = parseFloat(deskEl.style.left) || 0;
                const dy = parseFloat(deskEl.style.top) || 0;
                const dc = clampToScreen(dx, dy, 162);
                deskEl.style.left = dc.x + 'px';
                deskEl.style.top  = dc.y + 'px';
                saveDeskPos(dc.x, dc.y);
            }
        }, 150);
    });
}


// ------------------------------------------------------------
//  ПЕРЕТАСКИВАНИЕ
// ------------------------------------------------------------
let dragState = {
    active: false,
    offsetX: 0,
    offsetY: 0,
    pointerId: null,
    dragSide: 'right',
};

function setupDragging() {
    actorEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (pettingMode) {
            return;
        }
        // поймал стресс-анимацию
        if (animator.current === 'stress') {
            progress.stressCatch++;
            saveProgress();
            checkGiftProgress();
        }
        e.preventDefault();

        // Запрет перетаскивания во время работы за столом
        // (чибик хватается за стол, а стол тащит его за собой)
        if (behavior && behavior.busy && behavior.lastAction === 'work' && animator.current === 'work') {
            return;
        }

        // Запрет перетаскивания, пока чибик сидит в кресле.
        // Благодаря этому клик проходит "сквозь" чибика на кресло,
        // и кресло тащит чибика за собой — как это работает со столом.
        if (behavior && behavior.busy && behavior.lastAction === 'chair' &&
            (animator.current === 'chair_sit' || animator.current === 'chair_sip')) {
            return;
        }

        // Подстраховка: если по какой-то причине остался режим кресла,
        // но чибик уже не в анимации сидения — снимаем его,
        // иначе контейнер останется 106×130 и обычные анимации исказятся.
        if (actorEl.classList.contains('chair-mode')) {
            actorEl.classList.remove('chair-mode');
            chairLocked = false;
            clearTimeout(behavior?.holdTimer);
        }



        if (menuOpen) closeMenu();
        if (behavior) behavior.pause();


        const rect = actorEl.getBoundingClientRect();
        dragState.active = true;
        dragState.pointerId = e.pointerId;
        dragState.offsetX = e.clientX - rect.left;
        dragState.offsetY = e.clientY - rect.top;

        actorEl.classList.add('dragging');
        actorEl.setPointerCapture(e.pointerId);

        const centerX = rect.left + rect.width / 2;
        const side = (e.clientX < centerX) ? 'left' : 'right';
        dragState.dragSide = side;

        playCachedSound(grabAudio);   // звук «схватил»
        animator.play('grab_' + side, () => {
            if (dragState.active) {
                animator.play('dragging_' + side);
            }
        });
    });


    actorEl.addEventListener('pointermove', (e) => {
        if (!dragState.active || e.pointerId !== dragState.pointerId) return;

        const newX = e.clientX - dragState.offsetX;
        const newY = e.clientY - dragState.offsetY;
        const c = clampToScreen(newX, newY);
        actorEl.style.left = c.x + 'px';
        actorEl.style.top = c.y + 'px';

        // ↓↓↓ ДОБАВИТЬ ЭТИ ТРИ СТРОКИ ↓↓↓
        positionGiftAlert();
        positionLetterAlert();
        positionCommentBubble();
    });

    const endDrag = (e) => {
        if (!dragState.active || e.pointerId !== dragState.pointerId) return;
        const side = dragState.dragSide || 'right';
        dragState.active = false;
        actorEl.classList.remove('dragging');

        try { actorEl.releasePointerCapture(e.pointerId); } catch (err) {}

        const rect = actorEl.getBoundingClientRect();
        savePos(rect.left, rect.top);

        playCachedSound(releaseAudio);   // звук «отпустил»
        animator.play('release_' + side, () => {
            if (behavior) behavior.resume();
            else animator.play('idle_front');
        });
    };


    actorEl.addEventListener('pointerup', endDrag);
    actorEl.addEventListener('pointercancel', endDrag);
}

// ------------------------------------------------------------
//  КРУГОВОЕ МЕНЮ
// ------------------------------------------------------------
let menuEl = null;
let menuOpen = false;

const MENU_ITEMS = [
    { action: 'pet',     icon: 'pet',     title: 'Погладить' },
    { action: 'chair',   icon: 'chair',   title: 'Отправить в кресло' },
    { action: 'games',   icon: 'games',   title: 'Игры' },
    { action: 'work',    icon: 'work',    title: 'Отправить работать' },
    { action: 'letters', icon: 'letters', title: 'Письма и комментарии' },
    { action: 'gifts',   icon: 'gifts',   title: 'Подарки' },
];





function buildMenu() {
    menuEl = document.createElement('div');
    menuEl.id = 'chibiBoss-menu';
    menuEl.style.display = 'none';

const header = document.createElement('div');
header.className = 'cb-menu-header';
header.innerHTML = `
    <div class="cb-menu-name" id="cb-menu-name"></div>
    <div class="cb-indicator">
        <img class="cb-ind-icon" src="${EXT_PATH}icons/indicators/affection.svg" alt="affection">
        <div class="cb-ind-bar-wrap">
            <div class="cb-ind-bar cb-aff-bar" id="cb-affection-bar"></div>
        </div>
        <span class="cb-ind-value" id="cb-affection-value">0%</span>
    </div>
    <div class="cb-indicator">
        <img class="cb-ind-icon" src="${EXT_PATH}icons/indicators/stress.svg" alt="stress">
        <div class="cb-ind-bar-wrap">
            <div class="cb-ind-bar cb-stress-bar" id="cb-stress-bar"></div>
        </div>
        <span class="cb-ind-value" id="cb-stress-value">0%</span>
    </div>
`;




    menuEl.appendChild(header);

const ring = document.createElement('div');
ring.className = 'cb-menu-ring';

const radius = 100;
const cx = 130, cy = 130;
const step = 360 / MENU_ITEMS.length;   // равномерный шаг: 6 иконок = 60° каждая
MENU_ITEMS.forEach((item, i) => {
    const angle = (-90 + i * step) * Math.PI / 180;
    const x = cx + radius * Math.cos(angle) - 28;   // 28 = половина ширины кнопки (56px)
    const y = cy + radius * Math.sin(angle) - 28;


    const btn = document.createElement('button');
    btn.className = 'cb-menu-item';
    btn.title = item.title;
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    btn.style.setProperty('--cb-delay', (i * 0.03) + 's');

    // CSS круг с SVG иконкой внутри
    const circle = document.createElement('div');
    circle.className = 'cb-menu-circle';

    const img = document.createElement('img');
    img.className = 'cb-menu-icon';
    img.src = EXT_PATH + 'icons/menu/' + item.icon + '.svg';
    img.alt = item.title;

    circle.appendChild(img);
    btn.appendChild(circle);

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleMenuAction(item.action);
        closeMenu();
    });

    ring.appendChild(btn);
});



    menuEl.appendChild(ring);
    document.getElementById('chibiBoss-layer').appendChild(menuEl);
    menuEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

function updateIndicators() {
    const a = Math.max(0, Math.min(100, settings.affection ?? 60));
    const s = Math.max(0, Math.min(100, settings.stress ?? 20));

    const affBar = document.getElementById('cb-affection-bar');
    const stressBar = document.getElementById('cb-stress-bar');
    const affValue = document.getElementById('cb-affection-value');
    const stressValue = document.getElementById('cb-stress-value');

    if (affBar) affBar.style.width = a + '%';
    if (stressBar) stressBar.style.width = s + '%';
    if (affValue) affValue.textContent = Math.round(a) + '%';
    if (stressValue) stressValue.textContent = Math.round(s) + '%';
}



function openMenu() {
    if (menuOpen) return;
    playSound('menu_open.ogg');
    menuOpen = true;
if (behavior) behavior.freezeForMenu();

    document.getElementById('cb-menu-name').textContent = settings.name || 'Boss';
    updateIndicators();

    const rect = actorEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    menuEl.style.left = (centerX - 130) + 'px';
    menuEl.style.top  = (centerY - 130) + 'px';

    menuEl.style.display = 'block';
    requestAnimationFrame(() => menuEl.classList.add('open'));

    document.addEventListener('pointerdown', onOutsideDown, true);
}

function onOutsideDown(e) {
    if (!menuOpen) return;
    if (menuEl.contains(e.target)) return;
    if (actorEl.contains(e.target)) return;
    closeMenu();
}

function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    menuEl.classList.remove('open');
    menuEl.style.display = 'none';
    document.removeEventListener('pointerdown', onOutsideDown, true);
    if (behavior) behavior.unfreezeFromMenu();
}

function handleMenuAction(action) {
    playSound('button_click.ogg');

    // Выходим из кресла ТОЛЬКО для действий, требующих встать
    if (behavior && (action === 'pet' || action === 'work' || action === 'chair')) {
        behavior.leaveChairMode();
    }

    switch (action) {
        case 'pet':
            if (behavior && behavior.busy && behavior.lastAction === 'work') {
                const phrases = ['Позже.', 'Я занят.', 'Не сейчас.'];
                showBubble(phrases[Math.floor(Math.random() * phrases.length)]);
            } else {
                enterPetting();
            }
            break;

        case 'work':
            if (!settings.deskEnabled || !deskEl || deskEl.style.display === 'none') {
                notify('Сначала включите «Рабочий стол» в настройках расширения.');
            } else {
                openWorkChooser();
            }
            break;

        case 'chair':
            if (!settings.chairEnabled || !chairEl || chairEl.style.display === 'none') {
                notify('Сначала включите «Кресло» в настройках расширения.');
            } else {
                openChairChooser();
            }
            break;

        case 'games':
            openGameChooser();
            break;

        case 'gifts':
            openGifts();
            break;

        case 'letters':
            openLetters();
            break;
    }
}


function notify(msg) {
    if (typeof toastr !== 'undefined') {
        toastr.info(msg, settings.name || 'Chibi Boss');
    } else {
        console.log('[ChibiBoss]', msg);
    }
}

// Речевой пузырёк над боссом (для коротких фраз)
let bubbleEl = null;
let bubbleTimer = null;

function showBubble(text, durationMs = 2000) {
    // не перебиваем активный длинный комментарий от API
    if (commentBubbleActive) return;

    if (!bubbleEl) {
        bubbleEl = document.createElement('div');
        bubbleEl.id = 'chibiBoss-bubble';
        document.getElementById('chibiBoss-layer').appendChild(bubbleEl);
    }

    clearTimeout(bubbleTimer);
    bubbleEl.textContent = text;

    const rect = actorEl.getBoundingClientRect();
    bubbleEl.style.left = (rect.left + rect.width / 2) + 'px';
    bubbleEl.style.top = (rect.top - 40) + 'px';
    bubbleEl.style.transform = 'translateX(-50%) translateY(5px)';

    requestAnimationFrame(() => {
        bubbleEl.classList.add('show');
    });

    bubbleTimer = setTimeout(() => {
        bubbleEl.classList.remove('show');
    }, durationMs);
}


// маленькое меню выбора времени работы
function openWorkChooser() {
    const old = document.getElementById('cb-work-chooser');
    if (old) old.remove();

    const box = document.createElement('div');
    box.id = 'cb-work-chooser';
    Object.assign(box.style, {
        position: 'absolute',
        zIndex: '10002',
        background: 'linear-gradient(160deg, var(--cb-panel) 0%, var(--cb-panel-deep) 100%)',
        backdropFilter: 'blur(10px)',
        border: '3px solid var(--cb-accent)',
        borderRadius: '12px',
        padding: '8px',
        display: 'flex',
        gap: '6px',
        pointerEvents: 'auto',
        boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
    });

    // создаём три кнопки: 5 / 15 / 30 минут
    const options = [5, 15, 30];
    options.forEach(min => {
        const btn = document.createElement('button');
        btn.textContent = min + ' мин';
        Object.assign(btn.style, {
            cursor: 'pointer',
            border: '2px solid var(--cb-line)',
            borderRadius: '8px',
            padding: '6px 12px',
            background: 'var(--cb-fill)',
            color: 'var(--cb-text)',
            fontFamily: "'cbPixel', monospace",
            fontSize: '11px',
            fontWeight: 'bold',
        });
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'var(--cb-line)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'var(--cb-fill)';
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            box.remove();
            if (behavior) behavior.goToWork(min * 60 * 1000);
            progress.workCount++;
            const today = getTodayStr();
            if (progress.workTodayDate !== today) { progress.workToday = 0; progress.workTodayDate = today; }
            progress.workToday++;
            saveProgress();
            checkGiftProgress();
            notify(`Отправлен работать на ${min} мин.`);
        });
        box.appendChild(btn);
    });

    const rect = actorEl.getBoundingClientRect();
    box.style.left = (rect.left + rect.width / 2 - 80) + 'px';
    box.style.top = (rect.top - 50) + 'px';

    document.getElementById('chibiBoss-layer').appendChild(box);

    const closeChooser = (e) => {
        if (box.contains(e.target)) return;
        box.remove();
        document.removeEventListener('pointerdown', closeChooser, true);
    };
    setTimeout(() => document.addEventListener('pointerdown', closeChooser, true), 0);
}
// маленькое меню выбора времени для кресла
function openChairChooser() {
    const old = document.getElementById('cb-chair-chooser');
    if (old) old.remove();

    const box = document.createElement('div');
    box.id = 'cb-chair-chooser';
    Object.assign(box.style, {
        position: 'absolute',
        zIndex: '10002',
        background: 'linear-gradient(160deg, var(--cb-panel) 0%, var(--cb-panel-deep) 100%)',
        backdropFilter: 'blur(10px)',
        border: '3px solid var(--cb-accent)',
        borderRadius: '12px',
        padding: '8px',
        display: 'flex',
        gap: '6px',
        pointerEvents: 'auto',
        boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
    });

    const options = [5, 10, 15];
    options.forEach(min => {
        const btn = document.createElement('button');
        btn.textContent = min + ' мин';
        Object.assign(btn.style, {
            cursor: 'pointer',
            border: '2px solid var(--cb-line)',
            borderRadius: '8px',
            padding: '6px 12px',
            background: 'var(--cb-fill)',
            color: 'var(--cb-text)',
            fontFamily: "'cbPixel', monospace",
            fontSize: '11px',
            fontWeight: 'bold',
        });
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'var(--cb-line)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'var(--cb-fill)';
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            box.remove();
            if (behavior) behavior.goToChair(min * 60 * 1000);
            notify(`Отправлен в кресло на ${min} мин.`);
        });
        box.appendChild(btn);
    });

    const rect = actorEl.getBoundingClientRect();
    box.style.left = (rect.left + rect.width / 2 - 80) + 'px';
    box.style.top = (rect.top - 50) + 'px';

    document.getElementById('chibiBoss-layer').appendChild(box);

    const closeChooser = (e) => {
        if (box.contains(e.target)) return;
        box.remove();
        document.removeEventListener('pointerdown', closeChooser, true);
    };
    setTimeout(() => document.addEventListener('pointerdown', closeChooser, true), 0);
}

// Меню выбора игры (крестики, шашки, шахматы)
function openGameChooser() {
    const old = document.getElementById('cb-game-chooser');
    if (old) old.remove();

    const box = document.createElement('div');
    box.id = 'cb-game-chooser';
    Object.assign(box.style, {
        position: 'absolute',
        zIndex: '10002',
        background: 'linear-gradient(160deg, var(--cb-panel) 0%, var(--cb-panel-deep) 100%)',
        backdropFilter: 'blur(10px)',
        border: '3px solid var(--cb-accent)',
        borderRadius: '12px',
        padding: '8px',
        display: 'flex',
        gap: '6px',
        flexDirection: 'column',
        pointerEvents: 'auto',
        boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
    });

    const games = [
        { name: 'Крестики-нолики', fn: openTicTacToe },
        { name: 'Шашки', fn: openCheckers },
        { name: 'Шахматы', fn: openChess },
    ];

    games.forEach(game => {
        const btn = document.createElement('button');
        btn.textContent = game.name;
        Object.assign(btn.style, {
            cursor: 'pointer',
            border: '2px solid var(--cb-line)',
            borderRadius: '8px',
            padding: '8px 14px',
            background: 'var(--cb-fill)',
            color: 'var(--cb-text)',
            fontFamily: "'cbPixel', monospace",
            fontSize: '11px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
        });
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'var(--cb-line)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'var(--cb-fill)';
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            box.remove();
            game.fn();
        });
        box.appendChild(btn);
    });

    const rect = actorEl.getBoundingClientRect();
    box.style.left = (rect.left + rect.width / 2 - 80) + 'px';
    box.style.top = (rect.top - 120) + 'px';

    document.getElementById('chibiBoss-layer').appendChild(box);

    const closeChooser = (e) => {
        if (box.contains(e.target)) return;
        box.remove();
        document.removeEventListener('pointerdown', closeChooser, true);
    };
    setTimeout(() => document.addEventListener('pointerdown', closeChooser, true), 0);
}

function setupMenu() {
    buildMenu();
actorEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (menuOpen) {
        closeMenu();
    } else {
        openMenu();
    }
});

}

// ------------------------------------------------------------
//  РАБОЧИЙ СТОЛ
// ------------------------------------------------------------
const DESK_POS_KEY = 'chibiBoss_deskPos';
const CHAIR_POS_KEY = 'chibiBoss_chairPos';  

let deskEl = null;
let deskLocked = false;
let statsEl = null;

let chairEl = null;
let chairLocked = false;


function loadDeskPos() {
    try {
        const raw = localStorage.getItem(DESK_POS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function saveDeskPos(x, y) {
    localStorage.setItem(DESK_POS_KEY, JSON.stringify({ x, y }));
}

function loadChairPos() {
    try {
        const raw = localStorage.getItem(CHAIR_POS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function saveChairPos(x, y) {
    localStorage.setItem(CHAIR_POS_KEY, JSON.stringify({ x, y }));
}


function createDesk() {
    deskEl = document.createElement('div');
    deskEl.id = 'chibiBoss-desk';

    const img = document.createElement('img');
    img.className = 'cb-desk-img';
    img.src = EXT_PATH + 'assets/desk.png';
    img.alt = 'Desk';
    img.draggable = false;
    deskEl.appendChild(img);

    // подсветка стола при наведении (как у календаря)
    deskEl.addEventListener('pointerenter', () => {
        img.src = EXT_PATH + 'assets/desk_hover.png';
    });

    deskEl.addEventListener('pointerleave', () => {
        img.src = EXT_PATH + 'assets/desk.png';
    });

    const cal = document.createElement('img');
    cal.className = 'cb-calendar';
    cal.src = EXT_PATH + 'assets/calendar.png';
    cal.alt = 'Calendar';
    cal.draggable = false;
    deskEl.appendChild(cal);

    document.getElementById('chibiBoss-layer').appendChild(deskEl);

    // стартовая позиция: левый нижний угол
    const saved = loadDeskPos();
    let dx, dy;
    if (saved) {
        const c = clampToScreen(saved.x, saved.y, 162);
        dx = c.x; dy = c.y;
    } else {
        dx = 20;
        dy = window.innerHeight - 182;
    }

    deskEl.style.left = dx + 'px';
    deskEl.style.top = dy + 'px';

    const zoom = (window.devicePixelRatio || 1) / baseDPR;
    deskEl.style.transform = `scale(${1 / zoom})`;

    setupDeskDragging();
    setupCalendar(cal);
    createStatsBoard();

    // показать/спрятать по настройке
    deskEl.style.display = settings.deskEnabled ? 'block' : 'none';
}
function createChair() {
    chairEl = document.createElement('div');
    chairEl.id = 'chibiBoss-chair';

    const img = document.createElement('img');
    img.className = 'cb-chair-img';
    img.src = EXT_PATH + 'assets/chair.png';
    img.alt = 'Chair';
    img.draggable = false;
    chairEl.appendChild(img);

    // подсветка кресла при наведении (как у стола)
    chairEl.addEventListener('pointerenter', () => {
        img.src = EXT_PATH + 'assets/chair_hover.png';
    });

    chairEl.addEventListener('pointerleave', () => {
        img.src = EXT_PATH + 'assets/chair.png';
    });

    document.getElementById('chibiBoss-layer').appendChild(chairEl);

    // стартовая позиция: правый нижний угол
    const saved = loadChairPos();
    let cx, cy;
    if (saved) {
        const c = clampToScreen(saved.x, saved.y, 130);
        cx = c.x; cy = c.y;
    } else {
        cx = window.innerWidth - 200;
        cy = window.innerHeight - 150;
    }

    chairEl.style.left = cx + 'px';
    chairEl.style.top = cy + 'px';

    const zoom = (window.devicePixelRatio || 1) / baseDPR;
    chairEl.style.transform = `scale(${1 / zoom})`;

    setupChairDragging();

    // показать/спрятать по настройке
    chairEl.style.display = settings.chairEnabled ? 'block' : 'none';
}

// --- перетаскивание стола (за сам стол, не за календарь) ---
let deskDrag = { active: false, offsetX: 0, offsetY: 0, pointerId: null };

function setupDeskDragging() {
    deskEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.classList.contains('cb-calendar')) return; // календарь не таскаем
        e.preventDefault();

        const rect = deskEl.getBoundingClientRect();
        deskDrag.active = true;
        deskDrag.pointerId = e.pointerId;
        deskDrag.offsetX = e.clientX - rect.left;
        deskDrag.offsetY = e.clientY - rect.top;

        deskEl.classList.add('dragging');
        deskEl.setPointerCapture(e.pointerId);
    });

    deskEl.addEventListener('pointermove', (e) => {
        if (!deskDrag.active || e.pointerId !== deskDrag.pointerId) return;

        const oldRect = deskEl.getBoundingClientRect();
        const oldCenterX = oldRect.left + oldRect.width / 2;
        const oldCenterY = oldRect.top + oldRect.height / 2;

        const nx = e.clientX - deskDrag.offsetX;
        const ny = e.clientY - deskDrag.offsetY;
        const c = clampToScreen(nx, ny, 130);
        deskEl.style.left = c.x + 'px';
        deskEl.style.top = c.y + 'px';


        // если босс работает за столом — двигаем его вместе со столом
        if (behavior && behavior.busy && behavior.lastAction === 'work' && animator.current === 'work') {
            const newRect = deskEl.getBoundingClientRect();
            const newCenterX = newRect.left + newRect.width / 2;
            const newCenterY = newRect.top + newRect.height / 2;

            const dx = newCenterX - oldCenterX;
            const dy = newCenterY - oldCenterY;

            const bossX = parseFloat(actorEl.style.left) || 0;
            const bossY = parseFloat(actorEl.style.top) || 0;

            actorEl.style.left = Math.round(bossX + dx) + 'px';
            actorEl.style.top = Math.round(bossY + dy) + 'px';
        }
    });

    const endDeskDrag = (e) => {
        if (!deskDrag.active || e.pointerId !== deskDrag.pointerId) return;
        deskDrag.active = false;
        deskEl.classList.remove('dragging');
        try { deskEl.releasePointerCapture(e.pointerId); } catch (err) {}
        const rect = deskEl.getBoundingClientRect();
        saveDeskPos(rect.left, rect.top);
    };

    deskEl.addEventListener('pointerup', endDeskDrag);
    deskEl.addEventListener('pointercancel', endDeskDrag);
}
// --- перетаскивание кресла ---
let chairDrag = { active: false, offsetX: 0, offsetY: 0, pointerId: null };

function setupChairDragging() {
    // Основной обработчик: клик по самому креслу
    chairEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        startChairDrag(e);
    });

    // Дополнительный обработчик: клик по чибику, пока он сидит в кресле.
    // Если чибик сидит — считаем это кликом по креслу (расширяем зону захвата).
    actorEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        // Проверяем: чибик сейчас сидит в кресле?
        if (behavior && behavior.busy && behavior.lastAction === 'chair' &&
            (animator.current === 'chair_sit' || animator.current === 'chair_sip')) {
            e.preventDefault();
            e.stopPropagation();
            startChairDrag(e);
        }
    }, true); // true = фаза захвата, сработает раньше обработчика перетаскивания чибика

    chairEl.addEventListener('pointermove', (e) => {
        if (!chairDrag.active || e.pointerId !== chairDrag.pointerId) return;

        const oldRect = chairEl.getBoundingClientRect();
        const oldCenterX = oldRect.left + oldRect.width / 2;
        const oldCenterY = oldRect.top + oldRect.height / 2;

        const nx = e.clientX - chairDrag.offsetX;
        const ny = e.clientY - chairDrag.offsetY;
        const c = clampToScreen(nx, ny, 130);
        chairEl.style.left = c.x + 'px';
        chairEl.style.top = c.y + 'px';

        // если босс сидит в кресле — двигаем его вместе с креслом
        if (behavior && behavior.busy && behavior.lastAction === 'chair' &&
            (animator.current === 'chair_sit' || animator.current === 'chair_sip')) {
            const newRect = chairEl.getBoundingClientRect();
            const newCenterX = newRect.left + newRect.width / 2;
            const newCenterY = newRect.top + newRect.height / 2;

            const dx = newCenterX - oldCenterX;
            const dy = newCenterY - oldCenterY;

            const bossX = parseFloat(actorEl.style.left) || 0;
            const bossY = parseFloat(actorEl.style.top) || 0;

            actorEl.style.left = Math.round(bossX + dx) + 'px';
            actorEl.style.top = Math.round(bossY + dy) + 'px';
        }
    });

    const endChairDrag = (e) => {
        if (!chairDrag.active || e.pointerId !== chairDrag.pointerId) return;
        chairDrag.active = false;
        chairEl.classList.remove('dragging');
        try { chairEl.releasePointerCapture(e.pointerId); } catch (err) {}
        const rect = chairEl.getBoundingClientRect();
        saveChairPos(rect.left, rect.top);
    };

    chairEl.addEventListener('pointerup', endChairDrag);
    chairEl.addEventListener('pointercancel', endChairDrag);
}

// Вспомогательная функция: начать перетаскивание кресла
function startChairDrag(e) {
    const rect = chairEl.getBoundingClientRect();
    chairDrag.active = true;
    chairDrag.pointerId = e.pointerId;
    chairDrag.offsetX = e.clientX - rect.left;
    chairDrag.offsetY = e.clientY - rect.top;

    chairEl.classList.add('dragging');
    chairEl.setPointerCapture(e.pointerId);
}



// --- календарь: подсветка + клик ---
function setupCalendar(cal) {
    cal.addEventListener('pointerenter', () => {
        cal.src = EXT_PATH + 'assets/calendar_hover.png';
    });
    cal.addEventListener('pointerleave', () => {
        cal.src = EXT_PATH + 'assets/calendar.png';
    });
    cal.addEventListener('click', (e) => {
        e.stopPropagation();
        openStats();
    });
}

// центр стола в экранных координатах (куда идёт босс работать)
function getDeskCenter() {
    const rect = deskEl.getBoundingClientRect();
    // центр стола в экранных координатах (уже учитывает transform: scale)
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return {
        x: Math.round(centerX),  // округляем сразу
        y: Math.round(centerY),
    };
}
function getChairCenter() {
    const rect = chairEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return {
        x: Math.round(centerX),
        y: Math.round(centerY),
    };
}


// показать/спрятать стол (вызывается из настроек)
function setDeskVisible(visible) {
    if (!deskEl) return;
    deskEl.style.display = visible ? 'block' : 'none';
    if (!visible) {
        closeStats();
        // если босс сейчас работает (или идёт к столу) — прерываем работу
        if (behavior && behavior.busy && behavior.lastAction === 'work') {
            clearTimeout(behavior.holdTimer);
            if (behavior.walkRaf) {
                cancelAnimationFrame(behavior.walkRaf);
                behavior.walkRaf = null;
            }
            deskLocked = false;
            behavior.busy = false;
            behavior.lastAction = null;
            animator.play('idle_front');
            behavior.scheduleNext();
        }
    }
}

function setChairVisible(visible) {
    if (!chairEl) return;
    chairEl.style.display = visible ? 'block' : 'none';
    if (!visible) {
        // если босс сейчас сидит в кресле — прерываем
        if (behavior && behavior.busy && behavior.lastAction === 'chair') {
            clearTimeout(behavior.holdTimer);
            if (behavior.walkRaf) {
                cancelAnimationFrame(behavior.walkRaf);
                behavior.walkRaf = null;
            }

            // ← НОВОЕ: корректно выходим из режима кресла
            // (снимает класс chair-mode, возвращает размер 124×124
            //  и перезагружает спрайт, чтобы не осталось растянутого кадра)
            behavior.leaveChairMode();

            behavior.busy = false;
            behavior.lastAction = null;
            behavior.scheduleNext();
        }
    }
}


// ------------------------------------------------------------
//  БОРД СТАТИСТИКИ (по клику на календарь)
// ------------------------------------------------------------
function createStatsBoard() {
    statsEl = document.createElement('div');
    statsEl.id = 'chibiBoss-stats';

    statsEl.innerHTML = `
        <div class="cb-stats-head">
            <span class="cb-stats-head-title">Календарь</span>
            <span class="cb-stats-close" id="cb-stats-close">✕</span>
        </div>
        <div class="cb-stats-clock" id="cb-stat-time">--:--</div>
        <div class="cb-stats-day" id="cb-stat-day"></div>
        <div class="cb-stats-date" id="cb-stat-date"></div>
        <div class="cb-stats-divider"></div>
        <div class="cb-stats-chip">
            <span class="cb-chip-label">В сети сегодня</span>
            <span class="cb-chip-value" id="cb-stat-timeInST">00:00:00</span>
        </div>
        <div class="cb-stats-chip">
            <span class="cb-chip-label">Привязанность</span>
            <span class="cb-chip-value" id="cb-stat-aff">0%</span>
        </div>
        <div class="cb-stats-chip">
            <span class="cb-chip-label">Стресс</span>
            <span class="cb-chip-value" id="cb-stat-stress">0%</span>
        </div>
    `;

    document.getElementById('chibiBoss-layer').appendChild(statsEl);

    document.getElementById('cb-stats-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeStats();
    });

    statsEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ------------------------------------------------------------
//  СТАТИСТИКА: «время в сети» за день
// ------------------------------------------------------------
const TIME_IN_ST_KEY = 'chibiBoss_timeInST';

function getTodayStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

let stTimer = null;
let stTimeStart = null;

function loadTimeInST() {
    try {
        const raw = localStorage.getItem(TIME_IN_ST_KEY);
        if (!raw) return { date: '', seconds: 0 };
        return JSON.parse(raw);
    } catch (e) {
        return { date: '', seconds: 0 };
    }
}

function saveTimeInST(date, seconds) {
    localStorage.setItem(TIME_IN_ST_KEY, JSON.stringify({ date, seconds }));
}

function getTimeInSTToday() {
    const today = getTodayStr();
    const saved = loadTimeInST();
    if (saved.date !== today) {
        saveTimeInST(today, 0);
        return 0;
    }
    return saved.seconds;
}

function startSTTimer() {
    if (stTimer) return;
    stTimeStart = Date.now();
    stTimer = setInterval(() => {
        if (!settings.enabled) return; // ← НОВАЯ СТРОКА: если персонаж выключен — не считаем время

        const today = getTodayStr();
        const saved = loadTimeInST();
        const elapsed = Math.floor((Date.now() - stTimeStart) / 1000);
        const newTotal = (saved.date === today) ? saved.seconds + elapsed : elapsed;
        saveTimeInST(today, newTotal);
        stTimeStart = Date.now();
        if (statsEl && statsEl.style.display === 'block') {
            fillStats();
        }
    }, 5000);
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}


function fillStats() {
    const now = new Date();

    const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
    const months = ['января','февраля','марта','апреля','мая','июня',
                    'июля','августа','сентября','октября','ноября','декабря'];

    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');

    const timeEl = document.getElementById('cb-stat-time');
    const dayEl  = document.getElementById('cb-stat-day');
    const dateEl = document.getElementById('cb-stat-date');
    const timeInStEl = document.getElementById('cb-stat-timeInST');
    const affEl = document.getElementById('cb-stat-aff');
    const stressEl = document.getElementById('cb-stat-stress');

    if (timeEl) timeEl.textContent = `${hh}:${mm}`;
    if (dayEl)  dayEl.textContent  = days[now.getDay()];
    if (dateEl) dateEl.textContent = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    if (timeInStEl) timeInStEl.textContent = formatTime(getTimeInSTToday());
    if (affEl) affEl.textContent = Math.round(settings.affection) + '%';
    if (stressEl) stressEl.textContent = Math.round(settings.stress) + '%';
}



let statsClock = null;

function openStats() {
    if (!statsEl) return;
    fillStats();

    // ставим борд рядом с календарём
    const rect = deskEl.getBoundingClientRect();
    let x = rect.left + rect.width + 10;
    let y = rect.top;
    if (x + 220 > window.innerWidth) x = rect.left - 230; // если не влезает — слева
    if (x < 0) x = 10;
    if (y + 300 > window.innerHeight) y = window.innerHeight - 300;
    if (y < 0) y = 10;


    statsEl.style.left = x + 'px';
    statsEl.style.top = y + 'px';
    statsEl.style.display = 'block';

    // обновляем часы каждую секунду, пока борд открыт
    clearInterval(statsClock);
    statsClock = setInterval(fillStats, 1000);

    document.addEventListener('pointerdown', onStatsOutside, true);
}

function onStatsOutside(e) {
    if (statsEl.contains(e.target)) return;
    if (deskEl && deskEl.contains(e.target)) return; // клик по столу/календарю не закрывает
    closeStats();
}

function closeStats() {
    if (!statsEl) return;
    statsEl.style.display = 'none';
    clearInterval(statsClock);
    statsClock = null;
    document.removeEventListener('pointerdown', onStatsOutside, true);
}

// ============================================================
//  ИГРЫ (крестики-нолики + шашки)
// ============================================================
const GAME_STATS_KEY = 'chibiBoss_gameStats';

function loadGameStats() {
    try {
        const raw = localStorage.getItem(GAME_STATS_KEY);
        const def = {
            ttt: { w: 0, l: 0 },
            checkers: { w: 0, l: 0 },
            chess: { w: 0, l: 0 },
        };
        return raw ? { ...def, ...JSON.parse(raw) } : def;
    } catch (e) {
        return {
            ttt: { w: 0, l: 0 },
            checkers: { w: 0, l: 0 },
            chess: { w: 0, l: 0 },
        };
    }
}


function saveGameStats(s) {
    localStorage.setItem(GAME_STATS_KEY, JSON.stringify(s));
}

let gameStats = loadGameStats();

// --- универсальное перетаскивание борда за шапку ---
function makeBoardDraggable(boardEl, handleEl) {
    let drag = { active: false, ox: 0, oy: 0, id: null };

    handleEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.classList.contains('cb-game-btn')) return; // кнопки не таскают
        e.preventDefault();
        const rect = boardEl.getBoundingClientRect();
        drag.active = true;
        drag.id = e.pointerId;
        drag.ox = e.clientX - rect.left;
        drag.oy = e.clientY - rect.top;
        handleEl.classList.add('dragging');
        handleEl.setPointerCapture(e.pointerId);
    });

    handleEl.addEventListener('pointermove', (e) => {
        if (!drag.active || e.pointerId !== drag.id) return;
        let x = e.clientX - drag.ox;
        let y = e.clientY - drag.oy;
        x = Math.max(0, Math.min(x, window.innerWidth - boardEl.offsetWidth));
        y = Math.max(0, Math.min(y, window.innerHeight - boardEl.offsetHeight));
        boardEl.style.left = x + 'px';
        boardEl.style.top = y + 'px';
    });

    const endDrag = (e) => {
        if (!drag.active || e.pointerId !== drag.id) return;
        drag.active = false;
        handleEl.classList.remove('dragging');
        try { handleEl.releasePointerCapture(e.pointerId); } catch (err) {}
    };
    handleEl.addEventListener('pointerup', endDrag);
    handleEl.addEventListener('pointercancel', endDrag);
}

// ставим борд сбоку от босса (справа, если влезает; иначе слева)
function positionBoardNearBoss(boardEl) {
    const rect = actorEl.getBoundingClientRect();
    const w = boardEl.offsetWidth || 300;
    const h = boardEl.offsetHeight || 360;
    let x = rect.right + 12;
    let y = rect.top;
    if (x + w > window.innerWidth) x = rect.left - w - 12;
    if (x < 0) x = 10;
    if (y + h > window.innerHeight) y = window.innerHeight - h - 10;
    if (y < 0) y = 10;
    boardEl.style.left = x + 'px';
    boardEl.style.top = y + 'px';
}

// ------------------------------------------------------------
//  КРЕСТИКИ-НОЛИКИ  (игрок = X, босс = O)
// ------------------------------------------------------------
let tttEl = null;
let tttBoard = null;       // массив из 9: '', 'x', 'o'
let tttLocked = false;     // блок ввода во время хода босса

function buildTttBoard() {
    tttEl = document.createElement('div');
    tttEl.className = 'cb-game-board';
    tttEl.id = 'chibiBoss-ttt';
    tttEl.style.width = '236px';

    tttEl.innerHTML = `
        <div class="cb-game-head" id="cb-ttt-head">
            <div class="cb-game-controls">
                <button class="cb-game-btn" id="cb-ttt-new">Заново</button>
                <button class="cb-game-btn" id="cb-ttt-close">✕</button>
            </div>
            <div class="cb-game-score">
                <span>👑 <b id="cb-ttt-w">0</b></span>
                <span>💀 <b id="cb-ttt-l">0</b></span>
            </div>
        </div>
        <div class="cb-game-status" id="cb-ttt-status">Твой ход</div>
        <div class="cb-ttt-grid" id="cb-ttt-grid"></div>
    `;
    document.getElementById('chibiBoss-layer').appendChild(tttEl);

    const grid = tttEl.querySelector('#cb-ttt-grid');
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'cb-ttt-cell';
        cell.dataset.i = i;
        cell.addEventListener('click', () => tttPlayerMove(i));
        grid.appendChild(cell);
    }

    tttEl.querySelector('#cb-ttt-close').addEventListener('click', closeTtt);
    tttEl.querySelector('#cb-ttt-new').addEventListener('click', tttReset);
    makeBoardDraggable(tttEl, tttEl.querySelector('#cb-ttt-head'));
    tttEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

function tttUpdateScore() {
    tttEl.querySelector('#cb-ttt-w').textContent = gameStats.ttt.w;
    tttEl.querySelector('#cb-ttt-l').textContent = gameStats.ttt.l;
}

function tttRender() {
    const cells = tttEl.querySelectorAll('.cb-ttt-cell');
    cells.forEach((c, i) => {
        c.className = 'cb-ttt-cell';
        if (tttBoard[i] === 'x') { c.textContent = '✕'; c.classList.add('x'); }
        else if (tttBoard[i] === 'o') { c.textContent = '◯'; c.classList.add('o'); }
        else { c.textContent = ''; }
    });
}

function tttReset() {
    tttBoard = ['', '', '', '', '', '', '', '', ''];
    tttLocked = false;
    tttEl.querySelector('#cb-ttt-status').textContent = 'Твой ход';
    tttRender();
}

function tttWinner(b) {
    const lines = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6],
    ];
    for (const [a,bb,c] of lines) {
        if (b[a] && b[a] === b[bb] && b[a] === b[c]) return { who: b[a], line: [a,bb,c] };
    }
    if (b.every(v => v)) return { who: 'draw', line: null };
    return null;
}

function tttHighlightWin(line) {
    if (!line) return;
    const cells = tttEl.querySelectorAll('.cb-ttt-cell');
    line.forEach(i => cells[i].classList.add('win'));
}

function tttPlayerMove(i) {
    if (tttLocked || tttBoard[i]) return;
    tttBoard[i] = 'x';
    relieveStressFromGame(STRESS_RELIEF_PER_MOVE);   // ← ДОБАВЬ ЭТУ СТРОКУ
    tttRender();

    let res = tttWinner(tttBoard);
    if (res) return tttEnd(res);

    tttLocked = true;
    tttEl.querySelector('#cb-ttt-status').textContent = 'Босс думает...';
    setTimeout(tttAiMove, 500);
}


function tttAiMove() {
    const move = tttChooseMove();
    if (move != null) tttBoard[move] = 'o';
    tttRender();

    const res = tttWinner(tttBoard);
    if (res) return tttEnd(res);

    tttLocked = false;
    tttEl.querySelector('#cb-ttt-status').textContent = 'Твой ход';
}

// выбор хода ИИ с учётом сложности
function tttChooseMove() {
    const empty = tttBoard.map((v, i) => v ? null : i).filter(v => v !== null);
    if (!empty.length) return null;

    const diff = settings.gameDifficulty;
    let mistakeChance = 0;
    if (diff === 'easy') mistakeChance = 0.6;
    else if (diff === 'normal') mistakeChance = 0.25;
    else mistakeChance = 0; // hard — без ошибок

    if (Math.random() < mistakeChance) {
        return empty[Math.floor(Math.random() * empty.length)];
    }
    return tttMinimax(tttBoard.slice(), 'o').index;
}

// minimax: 'o' максимизирует, 'x' минимизирует
function tttMinimax(board, player) {
    const res = tttWinner(board);
    if (res) {
        if (res.who === 'o') return { score: 10 };
        if (res.who === 'x') return { score: -10 };
        return { score: 0 };
    }

    const empty = board.map((v, i) => v ? null : i).filter(v => v !== null);
    const moves = [];

    for (const idx of empty) {
        const nb = board.slice();
        nb[idx] = player;
        const score = tttMinimax(nb, player === 'o' ? 'x' : 'o').score;
        moves.push({ index: idx, score });
    }

    if (player === 'o') {
        return moves.reduce((best, m) => m.score > best.score ? m : best, { score: -Infinity });
    } else {
        return moves.reduce((best, m) => m.score < best.score ? m : best, { score: Infinity });
    }
}

function tttEnd(res) {
    tttLocked = true;
    relieveStressFromGame(STRESS_RELIEF_PER_GAME);   // ← ДОБАВЬ ЭТУ СТРОКУ
    const status = tttEl.querySelector('#cb-ttt-status');
    if (res.who === 'draw') {
        status.textContent = 'Ничья!';
    } else if (res.who === 'x') {
        status.textContent = 'Ты выиграл! 👑';
        gameStats.ttt.w++;
        saveGameStats(gameStats);
        tttUpdateScore();
        // победа над боссом немного повышает привязанность
        settings.affection = Math.min(100, settings.affection + 2);
        saveSettings(settings);
        progress.tttWins++;
        if (settings.gameDifficulty === 'hard') progress.tttWinsHard++;
        progress.totalWins++; progress.totalGames++;
        saveProgress(); checkGiftProgress();
    } else {
        status.textContent = 'Босс выиграл! 💀';
        gameStats.ttt.l++;
        saveGameStats(gameStats);
        tttUpdateScore();
        progress.totalGames++; saveProgress();
    }
    tttHighlightWin(res.line);
    setTimeout(tttReset, 2000); // через 2 сек новая игра

}

function openTicTacToe() {
    closeCheckers();
    closeChess();
    if (!tttEl) buildTttBoard();
    tttUpdateScore();
    tttReset();
    tttEl.style.display = 'block';
    positionBoardNearBoss(tttEl);
}



function closeTtt() {
    if (tttEl) tttEl.style.display = 'none';
}

// ------------------------------------------------------------
//  ШАШКИ  (игрок = светлые снизу, босс = тёмные сверху)
//  Поле 8×8. Фишки ходят по диагонали. Бьём прыжком.
//  Дамка ходит в обе стороны. Бой обязателен.
// ------------------------------------------------------------
let chEl = null;
let chBoard = null;        // 8x8: 0 пусто, 'p'/'P' игрок/дамка, 'a'/'A' босс/дамка
let chSelected = null;     // [r,c] выбранной фишки
let chValidMoves = [];     // ходы выбранной фишки
let chLocked = false;
let chCaptured = { player: 0, ai: 0 }; // счётчики съеденных

let chTimer = null;
let chStartTime = 0;

function chStartTimer() {
    chStopTimer();
    chStartTime = Date.now();
    chTimer = setInterval(() => {
        if (!chEl) return;
        const elapsed = Math.floor((Date.now() - chStartTime) / 1000);
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        const el = document.getElementById('cb-ch-timer');
        if (el) el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);
}

function chStopTimer() {
    if (chTimer) {
        clearInterval(chTimer);
        chTimer = null;
    }
}


function chInitBoard() {
    const b = [];
    for (let r = 0; r < 8; r++) {
        const row = [];
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 1) {
                if (r < 3) row.push('a');        // босс сверху
                else if (r > 4) row.push('p');   // игрок снизу
                else row.push(0);
            } else {
                row.push(0);
            }
        }
        b.push(row);
    }
    return b;
}

function chIsPlayer(v) { return v === 'p' || v === 'P'; }
function chIsAi(v) { return v === 'a' || v === 'A'; }
function chIsKing(v) { return v === 'P' || v === 'A'; }
function chInside(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

// все ходы стороны: side = 'player' | 'ai'
// возвращает {moves:[...], captures:[...]}; если есть бои — ходить можно только ими
function chGetMoves(board, side) {
    const moves = [];
    const captures = [];
    const own = side === 'player' ? chIsPlayer : chIsAi;
    const foe = side === 'player' ? chIsAi : chIsPlayer;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const v = board[r][c];
            if (!own(v)) continue;

            const dirs = chIsKing(v)
                ? [[-1,-1],[-1,1],[1,-1],[1,1]]
                : (side === 'player' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);

            // обычные ходы
            for (const [dr, dc] of (chIsKing(v) ? [[-1,-1],[-1,1],[1,-1],[1,1]] : dirs)) {
                const nr = r + dr, nc = c + dc;
                if (chInside(nr, nc) && board[nr][nc] === 0) {
                    if (chIsKing(v) || dirs.some(d => d[0] === dr && d[1] === dc)) {
                        moves.push({ from: [r, c], to: [nr, nc], cap: null });
                    }
                }
            }

            // бои (для всех — в любую сторону)
            for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
                const mr = r + dr, mc = c + dc;       // соседняя клетка (жертва)
                const lr = r + dr * 2, lc = c + dc * 2; // куда прыгаем
                if (chInside(lr, lc) && board[lr][lc] === 0 &&
                    chInside(mr, mc) && foe(board[mr][mc])) {
                    captures.push({ from: [r, c], to: [lr, lc], cap: [mr, mc] });
                }
            }
        }
    }
    return { moves, captures };
}

// применить ход к доске (возвращает новую доску); учитывает превращение в дамку
function chApply(board, move) {
    const nb = board.map(row => row.slice());
    const [fr, fc] = move.from;
    const [tr, tc] = move.to;
    let piece = nb[fr][fc];
    nb[fr][fc] = 0;
    if (move.cap) {
        const [cr, cc] = move.cap;
        nb[cr][cc] = 0;
    }
    // превращение в дамку
    if (piece === 'p' && tr === 0) piece = 'P';
    if (piece === 'a' && tr === 7) piece = 'A';
    nb[tr][tc] = piece;
    return nb;
}

// есть ли у фишки [r,c] продолжение боя
function chHasMoreCaptures(board, r, c, side) {
    const foe = side === 'player' ? chIsAi : chIsPlayer;
    const v = board[r][c];
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        const mr = r + dr, mc = c + dc;
        const lr = r + dr * 2, lc = c + dc * 2;
        if (chInside(lr, lc) && board[lr][lc] === 0 &&
            chInside(mr, mc) && foe(board[mr][mc])) {
            return true;
        }
    }
    return false;
}

function buildCheckersBoard() {
    chEl = document.createElement('div');
    chEl.className = 'cb-game-board';
    chEl.id = 'chibiBoss-checkers';
    chEl.style.width = '392px';

    chEl.innerHTML = `
        <div class="cb-game-head" id="cb-ch-head">
            <div class="cb-game-controls">
                <button class="cb-game-btn" id="cb-ch-new">Заново</button>
                <button class="cb-game-btn" id="cb-ch-close">✕</button>
            </div>
            <div class="cb-game-score">
                <span>👑 <b id="cb-ch-w">0</b></span>
                <span>💀 <b id="cb-ch-l">0</b></span>
            </div>
        </div>
        <div class="cb-game-status" id="cb-ch-status">Твой ход</div>
        <div class="cb-game-timer" id="cb-ch-timer">00:00</div>
        <div class="cb-checkers-wrap">
            <div class="cb-checkers-grid" id="cb-ch-grid"></div>
            <div class="cb-captured">
                <div class="cb-cap-label">съедено</div>
                <div class="cb-captured-row" id="cb-cap-ai"></div>
                <div class="cb-cap-label">боссом</div>
                <div class="cb-captured-row" id="cb-cap-player"></div>
            </div>
        </div>
    `;
    document.getElementById('chibiBoss-layer').appendChild(chEl);

    chEl.querySelector('#cb-ch-close').addEventListener('click', closeCheckers);
    chEl.querySelector('#cb-ch-new').addEventListener('click', chReset);
    makeBoardDraggable(chEl, chEl.querySelector('#cb-ch-head'));
    chEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

function chUpdateScore() {
    chEl.querySelector('#cb-ch-w').textContent = gameStats.checkers.w;
    chEl.querySelector('#cb-ch-l').textContent = gameStats.checkers.l;
}

function chRender() {
    const grid = chEl.querySelector('#cb-ch-grid');
    grid.innerHTML = '';

    // целевые клетки для подсветки
    const targets = chValidMoves.map(m => m.to[0] + ',' + m.to[1]);

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            const playable = (r + c) % 2 === 1;
            cell.className = 'cb-ch-cell ' + (playable ? 'dark playable' : 'light');
            cell.dataset.r = r;
            cell.dataset.c = c;

            if (chSelected && chSelected[0] === r && chSelected[1] === c) {
                cell.classList.add('selected');
            }
            if (targets.includes(r + ',' + c)) {
                cell.classList.add('target');
            }

            const v = chBoard[r][c];
            if (v !== 0) {
                const p = document.createElement('div');
                p.className = 'cb-piece ' + (chIsPlayer(v) ? 'player' : 'ai');
                if (chIsKing(v)) p.classList.add('king');
                cell.appendChild(p);
            }

            if (playable) cell.addEventListener('click', () => chCellClick(r, c));
            grid.appendChild(cell);
        }
    }

    // съеденные
    const capAi = chEl.querySelector('#cb-cap-ai');
    const capPl = chEl.querySelector('#cb-cap-player');
    capAi.innerHTML = '';
    capPl.innerHTML = '';
    for (let i = 0; i < chCaptured.ai; i++) {
        const m = document.createElement('div');
        m.className = 'cb-cap-mini ai';
        capAi.appendChild(m);
    }
    for (let i = 0; i < chCaptured.player; i++) {
        const m = document.createElement('div');
        m.className = 'cb-cap-mini player';
        capPl.appendChild(m);
    }
}

function chReset() {
    chStopTimer();
    chBoard = chInitBoard();
    chSelected = null;
    chValidMoves = [];
    chLocked = false;
    chCaptured = { player: 0, ai: 0 };
    chEl.querySelector('#cb-ch-status').textContent = 'Твой ход';
    chRender();
    chStartTimer();  // запустить таймер

}

function chCellClick(r, c) {
    if (chLocked) return;

    const { moves, captures } = chGetMoves(chBoard, 'player');
    const available = captures.length ? captures : moves; // бой обязателен

    // клик по своей фишке — выбрать
    if (chIsPlayer(chBoard[r][c])) {
        const pieceMoves = available.filter(m => m.from[0] === r && m.from[1] === c);
        if (pieceMoves.length) {
            chSelected = [r, c];
            chValidMoves = pieceMoves;
            chRender();
        }
        return;
    }

    // клик по целевой клетке — ходить
    if (chSelected) {
        const move = chValidMoves.find(m => m.to[0] === r && m.to[1] === c);
        if (move) {
            chBoard = chApply(chBoard, move);
            if (move.cap) chCaptured.ai++;

            // продолжение боя той же фишкой
            if (move.cap && chHasMoreCaptures(chBoard, r, c, 'player')) {
                chSelected = [r, c];
                const next = chGetMoves(chBoard, 'player').captures
                    .filter(m => m.from[0] === r && m.from[1] === c);
                chValidMoves = next;
                chRender();
                return;
            }

            chSelected = null;
            chValidMoves = [];
            chRender();

            if (chCheckEnd('player')) return;

            chLocked = true;
            chEl.querySelector('#cb-ch-status').textContent = 'Босс думает...';
            setTimeout(chAiTurn, 600);
        }
    }
}

function chAiTurn() {
    let moved = true;
    // ИИ может делать цепочку боёв
    while (moved) {
        const move = chAiChooseMove();
        if (!move) break;

        chBoard = chApply(chBoard, move);
        if (move.cap) chCaptured.player++;
        // НЕ рисуем внутри цикла — подождём завершения цепочки

        // продолжение боя
        if (move.cap && chHasMoreCaptures(chBoard, move.to[0], move.to[1], 'ai')) {
            const more = chGetMoves(chBoard, 'ai').captures
                .filter(m => m.from[0] === move.to[0] && m.from[1] === move.to[1]);
            if (more.length) { continue; }
        }
        moved = false;
    }

    chRender();  // одна перерисовка после завершения хода
    if (chCheckEnd('ai')) return;

    chLocked = false;
    chEl.querySelector('#cb-ch-status').textContent = 'Твой ход';
}

// выбор хода ИИ по сложности
function chAiChooseMove() {
    const { moves, captures } = chGetMoves(chBoard, 'ai');
    const pool = captures.length ? captures : moves;
    if (!pool.length) return null;

    const diff = settings.gameDifficulty;

    if (diff === 'easy') {
        // случайный ход
        return pool[Math.floor(Math.random() * pool.length)];
    }

    if (diff === 'normal') {
        // жадный: предпочитает бои, иначе случайный ход
        if (captures.length) return captures[Math.floor(Math.random() * captures.length)];
        return moves[Math.floor(Math.random() * moves.length)];
    }

    // hard — minimax с глубиной 2
    let best = null, bestScore = -Infinity;
    for (const m of pool) {
        const nb = chApply(chBoard, m);
        let score = chEvaluate(nb) + (m.cap ? 8 : 0);
        // второй уровень (ответный ход игрока)
        const resp = chGetMoves(nb, 'player');
        const respPool = resp.captures.length ? resp.captures : resp.moves;
        if (respPool.length) {
            let worstResp = Infinity;
            for (const rm of respPool.slice(0, 5)) {  // проверяем до 5 лучших ответов
                const nb2 = chApply(nb, rm);
                const s2 = chEvaluate(nb2);
                if (s2 < worstResp) worstResp = s2;
            }
            score = (score + worstResp) / 2;  // средняя оценка
        }
        if (score > bestScore) { bestScore = score; best = m; }
    }
    return best || pool[0];

}

// простая оценка позиции для ИИ (босс хочет больше своих фишек)
function chEvaluate(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const v = board[r][c];
            if (v === 'a') score += 3 + r;       // продвижение вниз ценно
            else if (v === 'A') score += 8;
            else if (v === 'p') score -= 3 + (7 - r);
            else if (v === 'P') score -= 8;
        }
    }
    return score;
}

// проверка конца игры; кто не может ходить — проиграл
function chCheckEnd(justMoved) {
    const playerMoves = chGetMoves(chBoard, 'player');
    const aiMoves = chGetMoves(chBoard, 'ai');
    const playerCan = playerMoves.moves.length || playerMoves.captures.length;
    const aiCan = aiMoves.moves.length || aiMoves.captures.length;

    const status = chEl.querySelector('#cb-ch-status');

    // если партия завершилась — снимаем стресс
    if (!aiCan || !playerCan) {
        relieveStressFromGame(STRESS_RELIEF_PER_GAME);   // ← ДОБАВЬ ЭТОТ БЛОК
    }

    if (!aiCan) {
        status.textContent = 'Ты выиграл! 👑';
        gameStats.checkers.w++;
        saveGameStats(gameStats);
        chUpdateScore();
        settings.affection = Math.min(100, settings.affection + 3);
        saveSettings(settings);
        progress.checkersWins++;
        if (settings.gameDifficulty === 'hard') progress.checkersWinsHard++;
        progress.totalWins++; progress.totalGames++;
        saveProgress(); checkGiftProgress();
        chLocked = true;
        chStopTimer();
        setTimeout(chReset, 2500);  // через 2.5 сек новая игра
        return true;
    }
    if (!playerCan) {
        status.textContent = 'Босс выиграл! 💀';
        gameStats.checkers.l++;
        saveGameStats(gameStats);
        chUpdateScore();
        progress.totalGames++; saveProgress();
        chLocked = true;
        chStopTimer();
        setTimeout(chReset, 2500);
        return true;
    }

    return false;
}

function openCheckers() {
    closeTtt();
    closeChess();
    if (!chEl) buildCheckersBoard();
    chUpdateScore();
    chReset();
    chEl.style.display = 'block';
    positionBoardNearBoss(chEl);
}



function closeCheckers() {
    if (chEl) chEl.style.display = 'none';
    chStopTimer();
}
// ============================================================
//  ШАХМАТЫ  (игрок = белые снизу, босс = чёрные сверху)
//  Ряд 0 — верх (чёрные), ряд 7 — низ (белые).
//  Фигуры: объект { type, color, moved }
//  type: 'p' пешка, 'n' конь, 'b' слон, 'r' ладья, 'q' ферзь, 'k' король
//  color: 'w' игрок (белые), 'b' босс (чёрные)
// ============================================================
let csEl = null;
let csBoard = null;         // 8x8 массив: null или { type, color, moved }
let csSelected = null;      // [r,c] выбранной фигуры
let csValidMoves = [];      // ходы выбранной фигуры
let csLocked = false;       // блок ввода во время хода босса
let csEnPassant = null;     // [r,c] клетка для взятия на проходе
let csCaptured = { player: [], ai: [] }; // съеденные фигуры (типы)

let csTimer = null;
let csStartTime = 0;

// символы фигур (Unicode) для отрисовки
const CS_GLYPH = {
    wp: '♟', wn: '♞', wb: '♝', wr: '♜', wq: '♛', wk: '♚',
    bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};


// ценность фигур (для ИИ и подсчёта)
const CS_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// направления ходов
const CS_DIRS = {
    n: [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]],
    b: [[-1,-1],[-1,1],[1,-1],[1,1]],
    r: [[-1,0],[1,0],[0,-1],[0,1]],
    q: [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]],
    k: [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]],
};

function csTimerStart() {
    csTimerStop();
    csStartTime = Date.now();
    csTimer = setInterval(() => {
        if (!csEl) return;
        const elapsed = Math.floor((Date.now() - csStartTime) / 1000);
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        const el = document.getElementById('cb-cs-timer');
        if (el) el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);
}

function csTimerStop() {
    if (csTimer) { clearInterval(csTimer); csTimer = null; }
}

function csInside(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

// стартовая расстановка
function csInitBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(null));
    const back = ['r','n','b','q','k','b','n','r'];
    for (let c = 0; c < 8; c++) {
        b[0][c] = { type: back[c], color: 'b', moved: false };
        b[1][c] = { type: 'p',     color: 'b', moved: false };
        b[6][c] = { type: 'p',     color: 'w', moved: false };
        b[7][c] = { type: back[c], color: 'w', moved: false };
    }
    return b;
}

// глубокая копия доски
function csClone(board) {
    return board.map(row => row.map(p => p ? { ...p } : null));
}

// собрать псевдо-ходы одной фигуры (без проверки на шах)
function csPieceMoves(board, r, c, ep) {
    const p = board[r][c];
    if (!p) return [];
    const moves = [];
    const foe = p.color === 'w' ? 'b' : 'w';

    if (p.type === 'p') {
        const fwd = p.color === 'w' ? -1 : 1;      // белые идут вверх
        const startRow = p.color === 'w' ? 6 : 1;
        const nr = r + fwd;
        // ход вперёд на 1
        if (csInside(nr, c) && !board[nr][c]) {
            moves.push({ from: [r, c], to: [nr, c] });
            // ход на 2 из начальной позиции
            const nr2 = r + fwd * 2;
            if (r === startRow && !board[nr2][c]) {
                moves.push({ from: [r, c], to: [nr2, c], dbl: true });
            }
        }
        // взятия по диагонали
        for (const dc of [-1, 1]) {
            const cc = c + dc;
            if (!csInside(nr, cc)) continue;
            if (board[nr][cc] && board[nr][cc].color === foe) {
                moves.push({ from: [r, c], to: [nr, cc] });
            }
            // взятие на проходе
            if (ep && ep[0] === nr && ep[1] === cc) {
                moves.push({ from: [r, c], to: [nr, cc], ep: true });
            }
        }
    } else if (p.type === 'n' || p.type === 'k') {
        for (const [dr, dc] of CS_DIRS[p.type]) {
            const nr = r + dr, nc = c + dc;
            if (!csInside(nr, nc)) continue;
            const t = board[nr][nc];
            if (!t || t.color === foe) moves.push({ from: [r, c], to: [nr, nc] });
        }
    } else {
        // слон / ладья / ферзь — скользят
        for (const [dr, dc] of CS_DIRS[p.type]) {
            let nr = r + dr, nc = c + dc;
            while (csInside(nr, nc)) {
                const t = board[nr][nc];
                if (!t) { moves.push({ from: [r, c], to: [nr, nc] }); }
                else { if (t.color === foe) moves.push({ from: [r, c], to: [nr, nc] }); break; }
                nr += dr; nc += dc;
            }
        }
    }
    return moves;
}

// найти короля цвета color
function csFindKing(board, color) {
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++)
            if (board[r][c] && board[r][c].type === 'k' && board[r][c].color === color)
                return [r, c];
    return null;
}

// атакована ли клетка [r,c] стороной byColor
function csIsAttacked(board, r, c, byColor) {
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            const p = board[i][j];
            if (!p || p.color !== byColor) continue;
            if (p.type === 'p') {
                const fwd = p.color === 'w' ? -1 : 1;
                if (i + fwd === r && (j - 1 === c || j + 1 === c)) return true;
            } else {
                const ms = csPieceMoves(board, i, j, null);
                if (ms.some(m => m.to[0] === r && m.to[1] === c)) return true;
            }
        }
    }
    return false;
}

// под шахом ли король цвета color
function csInCheck(board, color) {
    const k = csFindKing(board, color);
    if (!k) return false;
    return csIsAttacked(board, k[0], k[1], color === 'w' ? 'b' : 'w');
}

// применить ход к КОПИИ доски; вернуть { board, ep }
function csApply(board, move) {
    const nb = csClone(board);
    const [fr, fc] = move.from;
    const [tr, tc] = move.to;
    const piece = nb[fr][fc];
    let newEp = null;

    nb[fr][fc] = null;

    // взятие на проходе — убрать пешку сбоку
    if (move.ep) {
        nb[fr][tc] = null;
    }
    // рокировка — двигаем ладью
    if (move.castle) {
        const row = fr;
        if (tc === 6) { nb[row][5] = nb[row][7]; nb[row][7] = null; if (nb[row][5]) nb[row][5].moved = true; }
        else if (tc === 2) { nb[row][3] = nb[row][0]; nb[row][0] = null; if (nb[row][3]) nb[row][3].moved = true; }
    }

    piece.moved = true;
    // превращение пешки в ферзя
    if (piece.type === 'p' && (tr === 0 || tr === 7)) piece.type = 'q';
    nb[tr][tc] = piece;

    // выставить клетку для взятия на проходе
    if (move.dbl) newEp = [(fr + tr) / 2, fc];

    return { board: nb, ep: newEp };
}

// все ЛЕГАЛЬНЫЕ ходы стороны color (не оставляющие короля под шахом)
function csLegalMoves(board, color, ep) {
    const legal = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p || p.color !== color) continue;
            const pseudo = csPieceMoves(board, r, c, ep);
            for (const m of pseudo) {
                const { board: nb } = csApply(board, m);
                if (!csInCheck(nb, color)) legal.push(m);
            }
        }
    }
    // рокировки (добавляем, если легальны)
    csAddCastling(board, color, legal);
    return legal;
}

// добавить ходы-рокировки, если возможны
function csAddCastling(board, color, legal) {
    const row = color === 'w' ? 7 : 0;
    const king = board[row][4];
    if (!king || king.type !== 'k' || king.moved) return;
    if (csIsAttacked(board, row, 4, color === 'w' ? 'b' : 'w')) return; // король под шахом

    // короткая рокировка (вправо)
    const rookK = board[row][7];
    if (rookK && rookK.type === 'r' && !rookK.moved &&
        !board[row][5] && !board[row][6] &&
        !csIsAttacked(board, row, 5, color === 'w' ? 'b' : 'w') &&
        !csIsAttacked(board, row, 6, color === 'w' ? 'b' : 'w')) {
        legal.push({ from: [row, 4], to: [row, 6], castle: true });
    }
    // длинная рокировка (влево)
    const rookQ = board[row][0];
    if (rookQ && rookQ.type === 'r' && !rookQ.moved &&
        !board[row][1] && !board[row][2] && !board[row][3] &&
        !csIsAttacked(board, row, 3, color === 'w' ? 'b' : 'w') &&
        !csIsAttacked(board, row, 2, color === 'w' ? 'b' : 'w')) {
        legal.push({ from: [row, 4], to: [row, 2], castle: true });
    }
}
// ---- таблицы позиционной ценности (бонус за хорошие клетки) ----
// значения даны с точки зрения БЕЛЫХ (ряд 7 — низ). Для чёрных зеркалим.
const CS_PST = {
    p: [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [ 5,  5, 10, 25, 25, 10,  5,  5],
        [ 0,  0,  0, 20, 20,  0,  0,  0],
        [ 5, -5,-10,  0,  0,-10, -5,  5],
        [ 5, 10, 10,-20,-20, 10, 10,  5],
        [ 0,  0,  0,  0,  0,  0,  0,  0],
    ],
    n: [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50],
    ],
    b: [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20],
    ],
    r: [
        [ 0,  0,  0,  0,  0,  0,  0,  0],
        [ 5, 10, 10, 10, 10, 10, 10,  5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [-5,  0,  0,  0,  0,  0,  0, -5],
        [ 0,  0,  0,  5,  5,  0,  0,  0],
    ],
    q: [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [ -5,  0,  5,  5,  5,  5,  0, -5],
        [  0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20],
    ],
    k: [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [ 20, 20,  0,  0,  0,  0, 20, 20],
        [ 20, 30, 10,  0,  0, 10, 30, 20],
    ],
};

// оценка позиции. Положительно = хорошо для БОССА (чёрные).
function csEvaluate(board) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;
            const material = CS_VALUE[p.type];
            // позиционный бонус: для белых берём как есть, для чёрных зеркалим по вертикали
            const pst = CS_PST[p.type];
            const posBonus = p.color === 'w' ? pst[r][c] : pst[7 - r][c];
            const val = material + posBonus;
            // босс = чёрные → его фигуры со знаком +
            if (p.color === 'b') score += val;
            else score -= val;
        }
    }
    return score;
}

// minimax с альфа-бета отсечением
// maximizing = true → ход босса (чёрные), хотим максимум
function csMinimax(board, depth, alpha, beta, maximizing, ep) {
    if (depth === 0) return csEvaluate(board);

    const color = maximizing ? 'b' : 'w';
    const moves = csLegalMoves(board, color, ep);

    // нет ходов: мат или пат
    if (!moves.length) {
        if (csInCheck(board, color)) {
            // мат: очень плохо для стороны, которой ходить
            return maximizing ? -100000 + (10 - depth) : 100000 - (10 - depth);
        }
        return 0; // пат
    }

    if (maximizing) {
        let best = -Infinity;
        for (const m of moves) {
            const { board: nb, ep: nep } = csApply(board, m);
            const val = csMinimax(nb, depth - 1, alpha, beta, false, nep);
            best = Math.max(best, val);
            alpha = Math.max(alpha, val);
            if (beta <= alpha) break;
        }
        return best;
    } else {
        let best = Infinity;
        for (const m of moves) {
            const { board: nb, ep: nep } = csApply(board, m);
            const val = csMinimax(nb, depth - 1, alpha, beta, true, nep);
            best = Math.min(best, val);
            beta = Math.min(beta, val);
            if (beta <= alpha) break;
        }
        return best;
    }
}

// выбор хода ИИ (босс = чёрные) по уровню сложности
function csAiChooseMove() {
    const moves = csLegalMoves(csBoard, 'b', csEnPassant);
    if (!moves.length) return null;

    const diff = settings.gameDifficulty;

    // лёгкий: часто ходит случайно
    if (diff === 'easy') {
        if (Math.random() < 0.6) return moves[Math.floor(Math.random() * moves.length)];
    }

    // глубина поиска по сложности
    let depth;
    if (diff === 'easy') depth = 1;
    else if (diff === 'normal') depth = 2;
    else depth = 3; // hard

    // на нормальном иногда ошибается
    const mistakeChance = diff === 'normal' ? 0.15 : 0;
    if (mistakeChance && Math.random() < mistakeChance) {
        return moves[Math.floor(Math.random() * moves.length)];
    }

    let best = null, bestScore = -Infinity;
    // лёгкая случайность среди равных ходов, чтобы не играл одинаково
    const scored = [];
    for (const m of moves) {
        const { board: nb, ep: nep } = csApply(csBoard, m);
        let val = csMinimax(nb, depth - 1, -Infinity, Infinity, false, nep);
        // небольшой бонус за взятие для живости
        if (csBoard[m.to[0]][m.to[1]]) val += 5;
        scored.push({ m, val });
        if (val > bestScore) { bestScore = val; best = m; }
    }

    // среди ходов в пределах 10 очков от лучшего — выбираем случайный
    const nearBest = scored.filter(s => s.val >= bestScore - 10);
    if (nearBest.length) {
        return nearBest[Math.floor(Math.random() * nearBest.length)].m;
    }
    return best;
}
// ---- СОЗДАНИЕ ОКНА ИГРЫ ----
function buildChessBoard() {
    csEl = document.createElement('div');
    csEl.className = 'cb-game-board';
    csEl.id = 'chibiBoss-chess';
    csEl.style.width = '392px';

    csEl.innerHTML = `
        <div class="cb-game-head" id="cb-cs-head">
            <div class="cb-game-controls">
                <button class="cb-game-btn" id="cb-cs-new">Заново</button>
                <button class="cb-game-btn" id="cb-cs-close">✕</button>
            </div>
            <div class="cb-game-score">
                <span>👑 <b id="cb-cs-w">0</b></span>
                <span>💀 <b id="cb-cs-l">0</b></span>
            </div>
        </div>
        <div class="cb-game-status" id="cb-cs-status">Твой ход</div>
        <div class="cb-game-timer" id="cb-cs-timer">00:00</div>
        <div class="cb-chess-wrap">
            <div class="cb-chess-grid" id="cb-cs-grid"></div>
            <div class="cb-chess-captured">
                <div class="cb-cap-label">съедено</div>
                <div class="cb-cs-cap-row" id="cb-cs-cap-ai"></div>
                <div class="cb-cap-label">боссом</div>
                <div class="cb-cs-cap-row" id="cb-cs-cap-player"></div>
            </div>
        </div>
    `;

    document.getElementById('chibiBoss-layer').appendChild(csEl);

    csEl.querySelector('#cb-cs-close').addEventListener('click', closeChess);
    csEl.querySelector('#cb-cs-new').addEventListener('click', csReset);
    makeBoardDraggable(csEl, csEl.querySelector('#cb-cs-head'));
    csEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

function csUpdateScore() {
    csEl.querySelector('#cb-cs-w').textContent = gameStats.chess.w;
    csEl.querySelector('#cb-cs-l').textContent = gameStats.chess.l;
}

// ---- ОТРИСОВКА ДОСКИ ----
function csRender() {
    const grid = csEl.querySelector('#cb-cs-grid');
    grid.innerHTML = '';

    // целевые клетки для подсветки
    const targets = csValidMoves.map(m => m.to[0] + ',' + m.to[1]);

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            cell.className = 'cb-cs-cell ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
            cell.dataset.r = r;
            cell.dataset.c = c;

            if (csSelected && csSelected[0] === r && csSelected[1] === c) {
                cell.classList.add('selected');
            }
            if (targets.includes(r + ',' + c)) {
                cell.classList.add('target');
            }

            const p = csBoard[r][c];
            if (p) {
                const fig = document.createElement('div');
                fig.className = 'cb-cs-piece ' + p.color;
                fig.textContent = CS_GLYPH[p.color + p.type];
                cell.appendChild(fig);
            }

            cell.addEventListener('click', () => csCellClick(r, c));
            grid.appendChild(cell);
        }
    }

    // съеденные фигуры
    const capAi = csEl.querySelector('#cb-cs-cap-ai');
    const capPl = csEl.querySelector('#cb-cs-cap-player');
    capAi.innerHTML = '';
    capPl.innerHTML = '';

    csCaptured.ai.forEach(type => {
        const m = document.createElement('span');
        m.className = 'cb-cs-cap-mini';
        m.textContent = CS_GLYPH['b' + type];
        capAi.appendChild(m);
    });
    csCaptured.player.forEach(type => {
        const m = document.createElement('span');
        m.className = 'cb-cs-cap-mini';
        m.textContent = CS_GLYPH['w' + type];
        capPl.appendChild(m);
    });
}

// ---- СБРОС ИГРЫ ----
function csReset() {
    csTimerStop();
    csBoard = csInitBoard();
    csSelected = null;
    csValidMoves = [];
    csLocked = false;
    csEnPassant = null;
    csCaptured = { player: [], ai: [] };
    csEl.querySelector('#cb-cs-status').textContent = 'Твой ход';
    csRender();
    csTimerStart();
}

// ---- КЛИК ПО КЛЕТКЕ ----
function csCellClick(r, c) {
    if (csLocked) return;

    const moves = csLegalMoves(csBoard, 'w', csEnPassant);
    if (!moves.length) return; // нет ходов (мат/пат)

    const p = csBoard[r][c];

    // клик по своей фигуре — выбрать
    if (p && p.color === 'w') {
        const pieceMoves = moves.filter(m => m.from[0] === r && m.from[1] === c);
        if (pieceMoves.length) {
            csSelected = [r, c];
            csValidMoves = pieceMoves;
            csRender();
        }
        return;
    }

    // клик по целевой клетке — ходить
    if (csSelected) {
        const move = csValidMoves.find(m => m.to[0] === r && m.to[1] === c);
        if (move) {
            // съедение
            const victim = csBoard[r][c];
            if (victim) csCaptured.ai.push(victim.type);
            // взятие на проходе
            if (move.ep) {
                const vr = csSelected[0], vc = c;
                const vp = csBoard[vr][vc];
                if (vp) csCaptured.ai.push(vp.type);
            }

            const res = csApply(csBoard, move);
            csBoard = res.board;
            csEnPassant = res.ep;

            csSelected = null;
            csValidMoves = [];
            relieveStressFromGame(STRESS_RELIEF_PER_MOVE);
            csRender();

            if (csCheckEnd('w')) return;

            csLocked = true;
            csEl.querySelector('#cb-cs-status').textContent = 'Босс думает...';
            setTimeout(csAiTurn, 600);
        }
    }
}

// ---- ХОД ИИ ----
function csAiTurn() {
    const move = csAiChooseMove();
    if (!move) {
        csCheckEnd('b');
        return;
    }

    // съедение
    const victim = csBoard[move.to[0]][move.to[1]];
    if (victim) csCaptured.player.push(victim.type);
    // взятие на проходе
    if (move.ep) {
        const vr = move.from[0], vc = move.to[1];
        const vp = csBoard[vr][vc];
        if (vp) csCaptured.player.push(vp.type);
    }

    const res = csApply(csBoard, move);
    csBoard = res.board;
    csEnPassant = res.ep;

    csRender();
    if (csCheckEnd('b')) return;

    csLocked = false;
    csEl.querySelector('#cb-cs-status').textContent = 'Твой ход';
}

// ---- ПРОВЕРКА КОНЦА ИГРЫ ----
function csCheckEnd(justMoved) {
    const playerMoves = csLegalMoves(csBoard, 'w', csEnPassant);
    const aiMoves = csLegalMoves(csBoard, 'b', csEnPassant);
    const status = csEl.querySelector('#cb-cs-status');

    if (!aiMoves.length) {
        relieveStressFromGame(STRESS_RELIEF_PER_GAME);
        if (csInCheck(csBoard, 'b')) {
            status.textContent = 'Мат! Ты выиграл! 👑';
            gameStats.chess.w++;
            saveGameStats(gameStats);
            csUpdateScore();
            settings.affection = Math.min(100, settings.affection + 3);
            saveSettings(settings);
            progress.chessWins++;
            if (settings.gameDifficulty === 'hard') progress.chessWinsHard++;
            progress.totalWins++; progress.totalGames++;
            saveProgress(); checkGiftProgress();
        } else {
            status.textContent = 'Пат — ничья.';
            progress.totalGames++; saveProgress();
        }
        csLocked = true;
        csTimerStop();
        setTimeout(csReset, 2500);
        return true;
    }

    if (!playerMoves.length) {
        relieveStressFromGame(STRESS_RELIEF_PER_GAME);
        if (csInCheck(csBoard, 'w')) {
            status.textContent = 'Мат! Босс выиграл! 💀';
            gameStats.chess.l++;
            saveGameStats(gameStats);
            csUpdateScore();
        } else {
            status.textContent = 'Пат — ничья.';
        }
        progress.totalGames++; saveProgress();
        csLocked = true;
        csTimerStop();
        setTimeout(csReset, 2500);
        return true;
    }

    return false;
}

// ---- ОТКРЫТЬ / ЗАКРЫТЬ ----
function openChess() {
    closeTtt();
    closeCheckers();
    if (!csEl) buildChessBoard();
    csUpdateScore();
    csReset();
    csEl.style.display = 'block';
    positionBoardNearBoss(csEl);
}

function closeChess() {
    if (csEl) csEl.style.display = 'none';
    csTimerStop();
}

// ============================================================
//  КОЛЛЕКЦИЯ ПОДАРКОВ
// ============================================================
let giftsEl = null;

function buildGiftsBoard() {
    giftsEl = document.createElement('div');
    giftsEl.className = 'cb-game-board';
    giftsEl.id = 'chibiBoss-gifts';
    giftsEl.style.width = '400px';

    giftsEl.innerHTML = `
        <div class="cb-game-head" id="cb-gifts-head">
            <div class="cb-game-controls">
                <button class="cb-game-btn" id="cb-gifts-close">✕</button>
            </div>
            <div class="cb-gifts-title">Подарки</div>
            <div class="cb-game-score">
                <span>🎁 <b id="cb-gifts-count">0</b>/25</span>
            </div>
        </div>
        <div class="cb-gifts-grid" id="cb-gifts-grid"></div>
    `;
    document.getElementById('chibiBoss-layer').appendChild(giftsEl);

    giftsEl.querySelector('#cb-gifts-close').addEventListener('click', closeGifts);
    makeBoardDraggable(giftsEl, giftsEl.querySelector('#cb-gifts-head'));
    giftsEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

function renderGifts() {
    const grid = giftsEl.querySelector('#cb-gifts-grid');
    grid.innerHTML = '';

    const unlockedCount = Object.keys(giftsData.unlocked).length;
    giftsEl.querySelector('#cb-gifts-count').textContent = unlockedCount;

    GIFT_DEFS.forEach(def => {
        const slot = document.createElement('div');
        slot.className = 'cb-gift-slot';

        const unlockedDate = giftsData.unlocked[def.id];
        if (unlockedDate) {
            // открытый подарок — показываем PNG
            slot.classList.add('unlocked');
            const img = document.createElement('img');
            img.src = EXT_PATH + 'assets/gifts/' + def.id + '.png';
            img.alt = def.name;
            slot.appendChild(img);
            slot.addEventListener('click', () => openGiftDetail(def, unlockedDate));
        } else {
            // закрытый слот — замок + подсказка по наведению
            slot.classList.add('locked');
            slot.innerHTML = '<span class="cb-gift-lock">🔒</span>';
            slot.title = def.hint;
        }

        grid.appendChild(slot);
    });
}

function openGifts() {
    closeCheckers();
    closeChess();
    if (!giftsEl) buildGiftsBoard();
    renderGifts();
    giftsEl.style.display = 'block';
    positionBoardNearBoss(giftsEl);
}



function closeGifts() {
    if (giftsEl) giftsEl.style.display = 'none';
}

// ----- красивая плашка одного подарка -----
let giftDetailEl = null;

function openGiftDetail(def, dateStr) {
    if (!giftDetailEl) {
        giftDetailEl = document.createElement('div');
        giftDetailEl.id = 'chibiBoss-gift-detail';
        document.getElementById('chibiBoss-layer').appendChild(giftDetailEl);
        giftDetailEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    giftDetailEl.innerHTML = `
        <div class="cb-gd-close" id="cb-gd-close">✕</div>
        <div class="cb-gd-glow"></div>
        <img class="cb-gd-img" src="${EXT_PATH}assets/gifts/${def.id}.png" alt="${escapeHtml(def.name)}">
        <div class="cb-gd-name">${escapeHtml(def.name)}</div>
        <div class="cb-gd-desc">${escapeHtml(def.desc || '')}</div>
        <div class="cb-gd-date">получен ${escapeHtml(dateStr)}</div>
    `;

    giftDetailEl.style.display = 'flex';
    requestAnimationFrame(() => giftDetailEl.classList.add('show'));

    // onclick вместо addEventListener — при перерисовке НЕ наслаивается
    giftDetailEl.querySelector('#cb-gd-close').onclick = () => {
        giftDetailEl.classList.remove('show');
        setTimeout(() => { giftDetailEl.style.display = 'none'; }, 200);
    };
}


// ----- выдать подарок (id 1..25) -----
function awardGift(id) {
    // уже открыт или уже ждёт получения — не дублируем
    if (giftsData.unlocked[id]) return;
    if (giftsData.pending.includes(id)) return;

    giftsData.pending.push(id);
    saveGifts(giftsData);
    showGiftAlert();

    // уведомление о выполненном условии
    const def = GIFT_DEFS.find(d => d.id === id);
    if (def) {
        notify(`🎁 Достижение разблокировано!\n${def.hint}`);
    }
}


// дата получения в формате ДД.ММ.ГГГГ
function giftDateStr() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

// ----- пульсирующая иконка над боссом -----
let giftAlertEl = null;

function showGiftAlert() {
    if (!giftAlertEl) {
        giftAlertEl = document.createElement('div');
        giftAlertEl.id = 'chibiBoss-gift-alert';
        giftAlertEl.className = 'cb-alert-bubble';

        const circle = document.createElement('div');
        circle.className = 'cb-alert-circle';

        const img = document.createElement('img');
        img.className = 'cb-alert-icon';
        img.src = EXT_PATH + 'icons/alerts/gift.svg';
        img.alt = 'Новый подарок';

        circle.appendChild(img);
        giftAlertEl.appendChild(circle);
        document.getElementById('chibiBoss-layer').appendChild(giftAlertEl);

        giftAlertEl.addEventListener('click', claimPendingGift);
    }
    giftAlertEl.style.display = 'block';
    positionGiftAlert();
}


function positionGiftAlert() {
    if (!giftAlertEl || giftAlertEl.style.display === 'none') return;
    const x = parseFloat(actorEl.style.left) || 0;
    const y = parseFloat(actorEl.style.top) || 0;
    giftAlertEl.style.left = (x + 104) + 'px';
    giftAlertEl.style.top  = (y - 10) + 'px';
}


function hideGiftAlert() {
    if (giftAlertEl) giftAlertEl.style.display = 'none';
}

// клик по иконке — получаем первый ожидающий подарок
function claimPendingGift() {
    if (!giftsData.pending.length) {
        hideGiftAlert();
        return;
    }
    const id = giftsData.pending.shift();
    giftsData.unlocked[id] = giftDateStr();
    saveGifts(giftsData);

    // если ещё есть подарки в очереди — иконка остаётся, иначе прячем
    if (!giftsData.pending.length) hideGiftAlert();

    const def = GIFT_DEFS.find(d => d.id === id);
    if (def) {
        openGiftDetail(def, giftsData.unlocked[id]);
        notify(`Босс подарил вам: ${def.name}`);
    }
    if (giftsEl && giftsEl.style.display === 'block') renderGifts();
}

// ============================================================
//  КОЛЛЕКЦИЯ ПИСЕМ
// ============================================================
let lettersEl = null;
let letterDetailEl = null;

function buildLettersBoard() {
    lettersEl = document.createElement('div');
    lettersEl.className = 'cb-game-board';
    lettersEl.id = 'chibiBoss-letters';
    lettersEl.style.width = '380px';

    lettersEl.innerHTML = `
        <div class="cb-game-head" id="cb-letters-head">
            <div class="cb-game-controls">
                <button class="cb-game-btn" id="cb-letters-close">✕</button>
            </div>
            <div class="cb-letters-title">Письма</div>
            <div class="cb-game-score">
                <span>✉ <b id="cb-letters-count">0</b></span>
            </div>
        </div>
        <div class="cb-letters-grid" id="cb-letters-grid"></div>
    `;
    document.getElementById('chibiBoss-layer').appendChild(lettersEl);
    lettersEl.querySelector('#cb-letters-close').addEventListener('click', closeLetters);
    makeBoardDraggable(lettersEl, lettersEl.querySelector('#cb-letters-head'));
    lettersEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

function renderLetters() {
    const grid = lettersEl.querySelector('#cb-letters-grid');
    grid.innerHTML = '';

    // Фильтруем: письма — ВСЕ, комментарии — только текущего чата
    const currentChat = getCurrentChatId();
    const toShow = lettersData.filter(l =>
        l.type === 'letter' || (l.type === 'comment' && l.chatId === currentChat)
    );

    lettersEl.querySelector('#cb-letters-count').textContent = toShow.length;

    if (!toShow.length) {
        grid.innerHTML = '<div class="cb-letters-empty">Писем пока нет.<br>Босс напишет, когда будет настроение...</div>';
        return;
    }

    [...toShow].reverse().forEach(letter => {
        const isComment = letter.type === 'comment';
        const card = document.createElement('div');
        card.className = (isComment ? 'cb-comment-card' : 'cb-letter-card') + (letter.read ? '' : ' unread');

        if (isComment) {
            // карточка-комментарий: показываем кусочек текста
            const preview = letter.text.length > 60 ? letter.text.slice(0, 60) + '…' : letter.text;
            card.innerHTML = `
                <div class="cb-comment-quote">"</div>
                <div class="cb-comment-preview">${escapeHtml(preview)}</div>
                <div class="cb-comment-date">${letter.date}</div>
                <div class="cb-letter-del" title="Удалить">✕</div>
            `;
        } else {
            // карточка-конверт (письмо)
            card.innerHTML = `
                <div class="cb-letter-seal"></div>
                <div class="cb-letter-date">${letter.date}</div>
                <div class="cb-letter-del" title="Удалить">✕</div>
            `;
        }

        card.querySelector('.cb-letter-del').addEventListener('click', (e) => {
            e.stopPropagation();
            lettersData = lettersData.filter(l => l.id !== letter.id);
            saveLetters(lettersData);
            renderLetters();
        });

        card.addEventListener('click', () => {
            letter.read = true;
            saveLetters(lettersData);
            card.classList.remove('unread');
            openLetterDetail(letter);
        });
        grid.appendChild(card);
    });
}


function openLetters() {
    closeCheckers();
    closeChess();
    if (!lettersEl) buildLettersBoard();
    renderLetters();
    lettersEl.style.display = 'block';
    positionBoardNearBoss(lettersEl);
}



function closeLetters() {
    if (lettersEl) lettersEl.style.display = 'none';
}

function openLetterDetail(letter) {
    const isComment = letter.type === 'comment';
    const headTitle = isComment ? 'Комментарий' : 'Письмо';
    const footerIcon = isComment ? '💬' : '✦';

    // создаём каркас ОДИН раз
    if (!letterDetailEl) {
        letterDetailEl = document.createElement('div');
        letterDetailEl.id = 'chibiBoss-letter-detail';
        letterDetailEl.innerHTML = `
            <div class="cb-ld-head" id="cb-ld-head">
                <span class="cb-ld-head-title" id="cb-ld-head-title"></span>
                <span class="cb-ld-close" id="cb-ld-close">✕</span>
            </div>
            <div class="cb-ld-body" id="cb-ld-body"></div>
            <div class="cb-ld-footer">
                <span class="cb-ld-footer-date" id="cb-ld-footer-date"></span>
                <div class="cb-ld-footer-seal" id="cb-ld-footer-seal"></div>
            </div>
        `;
        document.getElementById('chibiBoss-layer').appendChild(letterDetailEl);
        letterDetailEl.addEventListener('contextmenu', (e) => e.preventDefault());

        // перетаскивание и кнопку закрытия вешаем ОДИН раз
        makeBoardDraggable(letterDetailEl, letterDetailEl.querySelector('#cb-ld-head'));
        letterDetailEl.querySelector('#cb-ld-close').addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            letterDetailEl.classList.remove('show');
            setTimeout(() => { letterDetailEl.style.display = 'none'; }, 220);
        });
    }

    // обновляем ТОЛЬКО содержимое (без пересоздания шапки/кнопок)
    letterDetailEl.querySelector('#cb-ld-head-title').textContent = headTitle;
    letterDetailEl.querySelector('#cb-ld-footer-date').textContent = letter.date;
    letterDetailEl.querySelector('#cb-ld-footer-seal').textContent = footerIcon;

    const signBlock = isComment
        ? ''
        : `<div class="cb-ld-sign">— ${escapeHtml(settings.name)}</div>`;

    letterDetailEl.querySelector('#cb-ld-body').innerHTML =
        `<div class="cb-ld-text${isComment ? ' cb-ld-text-comment' : ''}">${escapeHtml(letter.text)}</div>` + signBlock;

    // показываем и центрируем
    letterDetailEl.style.display = 'flex';
    requestAnimationFrame(() => {
        const w = letterDetailEl.offsetWidth || 480;
        const h = letterDetailEl.offsetHeight || 300;
        letterDetailEl.style.left = Math.max(10, Math.round((window.innerWidth - w) / 2)) + 'px';
        letterDetailEl.style.top  = Math.max(10, Math.round((window.innerHeight - h) / 2)) + 'px';
        letterDetailEl.classList.add('show');

        // Проверяем: остались ли непрочитанные письма?
        const hasUnreadLetters = lettersData.some(l => !l.read && l.type === 'letter');
        if (!hasUnreadLetters) {
            hideLetterAlert();
        }
    });
}




// ============================================================
//  ГЕНЕРАЦИЯ ПИСЬМА ЧЕРЕЗ API
// ============================================================
// собрать пользовательскую часть письма (БЕЗ статистики игр/подарков и БЕЗ лога РП)
function buildLetterUserPrompt() {
    // Короткая сводка состояния — только настроение, никаких счётчиков
    const memory = [
        `Your current affection toward the user: ${Math.round(settings.affection)}%.`,
        `Your current stress level: ${Math.round(settings.stress)}%.`,
    ].join('\n');

    const now = new Date();
    const currentTime = now.toLocaleString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    let out = `CURRENT TIME: ${currentTime}\n\nYour current state:\n` + memory;

    // Память прошлых писем (чтобы не повторяться)
    out += buildBossMemoryBlock('letter');

    out += '\n\nNow write the letter.';
    return out;
}



// главная функция: сгенерировать письмо и добавить в коллекцию
let letterGenerating = false;

async function generateLetter(force = false) {
    if (!apiIsConnected()) return false;
    if (!force && !apiSettings.lettersEnabled) return false;
    if (letterGenerating) {
        console.warn('[ChibiBoss] генерация письма уже идёт — пропускаю повторный запуск');
        return false;
    }

    letterGenerating = true;
    console.log('[ChibiBoss] генерирую письмо...');
    let created = false;
    try {
        const sys = await buildSystemPrompt('letter');
        const user = buildLetterUserPrompt();
        const raw = await apiGenerateWithRetry(sys, user, Math.max(apiSettings.maxTokens || 0, 350), 2);
        const parsed = parseLetterResponse(raw);
        if (parsed) {
            console.log('[ChibiBoss] письмо готово:', parsed.text.slice(0, 60));
            addLetter(parsed.text, 'letter');
            showLetterAlert();  // ← гарантированно показываем иконку
            created = true;
        } else {
            console.warn('[ChibiBoss] письмо не сгенерировано (пустой/битый ответ).');
        }
    } catch (e) {
        console.warn('[ChibiBoss] ошибка генерации письма:', e);
    } finally {
        letterGenerating = false;
    }
    return created;
}


// ---- планировщик писем: иногда босс пишет сам ----
const LETTER_MIN_GAP_MS = 40 * 60 * 1000; // не чаще раза в 40 минут
let lastLetterAt = parseInt(localStorage.getItem('chibiBoss_lastLetterAt') || '0', 10);

function maybeGenerateLetter() {
    if (!settings.enabled) return; // ← НОВАЯ СТРОКА: проверка включен ли персонаж
    if (!apiIsConnected() || !apiSettings.lettersEnabled) return;


    const now = Date.now();

    // первый запуск (lastLetterAt = 0) — просто ставим точку отсчёта, письмо НЕ генерим
    if (!lastLetterAt) {
        lastLetterAt = now;
        localStorage.setItem('chibiBoss_lastLetterAt', String(now));
        return;
    }

    // ещё не прошло 40 минут с прошлого письма — ждём
    if (now - lastLetterAt < LETTER_MIN_GAP_MS) return;

    lastLetterAt = now;
    localStorage.setItem('chibiBoss_lastLetterAt', String(now));
    generateLetter();
}



function startLetterLoop() {
    setInterval(maybeGenerateLetter, 5 * 60 * 1000); // проверка каждые 5 мин
}



// добавить запись в коллекцию (type: 'letter' = письмо, 'comment' = комментарий РП)
function addLetter(text, type = 'letter') {
    const d = new Date();
    const date = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;

    // Для комментариев — привязываем к текущему чату.
    // Для писем — НЕ привязываем (они общие для всех чатов).
    const entry = {
        id: Date.now(),
        text,
        date,
        read: false,
        type,
    };

    if (type === 'comment') {
        entry.chatId = getCurrentChatId();
        entry._debugChat = getCurrentChatId();
    }

    lettersData.push(entry);


    saveLetters(lettersData);

    console.log(`[ChibiBoss] addLetter(${type}): сохранено в chatId="${lettersData[lettersData.length - 1].chatId}"`);

    // иконку показываем ТОЛЬКО для писем (НЕ для комментариев)
    if (type === 'letter') {
        showLetterAlert();
    }

    // обновить список писем в открытом окне (если оно открыто)
    if (lettersEl && lettersEl.style.display === 'block') {
        renderLetters();
    }
}






// ----- пульсирующая иконка письма над боссом -----
let letterAlertEl = null;

function showLetterAlert() {
    if (!letterAlertEl) {
        letterAlertEl = document.createElement('div');
        letterAlertEl.id = 'chibiBoss-letter-alert';
        letterAlertEl.className = 'cb-alert-bubble';

        const circle = document.createElement('div');
        circle.className = 'cb-alert-circle';

        const img = document.createElement('img');
        img.className = 'cb-alert-icon';
        img.src = EXT_PATH + 'icons/alerts/letter.svg';
        img.alt = 'Новое письмо';

        circle.appendChild(img);
        letterAlertEl.appendChild(circle);
        document.getElementById('chibiBoss-layer').appendChild(letterAlertEl);
        letterAlertEl.addEventListener('click', claimLetterAlert);
    }
    letterAlertEl.style.display = 'block';
    positionLetterAlert();
}


function positionLetterAlert() {
    if (!letterAlertEl || letterAlertEl.style.display === 'none') return;
    const x = parseFloat(actorEl.style.left) || 0;
    const y = parseFloat(actorEl.style.top) || 0;
    letterAlertEl.style.left = (x - 18) + 'px';
    letterAlertEl.style.top  = (y - 10) + 'px';
}

function hideLetterAlert() {
    if (letterAlertEl) letterAlertEl.style.display = 'none';
}

// клик по иконке — открываем самое свежее непрочитанное письмо
function claimLetterAlert() {
    const unread = [...lettersData].reverse().find(l => !l.read && l.type === 'letter');
    if (!unread) {
        hideLetterAlert();
        return;
    }
    unread.read = true;
    saveLetters(lettersData);
    hideLetterAlert();
    openLetterDetail(unread);
}

// ------------------------------------------------------------
//  ПОГЛАЖИВАНИЕ
// ------------------------------------------------------------
let pettingMode = false;
let pettingDown = false;

function setupPetting() {
    actorEl.addEventListener('pointerdown', (e) => {
        if (!pettingMode || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        pettingDown = true;

        // запускаем звук поглаживания с зацикливанием
        if (!petAudio) {
            petAudio = new Audio(EXT_PATH + 'sounds/pet.wav');
            petAudio.loop = true;
            petAudio.volume = 0.5;
        }
        petAudio.play().catch(e => console.warn('[ChibiBoss] не удалось запустить звук поглаживания:', e));

        animator.play('pet_loop');
    });

    actorEl.addEventListener('pointerup', (e) => {
        if (!pettingMode) return;
        pettingDown = false;

        // останавливаем звук
        if (petAudio) {
            petAudio.pause();
            petAudio.currentTime = 0;
        }

        animator.play('idle_front');
    });

    actorEl.addEventListener('pointerleave', (e) => {
        if (!pettingMode || !pettingDown) return;
        pettingDown = false;

        // останавливаем звук
        if (petAudio) {
            petAudio.pause();
            petAudio.currentTime = 0;
        }

        animator.play('idle_front');
    });

    document.addEventListener('pointerdown', (e) => {
        if (!pettingMode) return;
        if (actorEl.contains(e.target)) return;
        exitPetting();
    }, true);
}


function enterPetting() {
    pettingMode = true;
    pettingDown = false;
    actorEl.style.cursor = 'pointer';
    if (behavior) behavior.enablePetting();

    startPetTick(); // запустить тик систем для поглаживания
    progress.petCount++;
    // погладить во время стресс-анимации
    if (animator.current === 'stress') progress.petDuringStress++;
    saveProgress();
    notify('Режим поглаживания активирован. Кликните за пределами босса для выхода.');
}

function exitPetting() {
    if (!pettingMode) return;
    pettingMode = false;
    pettingDown = false;
    actorEl.style.cursor = 'grab';

    // останавливаем звук поглаживания
    if (petAudio) {
        petAudio.pause();
        petAudio.currentTime = 0;
    }

    if (behavior) behavior.disablePetting();
    if (petTimer) {
        clearInterval(petTimer);
        petTimer = null;
    }
}


// ------------------------------------------------------------
//  НАСТРОЙКИ
// ------------------------------------------------------------

function wireApiSettingsEvents() {
    const modeEl    = document.getElementById('cb-api-mode');
    const customBox = document.getElementById('cb-api-settings-block');
    const stBlock   = document.getElementById('cb-boss-profile-block');

    const urlEl     = document.getElementById('cb-api-url');
    const keyEl     = document.getElementById('cb-api-key');
    const modelEl   = document.getElementById('cb-api-model');
    const refreshEl = document.getElementById('cb-api-refresh');
    const testEl    = document.getElementById('cb-api-test');
    const statusEl  = document.getElementById('cb-api-test-status');

    const stSelect  = document.getElementById('cb-boss-profile');
    const stRefresh = document.getElementById('cb-boss-profile-refresh');

    // --- переключение блоков режимов ---
    const toggleModeBlocks = () => {
        const mode = modeEl.value;
        if (customBox) customBox.style.display = (mode === 'api') ? 'block' : 'none';
        if (stBlock)   stBlock.style.display   = (mode === 'st')  ? 'block' : 'none';
    };

    // --- заполнить выпадашку моделей ---
    const fillModels = () => {
        modelEl.innerHTML = '';
        if (!apiSettings.models.length) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '— сначала обновите список —';
            modelEl.appendChild(opt);
        } else {
            apiSettings.models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                modelEl.appendChild(opt);
            });
        }
        if (apiSettings.model) modelEl.value = apiSettings.model;
    };

    // --- восстановить сохранённые значения ---
    modeEl.value = apiSettings.mode;
    urlEl.value  = apiSettings.url || '';
    keyEl.value  = apiSettings.key || '';
    fillModels();
    toggleModeBlocks();

    if (apiSettings.mode === 'st') {
        populateBossProfiles();
    }

    // --- смена режима ---
    modeEl.addEventListener('change', () => {
        apiSettings.mode = modeEl.value;
        saveApiSettings();
        toggleModeBlocks();
        statusEl.textContent = '';
        statusEl.className = 'cb-api-status';
        if (apiSettings.mode === 'st') populateBossProfiles();
    });

    // --- ввод URL ---
    urlEl.addEventListener('input', () => {
        apiSettings.url = urlEl.value.trim();
        apiSettings.resolvedModelsUrl = '';
        apiSettings.resolvedChatUrl = '';
        saveApiSettings();
    });

    // --- ввод ключа ---
    keyEl.addEventListener('input', () => {
        apiSettings.key = keyEl.value.trim();
        saveApiSettings();
    });

    // --- выбор модели ---
    modelEl.addEventListener('change', () => {
        apiSettings.model = modelEl.value;
        saveApiSettings();
    });

    // --- обновление списка моделей ---
    refreshEl.addEventListener('click', async () => {
        refreshEl.classList.add('spinning');
        statusEl.textContent = 'Загрузка моделей...';
        statusEl.className = 'cb-api-status';
        const models = await apiFetchModels();
        refreshEl.classList.remove('spinning');
        if (models.length) {
            apiSettings.models = models;
            saveApiSettings();
            fillModels();
            statusEl.textContent = `Найдено моделей: ${models.length}`;
            statusEl.className = 'cb-api-status ok';
        } else {
            statusEl.textContent = 'Модели не найдены. Проверьте URL и ключ.';
            statusEl.className = 'cb-api-status err';
        }
    });

    // --- тест соединения ---
    testEl.addEventListener('click', async () => {
        testEl.disabled = true;
        statusEl.textContent = 'Проверка...';
        statusEl.className = 'cb-api-status';
        const res = await apiTestConnection();
        testEl.disabled = false;
        statusEl.textContent = res.message;
        statusEl.className = 'cb-api-status ' + (res.ok ? 'ok' : 'err');
        notify(res.message);
    });

    // --- профиль таверны ---
    if (stSelect) {
        stSelect.addEventListener('change', () => {
            apiSettings.stProfile = stSelect.value;
            saveApiSettings();
        });
    }
    if (stRefresh) {
        stRefresh.addEventListener('click', () => populateBossProfiles());
    }

    // ============ ПИСЬМА ============
    const lettersChk = document.getElementById('cb-api-letters');
    const letterSettings = document.getElementById('cb-letter-settings');
    if (lettersChk && letterSettings) {
        lettersChk.checked = apiSettings.lettersEnabled;
        letterSettings.style.display = apiSettings.lettersEnabled ? 'block' : 'none';
        lettersChk.addEventListener('change', () => {
            apiSettings.lettersEnabled = lettersChk.checked;
            letterSettings.style.display = lettersChk.checked ? 'block' : 'none';
            saveApiSettings();
        });
    }

    // память писем
    const letterMemEl = document.getElementById('cb-letter-memory');
    if (letterMemEl) {
        letterMemEl.value = apiSettings.letterMemory ?? 3;
        letterMemEl.addEventListener('change', () => {
            let v = parseInt(letterMemEl.value, 10);
            if (isNaN(v)) v = 3;
            v = Math.max(0, Math.min(10, v));
            apiSettings.letterMemory = v;
            letterMemEl.value = v;
            saveApiSettings();
        });
    }

    // свой промпт писем
    const letterPromptEl = document.getElementById('cb-letter-prompt');
    if (letterPromptEl) {
        letterPromptEl.value = apiSettings.customLetterPrompt || '';
        letterPromptEl.addEventListener('input', () => {
            apiSettings.customLetterPrompt = letterPromptEl.value;
            saveApiSettings();
        });
    }
    const letterPromptReset = document.getElementById('cb-letter-prompt-reset');
    if (letterPromptReset) {
        letterPromptReset.addEventListener('click', async () => {
            apiSettings.customLetterPrompt = '';
            saveApiSettings();
            delete PROMPTS_CACHE['letter'];
            const def = await loadPromptTemplate('letter');
            if (letterPromptEl) letterPromptEl.value = def;
            notify('Промпт писем сброшен на встроенный');
        });
    }

    // ============ КОММЕНТАРИИ ============
    const commentChk = document.getElementById('cb-api-comment');
    const commentSettings = document.getElementById('cb-comment-settings');
    if (commentChk && commentSettings) {
        commentChk.checked = apiSettings.commentEnabled;
        commentSettings.style.display = apiSettings.commentEnabled ? 'block' : 'none';
        commentChk.addEventListener('change', () => {
            apiSettings.commentEnabled = commentChk.checked;
            commentSettings.style.display = commentChk.checked ? 'block' : 'none';
            saveApiSettings();
        });
    }

    // характер
    const persEl = document.getElementById('cb-api-personality');
    if (persEl) {
        persEl.value = apiSettings.personality;
        persEl.addEventListener('change', () => {
            apiSettings.personality = persEl.value;
            saveApiSettings();
        });
    }

    // глубина контекста РП
    const ctxEl = document.getElementById('cb-api-context');
    if (ctxEl) {
        ctxEl.value = apiSettings.contextDepth;
        ctxEl.addEventListener('change', () => {
            let v = parseInt(ctxEl.value, 10) || 4;
            v = Math.max(1, Math.min(10, v));
            apiSettings.contextDepth = v;
            ctxEl.value = v;
            saveApiSettings();
        });
    }

    // частота комментариев
    const freqEl = document.getElementById('cb-api-frequency');
    if (freqEl) {
        freqEl.value = apiSettings.frequency || 8;
        freqEl.addEventListener('change', () => {
            let v = parseInt(freqEl.value, 10) || 8;
            v = Math.max(2, Math.min(20, v));
            apiSettings.frequency = v;
            freqEl.value = v;
            saveApiSettings();
        });
    }

    // галочка: персона
    const personaChk = document.getElementById('cb-api-include-persona');
    if (personaChk) {
        personaChk.checked = apiSettings.includePersona;
        personaChk.addEventListener('change', () => {
            apiSettings.includePersona = personaChk.checked;
            saveApiSettings();
        });
    }

    // галочка: карточка бота
    const charChk = document.getElementById('cb-api-include-char');
    if (charChk) {
        charChk.checked = apiSettings.includeCharacterDescription;
        charChk.addEventListener('change', () => {
            apiSettings.includeCharacterDescription = charChk.checked;
            saveApiSettings();
        });
    }

    // память комментариев
    const commentMemEl = document.getElementById('cb-comment-memory');
    if (commentMemEl) {
        commentMemEl.value = apiSettings.commentMemory ?? 3;
        commentMemEl.addEventListener('change', () => {
            let v = parseInt(commentMemEl.value, 10);
            if (isNaN(v)) v = 3;
            v = Math.max(0, Math.min(10, v));
            apiSettings.commentMemory = v;
            commentMemEl.value = v;
            saveApiSettings();
        });
    }

    // свой промпт комментариев
    const commentPromptEl = document.getElementById('cb-comment-prompt');
    if (commentPromptEl) {
        commentPromptEl.value = apiSettings.customCommentPrompt || '';
        commentPromptEl.addEventListener('input', () => {
            apiSettings.customCommentPrompt = commentPromptEl.value;
            saveApiSettings();
        });
    }
    const commentPromptReset = document.getElementById('cb-comment-prompt-reset');
    if (commentPromptReset) {
        commentPromptReset.addEventListener('click', async () => {
            apiSettings.customCommentPrompt = '';
            saveApiSettings();
            delete PROMPTS_CACHE['comment'];
            const def = await loadPromptTemplate('comment');
            if (commentPromptEl) commentPromptEl.value = def;
            notify('Промпт комментариев сброшен на встроенный');
        });
    }

    // ============ КНОПКИ ТЕСТОВОЙ ГЕНЕРАЦИИ ============
    const testLetterBtn  = document.getElementById('cb-api-test-letter');
    const testCommentBtn = document.getElementById('cb-api-test-comment');

    if (testLetterBtn) {
        testLetterBtn.addEventListener('click', async () => {
            const outEl = document.getElementById('cb-api-debug-out');
            const showOut = (color, text) => {
                if (!outEl) return;
                outEl.style.display = 'block';
                outEl.style.color = color;
                outEl.textContent = text;
            };
            if (!apiIsConnected()) {
                showOut('#ff7d7d', '❌ Сначала подключите API.');
                return;
            }
            testLetterBtn.disabled = true;
            showOut('var(--SmartThemeBodyColor,#ddd)', '⏳ Босс пишет письмо...');
            try {
                const ok = await generateLetter(true);
                if (ok) {
                    showOut('#7ddc7d', '✅ Письмо доставлено. Смотри иконку-конверт над боссом.');
                } else {
                    showOut('#ffc86b', '⚠️ Модель вернула пустой ответ. Попробуй ещё раз или проверь модель/промпт.');
                }
            } catch (e) {
                showOut('#ff7d7d', '❌ Ошибка: ' + e.message);
            }
            testLetterBtn.disabled = false;
        });
    }


    if (testCommentBtn) {
        testCommentBtn.addEventListener('click', async () => {
            const outEl = document.getElementById('cb-api-debug-out');
            const showOut = (color, text) => {
                if (!outEl) return;
                outEl.style.display = 'block';
                outEl.style.color = color;
                outEl.textContent = text;
            };
            if (!apiIsConnected()) {
                showOut('#ff7d7d', '❌ Сначала подключите API.');
                return;
            }
            testCommentBtn.disabled = true;
            showOut('var(--SmartThemeBodyColor,#ddd)', '⏳ Босс идёт к чату комментировать...');
            try {
                await runCommentCycle(true);
                showOut('#7ddc7d', '✅ Готово. Смотри пузырёк над боссом.');
            } catch (e) {
                showOut('#ff7d7d', '❌ Ошибка: ' + e.message);
            }
            testCommentBtn.disabled = false;
        });
    }
}


// HTML секции «Настройка API» (встраивается ВНУТРЬ панели Chibi Mafia Boss)
function buildApiSettingsHTML() {
    return `
    <div id="chibiBoss-api-settings" class="chibiBoss-api-section">
        <div class="chibiBoss-api-section-title">Настройка API</div>

        <div class="chibiBoss-row">
            <label for="cb-api-mode">Подключение:</label>
            <select id="cb-api-mode" class="text_pole">
                <option value="off">Без подключения</option>
                <option value="api">Подключить свой API</option>
                <option value="st">Использовать профиль таверны</option>
            </select>
        </div>

        <div id="cb-api-settings-block" style="display:none;">
            <div class="chibiBoss-row">
                <label for="cb-api-url">URL:</label>
                <input type="text" id="cb-api-url" class="text_pole"
                       placeholder="https://api.example.com">
            </div>
            <div class="chibiBoss-row">
                <label for="cb-api-key">Ключ:</label>
                <input type="password" id="cb-api-key" class="text_pole"
                       placeholder="sk-...">
            </div>
            <div class="chibiBoss-row">
                <label for="cb-api-model">Модель:</label>
                <select id="cb-api-model" class="text_pole" style="flex:1;">
                    <option value="">— сначала обновите список —</option>
                </select>
                <button id="cb-api-refresh" class="cb-api-icon-btn" title="Обновить список моделей">⟳</button>
            </div>
        </div>

        <div id="cb-boss-profile-block" style="display:none;">
            <div class="chibiBoss-row">
                <label for="cb-boss-profile">Профиль таверны:</label>
                <select id="cb-boss-profile" class="text_pole" style="flex:1;">
                    <option value="">— выберите профиль —</option>
                </select>
                <button id="cb-boss-profile-refresh" class="cb-api-icon-btn" title="Обновить список">⟳</button>
            </div>
            <div class="chibiBoss-hint">
                Генерация через выбранный профиль подключения.
            </div>
        </div>

        <div class="chibiBoss-row" id="cb-api-test-row">
            <button id="cb-api-test" class="cb-api-test-btn">Тест соединения</button>
            <span id="cb-api-test-status" class="cb-api-status"></span>
        </div>
        <div class="chibiBoss-row" style="gap:6px; flex-wrap:wrap;">
            <button id="cb-api-test-letter" class="cb-api-test-btn">🧪 Тест письма</button>
            <button id="cb-api-test-comment" class="cb-api-test-btn">🧪 Тест комментария</button>
        </div>
        <div id="cb-api-debug-out" style="
            font-size:10px; line-height:1.5; margin:6px 0 2px;
            padding:6px 8px; border-radius:6px; display:none;
            background:rgba(0,0,0,0.25); color:var(--SmartThemeBodyColor,#ddd);
            white-space:pre-wrap; word-break:break-word; max-height:120px; overflow-y:auto;
        "></div>

        <div class="chibiBoss-api-divider"></div>

        <!-- ============ ПИСЬМА ============ -->
        <div class="chibiBoss-api-section-title">Письма от босса</div>
        <div class="chibiBoss-checkrow">
            <input type="checkbox" id="cb-api-letters">
            <label for="cb-api-letters">Генерировать письма (требуется API)</label>
        </div>

        <div id="cb-letter-settings" style="display:none;">
            <div class="chibiBoss-hint">
                Босс пишет на свободные темы: чем был занят, выдуманные сцены из цифровой жизни, гипотетические ситуации. Персона учитывается автоматически.
            </div>
            <div class="chibiBoss-row">
                <label for="cb-letter-memory">Помнить писем:</label>
                <input type="number" id="cb-letter-memory" class="text_pole" min="0" max="10" value="3">
            </div>
            <div class="chibiBoss-hint">
                Сколько последних писем учитывать, чтобы не повторяться (0 = выкл).
            </div>
            <div class="chibiBoss-row" style="flex-direction:column; align-items:stretch; gap:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label for="cb-letter-prompt">Свой промпт для писем:</label>
                    <button id="cb-letter-prompt-reset" class="cb-api-icon-btn" title="Сбросить на встроенный">⟲</button>
                </div>
                <textarea id="cb-letter-prompt" class="text_pole" rows="6"
                          style="resize:vertical; font-family:monospace; font-size:11px; line-height:1.4;"
                          placeholder="Пусто = встроенный промпт из prompts/letters.md"></textarea>
            </div>
        </div>

        <div class="chibiBoss-api-divider"></div>

        <!-- ============ КОММЕНТАРИИ ============ -->
        <div class="chibiBoss-api-section-title">Комментирование РП</div>
        <div class="chibiBoss-checkrow">
            <input type="checkbox" id="cb-api-comment">
            <label for="cb-api-comment">Босс комментирует ролевую (требуется API)</label>
        </div>

        <div id="cb-comment-settings" style="display:none;">
            <div class="chibiBoss-row">
                <label for="cb-api-personality">Характер:</label>
                <select id="cb-api-personality" class="text_pole">
                    <option value="calm">Спокойный</option>
                    <option value="possessive">Собственнический</option>
                    <option value="obsessed">Одержимый</option>
                </select>
            </div>
            <div class="chibiBoss-row">
                <label for="cb-api-context">Контекст РП (сообщений):</label>
                <input type="number" id="cb-api-context" class="text_pole" min="1" max="10" value="4">
            </div>
            <div class="chibiBoss-row">
                <label for="cb-api-frequency">Частота (раз в N сообщений):</label>
                <input type="number" id="cb-api-frequency" class="text_pole" min="2" max="20" value="8">
            </div>
            <div class="chibiBoss-hint">
                Босс комментирует раз в указанное число сообщений (с небольшой случайностью).
            </div>

            <div class="chibiBoss-checkrow">
                <input type="checkbox" id="cb-api-include-persona">
                <label for="cb-api-include-persona">Учитывать персону</label>
            </div>
            <div class="chibiBoss-checkrow">
                <input type="checkbox" id="cb-api-include-char">
                <label for="cb-api-include-char">Учитывать карточку текущего бота</label>
            </div>

            <div class="chibiBoss-row">
                <label for="cb-comment-memory">Помнить комментариев:</label>
                <input type="number" id="cb-comment-memory" class="text_pole" min="0" max="10" value="3">
            </div>
            <div class="chibiBoss-hint">
                Сколько последних комментариев учитывать, чтобы не повторяться (0 = выкл).
            </div>
            <div class="chibiBoss-row" style="flex-direction:column; align-items:stretch; gap:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <label for="cb-comment-prompt">Свой промпт для комментариев:</label>
                    <button id="cb-comment-prompt-reset" class="cb-api-icon-btn" title="Сбросить на встроенный">⟲</button>
                </div>
                <textarea id="cb-comment-prompt" class="text_pole" rows="6"
                          style="resize:vertical; font-family:monospace; font-size:11px; line-height:1.4;"
                          placeholder="Пусто = встроенный промпт из prompts/comments.md"></textarea>
            </div>
        </div>
    </div>`;
}




function buildSettingsHTML() {
    return `
    <div id="chibiBoss-settings" class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Chibi Mafia Boss</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="chibiBoss-checkrow">
                <input type="checkbox" id="chibiBoss-enabled">
                <label for="chibiBoss-enabled">Включить персонажа</label>
            </div>
            <div class="chibiBoss-hint">При отключении расширение полностью останавливается.</div>

            <div class="chibiBoss-row">
                <label for="chibiBoss-name">Имя персонажа:</label>
                <input type="text" id="chibiBoss-name" class="text_pole"
                       placeholder="Boss" value="${escapeHtml(settings.name)}">
            </div>
            <div class="chibiBoss-row">
                <label for="chibiBoss-tempo">Темп:</label>
                <select id="chibiBoss-tempo" class="text_pole">
                    <option value="low">Низкий</option>
                    <option value="normal">Средний</option>
                    <option value="high">Высокий</option>
                </select>
            </div>
            <div class="chibiBoss-hint">Влияет на скорость смены действий персонажа.</div>
            <div class="chibiBoss-checkrow">
                <input type="checkbox" id="chibiBoss-desk">
                <label for="chibiBoss-desk">Рабочий стол</label>
            </div>
             <div class="chibiBoss-checkrow">
                <input type="checkbox" id="chibiBoss-chair">
                <label for="chibiBoss-chair">Кресло</label>
            </div>
            <div class="chibiBoss-row">
                <label for="chibiBoss-difficulty">Сложность игр:</label>
                <select id="chibiBoss-difficulty" class="text_pole">
                    <option value="easy">Лёгкая</option>
                    <option value="normal">Средняя</option>
                    <option value="hard">Сложная</option>
                </select>
            </div>
        </div>
    </div>`;
}


function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function wireSettingsEvents() {
    const nameEl = document.getElementById('chibiBoss-name');
    const tempoEl = document.getElementById('chibiBoss-tempo');
    const deskCheckbox = document.getElementById('chibiBoss-desk');
    const chairCheckbox = document.getElementById('chibiBoss-chair');
    const diffEl = document.getElementById('chibiBoss-difficulty');

    tempoEl.value = settings.tempo;
    deskCheckbox.checked = settings.deskEnabled;
    chairCheckbox.checked = settings.chairEnabled;
    if (diffEl) diffEl.value = settings.gameDifficulty;

    const enabledCheckbox = document.getElementById('chibiBoss-enabled');
enabledCheckbox.checked = settings.enabled;

enabledCheckbox.addEventListener('change', () => {
    settings.enabled = enabledCheckbox.checked;
    saveSettings(settings);

    if (settings.enabled) {
        // включаем всё обратно
        if (actorEl) actorEl.style.display = 'block';
        if (deskEl && settings.deskEnabled) deskEl.style.display = 'block';
        if (chairEl && settings.chairEnabled) chairEl.style.display = 'block'; 
        if (behavior && !behavior.paused) behavior.resume();
    } else {
        // выключаем: прячем босса, стол, закрываем все окна
        if (actorEl) actorEl.style.display = 'none';
        if (deskEl) deskEl.style.display = 'none';
        if (chairEl) chairEl.style.display = 'none';
        if (behavior) behavior.pause();
        closeMenu();
        closeTtt();
        closeCheckers();
        closeChess();
        closeGifts();
        closeLetters();
        closeStats();
        hideGiftAlert();
        hideLetterAlert();
    }
});


    nameEl.addEventListener('input', () => {
        settings.name = nameEl.value || 'Boss';
        saveSettings(settings);
    });

    tempoEl.addEventListener('change', () => {
        settings.tempo = tempoEl.value;
        saveSettings(settings);
    });

    deskCheckbox.addEventListener('change', () => {
        settings.deskEnabled = deskCheckbox.checked;
        saveSettings(settings);
        setDeskVisible(settings.deskEnabled);
    });
    
    chairCheckbox.addEventListener('change', () => {
        settings.chairEnabled = chairCheckbox.checked;
        saveSettings(settings);
        setChairVisible(settings.chairEnabled);
    });

    if (diffEl) {
        diffEl.addEventListener('change', () => {
            settings.gameDifficulty = diffEl.value;
            saveSettings(settings);
        });
    }

    // обновляем индикаторы привязанности/стресса, пока меню открыто
    setInterval(() => {
        if (menuOpen) updateIndicators();
    }, 2000);

}


function injectSettings() {
    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;
        const container =
            document.querySelector('#extensions_settings2') ||
            document.querySelector('#extensions_settings');

        if (container) {
            clearInterval(timer);
            if (!document.getElementById('chibiBoss-settings')) {
                container.insertAdjacentHTML('beforeend', buildSettingsHTML());
                // встраиваем блок API внутрь панели Chibi Mafia Boss
                const content = document.querySelector('#chibiBoss-settings .inline-drawer-content');
                if (content) content.insertAdjacentHTML('beforeend', buildApiSettingsHTML());
                wireSettingsEvents();
                wireApiSettingsEvents();
            }


        } else if (attempts >= 40) {
            clearInterval(timer);
            console.warn('[ChibiBoss] контейнер настроек не найден');
        }
    }, 250);
}

// ------------------------------------------------------------
//  СТАРТ
// ------------------------------------------------------------
function init() {
    if (document.getElementById('chibiBoss-layer')) return;
    preloadAll();
    createBoss();
    injectSettings();
    startSTTimer();
    startSystemsLoop();
    startLetterLoop();
    initCommentListener();
    if (giftsData.pending.length) showGiftAlert();
    if (lettersData.some(l => !l.read && l.type === 'letter')) showLetterAlert();


    // автоматическая проверка подключения при загрузке
    if (apiSettings.mode !== 'off') {
        apiTestConnection().then(res => {
            if (res.ok) {
                console.log('[ChibiBoss] API подключён:', res.message);
            } else {
                console.warn('[ChibiBoss] API недоступен:', res.message);
            }
        });
    }
// если персонаж отключён в настройках — сразу прячем
if (!settings.enabled) {
    if (actorEl) actorEl.style.display = 'none';
    if (deskEl) deskEl.style.display = 'none';
    if (behavior) behavior.pause();
}

console.log('[ChiboBoss] загружен. Путь:', EXT_PATH);
    console.log('[ChibiBoss] загружен. Путь:', EXT_PATH);
}


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
