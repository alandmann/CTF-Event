const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const SRC = path.join(__dirname, '..', 'challenges.src.json');
const OUT = path.join(__dirname, '..', 'challenges.json');

function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

function build() {
  const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const out = deepClone(src);

  for (const cat of out.categories) {
    for (const ch of cat.challenges) {
      if (!ch.flag) {
        console.warn(`[WARN] Challenge ${ch.id} missing plaintext flag; skipping hash.`);
        continue;
      }
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(ch.flag, salt);
      ch.flagHash = hash;
      delete ch.flag; // remove plaintext
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT}`);
}

build();

