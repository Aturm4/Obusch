/* ===== REST API платформы ===== */
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
const { requireAuth, requireMentor, publicUser, initials } = require('./auth');

const router = express.Router();

/* ---------- Загрузка файлов (ДЗ) ---------- */
const UPLOAD_DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : path.join(__dirname, '..', 'uploads');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { /* есть */ }
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[^\w.\-а-яё]/gi, '_');
    cb(null, Date.now() + '_' + safe);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

function fileTypeBadge(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'fig') return { type: 'FIG', tc: '#E8835A' };
  if (ext === 'pdf') return { type: 'PDF', tc: '#C98B6B' };
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return { type: 'IMG', tc: '#8FA98C' };
  return { type: ext.toUpperCase().slice(0, 3) || 'FILE', tc: '#8FA98C' };
}
function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
}
function ruDate() {
  const days = ['ВОСКРЕСЕНЬЕ', 'ПОНЕДЕЛЬНИК', 'ВТОРНИК', 'СРЕДА', 'ЧЕТВЕРГ', 'ПЯТНИЦА', 'СУББОТА'];
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const d = new Date();
  const hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
  return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()].toUpperCase() + ' · ' + hh + ':' + mm;
}

/* ===================== ПРОГРЕССИЯ ===================== */
// Все опубликованные уроки по порядку модулей и уроков
function publishedLessonsAll() {
  return db.modules.all().reduce((acc, m) =>
    acc.concat(db.lessons.byModule(m.id).filter(l => l.status === 'Опубликован')), []);
}
function lessonAvailable(l) {
  const m = db.modules.byId(l.moduleId);
  return !!m && (m.status === 'active' || m.status === 'done');
}
function availableSequence() { return publishedLessonsAll().filter(lessonAvailable); }
function completedMap(user) { return user.completedLessons || {}; }
function computeProgress(user) {
  const all = publishedLessonsAll();
  if (!all.length) return 0;
  const cl = completedMap(user);
  return Math.round(100 * all.filter(l => cl[l.id]).length / all.length);
}
function lessonsDoneCount(user) {
  const cl = completedMap(user);
  return publishedLessonsAll().filter(l => cl[l.id]).length;
}
function currentLessonFor(user) {
  const seq = availableSequence();
  const cl = completedMap(user);
  return seq.find(l => !cl[l.id]) || seq[seq.length - 1] || db.lessons.all().find(l => l.body) || db.lessons.all()[0] || null;
}
function nextLessonIdAfter(id) {
  const seq = availableSequence();
  const i = seq.findIndex(l => l.id === id);
  return (i > -1 && i < seq.length - 1) ? seq[i + 1].id : null;
}
// синхронизировать прогресс/счётчики в профиле студента
function syncProgress(user) {
  user.progressPct = computeProgress(user);
  if (!user.stats) user.stats = {};
  user.stats.lessonsDone = lessonsDoneCount(user);
  user.stats.lessonsTotal = publishedLessonsAll().length;
  // домашки и средний балл — по реальным сданным/оценённым работам
  const subs = db.submissions.byStudent(user.id);
  user.stats.homeworksDone = subs.filter(s => s.review && s.review.verdict === 'accepted').length;
  const graded = subs.filter(s => s.review && typeof s.review.total === 'number');
  if (graded.length) {
    const avg = graded.reduce((a, s) => a + s.review.total, 0) / graded.length;
    user.stats.avgGrade = (Math.round(avg * 10) / 10).toString().replace('.', ',');
  } else {
    user.stats.avgGrade = '—';
  }
}
// текущий модуль ученика (для панели наставника)
function currentModuleLabel(user) {
  const cur = currentLessonFor(user);
  const m = cur ? db.modules.byId(cur.moduleId) : (db.modules.all().find(x => x.status === 'active') || db.modules.all()[0]);
  return m ? ('Модуль ' + m.order + ' · ' + m.title) : '—';
}
// принять домашку → завершить модуль и открыть следующий
function advanceModule(moduleId) {
  const m = db.modules.byId(moduleId);
  if (!m) return;
  if (m.status !== 'done') db.modulesMut.update(m.id, { status: 'done' });
  const next = db.modules.all().find(x => x.order === m.order + 1);
  if (next && next.status === 'locked') db.modulesMut.update(next.id, { status: 'active', published: true });
}

