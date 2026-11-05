# Readfox iPhone app

The shell, build, archive, and TestFlight steps are added with the shell unit. This file already holds the Beta App Review fields.

## Beta App Review fields

| Field                  | Value                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Privacy policy address | `https://readfox.app/privacy`                                                                                             |
| Feedback contact       | `https://readfox.app/feedback`                                                                                            |
| Demo account           | A Free plan account with no personal data. Create it on the website and verify its email.                                 |
| Demo password          | Enter it only in the App Store Connect review fields. Never write it in this repository. Change it after Beta App Review. |

Notes for the reviewer:

- The app shows no price and no purchase, upgrade, or redeem-code screen.
- Before the first request that sends text to an AI service, the app asks for consent once.
- Account deletion is in Settings, under Delete account.

## Build the shell

Needs Xcode 16 or later, Node, and CocoaPods (`brew install cocoapods`). The shell uses Capacitor 7.

```bash
cd ios-app
npm install
npx cap sync ios
npx cap open ios
```

The shell opens a small bundled page (`launcher/`). It checks `https://readfox.app/health`, then loads the site. The user agent carries `ReadfoxApp/1`, which the web code reads (`src/lib/native-app.ts`). Links to other hosts open in Safari.

Signing, the app icon, the launch screen, and the TestFlight upload are added with the release unit.

## Offline reading

The web app keeps the five lessons you opened last in `offline.json` (the app's Data folder, through the Filesystem plugin). If the health check fails and lessons are cached, the launcher opens `offline.html`: a plain reader where a tap saves a word. Saved words wait in the same file and are sent when the account is signed in and the phone is online. Reaching the sign-in page signed out clears the file. The file format is shared by `src/lib/offline/store.ts` and `launcher/logic.js`; `tests/launcher.test.ts` checks that they agree.
