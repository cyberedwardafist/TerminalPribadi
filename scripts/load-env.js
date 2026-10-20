// Memuat .env di root proyek ke process.env (KEY=VALUE, komentar #, kutip). Variabel yang sudah ada di lingkungan tidak ditimpa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
try {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* tanpa .env */ }
