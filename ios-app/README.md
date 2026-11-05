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
