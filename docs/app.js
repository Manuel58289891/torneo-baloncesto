// Vista pública (solo lectura)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

const TABS = [['rounds', '📅 Jornadas'], ['standings', '📊 Balance'], ['scorers', '🔥 Anotadores'], ['mvps', '⭐ MVPs']];
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
  if (document.activeElement?.id === 'scq') return;
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
  const q = document.getElementById('scq'), tsel = document.getElementById('sct');
  const refill = () => { document.getElementById('scBody').innerHTML = scorersTable(); };
  if (q) q.oninput = () => { scQuery = q.value; refill(); };
  if (tsel) tsel.onchange = () => { scTeam = tsel.value; refill(); };
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
  return `<span class="lbl tl" data-tid="${esc(id)}">${after ? n + a : a + n}</span>`;
};
const pName = (id) => {
  const p = S.players.get(id);
  return `<span class="lbl pl" data-pid="${esc(id)}">${avatar(p?.photo, p?.name, 'photo')}${esc(p?.name ?? '?')}</span>`;
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

let scMode = 'total', scSort = 'pts', scTeam = 'all', scQuery = ''; // total | avg · pts | reb | ast
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function scorersTable() {
  const avg = scMode === 'avg';
  const val = (e, k) => avg ? (e.gp ? e[k] / e.gp : -1) : e[k];
  const f = (n) => avg ? (n < 0 ? '—' : n.toFixed(1)) : n;
  const ranked = [...S.scorers].sort((x, y) => val(y, scSort) - val(x, scSort) || y.pts - x.pts || y.gp - x.gp);
  ranked.forEach((e, i) => { e.rank = i + 1; }); // el puesto es el global, aunque se filtre
    const rows = ranked.filter((e) => (scTeam === 'all' || e.teamId === scTeam)
    && (!scQuery.trim() || norm(S.players.get(e.playerId)?.name).includes(norm(scQuery))));
  if (!rows.length) return '<div class="empty">Ningún jugador coincide con la búsqueda.</div>';
  const head = (k, tot, av) => `<th class="${scSort === k ? 'sorted' : ''}">${avg ? av : tot}${scSort === k ? ' ▼' : ''}</th>`;
  return `<div class="tablewrap"><table class="scorers">
    <tr><th>#</th><th class="l">Jugador</th><th>PJ</th>${head('pts', 'PTS', 'PPP')}${head('reb', 'REB', 'RPP')}${head('ast', 'AST', 'APP')}<th class="hm">Mejor partido</th></tr>
    ${rows.map((e) => { const p = S.players.get(e.playerId); return `<tr class="prow ${e.rank === 1 ? 'top1' : ''}" data-pid="${esc(e.playerId)}"><td class="pos ${e.rank <= 3 ? 'r' + e.rank : ''}"><span>${e.rank}</span></td>
      <td class="l"><div class="pcell">${avatar(p?.photo, p?.name, 'photo face')}<div class="pinfo"><div class="pnm">${esc(p?.name ?? '?')}</div><div class="pteam">${tName(e.teamId)}</div></div></div></td>
      <td>${e.gp || '—'}</td>
      <td class="${scSort === 'pts' ? 'sorted' : ''}"><b>${f(val(e, 'pts'))}</b></td><td class="${scSort === 'reb' ? 'sorted' : ''}">${f(val(e, 'reb'))}</td>
      <td class="${scSort === 'ast' ? 'sorted' : ''}">${f(val(e, 'ast'))}</td><td class="hm">${e.high ? e.high + ' pts' : '—'}</td></tr>`; }).join('')}
  </table></div>`;
}

function viewScorers() {
  if (!S.scorers.length) return '<div class="card empty">Aún no hay estadísticas de jugadores.</div>';
  const avg = scMode === 'avg';
  const seg = (attr, cur, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-${attr}="${v}">${l}</button>`).join('')}</div>`;
  const teams = [...S.teams.values()].sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="card"><h2>Máximos anotadores</h2>
    <div class="row" style="gap:12px 16px">
      <label>Buscar jugador<input type="search" id="scq" placeholder="Nombre…" value="${esc(scQuery)}" autocomplete="off"></label>
      <label>Equipo<select id="sct"><option value="all">Todos los equipos</option>${teams.map((t) => `<option value="${esc(t.id)}" ${t.id === scTeam ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    </div>
    <div class="row" style="gap:12px 16px">
      <label>Mostrar ${seg('scmode', scMode, [['total', 'Totales'], ['avg', 'Promedio']])}</label>
      <label>Ordenar por ${seg('scsort', scSort, [['pts', avg ? 'PPP (puntos)' : 'Puntos'], ['ast', 'Asistencias'], ['reb', 'Rebotes']])}</label>
    </div>
    <div id="scBody">${scorersTable()}</div>
    <p class="muted">${data.baseThrough ? `Puntos acumulados hasta la jornada ${data.baseThrough}. ` : ''}Toca un jugador para ver su tarjeta. PJ = partidos jugados · PPP / RPP / APP = puntos / rebotes / asistencias por partido (solo con partidos jugados cargados) · Mejor partido = más puntos en un solo juego.</p></div>`;
}

// ---- Tarjeta del jugador ----
function playerCard(pid) {
  const p = S.players.get(pid); if (!p) return;
  const t = S.teams.get(p.teamId);
  const e = S.scorers.find((x) => x.playerId === pid) || { gp: 0, pts: 0, reb: 0, ast: 0, high: 0 };
  const log = [];
  S.rounds.forEach((r) => r.games.forEach((g) => {
    const st = (g.stats || []).find((x) => x.playerId === pid); if (!g.played || !st) return;
    const mine = g.home === p.teamId ? g.homeScore : g.awayScore, theirs = g.home === p.teamId ? g.awayScore : g.homeScore;
    log.push({ r: r.round, opp: g.home === p.teamId ? g.away : g.home, win: mine > theirs, score: mine + '-' + theirs, st });
  }));
  const per = (n) => e.gp ? (n / e.gp).toFixed(1) : '—';
  const d = document.getElementById('pcard');
  d.innerHTML = `<div class="pc-hero"><div class="pc-ring">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : `<span>${esc(initials(p.name))}</span>`}</div>
      <button class="pc-x" aria-label="Cerrar" data-close>×</button></div>
    <div class="pc-body">
      <h2>${esc(p.name)}</h2>
      <div class="pc-sub">${p.number !== '' && p.number != null ? `<span class="badge">#${esc(p.number)}</span>` : ''}<span class="lbl">${avatar(t?.logo, t?.name, 'logo')}<b>${esc(t?.name ?? '')}</b></span></div>
      <div class="pc-stats">
        <div><b>${e.gp || '—'}</b><span>PJ</span></div><div><b>${e.pts}</b><span>PTS</span></div><div><b>${per(e.pts)}</b><span>PPP</span></div>
        <div><b>${e.reb}</b><span>REB</span></div><div><b>${e.ast}</b><span>AST</span></div><div><b>${e.high || '—'}</b><span>Mejor</span></div>
      </div>
      ${log.length ? `<h3>Partidos</h3><table>${log.map((l) => `<tr><td class="l">J${l.r} vs ${tName(l.opp)}</td><td><span class="${l.win ? 'pos-num' : 'neg-num'}">${l.win ? 'G' : 'P'} ${l.score}</span></td><td>${l.st.pts} pts</td><td>${l.st.reb} reb</td><td>${l.st.ast} ast</td></tr>`).join('')}</table>`
        : (e.pts ? `<p class="muted">Estadísticas acumuladas${data.baseThrough ? ' hasta la jornada ' + data.baseThrough : ''}. El detalle partido por partido se mostrará aquí desde que se registre.</p>` : '<p class="muted">Aún no hay estadísticas de este jugador.</p>')}
    </div>`;
  d.querySelector('[data-close]').onclick = () => d.close();
  if (!d.open) d.showModal();
}
// ---- Tarjeta del equipo: escudo, balance y jugadores (tocar un jugador abre su tarjeta) ----
function teamCard(tid) {
  const t = S.teams.get(tid); if (!t) return;
  const st = S.standings.find((r) => r.teamId === tid) || { pj: 0, g: 0, p: 0, pf: 0, pc: 0, dif: 0, pts: 0 };
  const sc = new Map(S.scorers.map((e) => [e.playerId, e]));
  const d = document.getElementById('tcard');
  d.innerHTML = `<div class="pc-hero tc-hero"><div class="tc-logo">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : `<span>${esc(initials(t.name))}</span>`}</div>
      <button class="pc-x" aria-label="Cerrar" data-close>×</button></div>
    <div class="pc-body">
      <h2>${esc(t.name)}</h2>
      <div class="pc-stats tc-stats">
        <div><b>${st.pj}</b><span>PJ</span></div><div><b>${st.g}-${st.p}</b><span>G-P</span></div><div><b>${st.dif > 0 ? '+' : ''}${st.dif}</b><span>Dif</span></div>
        <div><b>${st.pf}</b><span>PF</span></div><div><b>${st.pc}</b><span>PC</span></div><div><b>${st.pts}</b><span>PTS</span></div>
      </div>
      <h3>Jugadores (${t.players.length})</h3>
      ${t.players.length ? `<div class="tc-players">${t.players.map((p) => { const e = sc.get(p.id);
        return `<button class="tc-p" data-pid="${esc(p.id)}">${avatar(p.photo, p.name, 'photo face')}<div class="tc-pt"><span class="tc-pn">${esc(p.name)}</span>
          <span class="tc-pm">${p.number !== '' && p.number != null ? '#' + esc(p.number) : ''}${e && e.pts ? (p.number ? ' · ' : '') + e.pts + ' pts' : ''}</span></div></button>`; }).join('')}</div>`
        : '<p class="muted">Este equipo aún no tiene jugadores cargados.</p>'}
    </div>`;
  d.querySelector('[data-close]').onclick = () => d.close();
  if (!d.open) d.showModal();
}
const delegate = (ev) => {
  const el = ev.target.closest('[data-pid],[data-tid]'); if (!el) return;
  if (el.dataset.pid) playerCard(el.dataset.pid); else teamCard(el.dataset.tid);
};
document.getElementById('view').addEventListener('click', delegate);
document.getElementById('tcard').addEventListener('click', (ev) => { // dentro de la tarjeta del equipo: tocar un jugador abre su tarjeta
  if (ev.target === ev.currentTarget) ev.currentTarget.close(); else { const el = ev.target.closest('[data-pid]'); if (el) playerCard(el.dataset.pid); }
});
const pcard = document.getElementById('pcard');
pcard.addEventListener('click', (ev) => { if (ev.target === pcard) pcard.close(); }); // clic fuera = cerrar

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