/* ===================== ОБЩЕЕ ===================== */

/* GET /api/bootstrap — всё, что нужно фронту при старте */
router.get('/bootstrap', requireAuth, (req, res) => {
  const u = req.user;
  const mentor = db.users.all().find(x => x.role === 'mentor') || null;
  res.json({
    user: publicUser(u),
    mentor: mentor ? { id: mentor.id, name: mentor.name, init: mentor.init, title: mentor.title, bio: mentor.bio, stats: mentor.stats } : null,
    meta: db.raw.meta
  });
});

/* ===================== КУРС / УРОКИ ===================== */

/* GET /api/course — дорожная карта */
router.get('/course', requireAuth, (req, res) => {
  db.modulesMut.cleanupOrphans(); db.modulesMut.ensureEntry();
  const cl = completedMap(req.user);
  const modules = db.modules.all().map(m => ({
    id: m.id, num: String(m.order).padStart(2, '0'), title: m.title, meta: m.meta,
    status: m.status, desc: m.desc, published: m.published,
    available: m.status === 'active' || m.status === 'done',
    lessons: db.lessons.byModule(m.id).filter(x => x.status === 'Опубликован').map(x => ({
      id: x.id, title: x.title, kind: x.kind, dur: x.dur, status: x.status, completed: !!cl[x.id]
    }))
  }));
  const done = modules.filter(m => m.status === 'done').length;
  res.json({ modules, done, total: modules.length, currentLessonId: (currentLessonFor(req.user) || {}).id || null });
});

/* GET /api/lesson/:id */
router.get('/lesson/:id', requireAuth, (req, res) => {
  db.modulesMut.cleanupOrphans(); db.modulesMut.ensureEntry();
  let l = req.params.id === 'current' ? currentLessonFor(req.user) : db.lessons.byId(req.params.id);
  if (!l) return res.status(404).json({ error: 'Урок не найден' });
  const mentor = db.users.byId(req.user.mentorId || db.raw.meta.mentorId) || db.users.mentor();
  const cl = completedMap(req.user);
  const userChecklist = req.user.checklist || {};
  const m = db.modules.byId(l.moduleId);
  const hw = db.homeworks.byModule(l.moduleId);
  res.json({
    lesson: l,
    completed: !!cl[l.id],
    module: m ? { id: m.id, num: String(m.order).padStart(2, '0'), title: m.title } : null,
    moduleLessons: db.lessons.byModule(l.moduleId).filter(x => x.status === 'Опубликован').map(x => ({
      id: x.id, title: x.title, kind: x.kind, dur: x.dur, status: x.status, completed: !!cl[x.id]
    })),
    nextLessonId: nextLessonIdAfter(l.id),
    homeworkId: hw ? hw.id : null,
    mentor: mentor ? { name: mentor.name, init: mentor.init } : null,
    materials: db.materials.byLesson(l.id),
    checklist: db.checklist.byLesson(l.id).map(c => ({ id: c.id, t: c.t, done: !!userChecklist[c.id] })),
    progressPct: computeProgress(req.user)
  });
});

/* POST /api/lesson/:id/complete  { done } — отметить урок пройденным */
router.post('/lesson/:id/complete', requireAuth, (req, res) => {
  const l = db.lessons.byId(req.params.id);
  if (!l) return res.status(404).json({ error: 'Урок не найден' });
  if (!req.user.completedLessons) req.user.completedLessons = {};
  const markDone = !(req.body && req.body.done === false);
  if (markDone) req.user.completedLessons[l.id] = true;
  else delete req.user.completedLessons[l.id];
  syncProgress(req.user);
  db.saveSoon();
  res.json({ ok: true, completed: markDone, progressPct: req.user.progressPct,
    nextLessonId: nextLessonIdAfter(l.id), lessonsDone: req.user.stats.lessonsDone });
});

/* POST /api/lesson/:lessonId/checklist  { itemId, done } */
router.post('/lesson/:lessonId/checklist', requireAuth, (req, res) => {
  const { itemId, done } = req.body || {};
  const item = db.checklist.byLesson(req.params.lessonId).find(c => c.id === itemId);
  if (!item) return res.status(404).json({ error: 'Пункт не найден' });
  if (!req.user.checklist) req.user.checklist = {};
  req.user.checklist[itemId] = !!done;
  db.saveSoon();
  res.json({ ok: true, checklist: req.user.checklist });
});

