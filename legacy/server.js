const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "2mb" }));
app.use(cors());

// -----------------------
// Paths
// -----------------------
const DATA_DIR = path.join(__dirname, "data");
const CHALLENGES_PATH = path.join(DATA_DIR, "challenges.json");
const EASTER_PATH = path.join(DATA_DIR, "easterEggs.json");
const JOKER_PATH = path.join(DATA_DIR, "jokers.json");

// -----------------------
// Load data (synchronously at boot)
// -----------------------
if (!fs.existsSync(CHALLENGES_PATH)) {
  console.error(`❌ Missing challenges file at ${CHALLENGES_PATH}`);
  process.exit(1);
}
let rawChallenges = JSON.parse(fs.readFileSync(CHALLENGES_PATH, "utf8"));

const easterEggs = fs.existsSync(EASTER_PATH)
  ? JSON.parse(fs.readFileSync(EASTER_PATH, "utf8"))
  : [];

const jokersCfg = fs.existsSync(JOKER_PATH)
  ? JSON.parse(fs.readFileSync(JOKER_PATH, "utf8"))
  : {
      consult_oracle: { max: 5, cost: 100 },
      chronoshard: { max: 2, seconds: 30 },
      reroll_trial: { max: 3 },
      wildcard_ritual: { max: 1 }
    };

// -----------------------
// Normalize/shape challenges
// Accepts either flat array with category field
//   or {categories:[{key/label/challenges:[...]}, ...]}
// API will always return { categories: [...] }
// -----------------------
function shapeChallenges(input) {
  if (Array.isArray(input)) {
    // Flat array -> group by category
    const byCat = {};
    for (const ch of input) {
      const cat = ch.category || "Misc";
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(ch);
    }
    return {
      categories: Object.keys(byCat).map((name) => ({
        key: name.toLowerCase().replace(/\s+/g, "_"),
        label: name,
        challenges: byCat[name]
          .map((c) => ({
            id: c.id,
            difficulty: Number(c.difficulty),
            title: c.title,
            description: c.description,
            hint: c.hint || "",
            flag: c.flag,
            points: c.points || (c.difficulty * 100),
            externalLink: c.externalLink || "",
            files: c.files || []
          }))
          .sort((a, b) => a.difficulty - b.difficulty)
      }))
    };
  }
  if (input && input.categories) {
    // Already shaped; ensure required fields exist
    return {
      categories: input.categories.map((cat) => ({
        key: cat.key || cat.name?.toLowerCase().replace(/\s+/g, "_"),
        label: cat.label || cat.name,
        challenges: (cat.challenges || [])
          .map((c) => ({
            id: c.id,
            difficulty: Number(c.difficulty),
            title: c.title,
            description: c.description,
            hint: c.hint || "",
            flag: c.flag,
            points: c.points || (c.difficulty * 100),
            externalLink: c.externalLink || "",
            files: c.files || []
          }))
          .sort((a, b) => a.difficulty - b.difficulty)
      }))
    };
  }
  return { categories: [] };
}

let challengesShaped = shapeChallenges(rawChallenges);

// -----------------------
// Config returned to client
// -----------------------
const CONFIG = {
  game: {
    title: "Trials of Sysdrasil",
    globalMinutes: 120,
    defaultTheme: "fantasy",
    themes: ["fantasy", "cli", "corporate"]
  },
  timers: {
    byDifficulty: {
      "1": 120,
      "2": 180,
      "3": 240,
      "4": 300,
      "5": 360,
      "6": 420,
      "7": 480,
      "8": 540,
      "9": 600,
      "10": 720
    }
  },
  scoring: {
    byDifficulty: {
      "1": 100,
      "2": 200,
      "3": 300,
      "4": 400,
      "5": 500,
      "6": 600,
      "7": 700,
      "8": 800,
      "9": 900,
      "10": 1000
    },
    hintCost: 100
  },
  jokers: jokersCfg
};

// -----------------------
// API routes
// -----------------------
app.get("/api/config", (_req, res) => res.json(CONFIG));

app.get("/api/challenges", (_req, res) => {
  res.json(challengesShaped);
});

// verify flag
app.post("/api/submit", (req, res) => {
  const { challengeId, flag } = req.body || {};
  if (!challengeId || typeof flag !== "string") {
    return res.status(400).json({ ok: false, error: "Invalid payload" });
  }

  const cat = challengesShaped.categories.find((c) =>
    c.challenges.some((x) => x.id === challengeId)
  );
  if (!cat) return res.json({ ok: false });

  const ch = cat.challenges.find((x) => x.id === challengeId);
  const correct = ch.flag === flag.trim();
  if (!correct) return res.json({ ok: false });

  const points = CONFIG.scoring.byDifficulty[String(ch.difficulty)] || 0;
  return res.json({ ok: true, points });
});

// easter egg trigger
app.post("/api/easter-egg", (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string") return res.json({ ok: false });

  const t = text.trim().toLowerCase();
  const hit = easterEggs.find((e) =>
    (e.trigger || "").trim().toLowerCase() === t
  );
  if (!hit) return res.json({ ok: false, message: "Nothing happens…" });

  return res.json({
    ok: true,
    reward: typeof hit.points === "number" ? hit.points : 0,
    message: hit.response || "✨"
  });
});

// optional: in-memory scoreboard
let scoreboard = [];
app.get("/api/scoreboard", (_req, res) => res.json(scoreboard));
app.post("/api/scoreboard", (req, res) => {
  const { name, points } = req.body || {};
  if (!name || typeof points !== "number")
    return res.status(400).json({ error: "Invalid payload" });
  const entry = scoreboard.find((x) => x.name === name);
  if (entry) entry.points += points;
  else scoreboard.push({ name, points });
  scoreboard.sort((a, b) => b.points - a.points);
  res.json({ ok: true, scoreboard });
});

// -----------------------
// Production static serve of React (if built)
// -----------------------
const clientBuild = path.join(__dirname, "client", "build");
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientBuild, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.send("CTF API running (React dev server expected on :3000).");
  });
}

app.listen(PORT, () => {
  console.log(`🚀 API on http://localhost:${PORT}`);
  console.log(`✅ ${challengesShaped.categories.length} categories loaded`);
  console.log(
    `✅ ${challengesShaped.categories.reduce((a, c) => a + c.challenges.length, 0)} challenges total`
  );
});

