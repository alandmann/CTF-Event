import React, { useEffect, useState } from "react";
import "./index.css";

function App() {
  const [challenges, setChallenges] = useState([]);
  const [selectedChallenge, setSelectedChallenge] = useState(null);

  useEffect(() => {
    fetch("/api/challenges")
      .then((res) => res.json())
      .then((data) => setChallenges(data))
      .catch((err) => console.error("Failed to load challenges:", err));
  }, []);

  // group challenges by category
  const categories = {};
  challenges.forEach((ch) => {
    if (!categories[ch.category]) categories[ch.category] = [];
    categories[ch.category].push(ch);
  });

  return (
    <div className="app">
      <h1>CTF Jeopardy</h1>
      <div className="grid">
        {Object.keys(categories).map((cat) => (
          <div key={cat} className="category">
            <h2>{cat}</h2>
            <div className="tiles">
              {categories[cat]
                .sort((a, b) => a.difficulty - b.difficulty)
                .map((ch) => (
                  <button
                    key={ch.id}
                    className={`tile ${ch.category === 3 ? "shattered" : ""}`}
                    onClick={() => setSelectedChallenge(ch)}
                  >
                    <div className="tile-title">{ch.title}</div>
                    <div className="tile-points">{ch.difficulty * 100}</div>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      {selectedChallenge && (
        <div className="modal-overlay" onClick={() => setSelectedChallenge(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{selectedChallenge.title}</h2>
            <p>{selectedChallenge.description}</p>
            {selectedChallenge.files && selectedChallenge.files.length > 0 && (
              <div>
                <h3>Downloads:</h3>
                <ul>
                  {selectedChallenge.files.map((file, idx) => {
                    const blob = new Blob(
                      [atob(file.content_b64)],
                      { type: "application/octet-stream" }
                    );
                    const url = URL.createObjectURL(blob);
                    return (
                      <li key={idx}>
                        <a href={url} download={file.name}>
                          {file.name}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <button onClick={() => setSelectedChallenge(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