/* ===================== DASHBOARD ===================== */
router.get('/dashboard', requireAuth, (req, res) => {
  const u = req.user;
  db.modulesMut.cleanupOrphans(); db.modulesMut.ensureEntry();
  syncProgress(u); db.saveSoon();
  const mentor = db.users.byId(u.mentorId || db.raw.meta.mentorId) || db.users.mentor();
  const seq = availableSequence();
  const cl = completedMap(u);
  const allLessonsDone = seq.length > 0 && seq.every(l => cl[l.id]);
  const noLessonsYet = seq.length === 0;
  const cur = (allLessonsDone || noLessonsYet) ? null : currentLessonFor(u);
  const allModules = db.modules.all();
  const curModule = cur ? db.modules.byId(cur.moduleId) : (allModules.find(m => m.status === 'active') || allModules[0]);
  const nextLesson = cur ? { id: cur.id, moduleNum: curModule ? curModule.order : '', title: cur.title,
    meta: cur.dur + (cur.kind === 'Задание' ? ' · задание' : ' · урок') } : null;
  const doneModules = allModules.filter(m => m.status === 'done').length;

  // обратная связь = последние ревью-комменты + последние сообщения наставника
  const sub = db.submissions.byStudent(u.id).find(s => s.review);
  const feedback = [];
  if (sub && sub.review) {
    feedback.push({ who: mentor ? mentor.name : 'Наставник', init: mentor ? mentor.init : 'Н', dot: '#E8835A',
      time: sub.submittedLabel || 'недавно', text: sub.review.verdictText });
  }
  const lastMsgs = db.messages.thread(u.id).filter(m => m.from === 'mentor').slice(-1);
  lastMsgs.forEach(m => feedback.push({ who: mentor ? mentor.name : 'Наставник', init: mentor ? mentor.init : 'Н',
    dot: '#8FA98C', time: 'в чате', text: m.text }));

  res.json({
    user: publicUser(u),
    stats: u.stats || {},
    progressPct: u.progressPct || 0,
    nextLesson: nextLesson,
    allLessonsDone: allLessonsDone,
    noLessonsYet: noLessonsYet,
    moduleNum: curModule ? curModule.order : 0,
    moduleTotal: allModules.length,
    doneModules: doneModules,
    today: ruDate(),
    call: { when: 'по договорённости', desc: 'Разбор домашних работ с наставником', mentor: mentor ? { name: mentor.name, init: mentor.init } : null },
    feedback,
    portfolioCount: db.portfolio.byOwner(u.id).length
  });
});

/* ===================== HOMEWORK ===================== */
router.get('/homework/:id', requireAuth, (req, res) => {
  db.modulesMut.cleanupOrphans(); db.modulesMut.ensureEntry();
  let hw;
  if (req.params.id === 'current') {
    const active = db.modules.all().find(m => m.status === 'active') || db.modules.all().find(m => m.status === 'done');
    hw = active ? db.homeworks.byModule(active.id) : null;   // только домашка активного модуля
  } else hw = db.homeworks.byId(req.params.id);
  if (!hw) return res.json({ homework: null });
  const mentor = db.users.byId(hw.mentorId) || db.users.byId(req.user.mentorId) || db.users.mentor();
  const sub = db.submissions.forHomeworkStudent(hw.id, req.user.id);
  res.json({
    homework: hw,
    mentor: mentor ? { name: mentor.name, init: mentor.init } : null,
    submission: sub ? { id: sub.id, file: sub.file, status: sub.status, submittedLabel: sub.submittedLabel } : null,
    accepted: !!(sub && sub.review && sub.review.verdict === 'accepted')
  });
});

