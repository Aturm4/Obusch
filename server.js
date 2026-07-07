/* ===== UI/UX Design — закрытый клуб. Сервер ===== */
const express = require('express');
const session = require('express-session');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const db = require('./server/db');
const { router: authRouter, requireAuth } = require('./server/auth');
const apiRouter = require('./server/routes');
const { initials } = require('./server/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';

// за обратным прокси (Render/Railway/…) — чтобы secure-cookie работали по HTTPS
app.set('trust proxy', 1);

if (PROD && !process.env.SESSION_SECRET) {
  console.warn('⚠ SESSION_SECRET не задан — задайте переменную окружения для безопасности сессий.');
}

/* ---------- Сессии (общие для HTTP и Socket.IO) ---------- */
const sessionMiddleware = session({
  name: 'club.sid',
  secret: process.env.SESSION_SECRET || 'ui-ux-club-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 1000 * 60 * 60 * 24 * 30 }
});
app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------- API ---------- */
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

/* ---------- Статика (без кэширования, чтобы браузер всегда брал свежие HTML/CSS/JS) ---------- */
const UPLOAD_DIR = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); }
}));

// гейт: на "/" пускаем всегда (фронт сам решит — логин или приложение)
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ---------- Socket.IO: real-time чат ---------- */
io.engine.use(sessionMiddleware);

function socketUser(socket) {
  const req = socket.request;
  const uid = req.session && req.session.userId;
  return uid ? db.users.byId(uid) : null;
}

io.on('connection', (socket) => {
  const user = socketUser(socket);
  if (!user) { socket.disconnect(true); return; }

  // комната треда: студент<->наставник. Ключ — id студента.
  if (user.role === 'student') {
    socket.join('thread:' + user.id);
  }

  function partnerInfo(p, viewerRole) {
    if (!p) return null;
    if (viewerRole === 'student') {
      return { id: p.id, name: p.name, init: p.init || initials(p.name), role: 'mentor',
        subtitle: p.title || 'Наставник', bio: p.bio || '',
        stats: p.stats || { students: '—', reply: '—', years: '—' } };
    }
    return { id: p.id, name: p.name, init: p.init || initials(p.name), role: 'student',
      subtitle: 'Ученик · ' + (p.progressPct || 0) + '% курса', bio: p.bio || '',
      stats: { lessonsDone: (p.stats && p.stats.lessonsDone) || 0, homeworksDone: (p.stats && p.stats.homeworksDone) || 0, avgGrade: (p.stats && p.stats.avgGrade) || '—' } };
  }

  socket.on('chat:open', (payload) => {
    let studentId, partner;
    if (user.role === 'student') {
      studentId = user.id;
      partner = db.users.mentor();
    } else {
      const students = db.users.students();
      studentId = (payload && payload.studentId) || (students[0] && students[0].id) || null;
      partner = studentId ? db.users.byId(studentId) : null;
    }
    if (studentId) socket.join('thread:' + studentId);
    socket.emit('chat:history', {
      studentId: studentId,
      messages: studentId ? db.messages.thread(studentId) : [],
      partner: partnerInfo(partner, user.role)
    });
  });

  socket.on('chat:send', (payload) => {
    payload = payload || {};
    const text = (payload.text || '').toString().trim();
    const file = payload.file && payload.file.name ? {
      name: String(payload.file.name).slice(0, 200),
      meta: String(payload.file.meta || '').slice(0, 80),
      url: typeof payload.file.url === 'string' ? payload.file.url : null
    } : null;
    if (!text && !file) return;
    const studentId = user.role === 'student' ? user.id : (payload.studentId);
    if (!studentId) return;
    const msg = {
      id: db.uid('msg'),
      studentId,
      from: user.role === 'student' ? 'student' : 'mentor',
      senderId: user.id,
      senderName: user.name,
      text: text.slice(0, 2000),
      ts: Date.now()
    };
    if (file) msg.file = file;
    db.messages.add(msg);
    io.to('thread:' + studentId).emit('chat:message', msg);
  });

  socket.on('disconnect', () => {});
});

server.listen(PORT, () => {
  const mentorExists = db.users.mentor();
  console.log('');
  console.log('  ▸ UI/UX Design — закрытый клуб');
  console.log('  ▸ Сервер запущен:  http://localhost:' + PORT);
  console.log('');
  if (mentorExists) {
    console.log('  Наставник потока: ' + mentorExists.name + '. Входите на сайте.');
  } else {
    console.log('  Аккаунтов ещё нет. На сайте нажмите «Зарегистрироваться».');
    console.log('  Сначала — НАСТАВНИК (роль «Наставник»), потом ученик (роль «Студент»).');
  }
  console.log('');
});
