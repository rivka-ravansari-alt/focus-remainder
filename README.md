# Focus Reminder

A production-ready Chrome Extension Manifest V3 app that lets users define websites they want to limit. When a listed website opens, the content script shows a timer prompt. The background service worker stores the per-tab timer, wakes via `chrome.alarms`, shows the closing overlay, and closes the tab after the countdown.

## Features

- React popup for adding and removing limited websites.
- Default examples: `youtube.com`, `instagram.com`, `facebook.com`, `tiktok.com`, `x.com`.
- `chrome.storage.local` for settings and active timer state.
- Content script modal for timer choices and full-screen focus overlay.
- MV3 background service worker using `chrome.alarms` for timer reliability.
- Subdomain matching, URL normalization, and safe Chrome API error handling.

## Project Structure

```text
public/manifest.json        Chrome extension manifest
src/background.ts           Service worker timer and tab control logic
src/content/main.tsx        Website modal and closing overlay
src/content/styles.css      Isolated content-script UI styles
src/popup/main.tsx          Settings popup React app
src/popup/styles.css        Popup UI styles
src/shared/                 Shared storage, site matching, and message types
```

## Development

```bash
npm install
npm run build
```

Load the generated `dist` folder in Chrome at `chrome://extensions` with Developer Mode enabled.
