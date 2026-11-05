(function () {
  var Logic = window.ReadfoxLauncher;
  var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  var FILE = { path: 'offline.json', directory: 'DATA', encoding: 'utf8' };
  var strings = window.READFOX_STRINGS.en;
  var state = { version: 1, lessons: [], queue: [] };
  var current = null;
  var picked = null;

  function $(id) {
    return document.getElementById(id);
  }

  async function load() {
    try {
      var res = await plugins.Filesystem.readFile(FILE);
      state = Logic.parseState(res.data);
    } catch (e) {
      state = Logic.parseState(null);
    }
  }

  async function save() {
    await plugins.Filesystem.writeFile(Object.assign({ data: JSON.stringify(state) }, FILE));
  }

  function uuid() {
    return window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : 'off-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function showList() {
    current = null;
    $('sheet').className = '';
    $('title').textContent = strings.offlineTitle;
    $('home').textContent = strings.tryOnline;
    $('home').onclick = function () {
      window.location.replace('index.html');
    };
    var view = $('view');
    view.textContent = '';
    if (!state.lessons.length) {
      var empty = document.createElement('p');
      empty.className = 'note';
      empty.textContent = strings.offlineEmpty;
      view.appendChild(empty);
      return;
    }
    state.lessons.forEach(function (lesson) {
      var row = document.createElement('button');
      row.className = 'row';
      row.type = 'button';
      row.textContent = lesson.title;
      row.onclick = function () {
        showLesson(lesson);
      };
      view.appendChild(row);
    });
  }

  function showLesson(lesson) {
    current = lesson;
    $('title').textContent = lesson.title;
    $('home').textContent = strings.back;
    $('home').onclick = showList;
    var view = $('view');
    view.textContent = '';
    var segmenter =
      typeof Intl !== 'undefined' && Intl.Segmenter
        ? new Intl.Segmenter(lesson.language || 'en', { granularity: 'word' })
        : null;
    Logic.splitParagraphs(lesson.text).forEach(function (paragraph) {
      var p = document.createElement('p');
      var pieces = segmenter
        ? Array.from(segmenter.segment(paragraph)).map(function (s) {
            return { text: s.segment, index: s.index, word: Boolean(s.isWordLike) };
          })
        : [{ text: paragraph, index: 0, word: false }];
      pieces.forEach(function (piece) {
        if (!piece.word) {
          p.appendChild(document.createTextNode(piece.text));
          return;
        }
        var span = document.createElement('span');
        span.className = 'w';
        span.textContent = piece.text;
        span.onclick = function () {
          openSheet(piece.text, Logic.sentenceAround(paragraph, piece.index), span);
        };
        p.appendChild(span);
      });
      view.appendChild(p);
    });
  }

  function openSheet(word, sentence, span) {
    picked = { word: word, sentence: sentence, span: span };
    $('sheetWord').textContent = word;
    $('sheetSentence').textContent = sentence;
    $('sheetNote').textContent = strings.needsConnection;
    $('saveBtn').textContent = strings.saveWord;
    $('closeBtn').textContent = strings.close;
    $('saveBtn').disabled = false;
    $('sheet').className = 'show';
  }

  $('closeBtn').onclick = function () {
    $('sheet').className = '';
  };
  $('saveBtn').onclick = async function () {
    if (!picked || !current) return;
    state.queue.push(
      Logic.newQueuedWord({
        userId: current.userId,
        vocabId: uuid(),
        text: picked.word,
        sentence: picked.sentence,
        language: current.language || 'en',
        lessonId: current.id,
        now: new Date().toISOString(),
      }),
    );
    await save();
    picked.span.className = 'w saved';
    $('sheetNote').textContent = strings.saved;
    $('saveBtn').disabled = true;
  };

  async function start() {
    var locale = 'en';
    try {
      var stored = await plugins.Preferences.get({ key: 'readfox.locale' });
      locale = Logic.pickLocale(stored && stored.value, navigator.language);
    } catch (e) {
      locale = Logic.pickLocale(null, navigator.language);
    }
    strings = window.READFOX_STRINGS[locale] || strings;
    await load();
    var id = new URLSearchParams(window.location.search).get('lesson');
    var found = state.lessons.filter(function (l) {
      return l.id === id;
    })[0];
    if (found) showLesson(found);
    else showList();
    try {
      await plugins.SplashScreen.hide();
    } catch (e) {
      /* no splash on the web */
    }
  }

  start();
})();
