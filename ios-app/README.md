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

Needs Xcode 26 or later (Apple's upload rule since April 2026), Node, and CocoaPods (`brew install cocoapods`). The shell uses Capacitor 7. Run CocoaPods with a UTF-8 locale (`LANG=en_US.UTF-8`); without it `pod install` stops with an encoding error.

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

## Release setup (needs the paid Apple Developer account)

Your steps, in order. Nothing here is done by the code.

1. Enroll in the Apple Developer Program as an individual: <https://developer.apple.com/programs/enroll/>.
2. In App Store Connect, create the app record with bundle id `app.readfox.ios`. Check that the name "Readfox" is free.
3. Open Membership in the developer portal and copy the 10-character Team ID. Replace `TEAMID` in `public/.well-known/apple-app-site-association` with it and deploy the site. Check `https://readfox.app/.well-known/apple-app-site-association` answers with `application/json` and no redirect.
4. In Xcode, select the App target, open Signing & Capabilities, choose your team, and add two capabilities: Associated Domains (`applinks:readfox.app`) and Push Notifications. Select the App target and the ReviewWidget target in turn and check that App Groups lists `group.app.readfox.ios`; Xcode registers the group when the team is set.
5. In the developer portal, create an APNs key (Keys, then the Apple Push Notifications service box). Download the `.p8` file once and note the Key ID. Put `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID=app.readfox.ios`, and `APNS_KEY` in the server `.env`. Never commit them.
6. Edit the server's Caddyfile to match `deploy/readfox/Caddyfile` (the `@anonHome` rule skips the landing page when the user agent contains `ReadfoxApp/`) and reload Caddy. `deploy.sh` does not ship this file.
7. Replace the app icon (1024 px) in `ios/App/App/Assets.xcassets/AppIcon.appiconset` and the launch screen.
8. Archive the app in Xcode, upload it, and add testers in TestFlight. External testers need Beta App Review: fill the fields in the table above.
9. After Beta App Review, change the demo account password.

## Device test script

Run these on a real iPhone from a TestFlight build.

- Start: the app opens to sign-in, signs in, and shows the library. A signed-out first launch lands on sign-in, not the landing page.
- Purchase surfaces: Settings shows no upgrade button, price, redeem box, or add-to-home-screen card. A paid plan still shows its name.
- Reminder: turn on the reminder in Settings for a time two minutes ahead, with at least one card due. One notification arrives, and tapping it opens practice. With no card due, none arrives.
- Offline: open a lesson, switch to airplane mode, close and reopen the app, read the lesson, and save a word. Go online and open the app: the word appears once in Vocab.
- Email link: sign up, then tap the verify link in Mail. The app opens and the email shows as verified.
- Share: in Safari, share an article to Readfox. The app opens on a new lesson.
- Selection: in the reader, hold a word and drag across a phrase. The page does not scroll and the phrase is selected.
- Tab bar: tap each tab; the page changes and the phone gives a light tap. Open a word in the reader, a dialog, and the keyboard: the tab bar steps aside each time.
- Swipe back: open a lesson and swipe from the left edge. The library comes back.
- Widget: add the Readfox widget to the home screen. It shows the cards due; after a review round it shows the new count. Tapping it opens practice. After sign-out it asks you to open the app.

## Share extension

`ios/App/ShareExtension/` is a Share Extension target that takes a web link from the share sheet and opens `readfox://share?url=…`. The app then loads `/share`, which extracts the article and makes a lesson. The target was added by `scripts/add-share-extension.rb`; the script does nothing when the target exists. The extension has its own bundle id (`app.readfox.ios.ShareExtension`), so it needs its own signing in Xcode. It needs no App Group.

## Native interface

The app draws some of its interface natively, on top of the web page.

- `MainViewController.swift` replaces Capacitor's root view controller (set in `Main.storyboard`). It registers the two plugins below and turns on the edge swipe back.
- `NativeTabBarPlugin.swift` is a UITabBar over the bottom of the web view. The page sends the tabs and the selection (`src/components/NativeBridge/NativeTabBarSync.tsx`) and hides the bar in the reader, under a dialog or sheet, and at iPad widths, where the web sidebar shows. The plugin hides it while the keyboard is up. Built with the iOS 26 SDK, the bar takes the Liquid Glass look.
- `ReviewWidgetPlugin.swift` saves the review counts the page sends into the App Group, and `ReviewWidget/` is a WidgetKit extension that shows them (small, medium, and two lock screen sizes). The widget opens `readfox://practice`. It needs iOS 17; the app itself still runs on iOS 14.
- The web side marks the page with `data-native-app` before first paint (`src/app/layout.tsx`); `globals.css` then uses the system font, flat buttons, 44-point tap targets, and a short slide on page changes.

`scripts/add-native-ui.rb` added these files and the ReviewWidget target to the Xcode project; it does nothing when they are there. Run it with CocoaPods' Ruby, as for the share extension script.

To try web changes in the simulator, copy the built `App.app`, set `server.url` to `http://localhost:3456` (with `cleartext: true`) in its `capacitor.config.json`, sign it again with `codesign -f -s - --entitlements ios/App/App/App.entitlements`, and install it with `xcrun simctl install`. Never commit that setting.
