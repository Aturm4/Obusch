const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const db = require('./db');

const directory = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : path.join(__dirname, '..', 'uploads');
fs.mkdirSync(directory, { recursive: true });
const mib = 1024 * 1024;
function quota(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Некорректная квота загрузок: ' + name);
  return value * mib;
}
const userQuota = quota('UPLOAD_USER_QUOTA_MB', 100);
const totalQuota = quota('UPLOAD_TOTAL_QUOTA_MB', 512);
const inFlight = new Map();
function failure(message, status) { return Object.assign(new Error(message), { status }); }

// Account for every retained file, including legacy and unlinked chat uploads.
function usage(userId) {
  let total = 0, own = 0, count = 0, ownCount = 0;
  for (const name of fs.readdirSync(directory)) {
    const stat = fs.lstatSync(path.join(directory, name));
    if (!stat.isFile()) continue;
    total += stat.size; count++;
    if (name.startsWith(userId + '--')) { own += stat.size; ownCount++; }
  }
  for (const [id, reservation] of inFlight) {
    total += reservation.bytes; count++;
    if (id.startsWith(userId + '--')) { own += reservation.bytes; ownCount++; }
  }
  return { total, own, count, ownCount };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, directory),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^.a-z0-9]/gi, '').slice(0, 16);
    cb(null, req.uploadReservation + ext);
  }
});

function uploadSingle(req, res, next) {
  let reserved;
  try {
    const used = usage(req.user.id);
    reserved = Math.min(25 * mib, userQuota - used.own, totalQuota - used.total);
    if (reserved < 1 || used.count >= 2048 || used.ownCount >= 200) throw failure('Лимит хранилища вложений исчерпан', 413);
  } catch (error) { return next(error.status ? error : failure('Хранилище временно недоступно', 503)); }
  const id = req.user.id + '--' + randomUUID();
  req.uploadReservation = id;
  inFlight.set(id, { bytes: reserved });
  multer({ storage, limits: { fileSize: reserved, files: 1, fields: 10, parts: 11 } }).single('file')(req, res, error => {
    inFlight.delete(id);
    if (error) return next(failure(error.code === 'LIMIT_FILE_SIZE' ? 'Файл превышает доступный лимит' : 'Не удалось загрузить файл', error instanceof multer.MulterError ? 413 : 503));
    next();
  });
}

function references(url) {
  return db.raw.submissions.some(s => s.file && s.file.url === url) || db.raw.messages.some(m => m.file && m.file.url === url);
}
function removeUnreferenced(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/') || references(url)) return;
  const name = url.slice('/uploads/'.length);
  if (!name || name !== path.basename(name) || /[\\/]/.test(name)) return;
  try { fs.unlinkSync(path.join(directory, name)); } catch (error) { if (error.code !== 'ENOENT') console.error('Не удалось удалить заменённое вложение'); }
}
function canAccessUpload(user, url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return false;
  const name = url.slice('/uploads/'.length);
  if (!name || name !== path.basename(name) || /[\\/]/.test(name)) return false;
  return user.role === 'mentor' || name.startsWith(user.id + '--') ||
    db.submissions.byStudent(user.id).some(s => s.file && s.file.url === url) ||
    db.messages.thread(user.id).some(m => m.file && m.file.url === url);
}
function download(req, res, next) {
  const name = req.params.name;
  if (!canAccessUpload(req.user, '/uploads/' + name)) return res.sendStatus(404);
  res.download(path.join(directory, name), name, { dotfiles: 'deny', headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store'
  } }, error => { if (error) next(error); });
}

module.exports = { uploadSingle, download, removeUnreferenced, canAccessUpload };