/* POST /api/homework/:id/submit  (файл) */
router.post('/homework/:id/submit', requireAuth, upload.single('file'), (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Домашку отправляет ученик из своего кабинета' });
  const hw = db.homeworks.byId(req.params.id);
  if (!hw) return res.status(404).json({ error: 'ДЗ не найдено' });
  if (!req.file) return res.status(400).json({ error: 'Файл не приложен' });

  const existing = db.submissions.forHomeworkStudent(hw.id, req.user.id);
  const sub = existing || { id: db.uid('sub'), homeworkId: hw.id, studentId: req.user.id };
  sub.file = { name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), size: humanSize(req.file.size), url: '/uploads/' + req.file.filename };
  sub.status = 'submitted';
  sub.kind = existing && existing.review ? 'Повторно' : 'Новая';
  sub.submittedAt = Date.now();
  sub.submittedLabel = 'только что';
  db.submissions.upsert(sub);
  res.json({ ok: true, submission: { id: sub.id, file: sub.file, status: sub.status, submittedLabel: sub.submittedLabel } });
});

/* ===================== REVIEW (взгляд студента) ===================== */
router.get('/review', requireAuth, (req, res) => {
  // последняя работа студента — проверенная ИЛИ ещё на проверке
  const sub = db.submissions.byStudent(req.user.id).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))[0];
  if (!sub) return res.json({ review: null, pending: false, hasSubmission: false });
  const hw = db.homeworks.byId(sub.homeworkId);
  const mentor = (sub.review && db.users.byId(sub.review.mentorId)) || db.users.mentor();
  res.json({
    review: sub.review || null,
    pending: sub.status === 'submitted',                 // сдано, ждёт проверки
    hasSubmission: true,
    verdict: sub.review ? sub.review.verdict : null,
    homework: hw ? { title: hw.title } : null,
    file: sub.file || null,
    submittedLabel: sub.submittedLabel,
    studentName: req.user.name,
    fileSize: sub.file && sub.file.size ? sub.file.size : '',
    mentor: mentor ? { name: mentor.name, init: mentor.init } : null
  });
});

/* ===================== PORTFOLIO ===================== */
router.get('/portfolio', requireAuth, (req, res) => {
  res.json({ items: db.portfolio.byOwner(req.user.id) });
});
router.post('/portfolio', requireAuth, (req, res) => {
  const { title, tag, meta } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Нужно название' });
  const item = db.portfolio.add({ id: db.uid('pf'), ownerId: req.user.id,
    title: String(title).trim(), tag: tag || 'Личный проект', meta: meta || 'Кейс',
    span: 6, h: '280px' });
  res.json({ item });
});

/* ===================== СКАЧИВАНИЕ МАТЕРИАЛА ===================== */
router.get('/material/:id/download', requireAuth, (req, res) => {
  const m = db.materials.byId(req.params.id);
  if (!m) return res.status(404).json({ error: 'Материал не найден' });
  var ext = m.type === 'PDF' ? 'pdf' : m.type === 'URL' ? 'txt' : 'fig';
  var content = '# ' + m.name + '\n\nУчебный материал курса UI/UX Design — поток 7.\nТип: ' + m.type + '\n' + (m.meta || '') + '\n\n(демо-файл платформы)';
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(m.name) + '.' + ext + '"');
  res.send(content);
});

/* ===================== ВЛОЖЕНИЕ В ЧАТ ===================== */
router.post('/chat/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не приложен' });
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  res.json({ file: { name: name, meta: fileTypeBadge(name).type + ' · ' + humanSize(req.file.size), url: '/uploads/' + req.file.filename } });
});

/* ===================== PROFILE ===================== */
router.patch('/profile', requireAuth, (req, res) => {
  const { name, city, bio } = req.body || {};
  const patch = {};
  if (typeof name === 'string' && name.trim()) { patch.name = name.trim(); patch.init = initials(name); }
  if (typeof city === 'string') patch.city = city.trim();
  if (typeof bio === 'string') patch.bio = bio.trim();
  const u = db.users.update(req.user.id, patch);
  res.json({ user: publicUser(u) });
});

router.get('/profile', requireAuth, (req, res) => {
  const u = req.user;
  if (u.role === 'student') { syncProgress(u); db.saveSoon(); }
  const activity = ((u.stats && u.stats.lessonsDone) || 0) + ((u.stats && u.stats.homeworksDone) || 0);
  res.json({
    user: publicUser(u),
    stats: u.stats || {},
    skills: u.skills || [],
    // тепловая карта активности — по реальному числу пройденного (у новичка пустая)
    heatmap: buildHeatmap(u.id, activity)
  });
});

