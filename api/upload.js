const crypto = require('crypto');
const { redis, isAdmin, json, handler } = require('./_lib');

// Guarda logos/fotos (ya reducidos a 256 px por el navegador) en Redis y devuelve su URL.
module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
  if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec((req.body || {}).dataUrl || '');
  if (!m) return json(res, 400, { error: 'Imagen inválida' });
  if (m[2].length > 1.5e6) return json(res, 400, { error: 'Imagen demasiado grande' });
  const id = crypto.randomBytes(10).toString('hex');
  await redis(['SET', 'img:' + id, m[1] + ';' + m[2]]);
  json(res, 200, { url: '/api/img?id=' + id });
});
