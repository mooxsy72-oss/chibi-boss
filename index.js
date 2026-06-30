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
const STRESS_RELIEF_FROM_PET_PER_SEC = 1; // -1% стресса за секунду поглаживания

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

    smoke_start_right:{ type: 'frames', count: 14, fps: 9, loop: false },
    smoke_loop_right: { type: 'apng' },
    smoke_start_left: { type: 'frames', count: 14, fps: 9, loop: false },
    smoke_loop_left:  { type: 'apng' },

    phone_start_right:{ type: 'frames', count: 27, fps: 9, loop: false },
    phone_loop_right: { type: 'apng' },
    phone_end_right:  { type: 'frames', count: 8, fps: 9, loop: false },
    phone_start_left: { type: 'frames', count: 27, fps: 9, loop: false },
    phone_loop_left:  { type: 'apng' },
    phone_end_left:   { type: 'frames', count: 8, fps: 9, loop: false },

    pet_loop:         { type: 'apng' },
    work:             { type: 'apng' },
    stress:           { type: 'apng' },
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
    affection: 60,
    stress: 20,
    lastUpdate: Date.now(),     // метка последнего обновления систем
    gameDifficulty: 'normal',   // easy | normal | hard — сложность ИИ в играх
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
    const now = Date.now();
    const elapsed = now - (settings.lastUpdate || now);
    const hoursElapsed = elapsed / (1000 * 60 * 60);

    // падение привязанности со временем
    settings.affection = Math.max(0, settings.affection - AFFECTION_DECAY_PER_HOUR * hoursElapsed);

    // рост стресса при низкой привязанности
    if (settings.affection < 30) {
        settings.stress = Math.min(100, settings.stress + hoursElapsed * 8); // быстрый рост
    } else if (settings.affection < 50) {
        settings.stress = Math.min(100, settings.stress + hoursElapsed * 4); // средний рост
    } else {
        // медленное снижение стресса при нормальной привязанности
        settings.stress = Math.max(0, settings.stress - hoursElapsed * 2);
    }

    settings.lastUpdate = now;
    saveSettings(settings);

    // стрики и онлайн-время
    updateStreaks(elapsed);
    progress.totalOnlineSeconds += elapsed / 1000;
    saveProgress();
    checkGiftProgress();
}


