# CTF Jeopardy – Solo Platform (React + Express)

**Features**
- 120‑minute global timer + per‑challenge timers (by difficulty)
- Jeopardy board (10 categories × 10 tiers; ships with 3 demo categories)
- Flag submissions (server‑side hashed via bcrypt)
- Hints & Jokers (consult_oracle, chronoshard, reroll_trial, wildcard_ritual)
- Easter eggs (global input, configurable)
- Themes: Fantasy (default), CLI Hacker, Corporate Hell
- Scoreboard (solo), achievements, CSV/JSON export
- Reusable config + challenge sources (YAML/JSON‑like via JSON files)
- Dockerized

> **No external DB required.** Challenge flags are hashed into `challenges.json` from `challenges.src.json`.

## Quick Start

```bash
# 1) Install deps
npm install

# 2) Build challenge hashes (from plaintext flags in challenges.src.json)
npm run build:challenges

# 3) Start dev server (Express + static React app)
npm run dev
# Visit http://localhost:3000
```

## Project Structure
```
.
├── package.json
├── server.js                 # Express API + static hosting
├── config.json               # Game configuration (timers, scoring, jokers, themes)
├── easter_eggs.json          # Easter eggs (pattern + flags, messages, rewards)
├── challenges.src.json       # Editable challenge source (PLAINTEXT flags)
├── challenges.json           # GENERATED: hashed flags only (no plaintext)
├── scripts/
│   └── generate-hashes.js    # Hashes flags → output challenges.json
├── public/
│   ├── index.html            # React SPA via CDN (React + Babel + Tailwind)
│   ├── app.jsx               # React app (board, timers, jokers, themes)
│   └── styles.css            # Theme styles
├── Dockerfile
└── docker-compose.yml
```

## Admin Notes
- Add/modify challenges in `challenges.src.json`, then run `npm run build:challenges`.
- Do **NOT** deploy `challenges.src.json` (contains plaintext flags). Deploy `challenges.json` only.
- You can disable features (e.g., jokers/easter eggs) in `config.json`.
- For containerized external challenges, set `externalLink` in each challenge.

## Exporting Results
- GET `/api/scoreboard/export.json` → raw JSON
- GET `/api/scoreboard/export.csv` → CSV

---
