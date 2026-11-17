const { getData, setData, validData, isAdmin, json, handler } = require('./_lib');

module.exports = handler(async (req, res) => {
  if (req.method === 'GET') {
    const fresh = new URL(req.url, 'http://x').searchParams.has('fresh'); // el admin siempre pide datos frescos
    // Público: caché de 10 s en el CDN para que muchos visitantes no agoten el plan gratuito de Redis
    return json(res, 200, await getData(), fresh ? 'no-store' : 'public, s-maxage=10, stale-while-revalidate=30');
  }
  if (req.method === 'PUT') {
    if (!isAdmin(req)) return json(res, 401, { error: 'No autorizado' });
    const d = req.body;
    if (!validData(d)) return json(res, 400, { error: 'Datos inválidos' });
    await setData(d);
    return json(res, 200, { ok: true });
  }
  json(res, 405, { error: 'Método no permitido' });
});
