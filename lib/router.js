// Router kecil: add(method, '/api/x/:id', handler, {public|admin|cron}). Satu function Vercel melayani semua rute (aman untuk batas 12 function di paket Hobby).
const routes = [];
export function add(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/+$/, '').replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler, opts, pattern });
}
export const get = (p, h, o) => add('GET', p, h, o);
export const post = (p, h, o) => add('POST', p, h, o);
export const put = (p, h, o) => add('PUT', p, h, o);
export const patch = (p, h, o) => add('PATCH', p, h, o);
export const del = (p, h, o) => add('DELETE', p, h, o);

export function match(method, path) {
  let allowed = false;
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    if (r.method !== method) { allowed = true; continue; }
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { route: r, params };
  }
  return { route: null, methodNotAllowed: allowed };
}
export const listRoutes = () => routes.map(r => `${r.method} ${r.pattern}`);
