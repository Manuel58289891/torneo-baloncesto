// Utilidades compartidas de las funciones de Vercel.
// Almacenamiento: Upstash Redis (plan gratuito) vía REST. Sin dependencias.
const crypto = require('crypto');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const TOKEN_TTL_MS = 12 * 3600 * 1000;

async function redis(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('Falta conectar Upstash Redis al proyecto');
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const EMPTY = { name: 'Torneo de Baloncesto', teams: [], games: [] };
async function getData() {
  const v = await redis(['GET', 'tournament']);
  return v ? JSON.parse(v) : EMPTY;
}
const setData = (d) => redis(['SET', 'tournament', JSON.stringify(d)]);
const validData = (d) => d && typeof d.name === 'string' && Array.isArray(d.teams) && Array.isArray(d.games);

// Tokens sin estado (las funciones serverless no comparten memoria): "<expira>.<firma>"
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const sign = (exp) => crypto.createHmac('sha256', sha('torneo:' + (process.env.ADMIN_PASSWORD || ''))).update(String(exp)).digest('hex');
function newToken() { const exp = Date.now() + TOKEN_TTL_MS; return exp + '.' + sign(exp); }
function isAdmin(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const m = /^Bearer (\d+)\.([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  if (!m || +m[1] < Date.now()) return false;
  return crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(sign(m[1])));
}
function passwordOk(p) {
  const real = process.env.ADMIN_PASSWORD;
  return !!real && crypto.timingSafeEqual(sha(p), sha(real));
}

function json(res, code, obj, cache) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(obj));
}
const handler = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) { console.error(e); json(res, 500, { error: e.message || 'Error del servidor' }); }
};

module.exports = { redis, getData, setData, validData, newToken, isAdmin, passwordOk, json, handler };
