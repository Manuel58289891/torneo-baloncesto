// Servidor sin dependencias externas: solo Node.js.
// Público: GET /  (resultados)      Admin: /admin.html (requiere contraseña)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
// En un hosting, apunta DATA_DIR a un disco persistente (ej. /var/data) para no perder los datos.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { name: 'Torneo de Baloncesto', teams: [], games: [] }; }
}
function saveData(d) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let data = loadData();
const tokens = new Map(); // token -> expira
const TOKEN_TTL = 12 * 3600 * 1000;

function isAdmin(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const exp = tokens.get(m[1]);
  if (!exp || exp < Date.now()) { tokens.delete(m[1]); return false; }
  return true;
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 5e6) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
  });
}
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function validData(d) {
  return d && typeof d.name === 'string' && Array.isArray(d.teams) && Array.isArray(d.games);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/data' && req.method === 'GET') return send(res, 200, data);

    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { password } = await readBody(req);
      if (crypto.timingSafeEqual(sha(password), sha(ADMIN_PASSWORD))) {
        const t = crypto.randomBytes(24).toString('hex');
        tokens.set(t, Date.now() + TOKEN_TTL);
        return send(res, 200, { token: t });
      }
      return send(res, 401, { error: 'Contraseña incorrecta' });
    }

    if (url.pathname === '/api/data' && req.method === 'PUT') {
      if (!isAdmin(req)) return send(res, 401, { error: 'No autorizado' });
      const d = await readBody(req);
      if (!validData(d)) return send(res, 400, { error: 'Datos inválidos' });
      data = d; saveData(data);
      return send(res, 200, { ok: true });
    }

    // Subida de imágenes (logos / fotos): el cliente envía un data URL ya reducido
    if (url.pathname === '/api/upload' && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 401, { error: 'No autorizado' });
      const { dataUrl } = await readBody(req);
      const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
      if (!m) return send(res, 400, { error: 'Imagen inválida' });
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 2e6) return send(res, 400, { error: 'Imagen demasiado grande' });
      const name = crypto.randomBytes(10).toString('hex') + (m[1] === 'jpeg' ? '.jpg' : '.' + m[1]);
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
      return send(res, 200, { url: '/uploads/' + name });
    }
    const up = /^\/uploads\/([a-f0-9]+\.(?:png|jpg|webp))$/.exec(url.pathname);
    if (up && req.method === 'GET') {
      return fs.readFile(path.join(UPLOAD_DIR, up[1]), (err, buf) => {
        if (err) return send(res, 404, { error: 'No encontrado' });
        const ext = path.extname(up[1]);
        res.writeHead(200, { 'Content-Type': ext === '.jpg' ? 'image/jpeg' : 'image/' + ext.slice(1), 'Cache-Control': 'public, max-age=31536000, immutable' });
        res.end(buf);
      });
    }

    if (url.pathname === '/api/check' && req.method === 'GET') {
      return send(res, isAdmin(req) ? 200 : 401, { ok: isAdmin(req) });
    }

    // Archivos estáticos
    if (req.method !== 'GET') return send(res, 405, { error: 'Método no permitido' });
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Prohibido' });
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, { error: 'No encontrado' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  } catch (e) {
    send(res, 400, { error: 'Solicitud inválida' });
  }
});

server.listen(PORT, () => {
  console.log(`Torneo en http://localhost:${PORT}   Admin: http://localhost:${PORT}/admin.html`);
  if (!process.env.ADMIN_PASSWORD) console.log('Contraseña de admin por defecto: admin123 (cámbiala con ADMIN_PASSWORD)');
});
