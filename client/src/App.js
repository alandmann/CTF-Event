import React, { useEffect, useState } from "react";
import "./index.css";

function App() {
  const [categories, setCategories] = useState([]);
  const [selectedChallenge, setSelectedChallenge] = useState(null);

  useEffect(() => {
    fetch("/api/challenges")
      .then((res) => res.json())
      .then((data) => {
        setCategories(data.categories || []);
      })
      .catch((err) => console.error("Failed to load challenges:", err));
  }, []);

  const closeModal = () => {
    setSelectedChallenge(null);
  };

  const downloadFile = (file) => {
    const blob = new Blob(
      [Uint8Array.from(atob(file.content_b64), (c) => c.charCodeAt(0))],
      { type: "application/octet-stream" }
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    link.click();
  };

  return (
    <div className="app">
      <h1 className="title">CTF Jeopardy</h1>

      <div className="board">
        {categories.map((cat) => (
          <div key={cat.key} className="category-column">
            <h2 className="category-title">{cat.label}</h2>
            {cat.challenges.map((ch) => (
              <button
                key={ch.id}
                className={`tile ${ch.difficulty === 3 ? "shattered" : ""}`}
                onClick={() => setSelectedChallenge(ch)}
              >
                <div className="tile-title">{ch.title}</div>
                <div className="tile-points">{ch.points}</div>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Modal */}
      {selectedChallenge && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()} // prevent closing when clicking inside
          >
            <h2>{selectedChallenge.title}</h2>
            <p>{selectedChallenge.description}</p>

            {selectedChallenge.files &&
              selectedChallenge.files.map((file, idx) => (
                <button
                  key={idx}
                  onClick={() => downloadFile(file)}
                  className="download-btn"
                >
                  Download {file.name}
                </button>
              ))}

            <button className="close-btn" onClick={closeModal}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

