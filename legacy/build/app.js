(async function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const state = {
    config: null,
    challenges: null,
    theme: localStorage.getItem('theme') || null,
    globalEnd: null,
    score: 0,
    solved: new Set(JSON.parse(localStorage.getItem('solved')||'[]')),
    expired: new Set(JSON.parse(localStorage.getItem('expired')||'[]')),
    openChallenge: null,
    perTimers: JSON.parse(localStorage.getItem('perTimers')||'{}'), // id -> endTs
    jokers: JSON.parse(localStorage.getItem('jokers')||'{}'),
  };

  function saveState(){
    localStorage.setItem('solved', JSON.stringify([...state.solved]));
    localStorage.setItem('expired', JSON.stringify([...state.expired]));
    localStorage.setItem('perTimers', JSON.stringify(state.perTimers));
    localStorage.setItem('jokers', JSON.stringify(state.jokers));
    localStorage.setItem('theme', state.theme);
    localStorage.setItem('score', String(state.score));
  }

  // Load config & challenges
  state.config = await (await fetch('/api/config')).json();
  const data = await (await fetch('/api/challenges')).json();
  state.challenges = data;
  state.score = Number(localStorage.getItem('score') || '0');

  // Theme
  if (!state.theme) state.theme = state.config.game.defaultTheme;
  document.body.classList.remove('theme-fantasy','theme-cli','theme-corporate');
  document.body.classList.add('theme-' + state.theme);

  // Global timer setup
  if (!localStorage.getItem('globalEnd')) {
    const end = Date.now() + state.config.game.globalMinutes * 60 * 1000;
    localStorage.setItem('globalEnd', String(end));
  }
  state.globalEnd = Number(localStorage.getItem('globalEnd'));

  // Jokers init
  if (!state.jokers.init) {
    state.jokers = {
      init: true,
      consult_oracle: 0,
      chronoshard: 0,
      reroll_trial: 0,
      wildcard_ritual: 0
    };
  }

  // UI build
  const app = $('#app');
  app.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'panel card p-4 mb-4 flex flex-wrap items-center gap-4 justify-between';
  header.innerHTML = `
    <div>
      <div class="text-2xl font-bold glow">${state.config.game.title}</div>
      <div class="text-sm opacity-80">Choose your theme & begin the trials.</div>
    </div>
    <div class="flex items-center gap-2">
      <label for="theme">Theme:</label>
      <select id="theme" class="panel p-2 rounded">
        ${state.config.game.themes.map(t=>`<option value="${t}" ${state.theme===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <div class="ml-4">Score: <span id="score" class="font-bold">${state.score}</span></div>
      <div class="ml-4">Global: <span id="globalTimer" class="font-mono"></span></div>
    </div>
  `;
  app.appendChild(header);

  $('#theme').addEventListener('change', (e)=>{
    state.theme = e.target.value;
    document.body.classList.remove('theme-fantasy','theme-cli','theme-corporate');
    document.body.classList.add('theme-' + state.theme);
    saveState();
  });

  // Easter egg panel
  const eggPanel = document.createElement('div');
  eggPanel.className = 'panel card p-3 mb-4 flex items-center gap-2';
  eggPanel.innerHTML = `
    <div class="text-sm opacity-80">Speak to the spirits (Easter eggs):</div>
    <input id="eggInput" class="panel p-2 flex-1 rounded" placeholder="type a secret incantation..." />
    <button id="eggSubmit" class="btn panel">Cast</button>
    <div id="eggMsg" class="ml-2 text-sm"></div>
  `;
  app.appendChild(eggPanel);

  $('#eggSubmit').addEventListener('click', async ()=>{
    const val = $('#eggInput').value.trim();
    if (!val) return;
    const res = await fetch('/api/easter-egg', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: val })
    });
    const j = await res.json();
    $('#eggMsg').textContent = j.message || '';
    if (j.ok && typeof j.reward === 'number') {
      state.score += j.reward;
      if (state.score < 0) state.score = 0;
      $('#score').textContent = state.score;
      saveState();
    }
    $('#eggInput').value = '';
  });

  // Jokers panel
  const jokers = document.createElement('div');
  jokers.className = 'panel card p-3 mb-4';
  jokers.innerHTML = `
    <div class="font-bold mb-2">Jokers</div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
      <button data-joker="consult_oracle" class="btn panel">Consult the Oracle (−${state.config.scoring.hintCost}) <span class="badge ml-2">${state.jokers.consult_oracle}/${state.config.jokers.consult_oracle.max}</span></button>
      <button data-joker="chronoshard" class="btn panel">Chronoshard (+${state.config.jokers.chronoshard.seconds}s) <span class="badge ml-2">${state.jokers.chronoshard}/${state.config.jokers.chronoshard.max}</span></button>
      <button data-joker="reroll_trial" class="btn panel">Reroll the Trial <span class="badge ml-2">${state.jokers.reroll_trial}/${state.config.jokers.reroll_trial.max}</span></button>
      <button data-joker="wildcard_ritual" class="btn panel">Wildcard Ritual <span class="badge ml-2">${state.jokers.wildcard_ritual}/${state.config.jokers.wildcard_ritual.max}</span></button>
    </div>
    <div class="text-sm opacity-75 mt-2">Use jokers while a challenge is open to affect it.</div>
  `;
  app.appendChild(jokers);

  $$("[data-joker]").forEach(btn=>{
    btn.addEventListener('click', ()=> useJoker(btn.getAttribute('data-joker')));
  });

  // Board
  const board = document.createElement('div');
  board.className = 'panel card p-3';

  // Build categories into columns with 10 tiers visible as tiles
  const cats = state.challenges.categories;
  const cols = cats.length;
  board.innerHTML = `<div class="grid md:grid-cols-${Math.min(cols,5)} gap-4">${cats.map(cat=>{
    const header = `<div class=\"text-lg font-bold mb-2\">${cat.label}</div>`;
    const tiles = (function(){
      // Ensure 10 tier placeholders even if fewer provided
      const tiers = [];
      for (let d=1; d<=10; d++) {
        const pick = cat.challenges.find(c=>c.difficulty===d);
        const id = pick? pick.id : `${cat.key}-placeholder-${d}`;
        const pts = state.config.scoring.byDifficulty[String(d)];
        const solved = state.solved.has(id);
        const expired = state.expired.has(id);
        const classes = ['tile']; if (solved||expired) classes.push('locked');
        return `<div class=\"${classes.join(' ')}\" data-cat=\"${cat.key}\" data-id=\"${id}\" data-diff=\"${d}\">
          <div class=\"text-sm opacity-70\">Tier ${d}</div>
          <div class=\"text-2xl font-bold\">${pts}</div>
          ${solved?'<div class=\"text-emerald-400 text-xs\">Solved</div>': expired?'<div class=\"text-rose-400 text-xs\">Expired</div>':''}
        </div>`;
      }
    })().join('');
    return `<div>${header}<div class=\"board\">${tiles}</div></div>`;
  }).join('')}</div>`;

  app.appendChild(board);

  // Modal for challenge
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="content panel card p-4">
      <div class="flex justify-between items-center mb-2">
        <div>
          <div id="mTitle" class="text-xl font-bold"></div>
          <div id="mMeta" class="text-sm opacity-75"></div>
        </div>
        <button id="mClose" class="btn panel">Close</button>
      </div>
      <div id="mDesc" class="mb-2 whitespace-pre-wrap"></div>
      <div id="mLink" class="mb-2 text-sm"></div>
      <div class="flex items-center gap-2 mb-2">
        <input id="mFlag" class="panel p-2 rounded flex-1" placeholder="flag{...}" />
        <button id="mSubmit" class="btn panel">Submit</button>
        <div class="text-sm">Time: <span id="mTimer" class="font-mono"></span></div>
      </div>
      <div id="mHint" class="text-sm opacity-80"></div>
      <div id="mMsg" class="mt-2 text-sm"></div>
    </div>
  `;
  document.body.appendChild(modal);
  $('#mClose').addEventListener('click', closeModal);
  $('#mSubmit').addEventListener('click', submitFlag);

  // Event: open tile
  $$('.tile').forEach(el=>{
    el.addEventListener('click', ()=>openTile(el));
  });

  // Global timer tick
  setInterval(()=>{
    const remain = state.globalEnd - Date.now();
    $('#globalTimer').textContent = fmt(remain);
    if (remain <= 0) {
      $('#globalTimer').textContent = '00:00';
      // disable board
      $$('.tile').forEach(t=> t.classList.add('locked'));
    }
  }, 250);

  function fmt(ms){
    if (ms < 0) ms = 0;
    const s = Math.floor(ms/1000);
    const m = Math.floor(s/60); const ss = s%60;
    const mm = String(m).padStart(2,'0');
    const sss = String(ss).padStart(2,'0');
    return `${mm}:${sss}`;
  }

  function openTile(el){
    const id = el.getAttribute('data-id');
    const diff = Number(el.getAttribute('data-diff'));
    const catKey = el.getAttribute('data-cat');

    // Find actual challenge by diff (if placeholder -> no challenge)
    const cat = state.challenges.categories.find(c=>c.key===catKey);
    const ch = cat.challenges.find(c=>c.difficulty===diff);
    if (!ch) {
      notify('No challenge defined for this tier yet.');
      return;
    }
    if (state.solved.has(ch.id) || state.expired.has(ch.id)) return;

    state.openChallenge = ch;

    if (!state.perTimers[ch.id]) {
      const seconds = state.config.timers.byDifficulty[String(ch.difficulty)] || 120;
      state.perTimers[ch.id] = Date.now() + seconds*1000;
      saveState();
    }

    // populate modal
    $('#mTitle').textContent = ch.title;
    $('#mMeta').textContent = `${cat.label} • Tier ${ch.difficulty} • ${state.config.scoring.byDifficulty[String(ch.difficulty)]} pts`;
    $('#mDesc').textContent = ch.description;
    $('#mLink').innerHTML = ch.externalLink ? `<a class="underline" href="${ch.externalLink}" target="_blank">External resource</a>` : '';
    $('#mHint').textContent = '';
    $('#mMsg').textContent = '';
    $('#mFlag').value = '';

    modal.classList.add('open');

    tickModal();
  }

  function closeModal(){
    modal.classList.remove('open');
    state.openChallenge = null;
  }

  function tickModal(){
    const t = setInterval(()=>{
      if (!state.openChallenge) return clearInterval(t);
      const end = state.perTimers[state.openChallenge.id];
      const remain = end - Date.now();
      const disabled = remain <= 0;
      $('#mTimer').textContent = fmt(remain);
      $('#mFlag').disabled = disabled;
      $('#mSubmit').classList.toggle('disabled', disabled);
      if (disabled) {
        state.expired.add(state.openChallenge.id);
        saveState();
      }
    }, 200);
  }

  async function submitFlag(){
    if (!state.openChallenge) return;
    const val = $('#mFlag').value.trim();
    if (!val) return;

    // stop if expired
    const end = state.perTimers[state.openChallenge.id];
    if (Date.now() > end) {
      $('#mMsg').textContent = 'The challenge has been sealed by time.';
      return;
    }

    const res = await fetch('/api/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: state.openChallenge.id, flag: val })
    });
    const j = await res.json();
    if (j.ok) {
      const pts = state.config.scoring.byDifficulty[String(state.openChallenge.difficulty)] || 0;
      state.score += pts;
      state.solved.add(state.openChallenge.id);
      $('#score').textContent = state.score;
      $('#mMsg').textContent = `Correct! +${pts} points.`;
      saveState();
      setTimeout(()=>{ location.reload(); }, 750);
    } else {
      $('#mMsg').textContent = 'Not quite. Keep trying!';
    }
  }

  function notify(msg){
    alert(msg);
  }

  async function useJoker(kind){
    const open = state.openChallenge;
    // usage limit check
    const limit = state.config.jokers[kind]?.max ?? 0;
    if ((state.jokers[kind]||0) >= limit) {
      notify('No uses left for this joker.');
      return;
    }

    if (!open && kind !== 'wildcard_ritual') {
      notify('Open a challenge to use this joker.');
      return;
    }

    if (kind==='consult_oracle'){
      // deduct points and show hint if any
      if (state.score < state.config.scoring.hintCost){ notify('Not enough points.'); return; }
      state.score -= state.config.scoring.hintCost;
      $('#score').textContent = state.score;
      $('#mHint').textContent = open?.hint ? `Hint: ${open.hint}` : 'The oracle is silent…';
    }
    else if (kind==='chronoshard'){
      if (!open) return;
      state.perTimers[open.id] = (state.perTimers[open.id] || Date.now()) + state.config.jokers.chronoshard.seconds*1000;
    }
    else if (kind==='reroll_trial'){
      // pick another challenge of same difficulty from same category
      const cat = state.challenges.categories.find(c=> c.challenges.some(cc=>cc.id===open.id));
      const same = cat.challenges.filter(c=> c.difficulty===open.difficulty && c.id!==open.id);
      if (same.length===0){ notify('No alternate trial exists.'); return; }
      const next = same[Math.floor(Math.random()*same.length)];
      state.openChallenge = next;
      // reset UI for new
      $('#mTitle').textContent = next.title;
      $('#mMeta').textContent = `${cat.label} • Tier ${next.difficulty} • ${state.config.scoring.byDifficulty[String(next.difficulty)]} pts`;
      $('#mDesc').textContent = next.description;
      $('#mLink').innerHTML = next.externalLink ? `<a class="underline" href="${next.externalLink}" target="_blank">External resource</a>` : '';
      $('#mHint').textContent = '';
      $('#mMsg').textContent = 'The trial has shifted…';
      $('#mFlag').value = '';
      // transfer timer to new id
      const remain = (state.perTimers[open.id]||Date.now()) - Date.now();
      delete state.perTimers[open.id];
      state.perTimers[next.id] = Date.now() + Math.max(0, remain);
    }
    else if (kind==='wildcard_ritual'){
      const roll = Math.random();
      if (roll < 0.33){ state.score += 250; notify('Fortune smiles: +250 points!'); }
      else if (roll < 0.66){ // time freeze 20s
        const add = 20000;
        if (state.openChallenge) state.perTimers[state.openChallenge.id] += add;
        state.globalEnd += add; localStorage.setItem('globalEnd', String(state.globalEnd));
        notify('Time bends: +20s to current challenge & global clock!');
      } else { state.score = Math.max(0, state.score - 200); notify('A trap! −200 points.'); }
      $('#score').textContent = state.score;
    }

    state.jokers[kind] = (state.jokers[kind]||0) + 1;
    saveState();
    // refresh badges
    $$("[data-joker]").forEach(btn=>{
      const k = btn.getAttribute('data-joker');
      const l = state.config.jokers[k]?.max ?? 0;
      const cur = state.jokers[k]||0;
      const badge = btn.querySelector('.badge');
      if (badge) badge.textContent = `${cur}/${l}`;
    });
  }

})();

