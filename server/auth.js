/* ===== Авторизация: регистрация, вход, выход, сессии, роли ===== */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { timingSafeEqual } = require('crypto');

const router = express.Router();

function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0] || '')[0] || '' ).toUpperCase() + ((parts[1] || '')[0] || '').toUpperCase();
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, role: u.role, name: u.name, init: u.init || initials(u.name),
    email: u.email, title: u.title, city: u.city, joined: u.joined,
    progressPct: u.progressPct, currentModuleId: u.currentModuleId,
    stats: u.stats, skills: u.skills, streak: u.streak, bio: u.bio
  };
}

/* Middleware: требуется вход */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const u = db.users.byId(req.session.userId);
  if (!u) { req.session.destroy(() => {}); return res.status(401).json({ error: 'Сессия недействительна' }); }
  req.user = u;
  next();
}

/* Middleware: только наставник */
function requireMentor(req, res, next) {
  if (req.user.role !== 'mentor') return res.status(403).json({ error: 'Доступ только для наставника' });
  next();
}

/* POST /api/auth/register */
router.post('/register', (req, res) => {
  const { name, email, password, role, mentorInvite } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Заполните имя, e-mail и пароль' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  if (db.users.byEmail(email)) return res.status(409).json({ error: 'Пользователь с таким e-mail уже есть' });

  const r = role === 'mentor' ? 'mentor' : 'student';
  if (r === 'mentor') {
    const expected = Buffer.from(process.env.MENTOR_INVITE_TOKEN || '');
    const supplied = Buffer.from(typeof mentorInvite === 'string' ? mentorInvite : '');
    if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return res.status(403).json({ error: 'Для роли наставника нужен действующий код приглашения' });
    }
  }
  const meta = db.meta.get();
  const mentor = db.users.mentor();
  const user = {
    id: db.uid('u'), role: r, name: String(name).trim(),
    init: initials(name), email: String(email).toLowerCase().trim(),
    passHash: bcrypt.hashSync(String(password), 10),
    mentorId: r === 'student' ? (meta.mentorId || (mentor && mentor.id) || null) : undefined,
    currentModuleId: r === 'student' ? 'm3' : undefined,
    progressPct: 0, joined: 'в клубе с ' + monthYear(), city: '',
    checklist: {}, completedLessons: {},
    skills: r === 'student' ? [
      { name: 'Типографика', label: 'старт', pct: 10, color: '#8FA98C' },
      { name: 'Цвет и контраст', label: 'старт', pct: 5, color: '#E8835A' },
      { name: 'Прототипирование', label: 'впереди', pct: 0, color: 'rgba(244,242,238,0.3)' }
    ] : undefined,
    title: r === 'mentor' ? 'Наставник' : undefined,
    bio: r === 'mentor' ? '' : undefined,
    stats: r === 'student'
      ? { lessonsDone: 0, lessonsTotal: 58, homeworksDone: 0, avgGrade: '—', streak: 0, hours: '0 ч' }
      : { students: 0, reply: '—', years: '—' },
    streak: 0
  };
  db.users.create(user);

  // Первый зарегистрированный наставник становится наставником потока
  if (r === 'mentor' && !meta.mentorId) {
    db.meta.setMentorId(user.id);
    // привязать «осиротевших» студентов (зарегистрировались до наставника)
    db.users.students().forEach(s => { if (!s.mentorId) db.users.update(s.id, { mentorId: user.id }); });
  }

  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

function monthYear() {
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const d = new Date();
  return months[d.getMonth()] + ' ' + d.getFullYear();
}

/* POST /api/auth/login */
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.users.byEmail(email);
  if (!u || !bcrypt.compareSync(String(password || ''), u.passHash)) {
    return res.status(401).json({ error: 'Неверный e-mail или пароль' });
  }
  req.session.userId = u.id;
  res.json({ user: publicUser(u) });
});

/* POST /api/auth/logout */
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* GET /api/auth/me */
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.json({ user: null });
  const u = db.users.byId(req.session.userId);
  res.json({ user: publicUser(u) });
});

module.exports = { router, requireAuth, requireMentor, publicUser, initials };
