(function () {
  var DB_NAME = 'readfox-offline';
  var STORE_NAME = 'state';
  var STATE_KEY = 'offline-v1';
  var USER_KEY = 'readfox-offline-user';

  var appEl = document.getElementById('app');
  var headingEl = document.getElementById('heading');
  var statusEl = document.getElementById('status');
  var retryBtn = document.getElementById('retry');

  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      window.location.reload();
    });
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function readState() {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var getReq = tx.objectStore(STORE_NAME).get(STATE_KEY);
        getReq.onsuccess = function () {
          try {
            var parsed = JSON.parse(getReq.result || '');
            resolve(parsed && parsed.version === 1 ? parsed : { version: 1, lessons: [], queue: [] });
          } catch (_) {
            resolve({ version: 1, lessons: [], queue: [] });
          }
        };
        getReq.onerror = function () {
          resolve({ version: 1, lessons: [], queue: [] });
        };
      });
    });
  }

  function writeState(state) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(JSON.stringify(state), STATE_KEY);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  var activeUser = null;
  try {
    activeUser = localStorage.getItem(USER_KEY);
  } catch (_) {}

  function renderList(state) {
    headingEl.textContent = 'Recent lessons';
    var lessons = (state.lessons || []).filter(function (l) {
      return activeUser && l.userId === activeUser;
    });
    appEl.innerHTML = '';

    if (lessons.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'card muted';
      empty.textContent = 'No offline lessons cached for this account yet.';
      appEl.appendChild(empty);
      return;
    }

    lessons.forEach(function (lesson) {
      var card = document.createElement('div');
      card.className = 'card';
      var title = document.createElement('div');
      title.style.fontWeight = '700';
      title.textContent = lesson.title;
      var meta = document.createElement('div');
      meta.className = 'muted';
      meta.style.margin = '4px 0 10px';
      meta.textContent = lesson.language;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Read offline';
      btn.addEventListener('click', function () {
        renderLesson(state, lesson);
      });
      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(btn);
      appEl.appendChild(card);
    });
  }

  function renderLesson(state, lesson) {
    headingEl.textContent = lesson.title;
    appEl.innerHTML = '';

    var back = document.createElement('button');
    back.type = 'button';
    back.textContent = '← All cached lessons';
    back.style.marginBottom = '12px';
    back.addEventListener('click', function () {
      renderList(state);
    });
    appEl.appendChild(back);

    var article = document.createElement('article');
    article.className = 'card reader';
    article.setAttribute('lang', lesson.language || 'en');

    var parts = (lesson.text || '').split(/(\s+)/);
    parts.forEach(function (part) {
      if (!part.trim()) {
        article.appendChild(document.createTextNode(part));
        return;
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'word';
      btn.textContent = part;
      btn.addEventListener('click', function () {
        var cleaned = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        if (!cleaned || !activeUser) return;
        state.queue = state.queue || [];
        state.queue.push({
          userId: activeUser,
          vocabId:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : 'offline-' + Date.now() + '-' + Math.random().toString(16).slice(2),
          text: cleaned,
          type: 'word',
          sentence: cleaned,
          language: lesson.language || 'en',
          lessonId: lesson.id,
          createdAt: new Date().toISOString(),
        });
        btn.classList.add('saved');
        writeState(state).then(function () {
          statusEl.textContent = 'Saved "' + cleaned + '" — will sync when back online.';
        });
      });
      article.appendChild(btn);
    });

    appEl.appendChild(article);
  }

  readState()
    .then(renderList)
    .catch(function () {
      appEl.innerHTML = '<div class="card muted">Offline storage is unavailable in this browser.</div>';
    });
})();
