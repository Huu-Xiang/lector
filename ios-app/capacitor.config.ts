import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.readfox.ios',
  appName: 'Readfox',
  webDir: 'launcher',
  server: {
    allowNavigation: ['readfox.app'],
  },
  ios: {
    appendUserAgent: 'ReadfoxApp/1',
    contentInset: 'never',
    backgroundColor: '#fbf8f1',
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    // The page hides the splash on first paint. The timeout covers a page that never does.
    SplashScreen: { launchAutoHide: true, launchShowDuration: 4000, backgroundColor: '#fbf8f1' },
  },
};

export default config;