function buildHeatmap(seedStr, activity) {
  activity = activity || 0;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) % 233280;
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  const cells = new Array(60).fill('rgba(255,255,255,0.05)');
  // засветить ~2 ячейки на каждое пройденное действие, ближе к концу (недавняя активность)
  let lit = Math.min(60, activity * 2);
  let i = 60;
  while (lit > 0 && i > 0) {
    i--;
    if (rnd() < 0.6) {
      const lv = rnd();
      cells[i] = lv < 0.45 ? 'rgba(232,131,90,0.3)' : lv < 0.8 ? 'rgba(232,131,90,0.6)' : '#E8835A';
      lit--;
    }
  }
  return cells;
}

/* ===================== НАСТАВНИК: ОБЗОР ===================== */
router.get('/admin/overview', requireAuth, requireMentor, (req, res) => {
  const students = db.users.all().filter(u => u.role === 'student');
  const rows = students.map(s => {
    syncProgress(s);
    const sub = db.submissions.byStudent(s.id).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))[0];
    let status = 'В процессе', sc = 'rgba(244,242,238,0.6)', sb = 'rgba(255,255,255,0.05)';
    if (sub) {
      if (sub.status === 'submitted') { status = 'На проверке'; sc = '#E8835A'; sb = 'rgba(232,131,90,0.12)'; }
      else if (sub.review && sub.review.verdict === 'accepted') { status = 'Принято'; sc = '#8FA98C'; sb = 'rgba(143,169,140,0.12)'; }
      else if (sub.review && sub.review.verdict === 'rework') { status = 'Требует доработки'; sc = '#C98B6B'; sb = 'rgba(201,139,107,0.12)'; }
    }
    return {
      id: s.id, name: s.name, init: s.init || initials(s.name),
      module: currentModuleLabel(s),
      prog: (s.progressPct || 0) + '%', status, sc, sb,
      active: s.active || 'недавно',
      dot: '#8FA98C'
    };
  });
  db.saveSoon();
  const pending = db.submissions.all().filter(s => s.status === 'submitted').length;
  res.json({
    total: students.length,
    activeNow: students.filter(s => s.online !== false).length,
    pending,
    students: rows
  });
});

/* ===================== НАСТАВНИК: ОЧЕРЕДЬ ===================== */
router.get('/admin/queue', requireAuth, requireMentor, (req, res) => {
  const items = db.submissions.all().map(s => {
    const st = db.users.byId(s.studentId);
    const hw = db.homeworks.byId(s.homeworkId);
    const isNew = s.status === 'submitted';         // ждёт проверки
    let kind, sc, sb;
    if (isNew) {
      kind = s.review ? 'Повторно' : 'Новая';
      sc = s.review ? '#C98B6B' : '#E8835A';
      sb = s.review ? 'rgba(201,139,107,0.12)' : 'rgba(232,131,90,0.12)';
    } else if (s.review && s.review.verdict === 'accepted') {
      kind = 'Принято'; sc = '#8FA98C'; sb = 'rgba(143,169,140,0.12)';
    } else {
      kind = 'Возвращено'; sc = '#C98B6B'; sb = 'rgba(201,139,107,0.12)';
    }
    return {
      id: s.id, real: true, student: st ? st.name : 'Студент', init: st ? (st.init || initials(st.name)) : 'С',
      task: (hw ? hw.title : 'Работа'), waiting: s.submittedLabel || 'недавно',
      kind, sc, sb, status: s.status, isNew, hasReview: !!s.review,
      submittedAt: s.submittedAt || 0
    };
  });
  // сначала ждущие проверки, потом остальные — по свежести
  items.sort((a, b) => (b.isNew - a.isNew) || (b.submittedAt - a.submittedAt));
  res.json({ items: items });
});

/* GET /api/admin/submission/:id — карточка проверки */
router.get('/admin/submission/:id', requireAuth, requireMentor, (req, res) => {
  const s = db.submissions.byId(req.params.id);
  if (!s) return res.status(404).json({ error: 'Работа не найдена' });
  const st = db.users.byId(s.studentId);
  const hw = db.homeworks.byId(s.homeworkId);
  res.json({
    submission: { id: s.id, file: s.file, status: s.status, submittedLabel: s.submittedLabel,
      student: st ? { name: st.name, init: st.init || initials(st.name) } : null },
    homework: hw ? { title: hw.title, criteria: hw.criteria } : null,
    review: s.review || null
  });
});

