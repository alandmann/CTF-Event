# CTF Jeopardy Platform – Solo, Themed, Timed

A self-hosted Jeopardy-style CTF with:
- 120 min global timer + per-challenge timers (difficulty-based)
- 10 categories × 10 tiers (extensible)
- Hints & "Jokers" (power-ups) with usage limits and point costs
- Global Easter-egg input with ~10 triggers
- Three selectable themes (Fantasy, CLI, Corporate)
- Reusable challenge config (JSON)
- Docker-ready

## Quick Start

```bash
# 1) Install
npm install

# 2) Build challenge hashes (from plaintext flags in challenges.src.json)
npm run build:challenges

# 3) Run (dev)
npm run dev
# or prod
npm start

# Visit
http://localhost:3000
```
