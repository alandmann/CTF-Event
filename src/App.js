import React, { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [challenges, setChallenges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [flag, setFlag] = useState("");
  const [score, setScore] = useState(0);
  const [theme, setTheme] = useState("fantasy");
  const [globalTime, setGlobalTime] = useState(120 * 60);
  const [jokers, setJokers] = useState({
    consult_oracle: 5,
    chronoshard: 2,
    reroll_trial: 3,
    wildcard_ritual: 1
  });
  const [easterEggs, setEasterEggs] = useState([]);
  const [eggInput, setEggInput] = useState("");
  const [eggOutput, setEggOutput] = useState("");

  // -----------------------
  // Load data from backend
  // -----------------------
  useEffect(() => {
    const API_BASE = "http://localhost:3001/api";
    fetch(`${API_BASE}/challenges`).then(r => r.json()).then(setChallenges);
    fetch(`${API_BASE}/easter-eggs`).then(r => r.json()).then(setEasterEggs);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setGlobalTime(t => Math.max(t - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (s) => `${Math.floor(s/60)}:${("0"+(s%60)).slice(-2)}`;

  const submitFlag = async () => {
    alert("Flag submission not yet implemented in this version.");
  };

  const triggerJoker = (type) => {
    if (jokers[type] <= 0) return alert("No more uses!");
    if (type === "consult_oracle" && selected) alert("Hint: " + selected.hint);
    if (type === "chronoshard") alert("+30s added!");
    if (type === "reroll_trial" && selected) alert("Rerolled challenge!");
    if (type === "wildcard_ritual") {
      const effects = ["Double points!", "Time freeze!", "Point penalty!"];
      alert("Wildcard effect: " + effects[Math.floor(Math.random()*effects.length)]);
    }
    setJokers({...jokers, [type]: jokers[type]-1});
  };

  const checkEgg = () => {
    const found = easterEggs.find(e => e.trigger.toLowerCase() === eggInput.toLowerCase());
    if (found) {
      setEggOutput(found.response);
      if (found.points) setScore(score + found.points);
    } else setEggOutput("Nothing happens...");
    setEggInput("");
  };

  const categories = [...new Set(challenges.map(c => c.category))];

  return (
    <div className={`theme-${theme} min-h-screen p-4`}>
      <h1 className="text-2xl mb-2">CTF Jeopardy - Score {score}</h1>
      <p>Global Time: {formatTime(globalTime)}</p>

      {/* Theme switch */}
      <div className="my-2">
        <button onClick={()=>setTheme("fantasy")}>Fantasy</button>
        <button onClick={()=>setTheme("cli")}>CLI Hacker</button>
        <button onClick={()=>setTheme("corporate")}>Corporate</button>
      </div>

      {/* Jokers */}
      <div className="my-2">
        {Object.keys(jokers).map(j => (
          <button key={j} onClick={()=>triggerJoker(j)}>
            {j} ({jokers[j]})
          </button>
        ))}
      </div>

      {/* Easter eggs */}
      <div className="my-2">
        <input value={eggInput} onChange={e=>setEggInput(e.target.value)} placeholder="Type Easter Egg" />
        <button onClick={checkEgg}>Submit</button>
        <p>{eggOutput}</p>
      </div>

      {/* Challenge Board */}
      <div className="grid grid-cols-5 gap-2 mt-4">
        {categories.map(cat => (
          <div key={cat}>
            <h2 className="font-bold">{cat}</h2>
            {challenges.filter(c => c.category===cat).map(c => (
              <button
                key={c.id}
                className={`w-full border p-2 mb-1 ${c.expired ? "expired-challenge" : ""}`}
                onClick={()=>setSelected(c)}
              >
                {c.points}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Challenge modal */}
      {selected && (
        <div className="modal open">
          <div className="content p-4 bg-white border">
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
            <input value={flag} onChange={e=>setFlag(e.target.value)} placeholder="flag{}" />
            <button onClick={submitFlag}>Submit</button>
            <button onClick={()=>setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