/* POST /api/admin/submission/:id/review — выставить оценку */
router.post('/admin/submission/:id/review', requireAuth, requireMentor, (req, res) => {
  const s = db.submissions.byId(req.params.id);
  if (!s) return res.status(404).json({ error: 'Работа не найдена' });
  const { scores, verdict, verdictText, comments } = req.body || {};
  const hw = db.homeworks.byId(s.homeworkId);

  // итоговый балл = взвешенная сумма (0..10)
  let total = 0;
  if (Array.isArray(scores) && hw) {
    let wsum = 0;
    scores.forEach(sc => {
      const cr = hw.criteria.find(c => c.id === sc.criterionId);
      if (cr) { total += (sc.v / 100) * cr.w; wsum += cr.w; }
    });
    total = wsum ? Math.round((total / wsum) * 10 * 10) / 10 : 0;
  }
  s.review = {
    mentorId: req.user.id,
    verdict: verdict === 'accepted' ? 'accepted' : 'rework',
    total,
    verdictText: verdictText || '',
    scores: scores || [],
    comments: comments || (s.review ? s.review.comments : [])
  };
  s.status = 'reviewed';
  db.submissions.upsert(s);

  // принятая работа завершает модуль и открывает следующий
  let advanced = false;
  if (s.review.verdict === 'accepted' && hw) {
    advanceModule(hw.moduleId);
    advanced = true;
    const student = db.users.byId(s.studentId);
    if (student) { syncProgress(student); db.saveSoon(); }
  }
  res.json({ ok: true, review: s.review, advanced });
});

/* ===================== BUILDER (конструктор курса) ===================== */
router.get('/admin/builder', requireAuth, requireMentor, (req, res) => {
  db.modulesMut.cleanupOrphans(); db.modulesMut.ensureEntry();
  const modules = db.modules.all().map(m => {
    const hw = db.homeworks.byModule(m.id);
    return {
      id: m.id, num: String(m.order).padStart(2, '0'), title: m.title,
      meta: m.meta, published: m.published, status: m.status,
      lessons: db.lessons.byModule(m.id).map(l => ({ id: l.id, title: l.title, kind: l.kind, dur: l.dur, status: l.status })),
      homework: hw ? { id: hw.id, title: hw.title, deadline: hw.deadline, format: hw.format, intro: hw.intro } : null
    };
  });
  res.json({ modules });
});

