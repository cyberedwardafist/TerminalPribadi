// Memuat .env di root proyek ke process.env. Variabel yang sudah terisi (tidak kosong) di lingkungan tidak ditimpa.
// Format yang didukung: KEY=VALUE, "KEY = VALUE", `export KEY=VALUE`, nilai berkutip ' atau " (boleh mengandung # dan spasi),
// komentar baris penuh (#...), komentar di ujung nilai tanpa kutip ( ... # komentar), BOM, dan akhir baris Windows (CRLF).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (!m) continue;
    let val = m[2].trim();
    const q = val[0];
    if ((q === '"' || q === "'") && val.indexOf(q, 1) > 0) {
      const end = val.indexOf(q, 1);
      val = val.slice(1, end);
      if (q === '"') val = val.replace(/\\n/g, '\n');
    } else {
      val = val.replace(/\s+#.*$/, '').trim();
    }
    out[m[1]] = val;
  }
  return out;
}

try {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  const vars = parseEnv(fs.readFileSync(file, 'utf8'));
  for (const [k, val] of Object.entries(vars)) if (!process.env[k]) process.env[k] = val;
} catch { /* tanpa .env */ }
