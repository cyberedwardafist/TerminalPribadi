// Penyaring HTML catatan di server (cermin clean() di klien): hanya tag aman, class "cl"/"done", tanpa atribut lain. Server wajib menyaring ulang.
const OK = new Set(['div', 'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'h3', 'ul', 'ol', 'li', 'span', 'hr']);
const VOID = new Set(['br', 'hr']);
const SKIP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math']);
const esc = s => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function cleanHtml(html, max = 500000) {
  const src = String(html ?? '').slice(0, max);
  const tokens = src.match(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+|</g) || [];
  const out = [], stack = [], skipping = [];
  for (const t of tokens) {
    if (t.startsWith('<!--')) continue;
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/.exec(t);
    if (!m) { if (!skipping.length) out.push(t === '<' ? '&lt;' : esc(t)); continue; }
    const closing = !!m[1], name = m[2].toLowerCase();
    if (SKIP.has(name)) { if (closing) skipping.pop(); else if (!/\/\s*$/.test(m[3])) skipping.push(name); continue; }
    if (skipping.length || !OK.has(name)) continue;
    if (closing) {
      const i = stack.lastIndexOf(name);
      if (i < 0 || VOID.has(name)) continue;
      while (stack.length > i) out.push(`</${stack.pop()}>`);
    } else {
      const cls = /\bclass\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3]);
      const keep = cls ? (cls[2] ?? cls[3] ?? cls[4]).split(/\s+/).filter(c => c === 'cl' || c === 'done') : [];
      out.push(`<${name}${keep.length ? ` class="${keep.join(' ')}"` : ''}>`);
      if (!VOID.has(name)) stack.push(name);
    }
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join('');
}
