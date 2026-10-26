/* ===== UI/UX Design — закрытый клуб. Клиент (API-driven) ===== */
(function () {
  'use strict';

  var ACCENT = '#E8835A';
  var avatar = 'repeating-linear-gradient(135deg,#242424 0 6px,#1b1b1b 6px 12px)';

  var state = {
    user: null,
    socket: null,
    chatStudentId: null,
    queue: { subId: null, criteria: [], scores: [] }
  };

  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function noop() {}
  function safeReviewColor(v) { return typeof v === 'string' && /^(?:#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\))$/i.test(v) ? v : '#8FA98C'; }
  function safeReviewCoordinate(v) { return typeof v === 'string' && /^(?:\d+(?:\.\d+)?)(?:%|px)$/.test(v) ? v : '50%'; }
  function fileBadge(name) {
    var ext = (String(name || '').split('.').pop() || '').toLowerCase();
    if (ext === 'fig') return { t: 'FIG', c: '#E8835A' };
    if (ext === 'pdf') return { t: 'PDF', c: '#C98B6B' };
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].indexOf(ext) > -1) return { t: 'IMG', c: '#8FA98C' };
    return { t: (ext.toUpperCase().slice(0, 3) || 'FILE'), c: '#8FA98C' };
  }
  function plural(n, one, few, many) {
    n = Math.abs(n) % 100; var n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  /* ---------- API helper ---------- */
  function api(path, opts) {
    opts = opts || {};
    var cfg = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined) {
      if (opts.body instanceof FormData) { cfg.body = opts.body; }
      else { cfg.headers['Content-Type'] = 'application/json'; cfg.body = JSON.stringify(opts.body); }
    }
    return fetch('/api' + path, cfg).then(function (r) {
      if (r.status === 401) { showGate('login'); throw new Error('unauth'); }
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || ('Ошибка ' + r.status));
        return j;
      });
    });
  }

  /* ---------- Иконки ---------- */
  function icon(name) {
    var s = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
    var p = {
      grid: '<rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/>',
      list: '<path d="M3 4h10"/><path d="M3 8h7.5"/><path d="M3 12h4.5"/>',
      play: '<path d="M5.5 3.4l6.5 4.6-6.5 4.6z"/>',
      task: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.2"/><path d="M5.6 8.1l1.7 1.7L11 6"/>',
      check: '<circle cx="8" cy="8" r="5.6"/><path d="M5.7 8l1.6 1.6L10.5 6.5"/>',
      chat: '<path d="M3 4.6a1.6 1.6 0 011.6-1.6h6.8A1.6 1.6 0 0113 4.6v4.1a1.6 1.6 0 01-1.6 1.6H6.2L3 12.7z"/>',
      grid2: '<rect x="2" y="2.4" width="5" height="5" rx="1.2"/><rect x="9" y="2.4" width="5" height="5" rx="1.2"/><rect x="2" y="9.2" width="12" height="4.4" rx="1.2"/>',
      user: '<circle cx="8" cy="5.6" r="2.7"/><path d="M3.2 13.2c0-2.5 2.1-3.9 4.8-3.9s4.8 1.4 4.8 3.9"/>'
    };
    return s + (p[name] || '') + '</svg>';
  }
  function gradeColor(v) { return v >= 80 ? '#8FA98C' : (v >= 70 ? ACCENT : '#C98B6B'); }

  /* ============================================================
     AUTH GATE
  ============================================================ */
  var authMode = 'login';
  var authRole = 'student';

  function showGate(mode) {
    setAuthMode(mode || 'login');
    document.body.classList.remove('authed');
    closeDrawer();
    $('app').style.display = 'none';
    $('auth-gate').style.display = 'flex';
  }
  function hideGate() { $('auth-gate').style.display = 'none'; }

  function setAuthMode(mode) {
    authMode = mode;
    var reg = mode === 'register';
    $('auth-title').textContent = reg ? 'Создать аккаунт' : 'С возвращением';
    $('auth-sub').textContent = reg ? 'Личное пространство потока 7' : 'Войдите в личное пространство потока 7';
    $('auth-name-row').style.display = reg ? 'flex' : 'none';
    $('auth-role-row').style.display = reg ? 'flex' : 'none';
    $('auth-invite-row').style.display = 'none';
    $('auth-submit').textContent = reg ? 'Зарегистрироваться' : 'Войти';
    $('auth-switch-text').textContent = reg ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?';
    $('auth-switch').textContent = reg ? 'Войти →' : 'Зарегистрироваться →';
    $('auth-error').style.display = 'none';
    $('auth-password').setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
    // сброс роли на «Студент» по умолчанию при каждом входе в форму
    if (reg) {
      var studentBtn = document.querySelector('.auth-role[data-role="student"]');
      if (studentBtn) selectAuthRole(studentBtn);
    }
  }

  function authError(msg) { var e = $('auth-error'); e.textContent = msg; e.style.display = 'block'; }

  function submitAuth(ev) {
    ev.preventDefault();
    var email = $('auth-email').value.trim();
    var password = $('auth-password').value;
    if (!email || !password) return authError('Заполните e-mail и пароль');
    var btn = $('auth-submit'); btn.disabled = true; btn.style.opacity = '0.6';

    var p;
    if (authMode === 'register') {
      var name = $('auth-name').value.trim();
      if (!name) { btn.disabled = false; btn.style.opacity = '1'; return authError('Укажите имя'); }
      p = api('/auth/register', { method: 'POST', body: { name: name, email: email, password: password, role: authRole, mentorInvite: $('auth-mentor-invite').value } });
    } else {
      p = api('/auth/login', { method: 'POST', body: { email: email, password: password } });
    }
    p.then(function (res) { enterApp(res.user); })
      .catch(function (e) { authError(e.message === 'unauth' ? 'Неверный e-mail или пароль' : e.message); })
      .then(function () { btn.disabled = false; btn.style.opacity = '1'; });
  }

  function logout() {
    api('/auth/logout', { method: 'POST' }).catch(noop).then(function () {
      state.user = null;
      if (state.socket) { state.socket.disconnect(); state.socket = null; }
      $('auth-email').value = ''; $('auth-password').value = '';
      showGate('login');
    });
  }

  /* ============================================================
     APP SHELL
  ============================================================ */
  function enterApp(user) {
    state.user = user;
    hideGate();
    document.body.classList.add('authed');
    $('app').style.display = 'flex';
    renderSidebarUser(user);
    renderNav(user.role);
    initSocket();
    setScreen(user.role === 'mentor' ? 'admin' : 'dashboard');
  }

  function renderSidebarUser(u) {
    $('sidebar-init').textContent = u.init || '';
    $('sidebar-name').textContent = u.name;
    $('sidebar-sub').textContent = u.role === 'mentor'
      ? 'Наставник · поток 7'
      : 'Студент · ' + (u.progressPct || 0) + '% курса';
  }

  var NAV_STUDENT = [
    { id: 'dashboard', label: 'Главная', icon: 'grid' },
    { id: 'course', label: 'Программа', icon: 'list' },
    { id: 'lesson', label: 'Урок', icon: 'play' },
    { id: 'homework', label: 'Домашка', icon: 'task' },
    { id: 'review', label: 'Проверка', icon: 'check' },
    { id: 'chat', label: 'Чат', icon: 'chat' },
    { id: 'portfolio', label: 'Портфолио', icon: 'grid2' },
    { id: 'profile', label: 'Профиль', icon: 'user' }
  ];
  var NAV_MENTOR = [
    { id: 'admin', label: 'Обзор', icon: 'grid' },
    { id: 'queue', label: 'Проверка', icon: 'check' },
    { id: 'builder', label: 'Конструктор', icon: 'list' },
    { id: 'chat', label: 'Чат', icon: 'chat' }
  ];

  function renderNav(role) {
    var main = role === 'mentor' ? [] : NAV_STUDENT;
    var admin = role === 'mentor' ? NAV_MENTOR : [];
    $('nav-main').innerHTML = main.map(navItem).join('');
    $('nav-admin').innerHTML = admin.map(navItem).join('');
    $('nav-admin-label').style.display = role === 'mentor' ? 'block' : 'none';
    $('nav-admin-label').textContent = role === 'mentor' ? 'Наставник' : '';
    bindHoversIn($('nav-main')); bindHoversIn($('nav-admin'));
  }

  function navItem(item) {
    return '<button data-nav="' + item.id + '" data-navitem="' + item.id + '" data-hover="background:rgba(255,255,255,0.045); color:#F4F2EE" ' +
      'style="position:relative; display:flex; align-items:center; gap:11px; width:100%; padding:8px 10px; border:none; border-radius:9px; background:transparent; color:rgba(244,242,238,0.46); font-family:\'Onest\',sans-serif; font-size:13.5px; font-weight:500; cursor:pointer; text-align:left; transition:background .15s,color .15s">' +
      '<span class="nav-active-bar" style="display:none; position:absolute; left:-14px; top:50%; width:2.5px; height:17px; margin-top:-8.5px; background:var(--accent); border-radius:0 3px 3px 0"></span>' +
      '<span style="flex:none; display:flex; width:16px; height:16px">' + icon(item.icon) + '</span>' +
      '<span style="flex:1">' + item.label + '</span>' +
      (item.badge ? '<span style="flex:none; font-family:\'JetBrains Mono\',monospace; font-size:10px; color:var(--accent)">' + item.badge + '</span>' : '') +
      '</button>';
  }

  function setScreen(id) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++)
      screens[i].classList.toggle('is-active', screens[i].getAttribute('data-screen') === id);

    $('sidebar').style.display = (id === 'onboarding') ? 'none' : 'flex';

    var items = document.querySelectorAll('[data-navitem]');
    for (var j = 0; j < items.length; j++) {
      var active = items[j].getAttribute('data-navitem') === id;
      var bar = items[j].querySelector('.nav-active-bar');
      items[j].style.background = active ? 'rgba(255,255,255,0.06)' : 'transparent';
      items[j].style.color = active ? '#F4F2EE' : 'rgba(244,242,238,0.46)';
      if (bar) bar.style.display = active ? 'block' : 'none';
    }
    $('main').scrollTop = 0;
    closeDrawer();
    loadScreen(id);
  }

  function openDrawer() { $('sidebar').classList.add('open'); $('mobile-backdrop').classList.add('show'); }
  function closeDrawer() { $('sidebar').classList.remove('open'); $('mobile-backdrop').classList.remove('show'); }

  function loadScreen(id) {
    switch (id) {
      case 'dashboard': return loadDashboard();
      case 'course': return loadCourse();
      case 'lesson': return loadLesson();
      case 'homework': return loadHomework();
      case 'review': return loadReview();
      case 'chat': return loadChat();
      case 'portfolio': return loadPortfolio();
      case 'profile': return loadProfile();
      case 'admin': return loadAdmin();
      case 'queue': return loadQueue();
      case 'builder': return loadBuilder();
    }
  }

  /* ============================================================
     SCREEN LOADERS — СТУДЕНТ
  ============================================================ */

  function loadDashboard() {
    api('/dashboard').then(function (d) {
      var u = d.user, s = d.stats || {};
      $('dash-name').textContent = (u.name || '').split(' ')[0] || u.name;
      $('dash-streak').textContent = s.streak != null ? s.streak : 0;
      $('dash-pct').textContent = d.progressPct || 0;
      if (d.today) $('dash-date').textContent = d.today;
      if ($('dash-module-of')) $('dash-module-of').textContent = 'Модуль ' + (d.moduleNum || 1) + ' из ' + (d.moduleTotal || 1);
      // сегменты прогресса — по проценту
      var segN = Math.max(1, d.moduleTotal || 7);
      var pct = (d.progressPct || 0) / 100;
      $('dash-segments').innerHTML = Array.apply(null, { length: segN }).map(function (_, i) {
        var from = i / segN, to = (i + 1) / segN, bg;
        if (pct >= to) bg = 'var(--accent)';
        else if (pct <= from) bg = 'rgba(255,255,255,0.07)';
        else { var p = Math.round((pct - from) / (to - from) * 100); bg = 'linear-gradient(90deg,var(--accent) ' + p + '%, rgba(255,255,255,0.08) ' + p + '%)'; }
        return '<span style="flex:1; height:6px; border-radius:4px; background:' + bg + '"></span>';
      }).join('');
      // виджет портфолио
      var pc = d.portfolioCount || 0;
      $('dash-portfolio-text').innerHTML = pc
        ? '<span style="color:#F4F2EE; font-weight:600">' + pc + ' ' + plural(pc, 'кейс', 'кейса', 'кейсов') + '</span> в портфолио'
        : 'В портфолио пока пусто';
      $('dash-portfolio-thumbs').innerHTML = (pc
        ? Array.apply(null, { length: Math.min(pc, 2) }).map(function () { return '<span style="flex:1; height:64px; border-radius:9px; background:repeating-linear-gradient(135deg,#181818 0 8px,#131313 8px 16px); border:1px solid rgba(255,255,255,0.06)"></span>'; }).join('')
        : '') +
        '<span style="flex:1; height:64px; border-radius:9px; border:1px dashed rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; color:rgba(244,242,238,0.3); font-size:20px">+</span>';
      $('dash-lessons').textContent = s.lessonsDone != null ? s.lessonsDone : 0;
      $('dash-lessons-total').textContent = s.lessonsTotal != null ? s.lessonsTotal : 58;
      $('dash-hours').textContent = s.hours || '0 ч';
      $('dash-avg').textContent = s.avgGrade || '—';
      var card = document.querySelector('[data-action="open-current-lesson"]');
      if (d.nextLesson) {
        if (card) { card.setAttribute('data-action', 'open-current-lesson'); card.style.cursor = 'pointer'; }
        $('dash-next-meta').textContent = 'Модуль ' + d.nextLesson.moduleNum + ' · следующий урок';
        $('dash-next-title').textContent = d.nextLesson.title;
        $('dash-next-dur').textContent = d.nextLesson.meta;
      } else {
        // уроки кончились или их ещё нет
        if (card) { card.removeAttribute('data-action'); card.style.cursor = 'default'; }
        if (d.noLessonsYet) {
          $('dash-next-meta').textContent = 'Уроков пока нет';
          $('dash-next-title').textContent = 'Наставник готовит первый урок';
          $('dash-next-dur').textContent = 'Загляните позже';
        } else {
          $('dash-next-meta').textContent = 'Все доступные уроки пройдены ✓';
          $('dash-next-title').textContent = 'Отличная работа!';
          $('dash-next-dur').textContent = 'Наставник скоро откроет следующий модуль';
        }
      }
      if (d.call && d.call.mentor) {
        $('dash-call-name').textContent = d.call.mentor.name;
        $('dash-call-init').textContent = d.call.mentor.init;
      }
      $('dash-comments').innerHTML = (d.feedback || []).map(function (c) {
        return '<div style="display:flex; gap:14px">' +
          '<span style="flex:none; width:32px; height:32px; border-radius:50%; background:' + avatar + '; border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:rgba(244,242,238,0.7)">' + esc(c.init) + '</span>' +
          '<div style="flex:1; min-width:0">' +
          '<div style="display:flex; align-items:center; gap:9px; margin-bottom:5px"><span style="font-size:13px; font-weight:600">' + esc(c.who) + '</span><span style="width:5px; height:5px; border-radius:50%; background:' + c.dot + '"></span><span style="font-size:11.5px; color:rgba(244,242,238,0.35)">' + esc(c.time) + '</span></div>' +
          '<div style="font-size:13.5px; line-height:1.55; color:rgba(244,242,238,0.62)">' + esc(c.text) + '</div>' +
          '</div></div>';
      }).join('') || '<div style="font-size:13px; color:rgba(244,242,238,0.4)">Пока нет обратной связи.</div>';
    }).catch(noop);
  }

  function loadCourse() {
    api('/course').then(function (d) {
      if ($('course-done')) $('course-done').textContent = d.done || 0;
      if ($('course-total')) $('course-total').textContent = d.total || 0;
      if ($('course-subhead')) $('course-subhead').textContent = d.total
        ? ('Программа из ' + d.total + ' ' + plural(d.total, 'модуля', 'модулей', 'модулей') + ' — от основ к системному мышлению.')
        : 'Наставник наполняет программу.';
      var statusMap = {
        done: { label: 'Завершён', sc: '#8FA98C', dot: '#8FA98C', op: 0.62 },
        active: { label: 'В процессе', sc: '#E8835A', dot: ACCENT, op: 1 },
        locked: { label: 'Откроется позже', sc: 'rgba(244,242,238,0.32)', dot: 'rgba(244,242,238,0.18)', op: 0.42 }
      };
      $('course-modules').innerHTML = d.modules.map(function (m) {
        var st = statusMap[m.status] || statusMap.locked;
        var isActive = m.status === 'active';
        // список уроков для доступных модулей
        var lessonsHtml = '';
        if (m.available && m.lessons && m.lessons.length) {
          lessonsHtml = '<div style="display:flex; flex-direction:column; gap:2px; margin-top:16px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.06)">' +
            m.lessons.map(function (l) {
              var circleBd = l.completed ? ACCENT : 'rgba(255,255,255,0.18)';
              var circleBg = l.completed ? ACCENT : 'transparent';
              return '<div data-open-lesson="' + l.id + '" style="display:flex; align-items:center; gap:11px; padding:8px 8px; border-radius:8px; cursor:pointer" data-hover="background:rgba(255,255,255,0.035)">' +
                '<span style="flex:none; width:16px; height:16px; border-radius:50%; border:1px solid ' + circleBd + '; background:' + circleBg + '; display:flex; align-items:center; justify-content:center; font-size:9px; color:#0B0B0B">' + (l.completed ? '✓' : '') + '</span>' +
                '<span style="flex:1; font-size:13px; color:rgba(244,242,238,0.7)">' + esc(l.title) + '</span>' +
                '<span style="flex:none; font-family:\'JetBrains Mono\',monospace; font-size:9.5px; color:rgba(244,242,238,0.35)">' + esc(l.kind) + ' · ' + esc(l.dur) + '</span></div>';
            }).join('') + '</div>';
        }
        return '<div style="position:relative; display:flex; gap:26px; opacity:' + st.op + '">' +
          '<div style="flex:none; position:relative; z-index:1"><div style="width:48px; height:48px; border-radius:50%; border:1px solid ' + st.dot + '; display:flex; align-items:center; justify-content:center; font-family:\'JetBrains Mono\',monospace; font-size:13px; color:' + st.dot + '; background-color:#0B0B0B">' + m.num + '</div></div>' +
          '<div style="flex:1; border:1px solid rgba(255,255,255,0.07); border-radius:15px; background:#101010; padding:22px 26px; transition:border-color .2s" data-hover="border-color:rgba(255,255,255,0.14)">' +
          '<div style="display:flex; align-items:center; justify-content:space-between; gap:18px"><div style="font-family:\'Lora\',serif; font-size:23px; color:#F7F5F1; line-height:1.2">' + esc(m.title) + '</div>' +
          '<div style="flex:none; display:inline-flex; align-items:center; gap:7px; padding:5px 11px; border-radius:100px; border:1px solid rgba(255,255,255,0.08); font-size:11.5px; font-weight:500; color:' + st.sc + '"><span style="width:6px; height:6px; border-radius:50%; background:' + st.dot + '"></span>' + st.label + '</div></div>' +
          '<div style="font-size:14px; line-height:1.55; color:rgba(244,242,238,0.5); margin:10px 0 0; max-width:560px">' + esc(m.desc) + '</div>' +
          '<div style="display:flex; align-items:center; justify-content:space-between; margin-top:18px"><div style="font-family:\'JetBrains Mono\',monospace; font-size:11.5px; color:rgba(244,242,238,0.4)">' + esc(m.meta) + '</div>' +
          (isActive ? '<button data-action="open-current-lesson" style="padding:9px 18px; border:none; border-radius:9px; background:#F4F2EE; color:#0B0B0B; font-family:\'Onest\',sans-serif; font-size:13px; font-weight:600; cursor:pointer">Продолжить урок →</button>' : '') +
          '</div>' + lessonsHtml + '</div></div>';
      }).join('');
      bindHoversIn($('course-modules'));
    }).catch(noop);
  }

  function openLesson(id) { state.currentLessonId = id; setScreen('lesson'); }
  function openCurrentLesson() { state.currentLessonId = null; setScreen('lesson'); }

  function loadLesson() {
    var id = state.currentLessonId || 'current';
    api('/lesson/' + id).then(function (d) {
      state.currentLessonId = d.lesson.id;
      state.lessonData = d;

      $('lesson-bc-module').textContent = d.module ? (/модул/i.test(d.module.title) ? d.module.title : ('Модуль ' + d.module.num + ' — ' + d.module.title)) : 'Урок';
      $('lesson-bc-lesson').textContent = d.lesson.title;
      $('lesson-title').textContent = d.lesson.title;
      $('lesson-dur').textContent = (d.lesson.kind === 'Задание' ? 'Задание' : 'Видео') + ' · ' + d.lesson.dur;
      if (d.mentor) { $('lesson-mentor-name').textContent = d.mentor.name; $('lesson-mentor-init').textContent = d.mentor.init; }

      renderLessonBody(d.lesson);

      // материалы
      var mats = d.materials || [];
      $('lesson-materials-card').style.display = mats.length ? 'block' : 'none';
      $('lesson-materials').innerHTML = mats.map(function (f) {
        return '<div data-material="' + f.id + '" style="display:flex; align-items:center; gap:12px; padding:11px 10px; border-radius:10px; cursor:pointer; transition:background .15s" data-hover="background:rgba(255,255,255,0.04)">' +
          '<span style="flex:none; width:34px; height:34px; border-radius:8px; border:1px solid rgba(255,255,255,0.09); display:flex; align-items:center; justify-content:center; font-family:\'JetBrains Mono\',monospace; font-size:9.5px; font-weight:500; color:' + f.tc + '">' + esc(f.type) + '</span>' +
          '<span style="flex:1; min-width:0"><span style="display:block; font-size:13px; font-weight:500; color:#F4F2EE; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">' + esc(f.name) + '</span><span style="display:block; font-size:11px; color:rgba(244,242,238,0.4); margin-top:2px">' + esc(f.meta) + '</span></span>' +
          '<span style="flex:none; color:rgba(244,242,238,0.35); font-size:14px">↓</span></div>';
      }).join('');

      // чек-лист
      var chk = d.checklist || [];
      $('lesson-checklist-card').style.display = chk.length ? 'block' : 'none';
      renderChecklist(chk);

      renderLessonList(d);
      renderLessonCTA(d);
      setupPlayer(d.lesson);

      bindHoversIn($('lesson-materials'));
    }).catch(noop);
  }

  function parseDur(meta) {
    var m = String(meta || '').match(/(\d+):(\d{2})/);
    return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : 0;
  }
  function setupPlayer(lesson) {
    playerPause(); player.cur = 0; player.speed = 1;
    var sp = $('player-speed'); if (sp) sp.textContent = '1.0×';
    var hasVideo = !!(lesson.video && lesson.video.name);
    player.dur = hasVideo ? (parseDur(lesson.video.meta) || 600) : 0;
    $('player-label').style.display = hasVideo ? 'block' : 'none';
    $('player-novideo').style.display = hasVideo ? 'none' : 'flex';
    $('player-bigplay').style.display = hasVideo ? 'flex' : 'none';
    $('player-controls').style.display = hasVideo ? 'block' : 'none';
    playerRender();
  }

  function renderLessonBody(lesson) {
    var b = lesson.body;
    if (Array.isArray(b) && b.length) {
      $('lesson-body').innerHTML = b.map(function (x) {
        if (x.type === 'h2') return '<h2 style="font-family:\'Lora\',serif; font-weight:500; font-size:25px; color:#F7F5F1; margin:38px 0 14px; letter-spacing:-0.01em">' + esc(x.text) + '</h2>';
        if (x.type === 'quote') return '<div style="border-left:2px solid var(--accent); padding:4px 0 4px 22px; margin:30px 0; font-family:\'Lora\',serif; font-style:italic; font-size:20px; line-height:1.5; color:#F7F5F1">' + esc(x.text) + '</div>';
        return '<p style="margin:0 0 22px">' + esc(x.text) + '</p>';
      }).join('');
    } else {
      $('lesson-body').innerHTML = '<p style="margin:0 0 22px; color:rgba(244,242,238,0.6)">Разбор этого урока — на занятии с наставником. Когда закончите, отметьте урок пройденным кнопкой справа, чтобы перейти к следующему.</p>';
    }
  }

  function renderLessonList(d) {
    var items = d.moduleLessons || [];
    $('lesson-list-count').textContent = items.filter(function (l) { return l.completed; }).length + '/' + items.length;
    $('lesson-list').innerHTML = items.map(function (l) {
      var cur = l.id === d.lesson.id;
      var circleBd = l.completed ? ACCENT : 'rgba(255,255,255,0.18)';
      var circleBg = l.completed ? ACCENT : 'transparent';
      return '<div data-open-lesson="' + l.id + '" style="display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:9px; cursor:pointer; background:' + (cur ? 'rgba(232,131,90,0.08)' : 'transparent') + '; border:1px solid ' + (cur ? 'rgba(232,131,90,0.3)' : 'transparent') + '" data-hover="background:rgba(255,255,255,0.04)">' +
        '<span style="flex:none; width:16px; height:16px; border-radius:50%; border:1px solid ' + circleBd + '; background:' + circleBg + '; display:flex; align-items:center; justify-content:center; font-size:9px; color:#0B0B0B">' + (l.completed ? '✓' : '') + '</span>' +
        '<span style="flex:1; font-size:12.5px; color:' + (cur ? '#F4F2EE' : 'rgba(244,242,238,0.65)') + '">' + esc(l.title) + '</span>' +
        '<span style="flex:none; font-family:\'JetBrains Mono\',monospace; font-size:9px; color:rgba(244,242,238,0.35)">' + esc(l.dur) + '</span></div>';
    }).join('') || '<div style="font-size:12px; color:rgba(244,242,238,0.4)">В модуле пока нет уроков.</div>';
    bindHoversIn($('lesson-list'));
  }

  function renderLessonCTA(d) {
    var label;
    if (!d.completed) label = 'Урок пройден';
    else if (d.nextLessonId) label = 'Следующий урок';
    else if (d.homeworkId) label = 'К домашнему заданию';
    else label = 'Модуль пройден ✓';
    $('lesson-cta-text').textContent = label;
    var btn = $('lesson-cta');
    btn.setAttribute('data-action', 'lesson-cta');
    btn.style.background = (!d.completed || d.nextLessonId || d.homeworkId) ? '#F4F2EE' : 'rgba(143,169,140,0.15)';
    btn.style.color = (!d.completed || d.nextLessonId || d.homeworkId) ? '#0B0B0B' : '#8FA98C';
  }

  function lessonCTA() {
    var d = state.lessonData;
    if (!d) return;
    if (!d.completed) {
      api('/lesson/' + d.lesson.id + '/complete', { method: 'POST', body: { done: true } }).then(function (r) {
        toast('Урок пройден ✓ — ' + r.progressPct + '% курса', '#8FA98C');
        if (state.user) { state.user.progressPct = r.progressPct; renderSidebarUser(state.user); }
        if (r.nextLessonId) { state.currentLessonId = r.nextLessonId; loadLesson(); }
        else if (d.homeworkId) { setScreen('homework'); }
        else { loadLesson(); }
      }).catch(function (e) { toast(e.message, '#C98B6B'); });
    } else if (d.nextLessonId) { state.currentLessonId = d.nextLessonId; loadLesson(); }
    else if (d.homeworkId) { setScreen('homework'); }
    else { setScreen('course'); }
  }

  function renderChecklist(items) {
    $('lesson-checklist').innerHTML = items.map(function (c) {
      var mark = c.done ? '✓' : '';
      var bd = c.done ? ACCENT : 'rgba(255,255,255,0.16)';
      var bg = c.done ? ACCENT : 'transparent';
      var color = c.done ? 'rgba(244,242,238,0.4)' : 'rgba(244,242,238,0.78)';
      var op = c.done ? 0.7 : 1;
      return '<div data-checkitem="' + c.id + '" style="display:flex; align-items:flex-start; gap:11px; opacity:' + op + '; cursor:pointer">' +
        '<span style="flex:none; width:18px; height:18px; border-radius:6px; margin-top:1px; border:1px solid ' + bd + '; background:' + bg + '; display:flex; align-items:center; justify-content:center; font-size:10px; color:#0B0B0B">' + mark + '</span>' +
        '<span style="font-size:13px; line-height:1.45; color:' + color + '">' + esc(c.t) + '</span></div>';
    }).join('');
  }

  function loadHomework() {
    api('/homework/current').then(function (d) {
      var hw = d.homework;
      if (!hw) {
        state.currentHomeworkId = null;
        $('hw-title').textContent = 'Домашнего задания пока нет';
        $('hw-deadline').textContent = '—'; $('hw-format').textContent = '—';
        $('hw-desc').innerHTML = '<p style="margin:0 0 18px; color:rgba(244,242,238,0.6)">Наставник ещё не добавил домашнее задание к текущему модулю.</p>';
        $('homework-criteria').innerHTML = '';
        $('hw-criteria-head').style.display = 'none';
        $('homework-submit-area').innerHTML = '';
        return;
      }
      $('hw-criteria-head').style.display = 'block';
      state.currentHomeworkId = hw.id;
      $('hw-title').textContent = hw.title;
      $('hw-deadline').textContent = hw.deadline || '—';
      $('hw-format').textContent = hw.format || '—';

      var desc = '<p style="margin:0 0 18px">' + esc(hw.intro || '') + '</p>';
      if (hw.tasks && hw.tasks.length) {
        desc += '<h2 style="font-family:\'Lora\',serif; font-weight:500; font-size:22px; color:#F7F5F1; margin:30px 0 14px">Что нужно сделать</h2>' +
          '<ul style="margin:0; padding-left:20px; line-height:1.85">' + hw.tasks.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
      }
      $('hw-desc').innerHTML = desc;

      // бейдж статуса по сабмишну
      var bt = 'В работе', bc = ACCENT, bbg = 'rgba(232,131,90,0.12)', bbd = 'rgba(232,131,90,0.25)';
      var sub = d.submission;
      if (sub) {
        if (sub.status === 'submitted') { bt = 'На проверке'; }
        else if (sub.status === 'reviewed') {
          if (d.accepted) { bt = 'Принято'; bc = '#8FA98C'; bbg = 'rgba(143,169,140,0.12)'; bbd = 'rgba(143,169,140,0.25)'; }
          else { bt = 'Требует доработки'; bc = '#C98B6B'; bbg = 'rgba(201,139,107,0.12)'; bbd = 'rgba(201,139,107,0.25)'; }
        }
      }
      $('hw-badge-text').textContent = bt;
      var badge = $('hw-badge');
      badge.style.background = bbg; badge.style.borderColor = bbd; badge.style.color = bc;
      badge.querySelector('span').style.background = bc;

      $('homework-criteria').innerHTML = hw.criteria.map(function (c) {
        return '<div style="display:flex; align-items:center; gap:18px; padding:15px 16px; border:1px solid rgba(255,255,255,0.06); border-radius:11px; background:#0F0F0F">' +
          '<span style="flex:none; width:42px; font-family:\'Lora\',serif; font-size:20px; color:var(--accent)">' + c.w + '<span style="font-size:11px; color:rgba(244,242,238,0.3)">%</span></span>' +
          '<span style="flex:1"><span style="display:block; font-size:14px; font-weight:600; color:#F4F2EE">' + esc(c.t) + '</span><span style="display:block; font-size:12.5px; color:rgba(244,242,238,0.45); margin-top:3px">' + esc(c.d) + '</span></span></div>';
      }).join('');
      if (d.mentor) { $('hw-mentor-name').textContent = d.mentor.name; $('hw-mentor-init').textContent = d.mentor.init; }
      renderHomeworkSubmit(d.submission);
    }).catch(noop);
  }

  function renderHomeworkSubmit(sub) {
    var area = $('homework-submit-area');
    var dropZone = '<div data-action="pick-file" style="border:1.5px dashed rgba(255,255,255,0.16); border-radius:13px; padding:30px 18px; text-align:center; cursor:pointer; transition:border-color .2s,background .2s" data-hover="border-color:var(--accent); background:rgba(232,131,90,0.04)">' +
      '<div style="width:42px; height:42px; margin:0 auto 14px; border-radius:11px; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; font-size:18px; color:rgba(244,242,238,0.55)">↥</div>' +
      '<div style="font-size:14px; font-weight:600; color:#F4F2EE">Перетащите файл сюда</div>' +
      '<div style="font-size:12px; color:rgba(244,242,238,0.42); margin-top:6px">или нажмите, чтобы выбрать</div></div>';

    var chip = '';
    if (sub && sub.file) {
      var statusLabel = sub.status === 'submitted' ? 'на проверке' : (sub.status === 'reviewed' ? 'проверено' : 'черновик');
      var fb = fileBadge(sub.file.name);
      chip = '<div style="display:flex; align-items:center; gap:10px; margin-top:14px; padding:10px 12px; border-radius:10px; background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.05)">' +
        '<span style="flex:none; width:30px; height:30px; border-radius:7px; border:1px solid rgba(255,255,255,0.09); display:flex; align-items:center; justify-content:center; font-family:\'JetBrains Mono\',monospace; font-size:9px; color:' + fb.c + '">' + fb.t + '</span>' +
        '<span style="flex:1; min-width:0"><span style="display:block; font-size:12.5px; color:#F4F2EE; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">' + esc(sub.file.name) + '</span><span style="display:block; font-size:11px; color:rgba(244,242,238,0.4)">' + esc(sub.file.size || '') + ' · ' + statusLabel + '</span></span></div>';
    }
    var btnLabel = sub && sub.status === 'submitted' ? 'Отправить заново' : 'Отправить на проверку';
    area.innerHTML = dropZone + chip +
      '<button data-action="submit-hw" style="width:100%; margin-top:14px; padding:14px; border:none; border-radius:11px; background:#F4F2EE; color:#0B0B0B; font-family:\'Onest\',sans-serif; font-size:14px; font-weight:600; cursor:pointer" data-hover="opacity:0.92">' + btnLabel + '</button>' +
      '<div id="homework-hint" style="font-size:11.5px; color:rgba(244,242,238,0.35); text-align:center; margin-top:10px">После отправки наставник получит уведомление</div>';
    bindHoversIn(area);
  }

  function loadReview() {
    api('/review').then(function (d) {
      var box = $('review-comments');
      // 1) работы вообще нет
      if (!d.hasSubmission) {
        $('review-title').textContent = 'Работа ещё не сдана';
        $('review-file').textContent = '// работа не загружена';
        $('review-submitted').textContent = 'Отправьте ДЗ во вкладке «Домашка»';
        $('review-pins').innerHTML = ''; $('review-grades').innerHTML = '';
        $('review-total-big').textContent = '—'; $('review-caption').textContent = '';
        $('review-grade-label').textContent = 'ОЦЕНКА'; $('review-grade-sub').textContent = '';
        $('review-mentor-init').textContent = '—'; $('review-mentor-name').textContent = 'Наставник';
        $('review-verdict-fulltext').textContent = '';
        $('review-comments-label').textContent = 'ЗАМЕЧАНИЯ ПО МАКЕТУ · 0';
        setVerdictBadge('none');
        box.innerHTML = '<div style="font-size:13px; color:rgba(244,242,238,0.4)">Пока нет работ на проверке.</div>';
        return;
      }
      // шапка/файл/подпись — общее для «на проверке» и «проверено»
      if (d.homework && d.homework.title) $('review-title').textContent = d.homework.title;
      $('review-file').textContent = '// загруженная работа' + (d.file && d.file.name ? ' · ' + d.file.name : '');
      $('review-submitted').textContent = 'Сдано вами · ' + (d.submittedLabel || 'недавно') + (d.fileSize ? ' · ' + d.fileSize : '');
      if (d.mentor) { $('review-mentor-name').textContent = d.mentor.name; $('review-mentor-init').textContent = d.mentor.init; }

      // 2) сдано, но ещё не проверено
      if (!d.review) {
        $('review-pins').innerHTML = ''; $('review-grades').innerHTML = '';
        $('review-total-big').textContent = '—'; $('review-caption').textContent = '';
        $('review-grade-label').textContent = 'ОЖИДАЕТ ПРОВЕРКИ'; $('review-grade-sub').textContent = 'наставник ещё не оценил';
        $('review-verdict-fulltext').textContent = 'Работа отправлена и ждёт проверки наставника.';
        $('review-comments-label').textContent = 'ЗАМЕЧАНИЯ ПО МАКЕТУ · 0';
        setVerdictBadge('pending');
        box.innerHTML = '<div style="font-size:13px; color:rgba(244,242,238,0.4)">Замечания появятся после проверки.</div>';
        return;
      }

      // 3) проверено
      var rev = d.review;
      var accepted = rev.verdict === 'accepted';
      $('review-total-big').textContent = String(rev.total).replace('.', ',');
      $('review-grade-label').textContent = accepted ? 'ФИНАЛЬНАЯ ОЦЕНКА' : 'ПРЕДВАРИТЕЛЬНАЯ ОЦЕНКА';
      $('review-grade-sub').textContent = accepted ? 'работа принята' : 'после доработки → финальная';
      $('review-caption').textContent = '';
      $('review-verdict-fulltext').textContent = rev.verdictText || '';
      var comments = Array.isArray(rev.comments) ? rev.comments.filter(function (c) { return c && typeof c === 'object'; }).map(function (c) {
        return { n: c.n, top: safeReviewCoordinate(c.top), left: safeReviewCoordinate(c.left), sc: safeReviewColor(c.sc), svBg: safeReviewColor(c.svBg), tag: c.tag, sev: c.sev, text: c.text };
      }) : [];
      $('review-comments-label').textContent = 'ЗАМЕЧАНИЯ ПО МАКЕТУ · ' + comments.length;
      $('review-pins').innerHTML = comments.map(function (p) {
        return '<div style="position:absolute; top:' + p.top + '; left:' + p.left + '; transform:translate(-50%,-50%); width:26px; height:26px; border-radius:50%; background:' + p.sc + '; color:#0B0B0B; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; box-shadow:0 0 0 4px rgba(11,11,11,0.6); cursor:pointer">' + esc(p.n) + '</div>';
      }).join('');
      $('review-grades').innerHTML = (Array.isArray(rev.scores) ? rev.scores : []).filter(function (g) { return g && typeof g.v === 'number' && isFinite(g.v) && g.v >= 0 && g.v <= 100; }).map(function (g) {
        var w = g.v + '%', c = gradeColor(g.v);
        return '<div style="display:flex; align-items:center; gap:14px"><span style="flex:none; width:170px; font-size:12.5px; color:rgba(244,242,238,0.55)">' + esc(g.t) + '</span>' +
          '<span style="flex:1; height:5px; border-radius:3px; background:rgba(255,255,255,0.07); position:relative; overflow:hidden"><span style="position:absolute; left:0; top:0; bottom:0; width:' + w + '; background:' + c + '; border-radius:3px"></span></span>' +
          '<span style="flex:none; width:34px; text-align:right; font-family:\'JetBrains Mono\',monospace; font-size:11px; color:rgba(244,242,238,0.5)">' + w + '</span></div>';
      }).join('');
      box.innerHTML = comments.length ? comments.map(function (c) {
        return '<div style="border:1px solid rgba(255,255,255,0.07); border-radius:13px; background:#0F0F0F; padding:16px 18px">' +
          '<div style="display:flex; align-items:center; gap:10px; margin-bottom:9px"><span style="flex:none; width:22px; height:22px; border-radius:50%; background:' + c.sc + '; color:#0B0B0B; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700">' + esc(c.n) + '</span>' +
          '<span style="font-size:13px; font-weight:600; color:#F4F2EE">' + esc(c.tag) + '</span><span style="flex:1"></span>' +
          '<span style="font-size:11px; font-weight:500; color:' + c.sc + '; padding:3px 9px; border-radius:100px; background:' + c.svBg + '">' + esc(c.sev) + '</span></div>' +
          '<div style="font-size:13.5px; line-height:1.6; color:rgba(244,242,238,0.62)">' + esc(c.text) + '</div></div>';
      }).join('') : '<div style="font-size:13px; color:rgba(244,242,238,0.4)">Наставник не оставил точечных замечаний.</div>';
      setVerdictBadge(accepted ? 'accepted' : 'rework');
    }).catch(noop);
  }

  function setVerdictBadge(state) {
    var map = {
      accepted: { t: 'Принято', c: '#8FA98C', bg: 'rgba(143,169,140,0.1)', bd: 'rgba(143,169,140,0.28)' },
      rework: { t: 'Требует доработки', c: ACCENT, bg: 'rgba(232,131,90,0.1)', bd: 'rgba(232,131,90,0.28)' },
      pending: { t: 'На проверке', c: '#E8835A', bg: 'rgba(232,131,90,0.1)', bd: 'rgba(232,131,90,0.28)' },
      none: { t: 'Нет работы', c: 'rgba(244,242,238,0.5)', bg: 'rgba(255,255,255,0.04)', bd: 'rgba(255,255,255,0.1)' }
    };
    var s = map[state] || map.none, badge = $('review-verdict-badge');
    if (!badge) return;
    badge.style.background = s.bg; badge.style.borderColor = s.bd; badge.style.color = s.c;
    $('review-verdict-dot').style.background = s.c;
    $('review-verdict-text').textContent = s.t;
  }

  function loadPortfolio() {
    if ($('portfolio-owner') && state.user) $('portfolio-owner').textContent = 'ПОРТФОЛИО · ' + (state.user.name || '').toUpperCase();
    api('/portfolio').then(function (d) {
      var cells = d.items.map(function (p) {
        return '<div style="grid-column:span ' + p.span + '; border-radius:16px; overflow:hidden; border:1px solid rgba(255,255,255,0.07); background:#101010; cursor:pointer; transition:border-color .25s,transform .25s" data-hover="border-color:rgba(255,255,255,0.18); transform:translateY(-3px)">' +
          '<div style="position:relative; height:' + p.h + '; background:repeating-linear-gradient(135deg,#171717 0 13px,#121212 13px 26px); border-bottom:1px solid rgba(255,255,255,0.05)">' +
          '<span style="position:absolute; top:16px; left:18px; font-family:\'JetBrains Mono\',monospace; font-size:10.5px; color:rgba(244,242,238,0.38)">// ' + esc(p.meta) + '</span>' +
          '<span style="position:absolute; bottom:16px; right:18px; font-size:12px; color:rgba(244,242,238,0.4); opacity:0.9">смотреть кейс →</span></div>' +
          '<div style="padding:20px 22px; display:flex; align-items:center; justify-content:space-between"><div><div style="font-family:\'Lora\',serif; font-size:20px; color:#F7F5F1; line-height:1.2">' + esc(p.title) + '</div><div style="font-size:12px; color:rgba(244,242,238,0.42); margin-top:6px">' + esc(p.tag) + '</div></div></div></div>';
      }).join('');
      cells += '<div data-action="add-portfolio" style="grid-column:span 12; border-radius:16px; border:1px dashed rgba(255,255,255,0.12); padding:30px; display:flex; align-items:center; justify-content:center; gap:12px; color:rgba(244,242,238,0.4); cursor:pointer; font-size:14px" data-hover="border-color:rgba(255,255,255,0.22); color:rgba(244,242,238,0.6)"><span style="font-size:18px">+</span>Добавить работу в портфолио</div>';
      $('portfolio-grid').innerHTML = cells;
      bindHoversIn($('portfolio-grid'));
    }).catch(noop);
  }

  function loadProfile() {
    api('/profile').then(function (d) {
      var u = d.user, s = d.stats || {};
      $('profile-name').textContent = u.name;
      if ($('profile-avatar')) $('profile-avatar').textContent = u.init || '—';
      $('profile-meta').textContent = (u.role === 'mentor' ? 'Наставник потока 7' : 'Студент потока 7') +
        (u.joined ? ' · ' + u.joined : '') + (u.city ? ' · ' + u.city : '');
      $('profile-lessons').textContent = s.lessonsDone != null ? s.lessonsDone : 0;
      $('profile-hw').textContent = s.homeworksDone != null ? s.homeworksDone : 0;
      $('profile-avg').textContent = s.avgGrade || '—';
      $('profile-streak').textContent = s.streak != null ? s.streak : 0;
      $('profile-heatmap').innerHTML = (d.heatmap || []).map(function (bg) {
        return '<span style="aspect-ratio:1; border-radius:3px; background:' + bg + '"></span>';
      }).join('');
    }).catch(noop);
  }

  /* ============================================================
     SCREEN LOADERS — НАСТАВНИК
  ============================================================ */
  function loadAdmin() {
    api('/admin/overview').then(function (d) {
      $('admin-students').innerHTML = d.students.map(function (st) {
        return '<div style="display:flex; align-items:center; padding:15px 24px; border-bottom:1px solid rgba(255,255,255,0.04); cursor:pointer; transition:background .15s" data-hover="background:rgba(255,255,255,0.025)">' +
          '<span style="flex:1; display:flex; align-items:center; gap:12px"><span style="position:relative; flex:none"><span style="width:34px; height:34px; border-radius:50%; background:' + avatar + '; border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:rgba(244,242,238,0.7)">' + esc(st.init) + '</span><span style="position:absolute; right:-1px; bottom:-1px; width:9px; height:9px; border-radius:50%; background:' + st.dot + '; border:2px solid #0F0F0F"></span></span><span style="font-size:14px; font-weight:500; color:#F4F2EE">' + esc(st.name) + '</span></span>' +
          '<span style="width:200px; font-size:13px; color:rgba(244,242,238,0.55)">' + esc(st.module) + '</span>' +
          '<span style="width:130px; display:flex; align-items:center; gap:10px"><span style="flex:1; height:5px; border-radius:3px; background:rgba(255,255,255,0.08); position:relative"><span style="position:absolute; left:0; top:0; bottom:0; width:' + st.prog + '; background:var(--accent); border-radius:3px"></span></span><span style="font-family:\'JetBrains Mono\',monospace; font-size:11px; color:rgba(244,242,238,0.45)">' + st.prog + '</span></span>' +
          '<span style="width:150px"><span style="font-size:11.5px; font-weight:500; color:' + st.sc + '; padding:4px 11px; border-radius:100px; background:' + st.sb + '">' + esc(st.status) + '</span></span>' +
          '<span style="width:120px; text-align:right; font-size:12px; color:rgba(244,242,238,0.4)">' + esc(st.active) + '</span></div>';
      }).join('');
      bindHoversIn($('admin-students'));
      var kpis = document.querySelectorAll('.screen[data-screen="admin"] [style*="font-size:42px"]');
      if (kpis[0]) kpis[0].textContent = d.total;
      if (kpis[1]) kpis[1].textContent = d.activeNow;
      if (kpis[2]) kpis[2].textContent = d.pending;
    }).catch(noop);
  }

  function loadQueue() {
    api('/admin/queue').then(function (d) {
      state.queue.items = d.items;
      if ($('queue-count-new')) $('queue-count-new').textContent = d.items.filter(function (q) { return q.isNew; }).length;
      if ($('queue-count-all')) $('queue-count-all').textContent = d.items.length;
      // открываем первую ждущую проверки; если таких нет — первую в списке
      var firstReal = d.items.filter(function (q) { return q.real && q.isNew; })[0] || d.items.filter(function (q) { return q.real; })[0];
      state.queue.subId = firstReal ? firstReal.id : null;
      renderQueueList();
      if (firstReal) openSubmission(firstReal.id);
      else {
        renderQueueScores([], []);
        $('queue-grade-init').textContent = '—';
        $('queue-grade-who').textContent = 'Нет работ на проверке';
        $('queue-grade-title').textContent = 'Выберите работу слева';
        $('queue-grade-file').textContent = '// работа студента';
        $('queue-review-text').value = '';
        state.queue.fileUrl = null;
      }
    }).catch(noop);
  }

  function openSubmission(subId) {
    api('/admin/submission/' + subId).then(function (d) {
      state.queue.subId = subId;
      var sub = d.submission || {};
      var st = sub.student || {};
      // шапка панели проверки — под выбранную работу
      $('queue-grade-init').textContent = st.init || '—';
      $('queue-grade-who').textContent = (st.name || 'Студент') + ' · сдано ' + (sub.submittedLabel || 'недавно');
      $('queue-grade-title').textContent = (d.homework && d.homework.title) || 'Работа на проверке';
      $('queue-grade-file').textContent = '// работа студента' + (sub.file && sub.file.name ? ' · ' + sub.file.name : '');
      state.queue.fileUrl = sub.file && sub.file.url ? sub.file.url : null;

      var crit = (d.homework && d.homework.criteria) || [];
      var existing = d.review && d.review.scores ? d.review.scores : [];
      state.queue.criteria = crit;
      state.queue.scores = crit.map(function (c) {
        var ex = existing.find(function (e) { return e.criterionId === c.id; });
        return { criterionId: c.id, t: c.t, v: ex ? ex.v : 70 };
      });
      renderQueueScores(state.queue.scores, crit);
      // ревью: уже написанное или пустое (чтобы не тащить чужой текст)
      $('queue-review-text').value = (d.review && d.review.verdictText) || '';
      highlightQueueItemById(subId);
    }).catch(noop);
  }

  function highlightQueueItemById(id) {
    var el = document.querySelector('[data-queue-item="' + id + '"]');
    if (el) highlightQueueItem(el);
  }

  function renderQueueScores(scores, crit) {
    var total = computeTotal(scores, crit);
    $('queue-scores').innerHTML = scores.map(function (g) {
      var score = Math.round(g.v / 10), c = gradeColor(g.v);
      return '<div style="display:flex; align-items:center; gap:16px"><span style="flex:1; font-size:13.5px; color:#F4F2EE">' + esc(g.t) + '</span>' +
        '<span style="flex:none; display:flex; align-items:center; gap:9px"><span data-score-dec="' + g.criterionId + '" style="width:28px; height:28px; border-radius:8px; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; color:rgba(244,242,238,0.5); cursor:pointer; font-size:15px; user-select:none">−</span>' +
        '<span style="font-family:\'Lora\',serif; font-size:20px; color:' + c + '; width:26px; text-align:center">' + score + '</span>' +
        '<span data-score-inc="' + g.criterionId + '" style="width:28px; height:28px; border-radius:8px; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; color:rgba(244,242,238,0.5); cursor:pointer; font-size:15px; user-select:none">+</span></span></div>';
    }).join('');
    if ($('queue-total')) $('queue-total').textContent = String(total).replace('.', ',');
  }

  function computeTotal(scores, crit) {
    if (!scores.length) return 0;
    var sum = 0, wsum = 0;
    scores.forEach(function (s) {
      var c = crit.find(function (x) { return x.id === s.criterionId; });
      var w = c ? c.w : 25;
      sum += (s.v / 100) * w; wsum += w;
    });
    return wsum ? Math.round((sum / wsum) * 10 * 10) / 10 : 0;
  }

  function adjustScore(critId, delta) {
    var s = state.queue.scores.find(function (x) { return x.criterionId === critId; });
    if (!s) return;
    s.v = Math.max(0, Math.min(100, s.v + delta * 10));
    renderQueueScores(state.queue.scores, state.queue.criteria);
  }

  function submitReview(verdict) {
    if (!state.queue.subId) { flashQueueStatus('Выберите работу из очереди', '#C98B6B'); return; }
    var body = {
      verdict: verdict,
      verdictText: $('queue-review-text').value.trim(),
      scores: state.queue.scores.map(function (s) { return { criterionId: s.criterionId, v: s.v }; })
    };
    api('/admin/submission/' + state.queue.subId + '/review', { method: 'POST', body: body })
      .then(function (r) {
        flashQueueStatus((verdict === 'accepted' ? 'Работа принята ✓ · итог ' : 'Возвращена на доработку · итог ') + String(r.review.total).replace('.', ',') + '/10', verdict === 'accepted' ? '#8FA98C' : '#C98B6B');
        loadQueue();   // работа уходит из «Новых», счётчики обновляются
      })
      .catch(function (e) { flashQueueStatus(e.message, '#C98B6B'); });
  }

  function flashQueueStatus(msg, color) {
    var el = $('queue-review-status');
    el.textContent = msg; el.style.color = color; el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.display = 'none'; }, 4500);
  }

  function loadBuilder() {
    api('/admin/builder').then(function (d) {
      state.builder = state.builder || {};
      state.builder.modules = d.modules;
      if (!state.builder.expandedId || !d.modules.some(function (m) { return m.id === state.builder.expandedId; })) {
        var active = d.modules.find(function (m) { return m.status === 'active'; }) || d.modules[0];
        state.builder.expandedId = active ? active.id : null;
      }
      renderBuilderModules();
    }).catch(noop);
  }

  function renderBuilderModules() {
    var modules = (state.builder && state.builder.modules) || [];
    $('builder-modules').innerHTML = modules.map(function (m) {
      return m.id === state.builder.expandedId ? builderExpanded(m) : builderCollapsed(m);
    }).join('');
    renderBuilderInspector(expandedModule());
    bindHoversIn($('builder-modules'));
  }

  function builderCollapsed(m) {
    var numColor = m.status === 'done' ? '#8FA98C' : (m.status === 'active' ? ACCENT : 'rgba(244,242,238,0.3)');
    var titleColor = m.status === 'locked' ? 'rgba(244,242,238,0.7)' : '#F4F2EE';
    var meta = m.lessons.length + ' ' + plural(m.lessons.length, 'урок', 'урока', 'уроков') + ' · ' + (m.published ? 'опубликован' : 'черновик');
    return '<div data-builder-module="' + m.id + '" style="display:flex; align-items:center; gap:14px; padding:18px 20px; border:1px solid rgba(255,255,255,0.06); border-radius:13px; background:#0F0F0F; opacity:0.65; cursor:pointer" data-hover="opacity:1">' +
      '<span style="font-family:\'JetBrains Mono\',monospace; font-size:12px; color:' + numColor + '">' + m.num + '</span>' +
      '<span style="flex:1; font-family:\'Lora\',serif; font-size:19px; color:' + titleColor + '">' + esc(m.title) + '</span>' +
      '<span style="font-size:12px; color:rgba(244,242,238,0.4)">' + meta + '</span>' +
      '<span data-del-module="' + m.id + '" title="Удалить модуль" style="color:rgba(244,242,238,0.3); font-size:13px; padding:2px 4px; cursor:pointer" data-hover="color:#C98B6B">✕</span>' +
      '<span style="color:rgba(244,242,238,0.3)">⌄</span></div>';
  }

  function builderExpanded(m) {
    var lessons = m.lessons.map(function (l) {
      var pub = l.status === 'Опубликован';
      var sc = pub ? '#8FA98C' : 'rgba(244,242,238,0.55)';
      var pillBd = pub ? 'rgba(143,169,140,0.3)' : 'rgba(255,255,255,0.14)';
      var pillBg = pub ? 'rgba(143,169,140,0.1)' : 'transparent';
      return '<div style="display:flex; align-items:center; gap:13px; padding:12px 12px; border:1px solid rgba(255,255,255,0.06); background:transparent; border-radius:10px; margin:4px 0" data-hover="border-color:rgba(255,255,255,0.16)">' +
        '<span style="flex:none; color:rgba(244,242,238,0.25); font-size:14px; letter-spacing:-2px; cursor:grab">⠿</span>' +
        '<span style="flex:none; font-family:\'JetBrains Mono\',monospace; font-size:9.5px; color:rgba(244,242,238,0.5); border:1px solid rgba(255,255,255,0.1); padding:2px 7px; border-radius:5px">' + esc(l.kind) + '</span>' +
        '<span style="flex:1; font-size:14px; color:#F4F2EE">' + esc(l.title) + '</span>' +
        '<span style="flex:none; font-size:12px; color:rgba(244,242,238,0.4)">' + esc(l.dur) + '</span>' +
        '<span data-toggle-lesson="' + l.id + '" data-status="' + l.status + '" title="' + (pub ? 'Нажмите, чтобы снять с публикации' : 'Нажмите, чтобы опубликовать') + '" style="flex:none; font-size:11px; font-weight:500; color:' + sc + '; cursor:pointer; padding:4px 11px; border-radius:100px; border:1px solid ' + pillBd + '; background:' + pillBg + '" data-hover="border-color:rgba(255,255,255,0.3)">' + esc(l.status) + '</span>' +
        '<span data-del-lesson="' + l.id + '" title="Удалить урок" style="flex:none; color:rgba(244,242,238,0.3); font-size:12px; padding:2px 4px; cursor:pointer" data-hover="color:#C98B6B">✕</span></div>';
    }).join('') +
      '<div data-action="add-lesson" style="display:flex; align-items:center; gap:9px; padding:11px 14px; margin:4px 0; border:1px dashed rgba(255,255,255,0.12); border-radius:10px; color:rgba(244,242,238,0.45); font-size:13px; cursor:pointer" data-hover="border-color:rgba(255,255,255,0.25); color:rgba(244,242,238,0.7)"><span style="font-size:15px">＋</span>Добавить урок или задание</div>';
    // блок домашнего задания
    var hwBlock;
    if (m.homework) {
      hwBlock = '<div style="margin:10px 4px 4px; font-family:\'JetBrains Mono\',monospace; font-size:9.5px; letter-spacing:0.06em; color:rgba(244,242,238,0.35)">ДОМАШНЕЕ ЗАДАНИЕ</div>' +
        '<div data-edit-homework="' + m.homework.id + '" style="display:flex; align-items:center; gap:11px; padding:13px 14px; margin:4px 0; border:1px solid rgba(232,131,90,0.25); border-radius:10px; background:rgba(232,131,90,0.05); cursor:pointer" data-hover="border-color:rgba(232,131,90,0.45)">' +
        '<span style="flex:none; width:8px; height:8px; border-radius:50%; background:var(--accent)"></span>' +
        '<span style="flex:1; font-size:13.5px; color:#F4F2EE">' + esc(m.homework.title) + '</span>' +
        '<span style="font-size:11px; color:rgba(244,242,238,0.45)">изменить</span></div>';
    } else {
      hwBlock = '<div data-add-homework="' + m.id + '" style="display:flex; align-items:center; gap:9px; padding:11px 14px; margin:10px 0 4px; border:1px dashed rgba(232,131,90,0.3); border-radius:10px; color:rgba(232,131,90,0.85); font-size:13px; cursor:pointer" data-hover="border-color:rgba(232,131,90,0.5); background:rgba(232,131,90,0.04)"><span style="font-size:15px">＋</span>Добавить домашнее задание</div>';
    }
    return '<div style="border:1px solid rgba(232,131,90,0.3); border-radius:14px; background:#101010; overflow:hidden">' +
      '<div data-builder-module="' + m.id + '" style="display:flex; align-items:center; gap:14px; padding:18px 20px; border-bottom:1px solid rgba(255,255,255,0.06); cursor:pointer">' +
      '<span style="font-family:\'JetBrains Mono\',monospace; font-size:12px; color:var(--accent)">' + m.num + '</span>' +
      '<span style="flex:1; font-family:\'Lora\',serif; font-size:19px; color:#F7F5F1">' + esc(m.title) + '</span>' +
      '<span style="font-size:11px; font-weight:500; color:var(--accent); padding:3px 10px; border-radius:100px; background:rgba(232,131,90,0.12)">редактируется</span>' +
      '<span data-del-module="' + m.id + '" title="Удалить модуль" style="color:rgba(244,242,238,0.35); font-size:13px; padding:2px 4px; cursor:pointer" data-hover="color:#C98B6B">✕</span>' +
      '<span style="color:rgba(244,242,238,0.4)">⌃</span></div>' +
      '<div style="padding:10px 14px">' + lessons + hwBlock + '</div></div>';
  }

  function addHomework(moduleId) {
    var mod = state.builder && state.builder.modules.find(function (m) { return m.id === moduleId; });
    openModal('Новое домашнее задание', [
      { name: 'title', label: 'Название', placeholder: 'Цветовая система для экрана' },
      { name: 'deadline', label: 'Дедлайн', placeholder: '23 июня, 23:59 · осталось 4 дня' },
      { name: 'format', label: 'Формат сдачи', placeholder: 'Figma-файл или PDF · до 25 МБ' },
      { name: 'intro', label: 'Описание', type: 'textarea', placeholder: 'Что нужно сделать студенту' }
    ], function (vals) {
      if (!vals.title) { toast('Нужно название', '#C98B6B'); return false; }
      return api('/admin/homework', { method: 'POST', body: {
        moduleId: moduleId, title: vals.title, deadline: vals.deadline, format: vals.format, intro: vals.intro
      } }).then(function () {
        loadBuilder(); toast('Домашнее задание создано (с критериями оценки)', '#8FA98C');
      }).catch(function (e) { toast(e.message, '#C98B6B'); return false; });
    });
  }

  function editHomework(hwId) {
    var hw = null;
    (state.builder.modules || []).forEach(function (m) { if (m.homework && m.homework.id === hwId) hw = m.homework; });
    if (!hw) return;
    openModal('Изменить домашнее задание', [
      { name: 'title', label: 'Название', value: hw.title },
      { name: 'deadline', label: 'Дедлайн', value: hw.deadline },
      { name: 'format', label: 'Формат сдачи', value: hw.format },
      { name: 'intro', label: 'Описание', type: 'textarea', value: hw.intro }
    ], function (vals) {
      if (!vals.title) { toast('Нужно название', '#C98B6B'); return false; }
      return api('/admin/homework/' + hwId, { method: 'PATCH', body: vals }).then(function () {
        loadBuilder(); toast('Домашнее задание обновлено', '#8FA98C');
      }).catch(function (e) { toast(e.message, '#C98B6B'); return false; });
    });
  }

  /* ============================================================
     CHAT (Socket.IO)
  ============================================================ */
  function initSocket() {
    if (state.socket) return;
    state.socket = io({ withCredentials: true });
    state.socket.on('chat:history', function (p) {
      state.chatStudentId = p.studentId;
      renderChatPartner(p.partner);
      renderChatMessages(p.messages || []);
    });
    state.socket.on('chat:message', function (m) { appendChatMessage(m); });
  }

  function loadChat() {
    if (!state.socket) initSocket();
    state.socket.emit('chat:open', {});
  }

  function renderChatPartner(partner) {
    var head = $('chat-head-name'), init = $('chat-head-init'), role = $('chat-head-role');
    if (!partner) {
      if (head) head.textContent = state.user.role === 'mentor' ? 'Ученик ещё не подключился' : 'Наставник ещё не подключился';
      if (init) init.textContent = '—';
      if (role) role.textContent = '';
      $('chat-partner-panel').innerHTML = '<div style="font-size:13px; line-height:1.6; color:rgba(244,242,238,0.4); text-align:center; padding-top:30px">' +
        (state.user.role === 'mentor' ? 'Как только ученик зарегистрируется и зайдёт, здесь появится переписка.' : 'Наставник скоро появится.') + '</div>';
      return;
    }
    if (head) head.textContent = partner.name;
    if (init) init.textContent = partner.init;
    if (role) role.textContent = partner.role === 'mentor' ? 'ваш наставник' : 'ваш ученик';

    var s = partner.stats || {};
    var statCells = partner.role === 'mentor'
      ? [[s.students != null ? s.students : '—', 'учеников'], [s.reply || '—', 'ответ'], [s.years || '—', 'в дизайне']]
      : [[s.lessonsDone != null ? s.lessonsDone : 0, 'уроков'], [s.homeworksDone != null ? s.homeworksDone : 0, 'домашек'], [s.avgGrade || '—', 'ср. балл']];

    $('chat-partner-panel').innerHTML =
      '<div style="display:flex; flex-direction:column; align-items:center; text-align:center; padding-bottom:26px; border-bottom:1px solid rgba(255,255,255,0.06)">' +
      '<span style="width:76px; height:76px; border-radius:50%; background:' + avatar + '; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:600; color:rgba(244,242,238,0.7)">' + esc(partner.init) + '</span>' +
      '<div style="font-family:\'Lora\',serif; font-size:21px; margin:15px 0 4px; color:#F7F5F1">' + esc(partner.name) + '</div>' +
      '<div style="font-size:12.5px; color:rgba(244,242,238,0.45)">' + esc(partner.subtitle || '') + '</div></div>' +
      '<div style="display:flex; padding:22px 0; border-bottom:1px solid rgba(255,255,255,0.06)">' +
      statCells.map(function (c, i) {
        return '<div style="flex:1; text-align:center;' + (i ? ' border-left:1px solid rgba(255,255,255,0.06)' : '') + '"><div style="font-family:\'Lora\',serif; font-size:22px; color:#F7F5F1">' + esc(c[0]) + '</div><div style="font-size:11px; color:rgba(244,242,238,0.4); margin-top:4px">' + c[1] + '</div></div>';
      }).join('') + '</div>' +
      (partner.bio ? '<div style="padding:22px 0"><div style="font-size:13.5px; line-height:1.65; color:rgba(244,242,238,0.6)">' + esc(partner.bio) + '</div></div>' : '');
  }

  function chatBubble(m) {
    var me = (state.user.role === 'student' && m.from === 'student') || (state.user.role === 'mentor' && m.from === 'mentor');
    var align = me ? 'flex-end' : 'flex-start';
    var bg = me ? '#F4F2EE' : '#161616';
    var color = me ? '#0B0B0B' : '#EDEAE4';
    var radius = me ? '14px 14px 4px 14px' : '14px 14px 14px 4px';
    var file = '';
    if (m.file) {
      file = '<div style="display:flex; align-items:center; gap:10px; margin-top:10px; padding:9px 11px; border-radius:9px; background:rgba(0,0,0,0.18); border:1px solid rgba(255,255,255,0.06)">' +
        '<span style="flex:none; width:28px; height:28px; border-radius:7px; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; font-family:\'JetBrains Mono\',monospace; font-size:8.5px; color:var(--accent)">FIG</span>' +
        '<span style="flex:1; min-width:0"><span style="display:block; font-size:12.5px; font-weight:600">' + esc(m.file.name) + '</span><span style="display:block; font-size:11px; opacity:0.6">' + esc(m.file.meta) + '</span></span>' +
        '<span style="flex:none; opacity:0.55">↓</span></div>';
    }
    var time = m.time || formatTime(m.ts);
    return '<div style="display:flex; flex-direction:column; align-items:' + align + '; max-width:100%">' +
      '<div style="max-width:64%; padding:11px 15px; border-radius:' + radius + '; background:' + bg + '; color:' + color + '; font-size:14px; line-height:1.5">' + esc(m.text) + file + '</div>' +
      '<span style="font-size:10.5px; color:rgba(244,242,238,0.3); margin:5px 4px 0">' + esc(time) + '</span></div>';
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function renderChatMessages(msgs) {
    $('chat-messages').innerHTML = msgs.map(chatBubble).join('');
    scrollChat();
  }
  function appendChatMessage(m) {
    $('chat-messages').insertAdjacentHTML('beforeend', chatBubble(m));
    scrollChat();
  }
  function scrollChat() {
    var scroller = $('chat-messages').parentNode;
    scroller.scrollTop = scroller.scrollHeight;
  }
  function sendChat() {
    var inp = $('chat-input');
    if (!inp) return;
    var text = inp.value.trim();
    if (!text) return;
    if (state.user.role === 'mentor' && !state.chatStudentId) { toast('Ученик ещё не подключился', '#C98B6B'); return; }
    var payload = { text: text };
    if (state.user.role === 'mentor') payload.studentId = state.chatStudentId;
    state.socket.emit('chat:send', payload);
    inp.value = '';
  }

  /* ============================================================
     HOVER (повтор style-hover)
  ============================================================ */
  function parseStyle(text) {
    var out = {};
    (text || '').split(';').forEach(function (d) {
      var i = d.indexOf(':');
      if (i > -1) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    });
    return out;
  }
  function bindHover(el) {
    if (el._hoverBound) return;
    el._hoverBound = true;
    var hover = parseStyle(el.getAttribute('data-hover'));
    var saved = {};
    el.addEventListener('mouseenter', function () {
      for (var k in hover) { saved[k] = el.style.getPropertyValue(k); el.style.setProperty(k, hover[k]); }
    });
    el.addEventListener('mouseleave', function () {
      for (var k in hover) { el.style.setProperty(k, saved[k]); }
    });
  }
  function bindHoversIn(root) {
    var nodes = (root || document).querySelectorAll('[data-hover]');
    for (var i = 0; i < nodes.length; i++) bindHover(nodes[i]);
  }

  /* ============================================================
     ОБРАБОТЧИКИ
  ============================================================ */
  var pendingFile = null;

  function onClick(e) {
    var t = e.target;
    while (t && t !== document) {
      if (t.hasAttribute) {
        if (t.hasAttribute('data-nav')) { setScreen(t.getAttribute('data-nav')); return; }
        if (t.hasAttribute('data-tab')) { setQueueTab(t.getAttribute('data-tab')); return; }
        if (t.hasAttribute('data-action')) {
          if (t.getAttribute('data-action') === 'player-seek') { playerSeek(e, t); return; }
          handleAction(t.getAttribute('data-action')); return;
        }
        if (t.hasAttribute('data-toggle-lesson')) { toggleLessonPublish(t.getAttribute('data-toggle-lesson'), t.getAttribute('data-status')); return; }
        if (t.hasAttribute('data-del-lesson')) { deleteLesson(t.getAttribute('data-del-lesson')); return; }
        if (t.hasAttribute('data-del-module')) { deleteModule(t.getAttribute('data-del-module')); return; }
        if (t.hasAttribute('data-add-homework')) { addHomework(t.getAttribute('data-add-homework')); return; }
        if (t.hasAttribute('data-edit-homework')) { editHomework(t.getAttribute('data-edit-homework')); return; }
        if (t.hasAttribute('data-builder-module')) {
          var bid = t.getAttribute('data-builder-module');
          state.builder.expandedId = (state.builder.expandedId === bid) ? null : bid;
          renderBuilderModules(); return;
        }
        if (t.hasAttribute('data-open-lesson')) { openLesson(t.getAttribute('data-open-lesson')); return; }
        if (t.hasAttribute('data-material')) { window.location.href = '/api/material/' + t.getAttribute('data-material') + '/download'; return; }
        if (t.hasAttribute('data-palette')) { var pid = t.getAttribute('data-palette'); closePalette(); setScreen(pid); return; }
        if (t.hasAttribute('data-checkitem')) { toggleChecklist(t); return; }
        if (t.hasAttribute('data-score-dec')) { adjustScore(t.getAttribute('data-score-dec'), -1); return; }
        if (t.hasAttribute('data-score-inc')) { adjustScore(t.getAttribute('data-score-inc'), +1); return; }
        if (t.hasAttribute('data-verdict')) { submitReview(t.getAttribute('data-verdict')); return; }
        if (t.hasAttribute('data-queue-item')) {
          if (t.getAttribute('data-real') === '1') { highlightQueueItem(t); openSubmission(t.getAttribute('data-queue-item')); }
          else flashQueueStatus('Это демо-работа без файла', '#C98B6B');
          return;
        }
        if (t.id === 'auth-switch') { setAuthMode(authMode === 'login' ? 'register' : 'login'); return; }
        if (t.classList && t.classList.contains('auth-role')) { selectAuthRole(t); return; }
      }
      t = t.parentNode;
    }
  }

  function handleAction(action) {
    switch (action) {
      case 'logout': return logout();
      case 'lesson-cta': return lessonCTA();
      case 'open-current-lesson': return openCurrentLesson();
      case 'pick-file': return $('homework-file').click();
      case 'submit-hw': return submitHomework();
      case 'add-portfolio': return addPortfolioModal();
      case 'portfolio-share': return portfolioShare();
      case 'edit-profile': return editProfile();
      case 'search': return openPalette();
      case 'join-call': return joinCall();
      case 'player-toggle': return playerToggle();
      case 'player-speed': return playerSpeed();
      case 'player-fs': return playerFullscreen();
      case 'builder-publish': return builderPublish();
      case 'builder-save': return builderSave();
      case 'builder-unpublish': return builderUnpublish();
      case 'add-module': return addModule();
      case 'add-lesson': return addLesson();
      case 'add-material': return addMaterial();
      case 'queue-tab': return; // обрабатывается ниже по data-tab
      case 'open-fig': return openFig();
      case 'attach-example': return attachExample();
      case 'chat-attach': return chatAttach();
    }
  }

  function toggleChecklist(el) {
    var id = el.getAttribute('data-checkitem');
    var span = el.querySelector('span');
    var done = !(span.textContent === '✓');
    var lid = (state.lessonData && state.lessonData.lesson.id) || state.currentLessonId;
    if (!lid) return;
    api('/lesson/' + lid + '/checklist', { method: 'POST', body: { itemId: id, done: done } })
      .then(function () { loadLesson(); }).catch(noop);
  }

  function submitHomework() {
    if (!state.currentHomeworkId) { toast('Нет активного задания', '#C98B6B'); return; }
    if (!pendingFile) { $('homework-file').click(); return; }
    var fd = new FormData();
    fd.append('file', pendingFile);
    var hint = $('homework-hint');
    if (hint) { hint.textContent = 'Загрузка…'; hint.style.color = 'rgba(244,242,238,0.6)'; }
    fetch('/api/homework/' + state.currentHomeworkId + '/submit', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
      .then(function (res) {
        pendingFile = null;
        renderHomeworkSubmit(res.submission);
        var h = $('homework-hint');
        if (h) { h.textContent = 'Отправлено! Наставник получил уведомление.'; h.style.color = '#8FA98C'; }
      })
      .catch(function (e) { var h = $('homework-hint'); if (h) { h.textContent = e.message; h.style.color = '#C98B6B'; } });
  }

  function addPortfolio() {
    var title = prompt('Название кейса:');
    if (!title) return;
    var tag = prompt('Тег (например «Личный проект»):') || 'Личный проект';
    api('/portfolio', { method: 'POST', body: { title: title, tag: tag, meta: 'Новый кейс' } })
      .then(function () { loadPortfolio(); }).catch(noop);
  }

  function selectAuthRole(el) {
    authRole = el.getAttribute('data-role');
    $('auth-invite-row').style.display = authMode === 'register' && authRole === 'mentor' ? 'block' : 'none';
    $('auth-mentor-invite').value = '';
    document.querySelectorAll('.auth-role').forEach(function (b) {
      var on = b === el;
      b.classList.toggle('is-on', on);
      b.style.border = on ? '1px solid rgba(232,131,90,0.4)' : '1px solid rgba(255,255,255,0.1)';
      b.style.background = on ? 'rgba(232,131,90,0.08)' : 'transparent';
      b.style.color = on ? '#F4F2EE' : 'rgba(244,242,238,0.6)';
    });
  }

  function highlightQueueItem(el) {
    document.querySelectorAll('[data-queue-item]').forEach(function (n) {
      n.style.border = '1px solid rgba(255,255,255,0.07)'; n.style.background = '#0F0F0F';
    });
    el.style.border = '1px solid rgba(232,131,90,0.4)'; el.style.background = 'rgba(232,131,90,0.05)';
  }

  /* ============================================================
     ТОСТЫ
  ============================================================ */
  function toast(msg, color) {
    var wrap = $('toast-wrap');
    var el = document.createElement('div');
    el.setAttribute('style', 'pointer-events:auto; min-width:220px; max-width:340px; padding:13px 16px; border-radius:12px; background:#161616; border:1px solid rgba(255,255,255,0.1); color:#F4F2EE; font-size:13.5px; line-height:1.45; box-shadow:0 16px 40px rgba(0,0,0,0.5); opacity:0; transform:translateY(8px); transition:opacity .2s,transform .2s; border-left:3px solid ' + (color || ACCENT));
    el.textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
    setTimeout(function () {
      el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 250);
    }, 3200);
  }

  /* ============================================================
     МОДАЛКА (форма)
  ============================================================ */
  function openModal(title, fields, onSave) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = fields.map(function (f) {
      var input = f.type === 'textarea'
        ? '<textarea id="mf-' + f.name + '" rows="3" placeholder="' + esc(f.placeholder || '') + '" style="width:100%; padding:11px 14px; border:1px solid rgba(255,255,255,0.1); border-radius:10px; background:#0B0B0B; color:#F4F2EE; font-family:\'Onest\',sans-serif; font-size:14px; outline:none; resize:vertical; box-sizing:border-box">' + esc(f.value || '') + '</textarea>'
        : '<input id="mf-' + f.name + '" type="text" value="' + esc(f.value || '') + '" placeholder="' + esc(f.placeholder || '') + '" style="width:100%; padding:11px 14px; border:1px solid rgba(255,255,255,0.1); border-radius:10px; background:#0B0B0B; color:#F4F2EE; font-family:\'Onest\',sans-serif; font-size:14px; outline:none; box-sizing:border-box">';
      return '<div style="display:flex; flex-direction:column; gap:6px"><label style="font-size:12px; color:rgba(244,242,238,0.45)">' + esc(f.label) + '</label>' + input + '</div>';
    }).join('');
    var modal = $('modal');
    modal.style.display = 'flex';
    var first = $('modal-body').querySelector('input,textarea');
    if (first) setTimeout(function () { first.focus(); }, 30);

    var ok = $('modal-ok');
    ok.textContent = 'Сохранить'; ok.style.background = '#F4F2EE'; ok.style.color = '#0B0B0B';
    function close() { modal.style.display = 'none'; ok.onclick = null; $('modal-cancel').onclick = null; }
    $('modal-cancel').onclick = close;
    ok.onclick = function () {
      var vals = {};
      fields.forEach(function (f) { var el = $('mf-' + f.name); vals[f.name] = el ? el.value.trim() : ''; });
      Promise.resolve(onSave(vals)).then(function (r) { if (r !== false) close(); });
    };
  }

  function openConfirm(title, message, okLabel, onOk) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = '<div style="font-size:14px; line-height:1.6; color:rgba(244,242,238,0.7)">' + esc(message) + '</div>';
    var modal = $('modal');
    modal.style.display = 'flex';
    var ok = $('modal-ok');
    ok.textContent = okLabel || 'Удалить';
    ok.style.background = '#C98B6B'; ok.style.color = '#0B0B0B';
    function close() { modal.style.display = 'none'; ok.onclick = null; $('modal-cancel').onclick = null; ok.style.background = '#F4F2EE'; }
    $('modal-cancel').onclick = close;
    ok.onclick = function () { Promise.resolve(onOk()).then(function (r) { if (r !== false) close(); }); };
  }

  function deleteModule(id) {
    var mod = state.builder && state.builder.modules.find(function (m) { return m.id === id; });
    var name = mod ? mod.title : 'модуль';
    var lessonCount = mod ? mod.lessons.length : 0;
    var msg = 'Удалить модуль «' + name + '»' + (lessonCount ? ' и его уроки (' + lessonCount + ')' : '') + '? Это действие необратимо.';
    openConfirm('Удалить модуль', msg, 'Удалить', function () {
      return api('/admin/module/' + id, { method: 'DELETE' }).then(function () {
        if (state.builder && state.builder.expandedId === id) state.builder.expandedId = null;
        loadBuilder();
        toast('Модуль «' + name + '» удалён', '#C98B6B');
      }).catch(function (e) { toast(e.message, '#C98B6B'); return false; });
    });
  }

  /* ============================================================
     КОМАНДНАЯ ПАЛИТРА (поиск)
  ============================================================ */
  var PALETTE_ITEMS = {
    student: [
      { id: 'dashboard', label: 'Главная', icon: 'grid' }, { id: 'course', label: 'Программа', icon: 'list' },
      { id: 'lesson', label: 'Урок', icon: 'play' }, { id: 'homework', label: 'Домашка', icon: 'task' },
      { id: 'review', label: 'Проверка', icon: 'check' }, { id: 'chat', label: 'Чат', icon: 'chat' },
      { id: 'portfolio', label: 'Портфолио', icon: 'grid2' }, { id: 'profile', label: 'Профиль', icon: 'user' }
    ],
    mentor: [
      { id: 'admin', label: 'Обзор', icon: 'grid' }, { id: 'queue', label: 'Очередь проверки', icon: 'check' },
      { id: 'builder', label: 'Конструктор курса', icon: 'list' }, { id: 'chat', label: 'Чат', icon: 'chat' }
    ]
  };
  function openPalette() {
    var pal = $('palette');
    pal.style.display = 'flex';
    var inp = $('palette-input');
    inp.value = '';
    renderPalette('');
    setTimeout(function () { inp.focus(); }, 30);
  }
  function closePalette() { $('palette').style.display = 'none'; }
  function renderPalette(q) {
    var items = (PALETTE_ITEMS[state.user.role] || []).filter(function (i) {
      return i.label.toLowerCase().indexOf(q.toLowerCase()) > -1;
    });
    $('palette-list').innerHTML = items.map(function (i, idx) {
      return '<div data-palette="' + i.id + '" style="display:flex; align-items:center; gap:12px; padding:11px 13px; border-radius:10px; cursor:pointer; color:' + (idx === 0 ? '#F4F2EE' : 'rgba(244,242,238,0.7)') + '; background:' + (idx === 0 ? 'rgba(255,255,255,0.05)' : 'transparent') + '" data-hover="background:rgba(255,255,255,0.05); color:#F4F2EE">' +
        '<span style="flex:none; display:flex; width:16px; height:16px; color:rgba(244,242,238,0.5)">' + icon(i.icon) + '</span><span>' + i.label + '</span></div>';
    }).join('') || '<div style="padding:14px; font-size:13px; color:rgba(244,242,238,0.4)">Ничего не найдено</div>';
    bindHoversIn($('palette-list'));
  }

  /* ============================================================
     ВИДЕОПЛЕЕР (симуляция)
  ============================================================ */
  var player = { playing: false, cur: 0, dur: 848, speed: 1, timer: null };
  var SPEEDS = [1, 1.25, 1.5, 2, 0.75];
  function fmt(s) { s = Math.max(0, Math.floor(s)); return ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2); }
  function playerRender() {
    var pct = (player.cur / player.dur) * 100;
    var fill = $('player-fill'), handle = $('player-handle'), time = $('player-time'), bigicon = $('player-bigicon'), stateIcon = $('player-state');
    if (fill) fill.style.width = pct + '%';
    if (handle) handle.style.left = pct + '%';
    if (time) time.textContent = fmt(player.cur) + ' / ' + fmt(player.dur);
    if (stateIcon) stateIcon.textContent = player.playing ? '⏸' : '▶';
    if (bigicon) {
      if (player.playing) { bigicon.style.borderLeft = ''; bigicon.style.borderTop = ''; bigicon.style.borderBottom = ''; bigicon.textContent = ''; bigicon.style.cssText = 'width:6px;height:18px;border-left:5px solid #0B0B0B;border-right:5px solid #0B0B0B;margin-left:0'; }
      else { bigicon.textContent = ''; bigicon.style.cssText = 'border-left:17px solid #0B0B0B;border-top:11px solid transparent;border-bottom:11px solid transparent;margin-left:4px'; }
    }
  }
  function playerToggle() {
    player.playing = !player.playing;
    if (player.playing) {
      player.timer = setInterval(function () {
        player.cur += 0.25 * player.speed;
        if (player.cur >= player.dur) { player.cur = player.dur; playerPause(); }
        playerRender();
      }, 250);
    } else playerPause();
    playerRender();
  }
  function playerPause() { player.playing = false; if (player.timer) { clearInterval(player.timer); player.timer = null; } }
  function playerSeek(e, el) {
    var rect = el.getBoundingClientRect();
    var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    player.cur = ratio * player.dur;
    playerRender();
  }
  function playerSpeed() {
    var i = (SPEEDS.indexOf(player.speed) + 1) % SPEEDS.length;
    player.speed = SPEEDS[i];
    var el = $('player-speed'); if (el) el.textContent = player.speed.toFixed(player.speed % 1 ? 2 : 1).replace(/0$/, '') + '×';
  }
  function playerFullscreen() {
    var p = $('player');
    if (!document.fullscreenElement && p && p.requestFullscreen) p.requestFullscreen().catch(function () { toast('Полноэкранный режим недоступен'); });
    else if (document.exitFullscreen) document.exitFullscreen();
  }

  /* ============================================================
     ДЕЙСТВИЯ ВТОРИЧНЫХ КНОПОК
  ============================================================ */
  function editProfile() {
    api('/profile').then(function (d) {
      var u = d.user;
      openModal('Редактировать профиль', [
        { name: 'name', label: 'Имя и фамилия', value: u.name },
        { name: 'city', label: 'Город', value: u.city || '', placeholder: 'Москва' },
        { name: 'bio', label: 'О себе', type: 'textarea', value: u.bio || '', placeholder: 'Пара слов о себе' }
      ], function (vals) {
        if (!vals.name) { toast('Имя не может быть пустым', '#C98B6B'); return false; }
        return api('/profile', { method: 'PATCH', body: vals }).then(function (r) {
          state.user = r.user; renderSidebarUser(r.user); loadProfile();
          toast('Профиль обновлён', '#8FA98C');
        });
      });
    }).catch(noop);
  }

  function portfolioShare() {
    var link = location.origin + '/#portfolio-' + state.user.id;
    function done() { toast('Ссылка на портфолио скопирована', '#8FA98C'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, done);
    else done();
  }

  function addPortfolioModal() {
    openModal('Новый кейс', [
      { name: 'title', label: 'Название', placeholder: 'Редизайн дашборда' },
      { name: 'tag', label: 'Тег', placeholder: 'Личный проект' },
      { name: 'meta', label: 'Подпись', placeholder: 'UI · 6 экранов' }
    ], function (vals) {
      if (!vals.title) { toast('Нужно название', '#C98B6B'); return false; }
      return api('/portfolio', { method: 'POST', body: vals }).then(function () {
        loadPortfolio(); toast('Кейс добавлен', '#8FA98C');
      });
    });
  }

  // конструктор
  function expandedModule() {
    return state.builder && state.builder.modules.find(function (m) { return m.id === state.builder.expandedId; });
  }
  function renderBuilderInspector(mod) {
    var insp = $('builder-inspector');
    if (!insp) return;
    if (!mod) { insp.style.display = 'none'; return; }
    insp.style.display = 'block';
    var pub = (mod.lessons || []).filter(function (l) { return l.status === 'Опубликован'; }).length;
    var total = (mod.lessons || []).length;
    var mono = "font-family:'JetBrains Mono',monospace";
    insp.innerHTML =
      '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px"><span style="' + mono + '; font-size:10.5px; letter-spacing:0.06em; color:rgba(244,242,238,0.4)">СВОДКА МОДУЛЯ</span><span style="font-size:11px; color:' + (mod.published ? '#8FA98C' : 'rgba(244,242,238,0.45)') + '">' + (mod.published ? 'опубликован' : 'черновик') + '</span></div>' +
      '<div style="font-family:\'Lora\',serif; font-size:20px; color:#F7F5F1; margin-bottom:18px; line-height:1.25">' + esc(mod.title) + '</div>' +
      '<div style="display:flex; gap:10px; margin-bottom:16px">' +
      '<div style="flex:1; border:1px solid rgba(255,255,255,0.07); border-radius:11px; background:#0B0B0B; padding:14px"><div style="font-family:\'Lora\',serif; font-size:24px; color:#F7F5F1">' + total + '</div><div style="font-size:11px; color:rgba(244,242,238,0.4); margin-top:4px">' + plural(total, 'урок', 'урока', 'уроков') + '</div></div>' +
      '<div style="flex:1; border:1px solid rgba(255,255,255,0.07); border-radius:11px; background:#0B0B0B; padding:14px"><div style="font-family:\'Lora\',serif; font-size:24px; color:#8FA98C">' + pub + '</div><div style="font-size:11px; color:rgba(244,242,238,0.4); margin-top:4px">опубл.</div></div></div>' +
      '<div style="display:flex; align-items:center; gap:10px; padding:12px 14px; border:1px solid ' + (mod.homework ? 'rgba(232,131,90,0.25)' : 'rgba(255,255,255,0.08)') + '; border-radius:10px; background:' + (mod.homework ? 'rgba(232,131,90,0.05)' : '#0B0B0B') + '; margin-bottom:20px"><span style="flex:none; width:8px; height:8px; border-radius:50%; background:' + (mod.homework ? 'var(--accent)' : 'rgba(244,242,238,0.3)') + '"></span><span style="flex:1; font-size:12.5px; color:rgba(244,242,238,0.7)">' + (mod.homework ? esc(mod.homework.title) : 'Домашнего задания нет') + '</span></div>' +
      '<div style="display:flex; gap:10px"><button data-action="builder-unpublish" style="flex:1; padding:12px; border:1px solid rgba(255,255,255,0.12); border-radius:10px; background:transparent; color:rgba(244,242,238,0.65); font-family:\'Onest\',sans-serif; font-size:13px; cursor:pointer" data-hover="border-color:rgba(255,255,255,0.25)">Снять с публ.</button><button data-action="builder-publish" style="flex:1; padding:12px; border:none; border-radius:10px; background:#F4F2EE; color:#0B0B0B; font-family:\'Onest\',sans-serif; font-size:13px; font-weight:600; cursor:pointer" data-hover="opacity:0.92">Опубликовать</button></div>';
    bindHoversIn(insp);
  }
  function builderPublish() {
    var mid = state.builder && state.builder.expandedId;
    if (!mid) { toast('Откройте модуль, который хотите опубликовать', '#C98B6B'); return; }
    api('/admin/publish', { method: 'POST', body: { moduleId: mid } }).then(function (r) {
      $('builder-savestate').textContent = 'опубликовано только что';
      loadBuilder();
      toast(r.published ? ('Опубликовано уроков: ' + r.published + ' — ученик их увидит') : 'Все уроки модуля уже опубликованы', '#8FA98C');
    }).catch(function (e) { toast(e.message, '#C98B6B'); });
  }
  // кнопки инспектора работают на открытый модуль (публикация всех его уроков)
  function builderSave() { builderPublish(); }
  function builderUnpublish() {
    var mod = expandedModule();
    if (!mod) { toast('Откройте модуль', '#C98B6B'); return; }
    Promise.all((mod.lessons || []).map(function (l) {
      return api('/admin/lesson/' + l.id, { method: 'PATCH', body: { status: 'Черновик' } });
    })).then(function () { loadBuilder(); toast('Уроки модуля сняты с публикации', ACCENT); })
      .catch(function (e) { toast(e.message, '#C98B6B'); });
  }
  function toggleLessonPublish(id, status) {
    var next = status === 'Опубликован' ? 'Черновик' : 'Опубликован';
    api('/admin/lesson/' + id, { method: 'PATCH', body: { status: next } }).then(function () {
      loadBuilder();
      toast(next === 'Опубликован' ? 'Урок опубликован — ученик его увидит' : 'Урок снят с публикации', next === 'Опубликован' ? '#8FA98C' : ACCENT);
    }).catch(function (e) { toast(e.message, '#C98B6B'); });
  }
  function deleteLesson(id) {
    var mod = expandedModule();
    var l = mod && mod.lessons.find(function (x) { return x.id === id; });
    openConfirm('Удалить урок', 'Удалить урок «' + (l ? l.title : '') + '»? Это действие необратимо.', 'Удалить', function () {
      return api('/admin/lesson/' + id, { method: 'DELETE' }).then(function () {
        loadBuilder(); toast('Урок удалён', '#C98B6B');
      }).catch(function (e) { toast(e.message, '#C98B6B'); return false; });
    });
  }
  function addModule() {
    openModal('Новый модуль', [{ name: 'title', label: 'Название модуля', placeholder: 'Анимация интерфейсов' }], function (vals) {
      if (!vals.title) { toast('Нужно название', '#C98B6B'); return false; }
      return api('/admin/module', { method: 'POST', body: { title: vals.title } }).then(function (r) {
        if (state.builder) state.builder.expandedId = r.module.id; // развернём новый модуль
        loadBuilder();
        toast('Модуль «' + r.module.title + '» добавлен', '#8FA98C');
      });
    });
  }
  function addLesson() {
    var mid = (state.builder && state.builder.expandedId) || 'm3';
    var mod = state.builder && state.builder.modules.find(function (m) { return m.id === mid; });
    var num = mod ? mod.num : '03';
    openModal('Новый урок или задание', [
      { name: 'title', label: 'Название', placeholder: 'Контраст и доступность' },
      { name: 'kind', label: 'Тип (Видео или Задание)', value: 'Видео' }
    ], function (vals) {
      if (!vals.title) { toast('Нужно название', '#C98B6B'); return false; }
      return api('/admin/lesson', { method: 'POST', body: { moduleId: mid, title: vals.title, kind: vals.kind } }).then(function () {
        loadBuilder(); toast('Урок добавлен в модуль ' + num, '#8FA98C');
      });
    });
  }
  function addMaterial() { toast('Добавление материалов — в инспекторе урока', ACCENT); }

  // очередь
  var queueTab = 'new';
  function setQueueTab(tab) {
    queueTab = tab;
    var n = $('queue-tab-new'), a = $('queue-tab-all');
    if (tab === 'new') {
      n.style.cssText = 'font-size:12px; color:#0B0B0B; background:#F4F2EE; padding:5px 12px; border-radius:100px; font-weight:600; cursor:pointer';
      a.style.cssText = 'font-size:12px; color:rgba(244,242,238,0.55); padding:5px 12px; border-radius:100px; border:1px solid rgba(255,255,255,0.1); cursor:pointer';
    } else {
      a.style.cssText = 'font-size:12px; color:#0B0B0B; background:#F4F2EE; padding:5px 12px; border-radius:100px; font-weight:600; cursor:pointer';
      n.style.cssText = 'font-size:12px; color:rgba(244,242,238,0.55); padding:5px 12px; border-radius:100px; border:1px solid rgba(255,255,255,0.1); cursor:pointer';
    }
    renderQueueList();
  }
  function renderQueueList() {
    var items = state.queue.items || [];
    var shown = queueTab === 'new' ? items.filter(function (q) { return q.isNew; }) : items;
    $('queue-list').innerHTML = shown.map(function (q, idx) {
      var sel = q.id === state.queue.subId || (idx === 0 && !state.queue.subId);
      var bd = sel ? 'rgba(232,131,90,0.4)' : 'rgba(255,255,255,0.07)';
      var bg = sel ? 'rgba(232,131,90,0.05)' : '#0F0F0F';
      return '<div data-queue-item="' + q.id + '" data-real="' + (q.real ? '1' : '0') + '" style="border:1px solid ' + bd + '; background:' + bg + '; border-radius:13px; padding:15px 16px; cursor:pointer; transition:border-color .2s" data-hover="border-color:rgba(255,255,255,0.2)">' +
        '<div style="display:flex; align-items:center; gap:11px; margin-bottom:10px"><span style="flex:none; width:30px; height:30px; border-radius:50%; background:' + avatar + '; border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:600; color:rgba(244,242,238,0.7)">' + esc(q.init) + '</span>' +
        '<span style="flex:1; font-size:13.5px; font-weight:600; color:#F4F2EE">' + esc(q.student) + '</span>' +
        '<span style="flex:none; font-size:10.5px; font-weight:500; color:' + q.sc + '; padding:3px 9px; border-radius:100px; background:' + q.sb + '">' + esc(q.kind) + '</span></div>' +
        '<div style="font-size:12.5px; color:rgba(244,242,238,0.55)">' + esc(q.task) + '</div>' +
        '<div style="font-size:11.5px; color:rgba(244,242,238,0.35); margin-top:6px">сдано ' + esc(q.waiting) + '</div></div>';
    }).join('') || '<div style="font-size:13px; color:rgba(244,242,238,0.4); padding:12px">Нет работ в этой вкладке.</div>';
    bindHoversIn($('queue-list'));
  }
  function openFig() {
    if (state.queue.fileUrl) { window.open(state.queue.fileUrl, '_blank'); }
    else { toast('Файл работы недоступен', '#C98B6B'); }
  }
  function attachExample() { toast('Пример прикреплён к ревью', '#8FA98C'); }

  // чат-вложение
  function chatAttach() { $('chat-file').click(); }
  function chatUploadFile(file) {
    var fd = new FormData(); fd.append('file', file);
    toast('Загрузка файла…', ACCENT);
    fetch('/api/chat/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error); return j; }); })
      .then(function (res) {
        if (state.user.role === 'mentor' && !state.chatStudentId) { toast('Ученик ещё не подключился', '#C98B6B'); return; }
        var payload = { text: '', file: res.file };
        if (state.user.role === 'mentor') payload.studentId = state.chatStudentId;
        state.socket.emit('chat:send', payload);
      })
      .catch(function (e) { toast(e.message, '#C98B6B'); });
  }

  function joinCall() { toast('Ссылка на созвон скопирована — откройте в Zoom/Meet', '#8FA98C'); }

  /* ============================================================
     INIT
  ============================================================ */
  function init() {
    document.addEventListener('click', onClick);
    bindHoversIn(document);
    $('auth-form').addEventListener('submit', submitAuth);
    $('mobile-menu-btn').addEventListener('click', function () {
      if ($('sidebar').classList.contains('open')) closeDrawer(); else openDrawer();
    });
    $('mobile-backdrop').addEventListener('click', closeDrawer);
    setupChatComposer();

    $('homework-file').addEventListener('change', function (e) {
      pendingFile = e.target.files[0] || null;
      if (pendingFile) {
        var hint = $('homework-hint');
        if (hint) { hint.textContent = 'Выбран: ' + pendingFile.name + ' — нажмите «Отправить»'; hint.style.color = 'rgba(244,242,238,0.6)'; }
      }
    });

    // вложение в чат
    $('chat-file').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (f) chatUploadFile(f); e.target.value = '';
    });

    // командная палитра: фильтрация и Enter
    $('palette-input').addEventListener('input', function (e) { renderPalette(e.target.value); });
    $('palette-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var first = $('palette-list').querySelector('[data-palette]');
        if (first) { closePalette(); setScreen(first.getAttribute('data-palette')); }
      } else if (e.key === 'Escape') closePalette();
    });

    // закрытие модалки/палитры по клику на фон
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) $('modal').style.display = 'none'; });
    $('palette').addEventListener('click', function (e) { if (e.target === $('palette')) closePalette(); });

    // горячие клавиши
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault(); if (state.user) openPalette();
      } else if (e.key === 'Escape') {
        if ($('palette').style.display === 'flex') closePalette();
        if ($('modal').style.display === 'flex') $('modal').style.display = 'none';
      }
    });

    api('/auth/me').then(function (r) {
      if (r.user) enterApp(r.user);
      else showGate('login');
    }).catch(function () { showGate('login'); });
  }

  function setupChatComposer() {
    var section = document.querySelector('.screen[data-screen="chat"]');
    if (!section) return;
    var spans = Array.prototype.slice.call(section.querySelectorAll('span'));
    var placeholderSpan = spans.filter(function (s) { return /Написать сообщение/.test(s.textContent); })[0];
    if (placeholderSpan) {
      var input = document.createElement('input');
      input.id = 'chat-input';
      input.type = 'text';
      input.placeholder = 'Написать сообщение…';
      input.setAttribute('style', "flex:1; font-size:14px; color:#F4F2EE; background:transparent; border:none; outline:none; font-family:'Onest',sans-serif");
      placeholderSpan.parentNode.replaceChild(input, placeholderSpan);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } });
      var sendBtn = input.parentNode.querySelector('button');
      if (sendBtn) sendBtn.addEventListener('click', sendChat);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