/* POST /api/admin/module — новый модуль */
router.post('/admin/module', requireAuth, requireMentor, (req, res) => {
  const title = (req.body && req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Нужно название модуля' });
  const order = db.modules.all().length + 1;
  const m = db.modulesMut.add({ id: db.uid('m'), order, title, meta: '0 уроков · 0 ч', status: 'locked', desc: '', published: false });
  res.json({ module: { id: m.id, num: String(m.order).padStart(2, '0'), title: m.title } });
});

/* POST /api/admin/homework — создать ДЗ для модуля */
router.post('/admin/homework', requireAuth, requireMentor, (req, res) => {
  const { moduleId, title, deadline, format, intro } = req.body || {};
  if (!moduleId || !title) return res.status(400).json({ error: 'Нужны модуль и название' });
  if (!db.modules.byId(moduleId)) return res.status(404).json({ error: 'Модуль не найден' });
  if (db.homeworks.byModule(moduleId)) return res.status(409).json({ error: 'У этого модуля уже есть домашнее задание' });
  const editingLesson = db.lessons.byModule(moduleId)[0];
  const hw = db.homeworks.add({
    id: db.uid('hw'), moduleId, lessonId: editingLesson ? editingLesson.id : null,
    title: String(title).trim(), mentorId: req.user.id,
    deadline: (deadline || '').trim() || 'без срока',
    format: (format || '').trim() || 'Figma-файл или PDF · до 25 МБ',
    difficulty: 2,
    intro: (intro || '').trim() || 'Описание задания появится позже.',
    tasks: [],
    criteria: [
      { id: db.uid('cr'), t: 'Качество решения', d: 'Соответствие задаче и подходу из урока', w: 40 },
      { id: db.uid('cr'), t: 'Аккуратность подачи', d: 'Чистый файл, понятная структура', w: 30 },
      { id: db.uid('cr'), t: 'Глубина проработки', d: 'Детали, состояния, граничные случаи', w: 30 }
    ]
  });
  res.json({ homework: { id: hw.id, title: hw.title, deadline: hw.deadline, format: hw.format, intro: hw.intro } });
});

/* PATCH /api/admin/homework/:id — изменить ДЗ */
router.patch('/admin/homework/:id', requireAuth, requireMentor, (req, res) => {
  const hw = db.homeworks.byId(req.params.id);
  if (!hw) return res.status(404).json({ error: 'ДЗ не найдено' });
  const { title, deadline, format, intro } = req.body || {};
  const patch = {};
  if (typeof title === 'string' && title.trim()) patch.title = title.trim();
  if (typeof deadline === 'string') patch.deadline = deadline.trim();
  if (typeof format === 'string') patch.format = format.trim();
  if (typeof intro === 'string') patch.intro = intro.trim();
  db.homeworks.update(hw.id, patch);
  res.json({ homework: { id: hw.id, title: hw.title, deadline: hw.deadline, format: hw.format, intro: hw.intro } });
});

/* DELETE /api/admin/module/:id — удалить модуль и его уроки */
router.delete('/admin/module/:id', requireAuth, requireMentor, (req, res) => {
  const m = db.modules.byId(req.params.id);
  if (!m) return res.status(404).json({ error: 'Модуль не найден' });
  db.modulesMut.remove(req.params.id);
  res.json({ ok: true });
});

/* POST /api/admin/lesson — новый урок/задание в модуль */
router.post('/admin/lesson', requireAuth, requireMentor, (req, res) => {
  const { moduleId, title, kind } = req.body || {};
  if (!moduleId || !title) return res.status(400).json({ error: 'Нужны модуль и название' });
  const order = db.lessons.byModule(moduleId).length + 1;
  const l = db.lessons.add({ id: db.uid('l'), moduleId, order, title: String(title).trim(),
    kind: kind === 'Задание' ? 'Задание' : 'Видео', dur: kind === 'Задание' ? 'ДЗ' : '— мин', status: 'Черновик' });
  res.json({ lesson: { id: l.id, title: l.title, kind: l.kind, dur: l.dur, status: l.status } });
});

/* PATCH /api/admin/lesson/:id — сохранить урок */
router.patch('/admin/lesson/:id', requireAuth, requireMentor, (req, res) => {
  const { title, status } = req.body || {};
  const patch = {};
  if (typeof title === 'string' && title.trim()) patch.title = title.trim();
  if (status === 'Опубликован' || status === 'Черновик') patch.status = status;
  const l = db.lessons.update(req.params.id, patch);
  if (!l) return res.status(404).json({ error: 'Урок не найден' });
  res.json({ lesson: { id: l.id, title: l.title, kind: l.kind, dur: l.dur, status: l.status } });
});

/* DELETE /api/admin/lesson/:id — удалить урок */
router.delete('/admin/lesson/:id', requireAuth, requireMentor, (req, res) => {
  const l = db.lessons.byId(req.params.id);
  if (!l) return res.status(404).json({ error: 'Урок не найден' });
  db.lessons.remove(req.params.id);
  res.json({ ok: true });
});

/* POST /api/admin/publish — опубликовать все уроки модуля */
router.post('/admin/publish', requireAuth, requireMentor, (req, res) => {
  const moduleId = req.body && req.body.moduleId;
  let count = 0;
  if (moduleId) {
    db.lessons.byModule(moduleId).forEach(l => {
      if (l.status !== 'Опубликован') { db.lessons.update(l.id, { status: 'Опубликован' }); count++; }
    });
    db.modulesMut.update(moduleId, { published: true });
  } else {
    // без модуля — опубликовать все черновики во всех модулях
    db.lessons.all().forEach(l => {
      if (l.status !== 'Опубликован') { db.lessons.update(l.id, { status: 'Опубликован' }); count++; }
    });
  }
  res.json({ ok: true, published: count });
});

module.exports = router;
