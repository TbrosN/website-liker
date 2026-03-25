# Website Liker (Chrome Extension PoC)

A proof-of-concept browser extension where you can set a local preference for the current website.

## Stack

- WXT (modern extension framework built on Vite)
- React + React DOM
- TypeScript
- Manifest V3

## What this PoC does

- Adds a popup UI with **Like**, **Dislike**, and **Neutral** actions for the active tab.
- Injects a floating button on normal web pages (`http/https`) that cycles through neutral/like/dislike.
- Stores site preference locally in `browser.storage.local`.
- Keeps popup/content script in sync via storage change events.

## Project structure

- `wxt.config.ts`: WXT + MV3 config and permissions
- `src/entrypoints/background.ts`: background service worker entrypoint
- `src/entrypoints/content.ts`: floating page button entrypoint
- `src/entrypoints/popup/*`: popup React app
- `src/utils/siteLikes.ts`: local preference-state helpers

## Run locally

```bash
npm install
npm run dev
```

Then load the generated development extension in Chrome (WXT also supports opening a browser for extension testing depending on local setup).

## Build

```bash
npm run build
```

The production build is generated in `.output/chrome-mv3`.
