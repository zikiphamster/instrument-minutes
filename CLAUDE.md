# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Instrument Minutes is a single-page web app where users earn screen time by logging instrument practice minutes. Users spend earned minutes via a countdown timer, with overtime tracking if they exceed their balance. An admin dashboard monitors all users.

**Stack:** Vanilla HTML/CSS/JS with GitHub Gist as a shared backend. No build step, no frameworks, no server.

## Architecture

Four files make up the app:

- **index.html** — Three screens: auth (`#screen-auth`), user app (`#screen-app` with 4 tabs), admin dashboard (`#screen-admin`). Includes a loading overlay shown during Gist fetch.
- **script.js** — All logic, organized by section comments (data layer, auth, timer, overtime, audio, notifications, stats, themes, admin, etc.)
- **style.css** — CSS custom properties for theming, component styles, responsive breakpoints
- **config.js** — Contains `GIST_ID` and `GITHUB_TOKEN` constants. **Gitignored — never commit this file.**

## Data Model

All shared data lives in a GitHub Gist (`data.json` file) as a JSON object with a `profiles` array. The in-memory `db` object is the working copy, synced to the Gist on every write.

`localStorage` is used only for:
- `im_currentUser` — which user is logged in on this device
- `im_db_cache` — offline fallback copy of the Gist data

User object shape:
```
{ id, name, pin, isAdmin, theme, mode, minutesBank, practiceLog: [{date, minutes}], usageLog: [{date, minutesUsed, overtime}] }
```

## GitHub Gist Backend

The app uses a GitHub Gist as a free shared database so data syncs across devices.

- **Read:** `GET https://api.github.com/gists/{GIST_ID}` on startup and before admin renders
- **Write:** `PATCH https://api.github.com/gists/{GIST_ID}` on every data change
- Auth via `Authorization: token {GITHUB_TOKEN}` header (token needs only `gist` scope)
- If the Gist fetch fails, the app falls back to the localStorage cache

### Setup for new devices
Each device needs a `config.js` file in the project root with:
```js
const GIST_ID = 'your-gist-id';
const GITHUB_TOKEN = 'ghp_your-token';
```

## Development

Open `index.html` directly in a browser. No build or install step. To test changes, refresh the page. The Gist data persists across devices — to reset, edit the Gist content to `{}`.

## Key Constants

- `APP_VERSION` at top of `script.js` — displayed in bottom-right corner
- `OVERTIME_THRESHOLD` in script.js — seconds before overtime is flagged (currently `60` for testing, change to `600` for production)
- `GIST_ID` and `GITHUB_TOKEN` in `config.js` — GitHub Gist backend credentials

## Theming

Two parallel theme objects (`THEMES_DARK` and `THEMES_LIGHT`) each define 7 pastel colour palettes. `applyTheme()` sets CSS custom properties on `:root`. Both user and admin screens have independent settings panels that must stay in sync — `updateModeButtons()` handles both.

## Admin vs User Flow

- Admin accounts (`isAdmin: true`) go directly to `#screen-admin` on login — they have no timer, no practice tab, no nav bar
- Regular users go to `#screen-app` with the 4-tab interface
- Admin dashboard reloads data from Gist each time it renders, so it always shows the latest from all devices

## Versioning

**Always bump `APP_VERSION` at the top of `script.js` when making any code changes.** Format is `MAJOR.MINOR.PATCH`:
- **PATCH** (e.g. 1.1.0 → 1.1.1): bug fixes
- **MINOR** (e.g. 1.1.1 → 1.2.0): new features
- **MAJOR** (e.g. 1.2.0 → 2.0.0): breaking changes

The version displays as a badge in the bottom-right corner of the page.
