// Cálculo de estadísticas. Se usa en navegador (window.Stats) y en Node (require).
(function (root) {
  const WIN_POINTS = 1, LOSS_POINTS = 0; // puntos de tabla por victoria / derrota
  const W_REB = 0.7, W_AST = 0.7;        // peso de rebotes y asistencias en la valoración
  const ROUND_WIN_BONUS = 5;             // bonus por partido ganado para el MVP de jornada

  // Valoración de un jugador en un partido
  const rating = (s) => (s.pts || 0) + W_REB * (s.reb || 0) + W_AST * (s.ast || 0);

  function gameMvp(g) {
    if (!g.played || !g.stats || !g.stats.length) return null;
    const winner = g.homeScore > g.awayScore ? g.home : g.awayScore > g.homeScore ? g.away : null;
    let pool = g.stats.filter((s) => s.teamId === winner);
    if (!pool.length) pool = g.stats; // empate o sin datos del ganador
    let best = null;
    for (const s of pool) {
      const r = rating(s);
      if (!best || r > best.rating || (r === best.rating && s.pts > best.pts)) best = { ...s, rating: r };
    }
    return best;
  }

  function roundMvp(games) {
    const acc = new Map();
    for (const g of games) {
      if (!g.played || !g.stats) continue;
      const winner = g.homeScore > g.awayScore ? g.home : g.awayScore > g.homeScore ? g.away : null;
      for (const s of g.stats) {
        const e = acc.get(s.playerId) || { playerId: s.playerId, teamId: s.teamId, score: 0, pts: 0, games: 0 };
        e.score += rating(s) + (s.teamId === winner ? ROUND_WIN_BONUS : 0);
        e.pts += s.pts || 0; e.games++;
        acc.set(s.playerId, e);
      }
    }
    let best = null;
    for (const e of acc.values()) {
      if (!best || e.score > best.score || (e.score === best.score && e.pts > best.pts)) best = e;
    }
    return best;
  }

  function compute(data) {
    const teams = new Map(data.teams.map((t) => [t.id, t]));
    const players = new Map();
    for (const t of data.teams) for (const p of t.players || []) players.set(p.id, { ...p, teamId: t.id });

    // Tabla de posiciones
    const table = new Map(data.teams.map((t) => [t.id, {
      teamId: t.id, name: t.name, pj: 0, g: 0, p: 0, pf: 0, pc: 0, dif: 0, pts: 0,
    }]));
    for (const g of data.games) {
      if (!g.played) continue;
      const h = table.get(g.home), a = table.get(g.away);
      if (!h || !a) continue;
      h.pj++; a.pj++;
      h.pf += g.homeScore; h.pc += g.awayScore;
      a.pf += g.awayScore; a.pc += g.homeScore;
      if (g.homeScore > g.awayScore) { h.g++; a.p++; h.pts += WIN_P(); a.pts += LOSS_P(); }
      else if (g.awayScore > g.homeScore) { a.g++; h.p++; a.pts += WIN_P(); h.pts += LOSS_P(); }
    }
    const standings = [...table.values()].map((r) => ({ ...r, dif: r.pf - r.pc }));
    standings.sort((x, y) => y.pts - x.pts || y.dif - x.dif || y.pf - x.pf || x.name.localeCompare(y.name));

    // Máximos anotadores
    const sc = new Map();
    for (const g of data.games) {
      if (!g.played) continue;
      for (const s of g.stats || []) {
        const e = sc.get(s.playerId) || { playerId: s.playerId, teamId: s.teamId, pts: 0, reb: 0, ast: 0, gp: 0, high: 0 };
        e.pts += s.pts || 0; e.reb += s.reb || 0; e.ast += s.ast || 0; e.gp++;
        e.high = Math.max(e.high, s.pts || 0);
        sc.set(s.playerId, e);
      }
    }
    const scorers = [...sc.values()].map((e) => ({ ...e, ppg: e.gp ? e.pts / e.gp : 0 }));
    scorers.sort((a, b) => b.pts - a.pts || b.ppg - a.ppg);

    // Jornadas
    const roundNums = [...new Set(data.games.map((g) => g.round))].sort((a, b) => a - b);
    const rounds = roundNums.map((n) => {
      const games = data.games.filter((g) => g.round === n)
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''))
        .map((g) => ({ ...g, mvp: gameMvp(g) }));
      const complete = games.every((g) => g.played);
      return { round: n, games, complete, mvp: roundMvp(games) };
    });

    return { teams, players, standings, scorers, rounds };
  }
  const WIN_P = () => WIN_POINTS, LOSS_P = () => LOSS_POINTS;

  const api = { compute, rating, gameMvp, roundMvp, WIN_POINTS, LOSS_POINTS, W_REB, W_AST, ROUND_WIN_BONUS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Stats = api;
})(typeof window !== 'undefined' ? window : globalThis);
