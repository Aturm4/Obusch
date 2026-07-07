/* ===== Простое JSON-хранилище с атомарной записью ===== */
const fs = require('fs');
const path = require('path');

// Каталог данных (для облака — указывает на постоянный диск через env DATA_DIR)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* уже есть */ }
const DB_PATH = path.join(DATA_DIR, 'db.json');

let db = null;

function load() {
  if (fs.existsSync(DB_PATH)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      return;
    } catch (e) {
      console.error('Не удалось прочитать db.json, пересоздаю:', e.message);
    }
  }
  db = seed();
  save();
}

let saveTimer = null;
function save() {
  // атомарная запись через временный файл
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 50);
}

function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------- Сид: только наполнение курса, без людей ----------
   Пользователи (наставник и ученики) создаются через регистрацию.
   Первый зарегистрированный наставник становится наставником потока. */
function seed() {

  const modules = [
    { id: 'm1', order: 1, title: 'Основы и цветовые системы', meta: 'стартовый модуль', status: 'active', desc: 'Вводный модуль-пример: как работает цвет и система решений в интерфейсе. Образец наполнения — отредактируйте под свою программу.', published: true },
    { id: 'm2', order: 2, title: 'Типографика и сетки', meta: 'наполняется', status: 'locked', desc: 'Ритм, кегли, модульные сетки и наборная дисциплина.', published: false },
    { id: 'm3', order: 3, title: 'Композиция интерфейсов', meta: 'наполняется', status: 'locked', desc: 'Асимметрия, фокус, плотность и воздух в реальных экранах.', published: false },
    { id: 'm4', order: 4, title: 'Прототипирование и взаимодействие', meta: 'наполняется', status: 'locked', desc: 'Состояния, переходы, micro-interactions, логика потоков.', published: false },
    { id: 'm5', order: 5, title: 'Дизайн-системы', meta: 'наполняется', status: 'locked', desc: 'Компоненты, токены, документация и масштабирование.', published: false },
    { id: 'm6', order: 6, title: 'Портфолио и подача кейсов', meta: 'наполняется', status: 'locked', desc: 'Сторителлинг, структура кейса и презентация работы.', published: false }
  ];

  const lessons = [
    { id: 'l_3_1', moduleId: 'm1', order: 1, title: 'Природа цвета и восприятие', kind: 'Видео', dur: '12 мин', status: 'Опубликован' },
    { id: 'l_3_2', moduleId: 'm1', order: 2, title: 'Цветовые системы в интерфейсах', kind: 'Видео', dur: '14 мин', status: 'Опубликован',
      video: { name: 'lesson-3-2.mp4', meta: '14:08 · 1080p' },
      readMins: '~9 минут чтения',
      body: [
        { type: 'p', text: 'Хороший цвет в интерфейсе — это не палитра «красивых» оттенков, а система решений. Прежде чем выбрать акцент, мы определяем роли: что является фоном, что несёт текст, что отвечает за действие, а что — за статус.' },
        { type: 'h2', text: 'От оттенков к токенам' },
        { type: 'p', text: 'Токен — это имя для решения, а не для цвета. surface/primary может быть почти чёрным сегодня и тёплым графитом завтра — но смысл останется. Именно поэтому профессиональные продукты переживают редизайны без переписывания половины кода.' },
        { type: 'quote', text: '«Если вы не можете назвать цвет словом-ролью — у вас ещё нет системы, у вас есть набор пикселей.»' },
        { type: 'p', text: 'Дальше в уроке разберём контраст: почему 4.5:1 — это не догма, а минимум, и как тёплый акцент работает на тёмном фоне, не выжигая глаза.' }
      ] },
    { id: 'l_3_3', moduleId: 'm1', order: 3, title: 'Контраст и доступность', kind: 'Видео', dur: '11 мин', status: 'Опубликован' }
  ];

  const materials = [
    { id: 'mat1', lessonId: 'l_3_2', type: 'Figma', tc: '#E8835A', name: 'Цветовые токены — стартовый файл', meta: '.fig · 2.4 МБ' },
    { id: 'mat2', lessonId: 'l_3_2', type: 'PDF', tc: '#C98B6B', name: 'Конспект: системы цвета', meta: '.pdf · 8 страниц' },
    { id: 'mat3', lessonId: 'l_3_2', type: 'URL', tc: '#8FA98C', name: 'Подборка референсов', meta: '12 примеров' }
  ];

  const checklistTemplate = [
    { id: 'c1', lessonId: 'l_3_2', t: 'Собрать палитру: 1 базовый + 2 акцентных' },
    { id: 'c2', lessonId: 'l_3_2', t: 'Проверить контраст по WCAG AA' },
    { id: 'c3', lessonId: 'l_3_2', t: 'Описать токены: фон / текст / границы' },
    { id: 'c4', lessonId: 'l_3_2', t: 'Применить систему на одном экране' }
  ];

  const homeworks = [
    { id: 'hw_m3', moduleId: 'm1', lessonId: 'l_3_2', title: 'Цветовая система для экрана продукта',
      deadline: 'без срока', mentorId: null,
      difficulty: 2, format: 'Figma-файл или PDF · до 25 МБ',
      intro: 'Соберите цветовую систему для одного экрана продукта (на ваш выбор: дашборд, плеер или профиль). Опирайтесь на разобранный в уроке подход — роли важнее оттенков.',
      tasks: ['Определите базовый фон и 2 уровня поверхностей.', 'Задайте акцент и проверьте его контраст на фоне.', 'Назовите токены по роли и примените их на экране.'],
      criteria: [
        { id: 'cr1', t: 'Системность палитры', d: 'Базовый + акцентные, осмысленные роли', w: 30 },
        { id: 'cr2', t: 'Контраст и доступность', d: 'Соответствие WCAG AA на тёмной теме', w: 25 },
        { id: 'cr3', t: 'Применение токенов', d: 'Названы по роли, а не по цвету', w: 25 },
        { id: 'cr4', t: 'Аккуратность подачи', d: 'Чистый файл, понятная структура', w: 20 }
      ] }
  ];

  // боевой старт — людей и их данных нет
  const submissions = [];
  const portfolio = [];
  const messages = [];
  const users = [];
  const queueExtra = [];

  return {
    users, modules, lessons, materials, checklistTemplate,
    homeworks, submissions, portfolio, messages, queueExtra,
    meta: { stream: 'Поток 7', mentorId: null }
  };
}

