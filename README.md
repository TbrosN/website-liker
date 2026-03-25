# Website Liker (Chrome Extension PoC)

A browser extension where users can like/dislike websites and unlock community counts (global likes/dislikes) after voting.

## Stack

- WXT (modern extension framework built on Vite)
- React + React DOM
- TypeScript
- Manifest V3

## What this PoC does

- Adds a popup UI with **Like**, **Dislike**, and **Neutral** actions for the active tab.
- Injects a floating button on normal web pages (`http/https`) for like/dislike.
- Stores local site preference in `browser.storage.local` (keyed by normalized site).
- Reveals global community counts only after a user votes on that site.
- Syncs global counts via Supabase RPC (`submit_site_vote`, `get_site_vote_counts`).
- Keeps popup/content script in sync via storage change events.

## Project structure

- `wxt.config.ts`: WXT + MV3 config and permissions
- `src/entrypoints/background.ts`: background service worker entrypoint
- `src/entrypoints/content.ts`: floating page button entrypoint
- `src/entrypoints/popup/*`: popup React app
- `src/utils/siteLikes.ts`: local preference-state helpers
- `src/utils/globalVotes.ts`: Supabase global vote/count helpers
- `supabase/schema.sql`: SQL schema + RPC functions for Supabase

## Supabase setup (no separate backend required)

1. In Supabase SQL Editor, run `supabase/schema.sql`.
2. In this project root, add `.env.local`:

```bash
WXT_SUPABASE_URL=https://<your-project-ref>.supabase.co
WXT_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
```

3. Restart `npm run dev` so env vars are picked up.

If env vars are missing, local likes still work, but community counts will show as unavailable.

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
