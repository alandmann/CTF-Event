const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load config & data
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const EASTER = JSON.parse(fs.readFileSync(path.join(__dirname, 'easter_eggs.json'), 'utf8'));
let CHALLENGES = JSON.parse(fs.readFileSync(path.join(__dirname, 'challenges.json'), 'utf8'));

function sanitizeChallengesForClient() {
  const clone = JSON.parse(JSON.stringify(CHALLENGES));
  for (const cat of clone.categories) {
    for (const ch of cat.challenges) {
      delete ch.flagHash; // never send hashes to client (not needed)
    }
  }
  return clone;
}

function findChallenge(id) {
  for (const cat of CHALLENGES.categories) {
    const ch = cat.challenges.find(c => c.id === id);
    if (ch) return ch;
  }
  return null;
}

// API
app.get('/api/config', (req, res) => {
  res.json(CONFIG);
});

app.get('/api/challenges', (req, res) => {
  res.json(sanitizeChallengesForClient());
});

app.post('/api/submit', (req, res) => {
  const { challengeId, flag } = req.body || {};
  const ch = findChallenge(challengeId);
  if (!ch || !flag) return res.status(400).json({ ok: false, error: 'Invalid request' });
  const ok = bcrypt.compareSync(flag, ch.flagHash);
  res.json({ ok });
});

app.post('/api/easter-egg', (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string') return res.status(400).json({ ok: false });
  for (const egg of EASTER) {
    const rx = eval(egg.pattern); // pattern stored as string like "/^foo$/i"
    if (rx.test(text)) {
      return res.json({ ok: true, reward: egg.reward || 0, message: egg.message || 'Secret found!' });
    }
  }
  res.json({ ok: false, reward: 0, message: 'Nothing happens…' });
});

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`CTF server running on http://localhost:${PORT}`);
});

