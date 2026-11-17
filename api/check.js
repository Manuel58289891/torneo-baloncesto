const { isAdmin, json, handler } = require('./_lib');

module.exports = handler(async (req, res) => {
  const ok = isAdmin(req);
  json(res, ok ? 200 : 401, { ok });
});