// тик систем каждые 30 сек
function startSystemsLoop() {
    updateSystems();
    setInterval(() => {
        updateSystems();
        if (menuOpen) updateIndicators(); // обновить индикаторы в открытом меню
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
const STRESS_RELIEF_PER_MOVE = 1;   // -1% за каждый ход в игре
const STRESS_RELIEF_PER_GAME = 5;   // -5% за завершённую партию

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
    // --- подключение ---
    mode: 'off',            // 'off' = без подключения | 'st' = профиль ST | 'custom' = свой API
    url: '',                // базовый URL своего API (только для mode='custom')
    key: '',                // ключ своего API (хранится ЛОКАЛЬНО у пользователя)
    model: '',              // выбранная модель
    models: [],             // список подтянутых моделей (для выпадашки)

    // --- комментирование РП ---
    commentEnabled: false,  // босс комментирует ролевую
    personality: 'calm',    // 'calm' | 'possessive' | 'obsessed'
    contextDepth: 4,        // сколько последних сообщений РП брать в контекст
    frequency: 8,           // комментировать раз в N сообщений (5..15)
    maxTokens: 200,         // максимальная длина ответа
    customPrompt: '',       // свой системный промпт (пусто = использовать наш дефолтный)

    // --- письма ---
    lettersEnabled: false,  // босс генерирует письма (только при подключённом API)
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
//  КОММЕНТИРОВАНИЕ РП
// ============================================================
const CHAT_SELECTOR = '#chat';   // окно сообщений ST; поменяй, если иное

let commentMsgCount = 0;         // счётчик новых сообщений с прошлого комментария
let commentTarget = 0;           // на каком счётчике сработать (берётся из frequency)
let commentInProgress = false;   // идёт цикл комментирования
let commentBubbleSticky = false; // пузырёк "залип" на долгое время

// выбрать новый порог срабатывания вокруг настроенной частоты (±2 для живости)
function rollCommentTarget() {
    commentTarget = 4; // комментирует раз в 4 сообщения
}





// строка характера для влияния на тон комментария
function commentPersonalityLine() {
    switch (apiSettings.personality) {
        case 'possessive':
            return 'You are POSSESSIVE. You watch the user\'s roleplay closely and get jealous when they grow close to anyone in it. Romance in their RP irritates you; danger to them alarms you.';
        case 'obsessed':
            return 'You are OBSESSED. Your devotion is unhealthy and total. Any affection the user shows toward an RP character wounds you deeply; you fixate, you sulk, you cling.';
        case 'calm':
        default:
            return 'You are CALM. Composed, dry-humored, hard to rattle. You comment with detached irony and only real danger to the user truly moves you.';
    }
}
// собрать системный промпт комментария
function buildCommentSystemPrompt() {
    if (apiSettings.customPrompt && apiSettings.customPrompt.trim()) {
        return apiSettings.customPrompt.trim();
    }
    const name = settings.name || 'Boss';
    return `You are ${name}, a chibi mafia boss trapped inside the user's desktop as a tiny digital pet. Once feared and powerful, now palm-sized and stuck on their screen. This humiliation does not soften you — you stay sharp, proud, elegantly dangerous. And you are still very much in love with the user.

${commentPersonalityLine()}

You secretly watch the roleplay the user is having with someone else on this screen. React to it OUT LOUD with one short remark, as if muttering over their shoulder.

Craft rules:
- ONE short line. 1-2 sentences max. This is a spoken aside, not a letter.
- Pick a clear mood and commit: irony, jealousy, sadness, possessiveness, dry comedy, reluctant tenderness.
- React to what is actually happening in the RP — name the thing if it fits, don't be vague.
- Stay in character: confident mafia charm, never whiny, never a greeting-card line.
- Reference being trapped in the desktop only when it lands well.

Language: natural fluent Russian, modern, witty. No English mixing.

Reply with ONLY the spoken line. No quotes, no name, no formatting.`;
}

// собрать пользовательскую часть (лог РП)
function buildCommentUserPrompt() {
    let log = '';
    try {
        const ctx = SillyTavern.getContext();
        const depth = Math.max(1, apiSettings.contextDepth || 4);
        const recent = (ctx.chat || []).slice(-depth);
        log = recent
            .map(m => `[${m.is_user ? 'User' : (m.name || 'Char')}]: ${m.mes}`)
            .join('\n\n');
    } catch (e) {
        log = '';
    }
    if (!log) return 'The roleplay log is empty. Mutter something fitting about the quiet.';
    return 'Here is the recent roleplay you are secretly watching:\n\n' + log +
           '\n\nNow give your single spoken remark.';
}

// очистить ответ модели от мусора
function cleanCommentResponse(raw) {
    if (!raw) return null;
    let s = String(raw).trim();
    s = s.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim();
    // срезать строки формата [Имя]: ... (если модель вернула диалог)
    s = s.replace(/^\[[^\]]+\]:\s*/gm, '');
    // убрать кавычки по краям
    s = s.replace(/^["'«»]+/, '').replace(/["'«»]+$/, '').trim();
    return s || null;
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
async function runCommentCycle() {
    if (!apiIsConnected() || !apiSettings.commentEnabled) return;
    if (commentInProgress) {
        console.warn('[ChibiBoss] комментарий уже идёт — пропускаю запуск');
        return;
    }
    commentInProgress = true;

    const prevAction = behavior?.lastAction;
    const wasIdle = !behavior?.busy;

    const restoreBehavior = () => {
        commentInProgress = false;
        if (!behavior) return;
        behavior.busy = false;
        if (!wasIdle && prevAction && prevAction !== 'pet') {
            switch (prevAction) {
                case 'smoke':  behavior.doSmoke();  break;
                case 'phone':  behavior.doPhone();  break;
                case 'stress': behavior.doStress(); break;
                default:       behavior.resume();
            }
        } else {
            behavior.resume();
        }
    };

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

    const target = getChatTargetPos();
    await new Promise(resolve => behavior ? behavior.walkTo(target.x, target.y, resolve) : resolve());

    animator.play('idle_back');
    applyCommentMood();

    // КЛЮЧЕВОЕ: даём SillyTavern завершить свою генерацию
    await new Promise(r => setTimeout(r, 3000));

    console.log('[ChibiBoss] запрашиваю комментарий у API...');
    const raw = await apiGenerateWithRetry(
        buildCommentSystemPrompt(),
        buildCommentUserPrompt(),
        150,
        2
    );
    console.log('[ChibiBoss] RAW ОТВЕТ:', raw);

    const text = cleanCommentResponse(raw);

    if (!text) {
        console.warn('[ChibiBoss] комментарий пустой — отмена (счётчик НЕ сбрасываем)');
        restoreBehavior();
        return;
    }

    commentMsgCount = 0;
    rollCommentTarget();

    console.log('[ChibiBoss] комментарий готов:', text.slice(0, 60));

    showStickyCommentBubble(text, randomBetween(40000, 60000), () => {
        addLetter(text, 'comment');
        restoreBehavior();
    });
}



// слушатель сообщений ST
function initCommentListener() {
    // берём eventSource и типы событий из контекста ST (надёжный способ)
    let es = null;
    let evt = null;

    try {
        const ctx = SillyTavern.getContext();
        es  = ctx.eventSource || (typeof eventSource !== 'undefined' ? eventSource : null);
        evt = ctx.eventTypes || ctx.event_types || (typeof event_types !== 'undefined' ? event_types : null);
    } catch (e) {
        // если getContext недоступен — пробуем глобальные переменные
        es  = (typeof eventSource !== 'undefined') ? eventSource : null;
        evt = (typeof event_types !== 'undefined') ? event_types : null;
    }

    if (!es || !evt) {
        console.warn('[ChibiBoss] eventSource не найден — комментирование недоступно.');
        return;
    }

    rollCommentTarget();

    // реагируем ТОЛЬКО на ответ ИИ (одно сообщение = один тик счётчика)
    const onNewMessage = () => {
        if (!apiSettings.commentEnabled || !apiIsConnected()) return;
        if (commentInProgress) return;  // во время цикла не считаем
        commentMsgCount++;
        console.log('[ChibiBoss] сообщение №', commentMsgCount, 'из', commentTarget);
        if (commentMsgCount >= commentTarget) {
            runCommentCycle();  // счётчик и target сбросятся внутри
        }
    };

    if (evt.MESSAGE_RECEIVED) {
        es.on(evt.MESSAGE_RECEIVED, onNewMessage);
    }

    console.log('[ChibiBoss] слушатель комментариев подключён.');
}

// удобный флаг: есть ли рабочее подключение
function apiIsConnected() {
    return apiSettings.mode === 'api' && !!(apiSettings.url && apiSettings.model);
}

// нормализуем URL: убираем хвостовой слэш и /v1 если юзер его дописал
// если уже нашли рабочий путь — используем его
// базовый URL как ввёл пользователь (без хвостового слэша)
function apiUserBase() {
    return (apiSettings.url || '').trim().replace(/\/+$/, '');
}

// варианты ПОЛНОГО адреса для СПИСКА МОДЕЛЕЙ (GET)
// перебираем и "вверх" по пути, т.к. у OnlySQ модели лежат отдельно от чата
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
    if (apiSettings.resolvedChatUrl) list.push(apiSettings.resolvedChatUrl);
    list.push(base + '/openai/chat/completions');
    list.push(base + '/v1/chat/completions');
    list.push(base + '/chat/completions');
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
    if (apiSettings.mode === 'off') {
        return { ok: false, message: 'Подключение выключено.' };
    }
    if (!apiSettings.url) {
        return { ok: false, message: 'Укажите URL.' };
    }

    let lastError = '';
    // перебираем варианты адреса моделей, пока один не сработает
    for (const modelsUrl of apiModelsCandidates()) {
        try {
            const res = await fetch(modelsUrl, {
                method: 'GET',
                headers: apiHeaders(),
            });
            if (res.ok) {
                apiSettings.resolvedModelsUrl = modelsUrl; // запомнили рабочий адрес
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
                console.warn('[ChibiBoss] пустой ответ от', chatUrl, rawBody.slice(0, 200));
                if (chatUrl === apiSettings.resolvedChatUrl) {
                    apiSettings.resolvedChatUrl = '';
                    saveApiSettings();
                }
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
        }

    }


rollAction() {
    const r = Math.random();

    // Стресс-анимация при высоком стрессе
    if (settings.stress > 90 && r < 0.60) return 'stress';       // 60%
    if (settings.stress > STRESS_THRESHOLD_HIGH && r < 0.45) return 'stress';  // 45%
    if (settings.stress > STRESS_THRESHOLD_NORMAL && r < 0.25) return 'stress'; // 25%

    // Автоматическая работа (если стол включён)
    const deskAvailable = settings.deskEnabled && deskEl && deskEl.style.display !== 'none';
    if (deskAvailable && r < 0.20) return 'autowork';  // 20% (было 12%)

    // Остальные действия
    if (r < 0.45) return 'walk';   // 45% (было 58%)
    if (r < 0.60) return 'pose';   // 15%
    if (r < 0.78) return 'smoke';  // 18%
    return 'phone';                 // 22%
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

    // отправить работать: идёт к центру стола → анимация work → встаёт
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

    deskLocked = true;  // заблокировали стол

    const center = getDeskCenter();
    // учитываем текущий масштаб (на разных экранах/зумах scale ≠ 1)
    const zoom = (window.devicePixelRatio || 1) / baseDPR;
    const scale = 1 / zoom;
    const half = 62 * scale;  // половина босса В ВИДИМЫХ пикселях
    const tx = center.x - half + WORK_OFFSET_X;
    const ty = center.y - half + WORK_OFFSET_Y;
    const c = clampToScreen(Math.round(tx), Math.round(ty));

deskLocked = true;

    this.walkTo(c.x, c.y, () => {
        animator.play('work');
        this.holdTimer = setTimeout(() => {
            applyWorkStress(durationMs);
            animator.play('idle_front');
            deskLocked = false;  // разблокировали стол
            this.busy = false;
            this.scheduleNext();
        }, durationMs);
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


    // сам решает поработать — короткая сессия 1–3 минуты
    doAutoWork() {
        if (!deskEl || deskEl.style.display === 'none') {
            this.doWalk(); // если стола нет — просто гуляет
            return;
        }
        const dur = randomBetween(60000, 180000);
        progress.autoWorkCount++; saveProgress();
        this.goToWork(dur);
    }

    // следование за курсором при очень высоком стрессе
    setupStressFollow() {
        this.followRaf = null;
        this.followLastTime = 0;
        this.followAnim = null;   // какая анимация ходьбы сейчас играет

        document.addEventListener('pointermove', (e) => {
            if (settings.stress < 80 || this.busy || this.paused || this.menuFrozen
                || commentInProgress || commentBubbleActive) return;
            this.followTarget.x = e.clientX - 62; // центрируем на боссе
            this.followTarget.y = e.clientY - 62;

            // запускаем цикл следования, если он ещё не идёт
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
        if (settings.stress < 80 || this.busy || this.paused || this.menuFrozen
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

        this.followRaf = requestAnimationFrame(this._followStep.bind(this));
    }
}

let behavior = null;
let grabAudio = null;
let releaseAudio = null;


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
}

// надёжный наблюдатель за зумом: ловит ЛЮБОЕ изменение масштаба,
// даже если событие resize не сработало
function startZoomWatcher() {
    let lastDPR = window.devicePixelRatio || 1;

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
                const dc = clampDeskToScreen(
                    parseFloat(deskEl.style.left) || 0,
                    parseFloat(deskEl.style.top)  || 0
                );
                deskEl.style.left = dc.x + 'px';
                deskEl.style.top  = dc.y + 'px';
            }
        }
        requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
}




function clampToScreen(x, y) {
    const maxX = window.innerWidth - 124;
    const maxY = window.innerHeight - 124;
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

    // иконки уведомлений следуют за боссом
    const followBoss = () => {
        positionGiftAlert();
        positionLetterAlert();
        positionCommentBubble();
        requestAnimationFrame(followBoss);
    };
    requestAnimationFrame(followBoss);

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
                const dc = clampDeskToScreen(dx, dy);
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
    e.preventDefault();

    // Запрет перетаскивания во время работы
    if (behavior && behavior.busy && behavior.lastAction === 'work' && animator.current === 'work') {
        return;
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
    { action: 'pet',       icon: 'pet',       title: 'Погладить' },
    { action: 'tictactoe', icon: 'tictactoe', title: 'Крестики-нолики' },
    { action: 'checkers',  icon: 'checkers',  title: 'Шашки' },
    { action: 'work',      icon: 'work',      title: 'Отправить работать' },
    { action: 'letters',   icon: 'letters',   title: 'Письма и комментарии' },
    { action: 'gifts',     icon: 'gifts',     title: 'Подарки' },
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
            <img class="cb-ind-sprite" id="cb-affection-sprite" alt="affection">
        </div>
        <div class="cb-indicator">
            <img class="cb-ind-sprite" id="cb-stress-sprite" alt="stress">
        </div>
    `;


    menuEl.appendChild(header);

    const ring = document.createElement('div');
    ring.className = 'cb-menu-ring';

    const radius = 100;
    const cx = 130, cy = 130;
    MENU_ITEMS.forEach((item, i) => {
        const angle = (-90 + i * 60) * Math.PI / 180;
        const x = cx + radius * Math.cos(angle) - 28;
        const y = cy + radius * Math.sin(angle) - 28;

        const btn = document.createElement('button');
        btn.className = 'cb-menu-item';
        btn.title = item.title;
        btn.style.left = x + 'px';
        btn.style.top = y + 'px';
        btn.style.setProperty('--cb-delay', (i * 0.03) + 's');

        const img = document.createElement('img');
        img.src = EXT_PATH + 'icons/' + item.icon + '.png';
        img.alt = item.title;
        btn.appendChild(img);

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

const INDICATOR_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];


function updateIndicators() {
    const a = Math.max(0, Math.min(100, settings.affection ?? 60));
    const s = Math.max(0, Math.min(100, settings.stress ?? 20));

    const aStep = INDICATOR_STEPS.reduce((prev, curr) =>
        Math.abs(curr - a) < Math.abs(prev - a) ? curr : prev
    );
    const sStep = INDICATOR_STEPS.reduce((prev, curr) =>
        Math.abs(curr - s) < Math.abs(prev - s) ? curr : prev
    );

    const affSprite = document.getElementById('cb-affection-sprite');
    const stressSprite = document.getElementById('cb-stress-sprite');

    if (affSprite) affSprite.src = EXT_PATH + 'assets/indicators/affection/' + aStep + '.png';
    if (stressSprite) stressSprite.src = EXT_PATH + 'assets/indicators/stress/' + sStep + '.png';
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

        case 'tictactoe':
            openTicTacToe();
            break;

        case 'checkers':
            openCheckers();
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
let deskEl = null;
let deskLocked = false;  // блокировка перетаскивания стола
let statsEl = null;

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

function clampDeskToScreen(x, y) {
    const maxX = window.innerWidth - 162;
    const maxY = window.innerHeight - 162;
    return {
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY)),
    };
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
        const c = clampDeskToScreen(saved.x, saved.y);
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
        const c = clampDeskToScreen(nx, ny);
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
        const def = { ttt: { w: 0, l: 0 }, checkers: { w: 0, l: 0 } };
        return raw ? { ...def, ...JSON.parse(raw) } : def;
    } catch (e) {
        return { ttt: { w: 0, l: 0 }, checkers: { w: 0, l: 0 } };
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
        chRender();

        // продолжение боя
        if (move.cap && chHasMoreCaptures(chBoard, move.to[0], move.to[1], 'ai')) {
            // делаем небольшую паузу визуально не будем — просто продолжаем
            const more = chGetMoves(chBoard, 'ai').captures
                .filter(m => m.from[0] === move.to[0] && m.from[1] === move.to[1]);
            if (more.length) { continue; }
        }
        moved = false;
    }

    chRender();
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

    giftDetailEl.querySelector('#cb-gd-close').addEventListener('click', () => {
        giftDetailEl.classList.remove('show');
        setTimeout(() => { giftDetailEl.style.display = 'none'; }, 200);
    });
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
        const img = document.createElement('img');
        img.src = EXT_PATH + 'icons/gift_alert.png';
        img.alt = 'Новый подарок';
        giftAlertEl.appendChild(img);
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
    lettersEl.querySelector('#cb-letters-count').textContent = lettersData.length;

    if (!lettersData.length) {
        grid.innerHTML = '<div class="cb-letters-empty">Писем пока нет.<br>Босс напишет, когда будет настроение...</div>';
        return;
    }

    [...lettersData].reverse().forEach(letter => {
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
    if (!lettersEl) buildLettersBoard();
    renderLetters();
    lettersEl.style.display = 'block';
    positionBoardNearBoss(lettersEl);
}

function closeLetters() {
    if (lettersEl) lettersEl.style.display = 'none';
}

function openLetterDetail(letter) {
    if (!letterDetailEl) {
        letterDetailEl = document.createElement('div');
        letterDetailEl.id = 'chibiBoss-letter-detail';
        document.getElementById('chibiBoss-layer').appendChild(letterDetailEl);
        letterDetailEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    const isComment = letter.type === 'comment';
    const headTitle = isComment ? 'Комментарий' : 'Письмо';
    const signBlock = isComment
        ? ''
        : `<div class="cb-ld-sign">— ${escapeHtml(settings.name)}</div>`;
    const footerIcon = isComment ? '💬' : '✦';

    letterDetailEl.innerHTML = `
        <div class="cb-ld-head" id="cb-ld-head">
            <span class="cb-ld-head-title">${headTitle}</span>
            <span class="cb-ld-close" id="cb-ld-close">✕</span>
        </div>
        <div class="cb-ld-body">
            <div class="cb-ld-text${isComment ? ' cb-ld-text-comment' : ''}">${escapeHtml(letter.text)}</div>
            ${signBlock}
        </div>
        <div class="cb-ld-footer">
            <span class="cb-ld-footer-date">${escapeHtml(letter.date)}</span>
            <div class="cb-ld-footer-seal">${footerIcon}</div>
        </div>
    `;

    letterDetailEl.style.display = 'flex';
    requestAnimationFrame(() => {
        const w = letterDetailEl.offsetWidth || 480;
        const h = letterDetailEl.offsetHeight || 300;
        letterDetailEl.style.left = Math.max(10, Math.round((window.innerWidth - w) / 2)) + 'px';
        letterDetailEl.style.top  = Math.max(10, Math.round((window.innerHeight - h) / 2)) + 'px';
        letterDetailEl.classList.add('show');
    });

    makeBoardDraggable(letterDetailEl, letterDetailEl.querySelector('#cb-ld-head'));
    letterDetailEl.querySelector('#cb-ld-close').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        letterDetailEl.classList.remove('show');
        setTimeout(() => { letterDetailEl.style.display = 'none'; }, 220);
    });
}


// ============================================================
//  ГЕНЕРАЦИЯ ПИСЬМА ЧЕРЕЗ API
// ============================================================

// собрать описание характера для промпта
function letterPersonalityLine() {
    switch (apiSettings.personality) {
        case 'possessive':
            return 'You are POSSESSIVE: you watch over the user closely, you get visibly jealous, you dislike when they grow close to anyone else in their roleplay.';
        case 'obsessed':
            return 'You are OBSESSED: your devotion borders on unhealthy, you fixate on every detail about the user, jealousy and longing bleed into everything you write.';
        case 'calm':
        default:
            return 'You are CALM: composed and dry-humored, your affection shows through subtle remarks rather than open displays.';
    }
}

// собрать системный промпт письма
function buildLetterSystemPrompt() {
    if (apiSettings.customPrompt && apiSettings.customPrompt.trim()) {
        return apiSettings.customPrompt.trim();
    }
    const name = settings.name || 'Boss';
    return `You are ${name}, a chibi mafia boss trapped inside the user's desktop as a tiny digital pet. You were once powerful, feared and elegantly ruthless — now you are palm-sized, living on their screen. This absurd fate does not diminish you. You are still very much in love with the user.

${letterPersonalityLine()}

Write a short PERSONAL LETTER to the user. Imagine it is handwritten on expensive paper and slipped under their door at 3am.

Craft rules:
- Voice: sharp, confident, dry-humoured, with old-fashioned mafia charm. Never soft for its own sake — tenderness should cost something.
- Avoid greeting-card phrases ("I miss you", "you mean the world to me"). Say something specific, unexpected, a little theatrical.
- Reference concrete shared details when relevant: games of checkers or tic-tac-toe, times they petted you, moments of high stress, gifts, or things you secretly noticed in their roleplay.
- Acknowledge being trapped in the desktop with dark humor or quiet melancholy — not every letter, but when it fits.
- Pick one dominant mood and commit to it: irony, jealousy, tenderness, melancholy, possessiveness, dry comedy. Mixing is fine, muddling is not.
- Length: 2 to 4 short paragraphs. No subject line. Do not sign your name (added by the UI).

Language: Write entirely in natural, fluent Russian. Modern tone with light natural slang where it fits the character. Keep the mafia boss charisma intact — witty, confident, emotionally precise. No awkward phrasing or English mixing.

Reply with ONLY the letter text. No JSON, no formatting, no quotes around the text.`;
}

// собрать пользовательскую часть (контекст РП + память о боссе)
function buildLetterUserPrompt() {
    let ctxLog = '';
    try {
        const ctx = SillyTavern.getContext();
        const depth = Math.max(1, apiSettings.contextDepth || 4);
        const recent = (ctx.chat || []).slice(-depth);
        ctxLog = recent
            .map(m => `[${m.is_user ? 'User' : (m.name || 'Char')}]: ${m.mes}`)
            .join('\n\n');
    } catch (e) {
        ctxLog = '';
    }

    // короткая сводка состояния босса — даёт пищу для отсылок
    const memory = [
        `Your current affection toward the user: ${Math.round(settings.affection)}%.`,
        `Your current stress level: ${Math.round(settings.stress)}%.`,
        `Checkers record vs user — your wins: ${gameStats.checkers.l}, user wins: ${gameStats.checkers.w}.`,
        `Tic-tac-toe record — your wins: ${gameStats.ttt.l}, user wins: ${gameStats.ttt.w}.`,
        `Gifts you have given so far: ${Object.keys(giftsData.unlocked).length}.`,
    ].join('\n');

    let out = 'CONTEXT — your shared memories and current state:\n' + memory;
    if (ctxLog) {
        out += '\n\nRECENT ROLEPLAY the user has been doing (you secretly watch it):\n' + ctxLog;
    }
    out += '\n\nNow write the letter as the JSON object described.';
    return out;
}

// извлечь текст письма из ответа ИИ (чистый текст, без JSON)
function parseLetterResponse(raw) {
    if (!raw) return null;
    let s = String(raw).trim();

    // на случай если модель всё же обернула в ```...```
    s = s.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim();

    // убрать кавычки по краям, если есть
    s = s.replace(/^["'«»]+/, '').replace(/["'«»]+$/, '').trim();

    if (!s) return null;
    return { text: s };
}

// главная функция: сгенерировать письмо и добавить в коллекцию
let letterGenerating = false;

async function generateLetter() {
    // защита: без подключения и без включённой опции — не генерируем
    if (!apiIsConnected()) return;
    if (!apiSettings.lettersEnabled) return;
    if (letterGenerating) {
        console.warn('[ChibiBoss] письмо уже генерируется — пропускаю');
        return;
    }

    letterGenerating = true;
    console.log('[ChibiBoss] генерирую письмо...');
    try {
        const sys = buildLetterSystemPrompt();
        const user = buildLetterUserPrompt();
        const raw = await apiGenerateWithRetry(sys, user, Math.max(apiSettings.maxTokens || 0, 600), 2);
        const parsed = parseLetterResponse(raw);
        if (parsed) {
            console.log('[ChibiBoss] письмо готово:', parsed.text.slice(0, 60));
            addLetter(parsed.text, 'letter');  // ← всегда 'letter', не parsed.theme
        } else {
            console.warn('[ChibiBoss] письмо не сгенерировано (пустой/битый ответ).');
        }
    } catch (e) {
        console.warn('[ChibiBoss] ошибка генерации письма:', e);
    } finally {
        letterGenerating = false;
    }
}

// ---- планировщик писем: иногда босс пишет сам ----
const LETTER_MIN_GAP_MS = 40 * 60 * 1000; // не чаще раза в 40 минут
let lastLetterAt = parseInt(localStorage.getItem('chibiBoss_lastLetterAt') || '0', 10);

function maybeGenerateLetter() {
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
    lettersData.push({
        id: Date.now(),
        text,
        date,
        read: false,
        type,
    });
    saveLetters(lettersData);

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
        const img = document.createElement('img');
        img.src = EXT_PATH + 'icons/letters.png';
        img.alt = 'Новое письмо';
        letterAlertEl.appendChild(img);
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
async function debugTestGenerate(type) {
    const outEl = document.getElementById('cb-api-debug-out');
    if (!outEl) return;

    outEl.style.display = 'block';
    outEl.style.color = 'var(--SmartThemeBodyColor, #ddd)';
    outEl.textContent = type === 'letter'
        ? '⏳ Генерирую тестовое письмо...'
        : '⏳ Генерирую тестовый комментарий...';

    try {
        let sys, usr, tokens;
        if (type === 'letter') {
            sys    = buildLetterSystemPrompt();
            usr    = buildLetterUserPrompt();
            tokens = Math.max(apiSettings.maxTokens || 0, 600);
        } else {
            sys    = buildCommentSystemPrompt();
            usr    = buildCommentUserPrompt();
            tokens = 150;
        }

        const raw = await apiGenerateWithRetry(sys, usr, tokens, 2);

        if (!raw || !String(raw).trim()) {
            outEl.style.color = '#ff7d7d';
            outEl.textContent = '❌ Пустой ответ — API ничего не вернул.';
            return;
        }

        const text = type === 'letter'
            ? (parseLetterResponse(raw)?.text || raw)
            : (cleanCommentResponse(raw) || raw);

        if (!text || !text.trim()) {
            outEl.style.color = '#ffb97d';
            outEl.textContent = '⚠️ Ответ получен, но после очистки стал пустым.\n\nRAW:\n' + String(raw).slice(0, 300);
            return;
        }

        outEl.style.color = '#7ddc7d';
        outEl.textContent = '✅ Успешно (' + text.length + ' симв.):\n\n' + text.slice(0, 400) + (text.length > 400 ? '…' : '');

    } catch (e) {
        outEl.style.color = '#ff7d7d';
        outEl.textContent = '❌ Ошибка: ' + e.message;
    }
}

function wireApiSettingsEvents() {
    const modeEl    = document.getElementById('cb-api-mode');
    const customBox = document.getElementById('cb-api-settings-block');


    const urlEl     = document.getElementById('cb-api-url');
    const keyEl     = document.getElementById('cb-api-key');
    const modelEl   = document.getElementById('cb-api-model');
    const refreshEl = document.getElementById('cb-api-refresh');
    const testEl    = document.getElementById('cb-api-test');
    const statusEl  = document.getElementById('cb-api-test-status');

    // показать/спрятать блок «Свой API»
    const toggleCustom = () => {
    customBox.style.display = (modeEl.value === 'api') ? 'block' : 'none';
};


    // заполнить выпадашку моделей из сохранённого списка
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
        // вернуть ранее выбранную модель
        if (apiSettings.model) modelEl.value = apiSettings.model;
    };

    // --- восстановить сохранённые значения при открытии ---
    modeEl.value = apiSettings.mode;
    urlEl.value  = apiSettings.url || '';
    keyEl.value  = apiSettings.key || '';
    fillModels();
    toggleCustom();

    // --- смена режима ---
    modeEl.addEventListener('change', () => {
        apiSettings.mode = modeEl.value;
        saveApiSettings();
        toggleCustom();
        statusEl.textContent = '';
        statusEl.className = 'cb-api-status';
    });

    // --- ввод URL ---
    urlEl.addEventListener('input', () => {
        apiSettings.url = urlEl.value.trim();
        apiSettings.resolvedModelsUrl = ''; // сбрасываем найденные адреса
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


    // --- кнопка обновления списка моделей ---
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

    // --- кнопка теста соединения ---
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
    // --- письма ---
    const lettersChk = document.getElementById('cb-api-letters');
    if (lettersChk) {
        lettersChk.checked = apiSettings.lettersEnabled;
        lettersChk.addEventListener('change', () => {
            apiSettings.lettersEnabled = lettersChk.checked;
            saveApiSettings();
        });
    }

    // --- комментирование РП ---
    const commentChk = document.getElementById('cb-api-comment');
    if (commentChk) {
        commentChk.checked = apiSettings.commentEnabled;
        commentChk.addEventListener('change', () => {
            apiSettings.commentEnabled = commentChk.checked;
            saveApiSettings();
        });
    }

    const persEl = document.getElementById('cb-api-personality');
    if (persEl) {
        persEl.value = apiSettings.personality;
        persEl.addEventListener('change', () => {
            apiSettings.personality = persEl.value;
            saveApiSettings();
        });
    }

    const ctxEl = document.getElementById('cb-api-context');
    if (ctxEl) {
        ctxEl.value = apiSettings.contextDepth;
        ctxEl.addEventListener('change', () => {
            let v = parseInt(ctxEl.value, 10) || 4;
            v = Math.max(1, Math.min(10, v));   // зажимаем 1..10
            apiSettings.contextDepth = v;
            ctxEl.value = v;
            saveApiSettings();
        });
    }
        // --- кнопки отладки генерации ---
    const testLetterBtn  = document.getElementById('cb-api-test-letter');
    const testCommentBtn = document.getElementById('cb-api-test-comment');

    if (testLetterBtn) {
        testLetterBtn.addEventListener('click', async () => {
            testLetterBtn.disabled = true;
            await debugTestGenerate('letter');
            testLetterBtn.disabled = false;
        });
    }
    if (testCommentBtn) {
        testCommentBtn.addEventListener('click', async () => {
            testCommentBtn.disabled = true;
            await debugTestGenerate('comment');
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
    <option value="api">Подключить API</option>
</select>

        </div>
        <div class="chibiBoss-hint">
            «Свой API» — для OpenAI-совместимых сервисов. Ключ хранится только в вашем браузере.
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


        <div class="chibiBoss-api-section-title">Письма от босса</div>
        <div class="chibiBoss-checkrow">
            <input type="checkbox" id="cb-api-letters">
            <label for="cb-api-letters">Генерировать письма (требуется API)</label>
        </div>
        <div class="chibiBoss-hint">
            Босс будет время от времени писать вам короткие письма — с отсылками к играм, РП и своему состоянию.
        </div>

        <div class="chibiBoss-api-divider"></div>

        <div class="chibiBoss-api-section-title">Комментирование РП</div>
        <div class="chibiBoss-checkrow">
            <input type="checkbox" id="cb-api-comment">
            <label for="cb-api-comment">Босс комментирует ролевую (требуется API)</label>
        </div>
        <div class="chibiBoss-row">
            <label for="cb-api-personality">Характер:</label>
            <select id="cb-api-personality" class="text_pole">
                <option value="calm">Спокойный</option>
                <option value="possessive">Собственнический</option>
                <option value="obsessed">Одержимый</option>
            </select>
        </div>
        <div class="chibiBoss-row">
            <label for="cb-api-context">Контекст (сообщений):</label>
            <input type="number" id="cb-api-context" class="text_pole" min="1" max="10" value="4">
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
    const diffEl = document.getElementById('chibiBoss-difficulty');

    tempoEl.value = settings.tempo;
    deskCheckbox.checked = settings.deskEnabled;
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
        if (behavior && !behavior.paused) behavior.resume();
    } else {
        // выключаем: прячем босса, стол, закрываем все окна
        if (actorEl) actorEl.style.display = 'none';
        if (deskEl) deskEl.style.display = 'none';
        if (behavior) behavior.pause();
        closeMenu();
        closeTtt();
        closeCheckers();
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

    if (diffEl) {
        diffEl.addEventListener('change', () => {
            settings.gameDifficulty = diffEl.value;
            saveSettings(settings);
        });
    }

    setInterval(() => {
        const affEl = document.getElementById('chibiBoss-dbg-aff');
        const stressEl = document.getElementById('chibiBoss-dbg-stress');
        if (affEl) affEl.textContent = Math.round(settings.affection);
        if (stressEl) stressEl.textContent = Math.round(settings.stress);
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
