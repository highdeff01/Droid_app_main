# DroidVision AI Page Bridge

A minimal Chrome/Edge (Manifest V3) extension that reports the active tab, its
URL, its title and its interactive page elements to the DroidVision AI app, so
the screen-analysis workflow can interpret real browser tabs and page elements
instead of guessing from pixels alone.

## Install

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this `browser-extension/` folder.

## Use

- Make sure the app is running (`http://localhost:3000`).
- Browse to any page: the extension posts the page and its elements whenever the
  tab is activated or finishes loading.
- Click the extension icon to report the current page on demand.

Reports land at `POST /api/browser/extension-report` and are shown on the
**AI Monitor** screen (and its Dashboard tab) as the current browser context.
The AI's perception step then receives the tab title, URL and element list, and
prefers those exact page elements over visually detected ones.

## Pointing at another host

If the app runs somewhere other than `http://localhost:3000`, update:

- `API_URL` in `background.js`
- `host_permissions` in `manifest.json`
