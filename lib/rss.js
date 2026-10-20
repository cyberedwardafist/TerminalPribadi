// Parser RSS/Atom ringan (tanpa dependensi) + utilitas teks.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export const decode = s => String(s ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const cdata = s => String(s ?? '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
export const stripHtml = h => decode(cdata(h).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(p|div|li|h\d|br)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n[ \n]*/g, '\n').trim();
const tag = (x, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(x); return m ? m[1] : ''; };

export function parseFeed(xml) {
  const items = [];
  const re = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi; let m;
  while ((m = re.exec(xml))) {
    const x = m[2];
    let link = stripHtml(tag(x, 'link'));
    if (!link) link = (/<link[^>]*href=["']([^"']+)["']/i.exec(x) || [])[1] || stripHtml(tag(x, 'guid'));
    const html = cdata(tag(x, 'content:encoded')) || cdata(tag(x, 'content')) || cdata(tag(x, 'description')) || cdata(tag(x, 'summary'));
    const date = stripHtml(tag(x, 'pubDate') || tag(x, 'published') || tag(x, 'updated') || tag(x, 'dc:date'));
    const t = Date.parse(date);
    items.push({ title: stripHtml(tag(x, 'title')), url: decode(link).trim(), html, text: stripHtml(html), ts: Number.isFinite(t) ? t : null });
  }
  return items.filter(i => i.title && /^https?:\/\//.test(i.url));
}
export const sentences = t => (t.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || []).map(s => s.trim()).filter(s => s.length > 25);

// ---------- sentimen berbasis kamus (Indonesia + Inggris). Sederhana dan transparan, bukan model ML ----------
const POS = ['naik', 'menguat', 'melonjak', 'melejit', 'meroket', 'laba', 'untung', 'rekor', 'positif', 'tumbuh', 'surplus', 'optimis', 'rebound', 'pulih', 'cetak', 'dividen', 'rally', 'surge', 'gain', 'rise', 'rises', 'jump', 'jumps', 'beat', 'beats', 'record', 'bullish', 'upgrade', 'soar', 'soars', 'climb', 'climbs', 'rebounds', 'recover', 'profit', 'growth', 'strong'];
const NEG = ['turun', 'melemah', 'anjlok', 'merosot', 'ambles', 'rugi', 'negatif', 'defisit', 'resesi', 'koreksi', 'tertekan', 'khawatir', 'krisis', 'bangkrut', 'gagal', 'crash', 'plunge', 'plunges', 'drop', 'drops', 'fall', 'falls', 'miss', 'misses', 'bearish', 'downgrade', 'slump', 'slumps', 'loss', 'losses', 'sell-off', 'selloff', 'tumble', 'tumbles', 'weak', 'fear', 'recession', 'hack', 'ban'];
export function sentiment(text) {
  const w = String(text).toLowerCase().match(/[a-zà-ÿ\-]+/g) || []; let s = 0;
  for (const x of w) { if (POS.includes(x)) s++; else if (NEG.includes(x)) s--; }
  return s >= 1 ? 'pos' : s <= -1 ? 'neg' : 'neu';
}
