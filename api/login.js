const { newToken, passwordOk, json, handler } = require('./_lib');

module.exports = handler(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido' });
  if (!process.env.ADMIN_PASSWORD) return json(res, 500, { error: 'Falta definir ADMIN_PASSWORD en Vercel' });
  if (!passwordOk((req.body || {}).password)) return json(res, 401, { error: 'Contraseña incorrecta' });
  json(res, 200, { token: newToken() });
});
