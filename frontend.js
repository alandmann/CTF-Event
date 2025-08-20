async function loadChallenges() {
  const res = await fetch("/api/challenges");
  const data = await res.json();

  const categories = [...new Set(data.map(c => c.category))];

  const board = document.getElementById("board");
  board.innerHTML = ""; // reset

  categories.forEach(cat => {
    const col = document.createElement("div");
    col.className = "category-column";
    const header = document.createElement("h2");
    header.textContent = cat;
    col.appendChild(header);

    data.filter(ch => ch.category === cat)
        .sort((a, b) => a.difficulty - b.difficulty)
        .forEach(challenge => {
          const btn = document.createElement("button");
          btn.textContent = challenge.difficulty * 100; // points
          btn.onclick = () => showChallenge(challenge);
          col.appendChild(btn);
        });

    board.appendChild(col);
  });
}

function showChallenge(ch) {
  const modal = document.getElementById("modal");
  modal.innerHTML = `
    <h2>${ch.title}</h2>
    <p>${ch.description}</p>
    ${ch.hint ? `<p><b>Hint:</b> ${ch.hint}</p>` : ""}
    ${ch.files ? ch.files.map(f => `<a href="data:application/octet-stream;base64,${f.content_b64}" download="${f.name}">${f.name}</a>`).join("<br>") : ""}
    <input id="flagInput" placeholder="Enter flag">
    <button onclick="submitFlag('${ch.flag}')">Submit</button>
  `;
  modal.style.display = "block";
}

function submitFlag(expected) {
  const val = document.getElementById("flagInput").value.trim();
  if (val === expected) {
    alert("✅ Correct!");
  } else {
    alert("❌ Wrong flag!");
  }
}

