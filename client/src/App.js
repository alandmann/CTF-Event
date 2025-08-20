import React, { useEffect, useMemo, useState } from "react";

const $fmt = (ms) => {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

export default function App() {
  const [config, setConfig] = useState(null);
  const [data, setData] = useState(null); // { categories: [...] }
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "fantasy");
  const [score, setScore] = useState(Number(localStorage.getItem("score") || "0"));

  const [solved, setSolved] = useState(new Set(JSON.parse(localStorage.getItem("solved") || "[]")));
  const [expired, setExpired] = useState(new Set(JSON.parse(localStorage.getItem("expired") || "[]")));

  const [globalEnd, setGlobalEnd] = useState(Number(localStorage.getItem("globalEnd") || "0"));
  const [perTimers, setPerTimers] = useState(JSON.parse(localStorage.getItem("perTimers") || "{}")); // id -> endTs

  const [jokersUse, setJokersUse] = useState(JSON.parse(localStorage.getItem("jokers") || "{}")); // counts by kind

  const [open, setOpen] = useState(null); // current challenge object
  const [msg, setMsg] = useState("");
  const [hintText, setHintText] = useState("");
  const [flag, setFlag] = useState("");

  const [egg, setEgg] = useState("");
  const [eggMsg, setEggMsg] = useState("");

  // ---- initial data load ----
  useEffect(() => {
    (async () => {
      const c = await (await fetch("/api/config")).json();
      setConfig(c);
      const d = await (await fetch("/api/challenges")).json();
      setData(d);

      // init global timer
      if (!localStorage.getItem("globalEnd")) {
        const end = Date.now() + c.game.globalMinutes * 60 * 1000;
        setGlobalEnd(end);
        localStorage.setItem("globalEnd", String(end));
      } else {
        setGlobalEnd(Number(localStorage.getItem("globalEnd")));
      }

      // init jokers counter
      if (!localStorage.getItem("jokers")) {
        const init = {
          consult_oracle: 0,
          chronoshard: 0,
          reroll_trial: 0,
          wildcard_ritual: 0
        };
        setJokersUse(init);
        localStorage.setItem("jokers", JSON.stringify(init));
      }
    })();
  }, []);

  // ---- theme class ----
  useEffect(() => {
    document.body.classList.remove("theme-fantasy", "theme-cli", "theme-corporate");
    document.body.classList.add(`theme-${theme}`);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // ---- global timer tick ----
  useEffect(() => {
    const t = setInterval(() => {
      const remain = (globalEnd || Date.now()) - Date.now();
      if (remain <= 0) {
        clearInterval(t);
      }
      // nothing else required; displayed live via compute
    }, 250);
    return () => clearInterval(t);
  }, [globalEnd]);

  const globalRemain = useMemo(() => (globalEnd ? globalEnd - Date.now() : 0), [globalEnd, Date.now()]);

  // ---- persist helpers ----
  const persist = (upd = {}) => {
    if ("score" in upd) localStorage.setItem("score", String(upd.score));
    if ("solved" in upd) localStorage.setItem("solved", JSON.stringify([...upd.solved]));
    if ("expired" in upd) localStorage.setItem("expired", JSON.stringify([...upd.expired]));
    if ("perTimers" in upd) localStorage.setItem("perTimers", JSON.stringify(upd.perTimers));
    if ("jokersUse" in upd) localStorage.setItem("jokers", JSON.stringify(upd.jokersUse));
  };

  // ---- open tile ----
  const openTile = (ch) => {
    if (solved.has(ch.id) || expired.has(ch.id)) return;
    setOpen(ch);
    setMsg("");
    setHintText("");
    setFlag("");

    // set/keep per-challenge timer
    if (!perTimers[ch.id]) {
      const secs = config.timers.byDifficulty[String(ch.difficulty)] || 120;
      const endTs = Date.now() + secs * 1000;
      const next = { ...perTimers, [ch.id]: endTs };
      setPerTimers(next);
      persist({ perTimers: next });
    }
  };

  // ---- close modal ----
  const closeModal = () => setOpen(null);

  // ---- per-challenge timer tick inside modal ----
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => {
      const end = perTimers[open.id];
      if (!end) return;
      const remain = end - Date.now();
      if (remain <= 0) {
        // expire this challenge
        if (!expired.has(open.id)) {
          const nx = new Set(expired);
          nx.add(open.id);
          setExpired(nx);
          persist({ expired: nx });
        }
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [open, perTimers]);

  // ---- submit flag ----
  const submitFlag = async () => {
    if (!open) return;
    const end = perTimers[open.id];
    if (Date.now() > end) {
      setMsg("⏳ The trial has expired.");
      return;
    }
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: open.id, flag })
    });
    const j = await res.json();
    if (j.ok) {
      const nxSolved = new Set(solved);
      nxSolved.add(open.id);
      setSolved(nxSolved);
      const newScore = score + (j.points || 0);
      setScore(newScore);
      persist({ solved: nxSolved, score: newScore });
      setMsg(`✅ Correct! +${j.points} points.`);
      setTimeout(() => setOpen(null), 800);
    } else {
      setMsg("❌ Not quite. Keep trying!");
    }
  };

  // ---- jokers ----
  const useJoker = (kind) => {
    if (!config) return;
    const lim = config.jokers[kind]?.max ?? 0;
    if ((jokersUse[kind] || 0) >= lim) {
      setMsg("No uses left for this joker.");
      return;
    }
    // require open challenge except wildcard
    if (!open && kind !== "wildcard_ritual") {
      setMsg("Open a challenge first.");
      return;
    }

    const nextUse = { ...jokersUse, [kind]: (jokersUse[kind] || 0) + 1 };
    setJokersUse(nextUse);
    persist({ jokersUse: nextUse });

    if (kind === "consult_oracle") {
      if (score < (config.scoring.hintCost || 100)) {
        setMsg("Not enough points for the oracle.");
        return;
      }
      const newScore = score - config.scoring.hintCost;
      setScore(newScore);
      persist({ score: newScore });
      setHintText(open?.hint ? `Hint: ${open.hint}` : "The oracle is silent…");
    } else if (kind === "chronoshard") {
      const add = (config.jokers.chronoshard.seconds || 30) * 1000;
      const end = perTimers[open.id] || Date.now();
      const next = { ...perTimers, [open.id]: end + add };
      setPerTimers(next);
      persist({ perTimers: next });
      setMsg(`⏱️ +${config.jokers.chronoshard.seconds}s granted.`);
    } else if (kind === "reroll_trial") {
      const cat = data.categories.find((c) => c.challenges.some((x) => x.id === open.id));
      const alts = cat.challenges.filter((x) => x.difficulty === open.difficulty && x.id !== open.id);
      if (alts.length === 0) {
        setMsg("No alternate trial exists.");
        return;
      }
      const next = alts[Math.floor(Math.random() * alts.length)];
      // transfer remaining time
      const remain = Math.max(0, (perTimers[open.id] || Date.now()) - Date.now());
      const timers = { ...perTimers };
      delete timers[open.id];
      timers[next.id] = Date.now() + remain;
      setPerTimers(timers);
      persist({ perTimers: timers });
      setOpen(next);
      setHintText("");
      setFlag("");
      setMsg("🔮 The trial has shifted…");
    } else if (kind === "wildcard_ritual") {
      const r = Math.random();
      if (r < 0.33) {
        const ns = score + 250;
        setScore(ns);
        persist({ score: ns });
        setMsg("🍀 Fortune smiles: +250 points!");
      } else if (r < 0.66) {
        const add = 20000; // 20s
        if (open) {
          const timers = { ...perTimers, [open.id]: (perTimers[open.id] || Date.now()) + add };
          setPerTimers(timers);
          persist({ perTimers: timers });
        }
        const gEnd = globalEnd + add;
        setGlobalEnd(gEnd);
        localStorage.setItem("globalEnd", String(gEnd));
        setMsg("🧊 Time bends: +20s to current trial & global clock!");
      } else {
        const ns = Math.max(0, score - 200);
        setScore(ns);
        persist({ score: ns });
        setMsg("💀 A trap! −200 points.");
      }
    }
  };

  // ---- easter egg ----
  const castEgg = async () => {
    const t = egg.trim();
    if (!t) return;
    const res = await fetch("/api/easter-egg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t })
    });
    const j = await res.json();
    setEggMsg(j.message || "");
    if (j.ok && typeof j.reward === "number") {
      const ns = Math.max(0, score + j.reward);
      setScore(ns);
      persist({ score: ns });
    }
    setEgg("");
  };

  if (!config || !data) {
    return <div className="container">Loading…</div>;
  }

  const globalDisabled = globalRemain <= 0;

  return (
    <div className="container">
      {/* Header */}
      <div className="panel header">
        <div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>{config.game.title}</div>
          <div style={{ opacity: 0.8, fontSize: ".9rem" }}>A Jeopardy-style solo CTF</div>
        </div>
        <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
          <label htmlFor="theme">Theme:</label>
          <select
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            {config.game.themes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div style={{ marginLeft: "1rem" }}>
            Score: <strong>{score}</strong>
          </div>
          <div style={{ marginLeft: "1rem" }}>
            Global: <span style={{ fontFamily: "monospace" }}>{$fmt(globalRemain)}</span>
          </div>
        </div>
      </div>

      {/* Easter Eggs */}
      <div className="panel" style={{ marginBottom: "1rem", display: "flex", gap: ".5rem", alignItems: "center" }}>
        <div style={{ opacity: .8, fontSize: ".9rem" }}>Speak to the spirits:</div>
        <input
          value={egg}
          onChange={(e) => setEgg(e.target.value)}
          placeholder="type a secret incantation…"
          style={{ flex: 1 }}
        />
        <button onClick={castEgg}>Cast</button>
        <div style={{ marginLeft: ".5rem", fontSize: ".9rem" }}>{eggMsg}</div>
      </div>

      {/* Jokers */}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div style={{ fontWeight: 800, marginBottom: ".5rem" }}>Jokers</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(200px, 1fr))", gap: ".5rem" }}>
          <button onClick={() => useJoker("consult_oracle")}>
            Consult the Oracle (−{config.scoring.hintCost}) <span style={{ marginLeft: ".5rem" }}>{jokersUse.consult_oracle || 0}/{config.jokers.consult_oracle.max}</span>
          </button>
          <button onClick={() => useJoker("chronoshard")}>
            Chronoshard (+{config.jokers.chronoshard.seconds}s) <span style={{ marginLeft: ".5rem" }}>{jokersUse.chronoshard || 0}/{config.jokers.chronoshard.max}</span>
          </button>
          <button onClick={() => useJoker("reroll_trial")}>
            Reroll the Trial <span style={{ marginLeft: ".5rem" }}>{jokersUse.reroll_trial || 0}/{config.jokers.reroll_trial.max}</span>
          </button>
          <button onClick={() => useJoker("wildcard_ritual")}>
            Wildcard Ritual <span style={{ marginLeft: ".5rem" }}>{jokersUse.wildcard_ritual || 0}/{config.jokers.wildcard_ritual.max}</span>
          </button>
        </div>
        <div style={{ opacity: .75, fontSize: ".9rem", marginTop: ".5rem" }}>Use jokers while a challenge is open.</div>
      </div>

      {/* Board */}
      <div className="board">
        {data.categories.map((cat) => {
          const tiles = [];
          for (let d = 1; d <= 10; d++) {
            const ch = cat.challenges.find((x) => x.difficulty === d);
            const id = ch?.id || `${cat.key}-missing-${d}`;
            const pts = config.scoring.byDifficulty[String(d)] || (d * 100);
            const isSolved = solved.has(id);
            const isExpired = expired.has(id);
            const disabled = globalDisabled || isSolved || isExpired || !ch;

            tiles.push(
              <div
                key={id}
                className={`tile ${disabled ? "locked" : ""} ${isExpired ? "expired" : ""}`}
                onClick={() => ch && !disabled && openTile(ch)}
                title={ch ? ch.title : "No challenge defined"}
              >
                <div style={{ opacity: 0.7, fontSize: ".85rem" }}>Tier {d}</div>
                <div style={{ fontWeight: 800, fontSize: "1.4rem" }}>{pts}</div>
                {isSolved && <div style={{ color: "#34d399", fontSize: ".8rem" }}>Solved</div>}
                {isExpired && <div style={{ color: "#f87171", fontSize: ".8rem" }}>Expired</div>}
                {!ch && <div style={{ color: "#fbbf24", fontSize: ".8rem" }}>Missing</div>}
              </div>
            );
          }

          return (
            <div key={cat.key} className="category">
              <div className="title">{cat.label}</div>
              <div className="tiles">{tiles}</div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {open && (
        <div className="modal open">
          <div className="panel content">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".5rem" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.2rem" }}>{open.title}</div>
                <div style={{ opacity: 0.75, fontSize: ".9rem" }}>
                  Tier {open.difficulty} • {config.scoring.byDifficulty[String(open.difficulty)]} pts
                </div>
              </div>
              <button onClick={closeModal}>Close</button>
            </div>

            <div style={{ whiteSpace: "pre-wrap", marginBottom: ".5rem" }}>{open.description}</div>
            {open.externalLink && (
              <div style={{ marginBottom: ".5rem", fontSize: ".9rem" }}>
                <a href={open.externalLink} target="_blank" rel="noreferrer">External resource</a>
              </div>
            )}

            <div style={{ display: "flex", gap: ".5rem", alignItems: "center", marginBottom: ".5rem" }}>
              <input
                value={flag}
                onChange={(e) => setFlag(e.target.value)}
                placeholder="flag{...}"
                style={{ flex: 1 }}
                disabled={(perTimers[open.id] || 0) - Date.now() <= 0}
              />
              <button onClick={submitFlag} disabled={(perTimers[open.id] || 0) - Date.now() <= 0}>
                Submit
              </button>
              <div style={{ fontSize: ".9rem" }}>
                Time:{" "}
                <span style={{ fontFamily: "monospace" }}>
                  {$fmt((perTimers[open.id] || 0) - Date.now())}
                </span>
              </div>
            </div>

            <div style={{ fontSize: ".9rem", opacity: 0.85 }}>{hintText}</div>
            <div style={{ marginTop: ".5rem", fontSize: ".9rem" }}>{msg}</div>
          </div>
        </div>
      )}
    </div>
  );
}

