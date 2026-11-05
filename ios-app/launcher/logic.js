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

  var api = { SITE: SITE, SUPPORTED: SUPPORTED, pickLocale: pickLocale, nextStep: nextStep };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReadfoxLauncher = api;
})(typeof window !== 'undefined' ? window : globalThis);
