# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Instrument Minutes is a single-page web app where users earn screen time by logging instrument practice minutes. Users spend earned minutes via a countdown timer, with overtime tracking if they exceed their balance. An admin dashboard monitors all users.

**Stack:** Vanilla HTML/CSS/JS with localStorage. No build step, no dependencies, no server.

## Architecture

Three files make up the entire app:

- **index.html** — Three screens: auth (`#screen-auth`), user app (`#screen-app` with 4 tabs), admin dashboard (`#screen-admin`)
- **script.js** — All logic, organized by section comments (data layer, auth, timer, overtime, audio, notifications, stats, themes, admin, etc.)
- **style.css** — CSS custom properties for theming, component styles, responsive breakpoints

## Data Model

All data lives in `localStorage` under keys `im_profiles` (array of user objects) and `im_currentUser` (user ID string).

User object shape:
```
{ id, name, pin, isAdmin, theme, mode, minutesBank, practiceLog: [{date, minutes}], usageLog: [{date, minutesUsed, overtime}] }
```

## Development

Open `index.html` directly in a browser. No build or install step. To test changes, refresh the page. Clear localStorage to reset all data.

## Key Constants

- `APP_VERSION` at top of `script.js` — displayed in bottom-right corner
- `OVERTIME_THRESHOLD` in script.js — seconds before overtime is flagged (currently `60` for testing, change to `600` for production)

## Theming

Two parallel theme objects (`THEMES_DARK` and `THEMES_LIGHT`) each define 7 pastel colour palettes. `applyTheme()` sets CSS custom properties on `:root`. Both user and admin screens have independent settings panels that must stay in sync — `updateModeButtons()` handles both.

## Admin vs User Flow

- Admin accounts (`isAdmin: true`) go directly to `#screen-admin` on login — they have no timer, no practice tab, no nav bar
- Regular users go to `#screen-app` with the 4-tab interface

## Versioning

**Always bump `APP_VERSION` at the top of `script.js` when making any code changes.** Format is `MAJOR.MINOR.PATCH`:
- **PATCH** (e.g. 1.1.0 → 1.1.1): bug fixes
- **MINOR** (e.g. 1.1.1 → 1.2.0): new features
- **MAJOR** (e.g. 1.2.0 → 2.0.0): breaking changes

The version displays as a badge in the bottom-right corner of the page.
