// Pure launcher rules. No DOM and no Capacitor calls, so the tests can import it.
(function (root) {
  var SITE = 'https://readfox.app';
  var SUPPORTED = ['en', 'zh-CN', 'zh-TW'];

  function pickLocale(stored, deviceLanguage) {
    if (SUPPORTED.indexOf(stored) !== -1) return stored;
    var tag = String(deviceLanguage || '').toLowerCase();
    if (tag.indexOf('zh') === 0) {
      return /-(tw|hk|mo|hant)/.test(tag) ? 'zh-TW' : 'zh-CN';
    }
    return 'en';
  }

  // "open": go to the site. "offline": cached lessons exist. "error": show retry.
  function nextStep(health, cachedLessonCount) {
    if (health && health.ok) return 'open';
    return cachedLessonCount > 0 ? 'offline' : 'error';
  }

  // The same JSON file is read by src/lib/offline/store.ts. Keep the field names in step.
  function parseState(raw) {
    try {
      var value = JSON.parse(raw);
      if (!value || value.version !== 1) return { version: 1, lessons: [], queue: [] };
      return {
        version: 1,
        lessons: Array.isArray(value.lessons) ? value.lessons : [],
        queue: Array.isArray(value.queue) ? value.queue : [],
      };
    } catch (e) {
      return { version: 1, lessons: [], queue: [] };
    }
  }

  function splitParagraphs(text) {
    return String(text || '')
      .split(/\n\s*\n/)
      .map(function (p) {
        return p.trim();
      })
      .filter(Boolean);
  }

  // The sentence of a paragraph that holds the character at `index`.
  function sentenceAround(paragraph, index) {
    var marks = /[.!?。！？]/;
    var start = 0;
    for (var i = index - 1; i >= 0; i--) {
      if (marks.test(paragraph.charAt(i))) {
        start = i + 1;
        break;
      }
    }
    var end = paragraph.length;
    for (var j = index; j < paragraph.length; j++) {
      if (marks.test(paragraph.charAt(j))) {
        end = j + 1;
        break;
      }
    }
    return paragraph.slice(start, end).trim();
  }

  function newQueuedWord(input) {
    return {
      userId: input.userId,
      vocabId: input.vocabId,
      text: input.text,
      type: 'word',
      sentence: input.sentence,
      language: input.language,
      lessonId: input.lessonId,
      createdAt: input.now,
    };
  }

  var api = {
    SITE: SITE,
    SUPPORTED: SUPPORTED,
    pickLocale: pickLocale,
    nextStep: nextStep,
    parseState: parseState,
    splitParagraphs: splitParagraphs,
    sentenceAround: sentenceAround,
    newQueuedWord: newQueuedWord,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReadfoxLauncher = api;
})(typeof window !== 'undefined' ? window : globalThis);
