const { useState, useEffect, useMemo, useRef } = React;

function useInterval(callback, delay) {
  const savedRef = useRef();
  useEffect(()=>{ savedRef.current = callback; });
  useEffect(()=>{
    if (delay == null) return;
    const id = setInterval(()=> savedRef.current && savedRef.current(), delay);
    return ()=> clearInterval(id);
  }, [delay]);
}

function fmt(ms){
  if (ms < 0) ms = 0;
  const s = Math.floor(ms/1000);
  const m = Math.floor(s/60); const ss = s%60;
  const mm = String(m).padStart(2,'0');
  const sss = String(ss).padStart(2,'0');
  return `${mm}:${sss}`;
}

function App(){
  const [config, setConfig] = useState(null);
  const [data, setData] = useState(null);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'fantasy');
  const [playerName, setPlayerName] = useState(localStorage.getItem('playerName') || 'solo');
  const [score, setScore] = useState(Number(localStorage.getItem('score')||'0'));
  const [solved, setSolved] = useState(new Set(JSON.parse(localStorage.getItem('solved')||'[]')));
  const [expired, setExpired] = useState(new Set(JSON.parse(localStorage.getItem('expired')||'[]')));
  const [perTimers, setPerTimers] = useState(JSON.parse(localStorage.getItem('perTimers')||'{}')); // id -> endTs
  const [globalEnd, setGlobalEnd] = useState(Number(localStorage.getItem('globalEnd')||0));
  const [jokers, setJokers] = useState(JSON.parse(localStorage.getItem('jokers')||'{}'));
  const [open, setOpen] = useState(null); // challenge object
  const [msg, setMsg] = useState('');

  useEffect(()=>{
    (async ()=>{
      const cfg = await fetch('/api/config').then(r=>r.json());
      const chs = await fetch('/api/challenges').then(r=>r.json());
      setConfig(cfg); setData(chs);
      if (!globalEnd) {
        const end = Date.now() + cfg.game.globalMinutes*60*1000;
        setGlobalEnd(end); localStorage.setItem('globalEnd', String(end));
      }
      document.body.classList.remove('theme-fantasy','theme-cli','theme-corporate');
      document.body.classList.add('theme-'+(localStorage.getItem('theme')||cfg.game.defaultTheme));
    })();
  }, []);

  useEffect(()=>{ localStorage.setItem('theme', theme); document.body.classList.remove('theme-fantasy','theme-cli','theme-corporate'); document.body.classList.add('theme-'+theme); }, [theme]);
  useEffect(()=>{ localStorage.setItem('playerName', playerName); }, [playerName]);
  useEffect(()=>{ localStorage.setItem('score', String(score)); }, [score]);
  useEffect(()=>{ localStorage.setItem('solved', JSON.stringify([...solved])); }, [solved]);
  useEffect(()=>{ localStorage.setItem('expired', JSON.stringify([...expired])); }, [expired]);
  useEffect(()=>{ localStorage.setItem('perTimers', JSON.stringify(perTimers)); }, [perTimers]);
  useEffect(()=>{ localStorage.setItem('jokers', JSON.stringify(jokers)); }, [jokers]);

  useInterval(()=>{
    if (!globalEnd) return;
    const remain = globalEnd - Date.now();
    if (remain <= 0) {
      // lock everything
      setMsg('Global time over. Trials sealed.');
    }
    // trigger re-render via state change
    setGlobalEnd(prev=>prev);
  }, 250);

  if (!config || !data) return <div className="p-6 text-lg">Loading…</div>;

  const categories = data.categories;

  const scoring = (d)=> config.scoring.byDifficulty[String(d)] || 0;
  const tierTime = (d)=> config.timers.byDifficulty[String(d)] || 120;

  const openTile = (cat, ch)=>{
    if (solved.has(ch.id) || expired.has(ch.id)) return;
    if (!perTimers[ch.id]) {
      const end = Date.now() + tierTime(ch.difficulty)*1000;
      setPerTimers(prev=> ({ ...prev, [ch.id]: end }));
    }
    setOpen({ cat, ch });
    setMsg('');
  };

  const applyJoker = async (kind)=>{
    if (!config.game.enableJokers) return;
    const max = config.jokers[kind]?.max ?? 0;
    const cur = jokers[kind] || 0;
    if (cur >= max) { alert('No uses left.'); return; }
    const current = open?.ch;

    if (kind==='consult_oracle'){
      if (!current) return alert('Open a challenge first.');
      if (score < config.scoring.hintCost) return alert('Not enough points.');
      setScore(s => Math.max(0, s - config.scoring.hintCost));
      setMsg(current.hint ? 'Hint: '+current.hint : 'The oracle is silent…');
      await fetch('/api/hint-used',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ playerName }) });
    }
    else if (kind==='chronoshard'){
      if (!current) return alert('Open a challenge first.');
      setPerTimers(prev=> ({ ...prev, [current.id]: (prev[current.id]||Date.now()) + config.jokers.chronoshard.seconds*1000 }));
    }
    else if (kind==='reroll_trial'){
      if (!current) return alert('Open a challenge first.');
      const cat = categories.find(c=> c.key===open.cat.key);
      const same = cat.challenges.filter(x=> x.difficulty===current.difficulty && x.id!==current.id);
      if (same.length===0) return alert('No alternate trial exists.');
      const next = same[Math.floor(Math.random()*same.length)];
      // transfer timer
      const remain = Math.max(0, (perTimers[current.id]||Date.now()) - Date.now());
      setPerTimers(prev=> { const p = {...prev}; delete p[current.id]; p[next.id] = Date.now() + remain; return p; });
      setOpen({ cat, ch: next });
      setMsg('The trial has shifted…');
    }
    else if (kind==='wildcard_ritual'){
      const roll = Math.random();
      if (roll < 0.33) { setScore(s=> s+250); alert('Fortune smiles: +250 points!'); }
      else if (roll < 0.66){
        const add = 20000; // +20s
        if (open?.ch) setPerTimers(prev=> ({ ...prev, [open.ch.id]: (prev[open.ch.id]||Date.now()) + add }));
        setGlobalEnd(g=> { const v = g + add; localStorage.setItem('globalEnd', String(v)); return v; });
        alert('Time bends: +20s to current and global!');
      } else { setScore(s=> Math.max(0, s-200)); alert('A trap! −200 points.'); }
    }

    setJokers(prev=> ({ ...prev, [kind]: (prev[kind]||0) + 1 }));
  };

  const submitFlag = async (value)=>{
    if (!open) return;
    const end = perTimers[open.ch.id];
    if (Date.now() > end) {
      setExpired(prev=> new Set(prev).add(open.ch.id));
      setMsg('The challenge has been sealed by time.');
      return;
    }
    const res = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ challengeId: open.ch.id, flag: value, playerName }) });
    const j = await res.json();
    if (j.ok) {
      setScore(s=> s + (j.points||0));
      setSolved(prev=> new Set(prev).add(open.ch.id));
      setMsg('Correct! +' + (j.points||0) + ' points.');
      setTimeout(()=> setOpen(null), 600);
    } else {
      setMsg('Not quite. Keep trying!');
    }
  };

  const globalRemain = globalEnd ? Math.max(0, globalEnd - Date.now()) : 0;
  const lockAll = globalRemain <= 0;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="panel card p-4 mb-4 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="text-2xl font-bold">{config.game.title}</div>
          <div className="text-sm opacity-80">Select a theme, set a player name, and begin.</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input className="panel p-2 rounded" placeholder="Player name" value={playerName} onChange={e=> setPlayerName(e.target.value)} />
          <select className="panel p-2 rounded" value={theme} onChange={e=> setTheme(e.target.value)}>
            {config.game.themes.map(t=> <option key={t} value={t}>{t}</option>)}
          </select>
          <div>Score: <span className="font-bold">{score}</span></div>
          <div>Global: <span className="font-mono">{fmt(globalRemain)}</span></div>
        </div>
      </div>

      {/* Easter eggs */}
      {config.game.enableEasterEggs && (
        <EasterEggs playerName={playerName} onReward={delta=> setScore(s=> Math.max(0, s+delta))} />
      )}

      {/* Jokers */}
      {config.game.enableJokers && (
        <div className="panel card p-3 mb-4">
          <div className="font-bold mb-2">Jokers</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button className="panel p-2 rounded" onClick={()=> applyJoker('consult_oracle')}>Consult the Oracle (−{config.scoring.hintCost}) <span className="badge ml-2">{(jokers.consult_oracle||0)}/{config.jokers.consult_oracle.max}</span></button>
            <button className="panel p-2 rounded" onClick={()=> applyJoker('chronoshard')}>Chronoshard (+{config.jokers.chronoshard.seconds}s) <span className="badge ml-2">{(jokers.chronoshard||0)}/{config.jokers.chronoshard.max}</span></button>
            <button className="panel p-2 rounded" onClick={()=> applyJoker('reroll_trial')}>Reroll the Trial <span className="badge ml-2">{(jokers.reroll_trial||0)}/{config.jokers.reroll_trial.max}</span></button>
            <button className="panel p-2 rounded" onClick={()=> applyJoker('wildcard_ritual')}>Wildcard Ritual <span className="badge ml-2">{(jokers.wildcard_ritual||0)}/{config.jokers.wildcard_ritual.max}</span></button>
          </div>
          {msg && <div className="text-sm opacity-80 mt-2">{msg}</div>}
        </div>
      )}

      {/* Board */}
      <div className="panel card p-3">
        <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(categories.length, 5)}, 1fr)` }}>
          {categories.map(cat=> (
            <div key={cat.key}>
              <div className="text-lg font-bold mb-2">{cat.label}</div>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(1, 1fr)' }}>
                {Array.from({length: 10}, (_,i)=> i+1).map(tier=>{
                  const ch = cat.challenges.find(c=> c.difficulty===tier);
                  const id = ch?.id || `${cat.key}-placeholder-${tier}`;
                  const pts = scoring(tier);
                  const isSolved = solved.has(id);
                  const isExpired = expired.has(id);
                  const disabled = lockAll || isSolved || isExpired || !ch;
                  return (
                    <div key={id} className={`tile panel p-3 ${disabled?'disabled':''}`} onClick={()=> ch && openTile(cat, ch)}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm opacity-70">Tier {tier}</div>
                        <div className="text-xl font-bold">{pts}</div>
                      </div>
                      {isSolved && <div className="text-emerald-300 text-xs mt-1">Solved</div>}
                      {isExpired && <div className="text-rose-300 text-xs mt-1">Expired</div>}
                      {!ch && <div className="text-yellow-300 text-xs mt-1">(empty slot)</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {open && (
        <Modal onClose={()=> setOpen(null)}>
          <ChallengeModal open={open} perTimers={perTimers} setPerTimers={setPerTimers} submitFlag={submitFlag} setExpired={setExpired} tierTime={tierTime} scoring={scoring} />
        </Modal>
      )}

      {/* Footer actions */}
      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <a className="underline" href="/api/scoreboard/export.json" target="_blank" rel="noreferrer">Export JSON</a>
        <a className="underline" href="/api/scoreboard/export.csv" target="_blank" rel="noreferrer">Export CSV</a>
      </div>
    </div>
  );
}

function EasterEggs({ playerName, onReward }){
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const cast = async ()=>{
    if (!text.trim()) return;
    const res = await fetch('/api/easter-egg', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text, playerName }) });
    const j = await res.json();
    setMsg(j.message||'');
    if (j.ok && typeof j.reward==='number') onReward(j.reward);
    setText('');
  };
  return (
    <div className="panel card p-3 mb-4 flex items-center gap-2">
      <div className="text-sm opacity-80">Speak to the spirits (Easter eggs):</div>
      <input className="panel p-2 flex-1 rounded" placeholder="type a secret incantation…" value={text} onChange={e=> setText(e.target.value)} onKeyDown={e=> e.key==='Enter' && cast()} />
      <button className="panel p-2 rounded" onClick={cast}>Cast</button>
      <div className="text-sm ml-2">{msg}</div>
    </div>
  );
}

function Modal({ children, onClose }){
  useEffect(()=>{
    const onKey = (e)=>{ if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal open">
      <div className="content panel card p-4">
        <div className="flex justify-end mb-2"><button className="panel p-2 rounded" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

function ChallengeModal({ open, perTimers, setPerTimers, submitFlag, setExpired, tierTime, scoring }){
  const { cat, ch } = open;
  const [val, setVal] = useState('');
  const [now, setNow] = useState(Date.now());
  useInterval(()=> setNow(Date.now()), 200);

  useEffect(()=>{
    if (!perTimers[ch.id]) { setPerTimers(prev=> ({ ...prev, [ch.id]: Date.now() + tierTime(ch.difficulty)*1000 })); }
  }, [ch.id]);

  const remain = Math.max(0, (perTimers[ch.id] || Date.now()) - now);
  const disabled = remain <= 0;
  useEffect(()=>{ if (disabled) setExpired(prev=> new Set(prev).add(ch.id)); }, [disabled]);

  return (
    <div>
      <div className="text-xl font-bold">{ch.title}</div>
      <div className="text-sm opacity-75 mb-2">{cat.label} • Tier {ch.difficulty} • {scoring(ch.difficulty)} pts</div>
      <div className="mb-2 whitespace-pre-wrap">{ch.description}</div>
      {ch.externalLink && <div className="mb-2"><a className="underline" href={ch.externalLink} target="_blank" rel="noreferrer">External resource</a></div>}
      <div className="flex items-center gap-2 mb-2">
        <input className="panel p-2 rounded flex-1" placeholder="flag{...}" value={val} onChange={e=> setVal(e.target.value)} disabled={disabled} />
        <button className={`panel p-2 rounded ${disabled?'opacity-50 pointer-events-none':''}`} onClick={()=> submitFlag(val)}>Submit</button>
        <div className="text-sm">Time: <span className="font-mono">{fmt(remain)}</span></div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

