const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

for (const operation of ['mkdirSync', 'readdirSync']) {
  test(`unavailable ${operation} does not crash startup or invoke the upload parser`, () => {
    let parserCalls = 0;
    const storageError = Object.assign(new Error('Storage unavailable'), { code: 'EROFS' });
    const storage = {
      ...fs,
      mkdirSync() { if (operation === 'mkdirSync') throw storageError; },
      readdirSync() { throw storageError; },
    };
    const multer = () => { parserCalls++; throw new Error('Parser must not run'); };
    multer.diskStorage = () => ({});
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server/uploads.js'), 'utf8'), {
      module, __dirname: path.join(__dirname, '../server'), process: { env: {} }, console,
      require(name) {
        if (name === 'fs') return storage;
        if (name === 'multer') return multer;
        if (name === './db') return {};
        return require(name);
      },
    });
    let result;
    module.exports.uploadSingle({ user: { id: 'student' } }, {}, error => { result = error; });
    assert.equal(result.status, 503);
    assert.equal(parserCalls, 0);
  });
}

test('a disk write failure returns 503 and releases the upload reservation', () => {
  let parserCalls = 0;
  const multer = options => ({ single: () => (_req, _res, done) => {
    parserCalls++;
    assert.ok(options.limits.fileSize <= 25 * 1024 * 1024);
    done(Object.assign(new Error('Write denied'), { code: 'EACCES' }));
  } });
  multer.diskStorage = () => ({});
  multer.MulterError = class extends Error {};
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../server/uploads.js'), 'utf8'), {
    module, __dirname: path.join(__dirname, '../server'),
    process: { env: { UPLOAD_USER_QUOTA_MB: '1', UPLOAD_TOTAL_QUOTA_MB: '1' } }, console,
    require(name) {
      if (name === 'fs') return { ...fs, mkdirSync() {}, readdirSync: () => [] };
      if (name === 'multer') return multer;
      if (name === './db') return {};
      return require(name);
    },
  });
  for (let i = 0; i < 2; i++) {
    let result;
    module.exports.uploadSingle({ user: { id: 'student' } }, {}, error => { result = error; });
    assert.equal(result.status, 503);
  }
  assert.equal(parserCalls, 2);
});
