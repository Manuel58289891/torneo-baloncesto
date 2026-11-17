const { redis, json, handler } = require('./_lib');

module.exports = handler(async (req, res) => {
  const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
  if (!/^[a-f0-9]+$/.test(id)) return json(res, 400, { error: 'Id inválido' });
  const v = await redis(['GET', 'img:' + id]);
  if (!v) return json(res, 404, { error: 'No encontrada' });
  const i = v.indexOf(';');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/' + v.slice(0, i));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // el id nunca cambia de contenido
  res.end(Buffer.from(v.slice(i + 1), 'base64'));
});
