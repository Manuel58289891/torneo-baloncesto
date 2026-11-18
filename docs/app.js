// Vista pública (solo lectura)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

const TABS = [['rounds', 'Jornadas'], ['standings', 'Balance'], ['scorers', 'Anotadores'], ['mvps', 'MVPs']];
let tab = location.hash.slice(1) || 'rounds';
let data, S, selRound = null;

async function load() {
  // Con servidor (local / Vercel) usa la API; en GitHub Pages cae al archivo data.json publicado
  let r = await fetch('api/data').catch(() => null);
  if (!r || !r.ok || !(r.headers.get('content-type') || '').includes('json')) r = await fetch('data.json?t=' + Date.now());
  data = await r.json();
  S = Stats.compute(data);
  document.getElementById('title').textContent = data.name;
  document.title = data.name;
  if (selRound === null) {
    // por defecto: primera jornada con partidos pendientes, o la última
    const open = S.rounds.find((r) => !r.complete);
    selRound = (open || S.rounds[S.rounds.length - 1] || {}).round ?? null;
  }
  render();
}

function render() {
  document.getElementById('tabs').innerHTML = TABS.map(([k, l]) =>
    `<button class="${k === tab ? 'active' : ''}" data-t="${k}">${l}</button>`).join('');
  document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.t; location.hash = tab; render(); });
  const v = document.getElementById('view');
  v.innerHTML = ({ rounds: viewRounds, standings: viewStandings, scorers: viewScorers, mvps: viewMvps }[tab] || viewRounds)();
  document.querySelectorAll('[data-scmode]').forEach((b) => b.onclick = () => { scMode = b.dataset.scmode; render(); });
  document.querySelectorAll('[data-scsort]').forEach((b) => b.onclick = () => { scSort = b.dataset.scsort; render(); });
  const sel = document.getElementById('roundSel');
  if (sel) sel.onchange = () => { selRound = +sel.value; render(); };
}

