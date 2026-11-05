(function () {
  var Logic = window.ReadfoxLauncher;
  var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};

  async function readLocale() {
    try {
      var stored = await plugins.Preferences.get({ key: 'readfox.locale' });
      return Logic.pickLocale(stored && stored.value, navigator.language);
    } catch (e) {
      return Logic.pickLocale(null, navigator.language);
    }
  }

  async function checkHealth() {
    try {
      var res = await plugins.CapacitorHttp.get({
        url: Logic.SITE + '/health',
        readTimeout: 4000,
        connectTimeout: 4000,
      });
      return { ok: res.status === 200 };
    } catch (e) {
      return { ok: false };
    }
  }

  async function countCachedLessons() {
    try {
      var res = await plugins.Filesystem.readFile({
        path: 'offline.json',
        directory: 'DATA',
        encoding: 'utf8',
      });
      return Logic.parseState(res.data).lessons.length;
    } catch (e) {
      return 0;
    }
  }

  async function hideSplash() {
    try {
      await plugins.SplashScreen.hide();
    } catch (e) {
      /* the web preview has no splash */
    }
  }

  async function start() {
    var health = await checkHealth();
    var cached = health.ok ? 0 : await countCachedLessons();
    var step = Logic.nextStep(health, cached);
    if (step === 'open') {
      window.location.replace(Logic.SITE + '/');
      return;
    }
    if (step === 'offline') {
      window.location.replace('offline.html');
      return;
    }
    var strings = window.READFOX_STRINGS[await readLocale()];
    document.getElementById('title').textContent = strings.title;
    document.getElementById('body').textContent = strings.body;
    document.getElementById('retry').textContent = strings.retry;
    document.getElementById('error').className = 'show';
    await hideSplash();
  }

  document.getElementById('retry').addEventListener('click', function () {
    document.getElementById('error').className = '';
    start();
  });
  start();
})();
