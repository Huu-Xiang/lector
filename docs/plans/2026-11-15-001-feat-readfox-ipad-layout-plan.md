---
title: Adapt the Readfox app to iPad windows
date: 2026-11-15
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

## Product contract

- Preserve the iPhone app's destinations, icons, palette, and reading controls.
- Give the iPad app a centered top tab bar in regular windows. Restore the phone navigation in narrow windows and keep the reader's own controls.
- Give the iPad library a separate recommendations column where space permits. Keep import, grouping, and list/grid preferences on the existing screen.
- Preserve the current reading selection when the window changes. Use safe areas and keep readable line lengths.
- Continue PR #5 so the tablet design includes the existing reader and navigation fixes.

## Implementation

- U1. Detect iPad inside the app, including a desktop-style iPad user agent. Share the window-width threshold between the mounted tab bar controls and CSS. Use the existing native destination and selection helpers for top tabs. Reuse the app header's language, back and chat controls.
- U2. Give the existing library a wider content area and a second column for recommendations. Keep the recommendations mounted across width changes. Refine tablet typography and gutters for the library, settings and reader.
- U3. Verify navigation at phone, regular iPad and narrow iPad widths, desktop browser isolation, and reader rotation. Build the web app and review the result. Update PR #5.

## Verification

Browser coverage uses the existing native bridge fixture and exercises the same UI the current TestFlight shell loads. Check selected tabs, direct navigation, viewport resize, library layout and existing reader interactions. The iPad design takes its top tabs and adaptive layout from [Apple's iPad guidance](https://developer.apple.com/design/human-interface-guidelines/tab-bars?changes=l_1__4&language=objc).

## iPad library visual refinement

Apple Books puts current reading above the cover grid, and Readwise makes the return to a saved position a direct action. Use available cover artwork and existing Reading typography in the iPad library. A prominent book uses the most recently read collection with unfinished progress. Resolve the next readable chapter through the existing lesson cache. When there is no progress, feature the first available book and link to it using the library's existing destination. Place the remaining shelf below with the current grouping, actions, and view preference. Keep recommendations aligned beside the shelf at wide widths and below it on portrait iPad. Check empty libraries, resumed chapters, narrow windows, and dark mode.

References: [Apple Books Home](https://support.apple.com/nl-nl/guide/ipad/ipadc8494b6b/ipados), [Apple Books library](https://support.apple.com/de-de/guide/ipad/ipad5ecae3c6/ipados), [Readwise long-form reading](https://docs.readwise.io/reader/guides/workflows/longform-reading).