const initials = (n) => String(n || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const avatar = (url, name, cls) => url
  ? `<img class="av ${cls}" src="${esc(url)}" alt="" loading="lazy">`
  : `<span class="av ${cls} ph">${esc(initials(name))}</span>`;
// nombre con logo; `after` pone el logo a la derecha del nombre (equipo local, alineado a la derecha)
const tName = (id, after) => {
  const t = S.teams.get(id); const n = `<span class="tn">${esc(t?.name ?? '?')}</span>`; const a = avatar(t?.logo, t?.name, 'logo');
  return `<span class="lbl">${after ? n + a : a + n}</span>`;
};
const pName = (id) => {
  const p = S.players.get(id);
  return `<span class="lbl">${avatar(p?.photo, p?.name, 'photo')}${esc(p?.name ?? '?')}</span>`;
};

function gameRow(g) {
  const hw = g.played && g.homeScore > g.awayScore, aw = g.played && g.awayScore > g.homeScore;
  const meta = [];
  if (g.date) meta.push(fmtDate(g.date) + (g.time ? ' · ' + esc(g.time) : ''));
  if (g.venue) meta.push('📍 ' + esc(g.venue));
  if (g.mvp) meta.push(`<span class="badge">MVP: ${pName(g.mvp.playerId)} (${g.mvp.pts} pts, ${g.mvp.reb || 0} reb, ${g.mvp.ast || 0} ast)</span>`);
  return `<div class="game">
    <div class="team home ${hw ? 'win' : ''}">${tName(g.home, true)}</div>
    <div class="score ${g.played ? '' : 'pending'}">${g.played ? `${g.homeScore} - ${g.awayScore}` : 'Por jugar'}</div>
    <div class="team ${aw ? 'win' : ''}">${tName(g.away)}</div>
    ${meta.length ? `<div class="meta">${meta.join('<span class="sep">•</span>')}</div>` : ''}
  </div>`;
}

function viewRounds() {
  if (!S.rounds.length) return '<div class="card empty">Aún no hay calendario.</div>';
  const r = S.rounds.find((x) => x.round === selRound) || S.rounds[0];
  const mvp = r.mvp;
  return `<div class="card">
    <div class="round-head">
      <h2>Jornada ${r.round}</h2>
      <select id="roundSel">${S.rounds.map((x) => `<option value="${x.round}" ${x.round === r.round ? 'selected' : ''}>Jornada ${x.round}${x.complete ? ' ✓' : ''}</option>`).join('')}</select>
    </div>
    ${mvp ? `<div class="mvp-round">🏆 <b>MVP de la jornada${r.complete ? '' : ' (provisional)'}:</b> ${pName(mvp.playerId)} — ${tName(mvp.teamId)} · ${mvp.pts} pts en ${mvp.games} partido(s)</div>` : ''}
    ${r.games.map(gameRow).join('')}
  </div>`;
}

function viewStandings() {
  if (!S.standings.length) return '<div class="card empty">Aún no hay equipos.</div>';
  return `<div class="card"><h2>Balance de los equipos</h2><div class="tablewrap"><table>
    <tr><th class="l">Equipo</th><th>PJ</th><th>G</th><th>P</th><th>PF</th><th>PC</th><th>DIF</th><th>PTS</th></tr>
    ${S.standings.map((t) => `<tr>
      <td class="l">${tName(t.teamId)}</td><td>${t.pj}</td><td>${t.g}</td><td>${t.p}</td>
      <td>${t.pf}</td><td>${t.pc}</td><td class="${t.dif > 0 ? 'pos-num' : t.dif < 0 ? 'neg-num' : ''}">${t.dif > 0 ? '+' : ''}${t.dif}</td><td><b>${t.pts}</b></td></tr>`).join('')}
  </table></div>
  <p class="muted">PJ partidos jugados · PF puntos a favor · PC puntos en contra · DIF diferencia · PTS ${Stats.WIN_POINTS} por victoria, ${Stats.LOSS_POINTS} por derrota.</p></div>`;
}

let scMode = 'total', scSort = 'pts'; // total | avg  ·  pts | reb | ast
function viewScorers() {
  if (!S.scorers.length) return '<div class="card empty">Aún no hay estadísticas de jugadores.</div>';
  const avg = scMode === 'avg';
  const val = (e, k) => avg ? e[k] / e.gp : e[k];
  const rows = [...S.scorers].sort((x, y) => val(y, scSort) - val(x, scSort) || y.pts - x.pts || y.gp - x.gp).slice(0, 30);
  const f = (n) => avg ? n.toFixed(1) : n;
  const head = (k, tot, av) => `<th class="${scSort === k ? 'sorted' : ''}">${avg ? av : tot}${scSort === k ? ' ▼' : ''}</th>`;
  const seg = (attr, cur, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-${attr}="${v}">${l}</button>`).join('')}</div>`;
  return `<div class="card"><h2>Máximos anotadores</h2>
    <div class="row" style="gap:16px">
      <label>Mostrar ${seg('scmode', scMode, [['total', 'Totales'], ['avg', 'Promedio']])}</label>
      <label>Ordenar por ${seg('scsort', scSort, [['pts', avg ? 'PPP (puntos)' : 'Puntos'], ['ast', 'Asistencias'], ['reb', 'Rebotes']])}</label>
    </div>
    <div class="tablewrap"><table class="scorers">
    <tr><th>#</th><th class="l">Jugador</th><th class="l">Equipo</th><th class="hm">PJ</th>${head('pts', 'PTS', 'PPP')}${head('reb', 'REB', 'RPP')}${head('ast', 'AST', 'APP')}<th class="hm">Mejor partido</th></tr>
    ${rows.map((e, i) => `<tr class="${i === 0 ? 'top1' : ''}"><td class="pos">${i + 1}</td>
      <td class="l">${pName(e.playerId)}</td><td class="l">${tName(e.teamId)}</td><td class="hm">${e.gp}</td>
      <td class="${scSort === 'pts' ? 'sorted' : ''}"><b>${f(val(e, 'pts'))}</b></td><td class="${scSort === 'reb' ? 'sorted' : ''}">${f(val(e, 'reb'))}</td>
      <td class="${scSort === 'ast' ? 'sorted' : ''}">${f(val(e, 'ast'))}</td><td class="hm">${e.high} pts</td></tr>`).join('')}
  </table></div><p class="muted">PJ = partidos jugados · PPP / RPP / APP = puntos / rebotes / asistencias por partido · Mejor partido = más puntos en un solo juego.</p></div>`;
}

function viewMvps() {
  const done = S.rounds.filter((r) => r.mvp);
  // conteo de MVPs de partido por jugador
  const cnt = new Map();
  S.rounds.forEach((r) => r.games.forEach((g) => g.mvp && cnt.set(g.mvp.playerId, (cnt.get(g.mvp.playerId) || 0) + 1)));
  const rank = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return `<div class="card"><h2>MVP por jornada</h2>
    ${done.length ? `<div class="tablewrap"><table><tr><th>Jornada</th><th class="l">Jugador</th><th class="l">Equipo</th><th>PTS</th></tr>
    ${done.map((r) => `<tr><td class="l">J${r.round}${r.complete ? '' : ' (prov.)'}</td><td class="l"><b>${pName(r.mvp.playerId)}</b></td><td class="l">${tName(r.mvp.teamId)}</td><td>${r.mvp.pts}</td></tr>`).join('')}</table></div>` : '<div class="empty">Sin datos todavía.</div>'}</div>
  <div class="card"><h2>Más MVPs de partido</h2>
    ${rank.length ? `<table>${rank.map(([id, n], i) => `<tr><td class="pos">${i + 1}</td><td class="l">${pName(id)}</td><td class="l">${tName(S.players.get(id)?.teamId)}</td><td><b>${n}</b></td></tr>`).join('')}</table>` : '<div class="empty">Sin datos todavía.</div>'}
    <p class="muted">El MVP del partido sale del equipo ganador: mejor valoración = puntos + ${Stats.W_REB} × rebotes + ${Stats.W_AST} × asistencias.
    El MVP de la jornada suma la valoración de todos sus partidos + ${Stats.ROUND_WIN_BONUS} por cada partido ganado.</p></div>`;
}

load();
setInterval(load, 30000); // refresco automático