/* ---------- Доступ к данным ---------- */
const api = {
  get raw() { return db; },
  save, saveSoon, uid,

  users: {
    all() { return db.users; },
    byId(id) { return db.users.find(u => u.id === id); },
    byEmail(email) { return db.users.find(u => u.email === (email || '').toLowerCase().trim()); },
    create(u) { db.users.push(u); saveSoon(); return u; },
    update(id, patch) {
      const u = db.users.find(x => x.id === id);
      if (u) { Object.assign(u, patch); saveSoon(); }
      return u;
    },
    students() { return db.users.filter(u => u.role === 'student'); },
    mentor() {
      if (db.meta.mentorId) { const m = db.users.find(u => u.id === db.meta.mentorId); if (m) return m; }
      return db.users.find(u => u.role === 'mentor') || null;
    }
  },

  meta: {
    get() { return db.meta; },
    setMentorId(id) { db.meta.mentorId = id; saveSoon(); }
  },

  modules: { all() { return db.modules.slice().sort((a, b) => a.order - b.order); },
    byId(id) { return db.modules.find(m => m.id === id); } },

  lessons: {
    all() { return db.lessons; },
    byId(id) { return db.lessons.find(l => l.id === id); },
    byModule(mid) { return db.lessons.filter(l => l.moduleId === mid).sort((a, b) => a.order - b.order); },
    add(l) { db.lessons.push(l); saveSoon(); return l; },
    update(id, patch) {
      const l = db.lessons.find(x => x.id === id);
      if (l) { Object.assign(l, patch); saveSoon(); }
      return l;
    },
    remove(id) {
      const i = db.lessons.findIndex(x => x.id === id);
      if (i === -1) return false;
      db.lessons.splice(i, 1);
      saveSoon();
      return true;
    }
  },

  modulesMut: {
    add(m) { db.modules.push(m); saveSoon(); return m; },
    update(id, patch) {
      const m = db.modules.find(x => x.id === id);
      if (m) { Object.assign(m, patch); saveSoon(); }
      return m;
    },
    remove(id) {
      const i = db.modules.findIndex(x => x.id === id);
      if (i === -1) return false;
      db.modules.splice(i, 1);
      db.lessons = db.lessons.filter(l => l.moduleId !== id);           // и его уроки
      const hwIds = db.homeworks.filter(h => h.moduleId === id).map(h => h.id);
      db.homeworks = db.homeworks.filter(h => h.moduleId !== id);        // и его домашку
      db.submissions = db.submissions.filter(s => hwIds.indexOf(s.homeworkId) === -1); // и сданные работы по ней
      db.modules.sort((a, b) => a.order - b.order).forEach((m, idx) => { m.order = idx + 1; });
      this.ensureEntry();
      saveSoon();
      return true;
    },
    // точка входа: если нет ни одного активного/пройденного модуля — открыть первый
    ensureEntry() {
      const mods = db.modules.slice().sort((a, b) => a.order - b.order);
      if (!mods.length) return;
      if (!mods.some(m => m.status === 'active' || m.status === 'done')) {
        mods[0].status = 'active';
        mods[0].published = true;
        saveSoon();
      }
    },
    // подчистить осиротевшие уроки/домашки/работы (на случай старых данных)
    cleanupOrphans() {
      const modIds = db.modules.map(m => m.id);
      const before = db.lessons.length + db.homeworks.length + db.submissions.length;
      db.lessons = db.lessons.filter(l => modIds.indexOf(l.moduleId) > -1);
      db.homeworks = db.homeworks.filter(h => modIds.indexOf(h.moduleId) > -1);
      const hwIds = db.homeworks.map(h => h.id);
      db.submissions = db.submissions.filter(s => hwIds.indexOf(s.homeworkId) > -1);
      if (db.lessons.length + db.homeworks.length + db.submissions.length !== before) saveSoon();
    }
  },

  materials: {
    byLesson(lid) { return db.materials.filter(m => m.lessonId === lid); },
    byId(id) { return db.materials.find(m => m.id === id); }
  },
  checklist: { byLesson(lid) { return db.checklistTemplate.filter(c => c.lessonId === lid); } },

  homeworks: {
    all() { return db.homeworks; },
    byId(id) { return db.homeworks.find(h => h.id === id); },
    byModule(mid) { return db.homeworks.find(h => h.moduleId === mid); },
    add(h) { db.homeworks.push(h); saveSoon(); return h; },
    update(id, patch) {
      const h = db.homeworks.find(x => x.id === id);
      if (h) { Object.assign(h, patch); saveSoon(); }
      return h;
    }
  },

  submissions: {
    all() { return db.submissions; },
    byId(id) { return db.submissions.find(s => s.id === id); },
    byStudent(sid) { return db.submissions.filter(s => s.studentId === sid); },
    forHomeworkStudent(hwId, sid) { return db.submissions.find(s => s.homeworkId === hwId && s.studentId === sid); },
    upsert(sub) {
      const i = db.submissions.findIndex(s => s.id === sub.id);
      if (i > -1) db.submissions[i] = sub; else db.submissions.push(sub);
      saveSoon();
      return sub;
    }
  },

  portfolio: {
    byOwner(oid) { return db.portfolio.filter(p => p.ownerId === oid); },
    add(p) { db.portfolio.push(p); saveSoon(); return p; }
  },

  messages: {
    thread(studentId) { return db.messages.filter(m => m.studentId === studentId).sort((a, b) => a.ts - b.ts); },
    add(m) { db.messages.push(m); saveSoon(); return m; }
  },

  queueExtra: { all() { return db.queueExtra; } }
};

load();
module.exports = api;
