// Genera la carpeta docs/ (sitio estático de solo lectura) para publicarla en GitHub Pages.
// Uso:  node build-static.js      (o doble clic en publicar.cmd para generar y subir a GitHub)
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const OUT = path.join(__dirname, 'docs');
const PUBLIC = path.join(__dirname, 'public');

if (!fs.existsSync(path.join(DATA_DIR, 'data.json'))) {
  console.error('No hay datos todavía. Arranca "node server.js", entra a /admin.html y carga el torneo.');
  process.exit(1);
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Página pública (sin el panel de administración)
for (const f of fs.readdirSync(PUBLIC)) {
  if (f === 'admin.html' || f === 'admin.js') continue;
  let buf = fs.readFileSync(path.join(PUBLIC, f));
  if (f === 'index.html') buf = buf.toString('utf8').replace(/\s*<a href="admin\.html">[^<]*<\/a>/, '');
  fs.writeFileSync(path.join(OUT, f), buf);
}

// Imágenes (logos / fotos) y datos, con rutas relativas para que funcionen bajo /nombre-del-repo/
const upDir = path.join(DATA_DIR, 'uploads');
if (fs.existsSync(upDir)) fs.cpSync(upDir, path.join(OUT, 'uploads'), { recursive: true });
const json = fs.readFileSync(path.join(DATA_DIR, 'data.json'), 'utf8').replace(/"\/uploads\//g, '"uploads/');
fs.writeFileSync(path.join(OUT, 'data.json'), json);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const d = JSON.parse(json);
console.log(`Listo: docs/ con ${d.teams.length} equipos y ${d.games.filter((g) => g.played).length}/${d.games.length} partidos jugados.`);
