// Panel de administración: equipos, calendario y resultados
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const $ = (s) => document.querySelector(s);
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) : 'sin fecha';


// Diálogos propios (confirm/prompt/alert nativos pueden estar bloqueados, p. ej. en el navegador integrado)
function uiAsk({ msg, input = null, cancel = true }) {
  return new Promise((res) => {
    const d = document.createElement('dialog'); d.style.width = 'min(440px, 94vw)';
    d.innerHTML = `<form method="dialog"><p style="white-space:pre-line;margin-top:0">${esc(msg)}</p>
      ${input !== null ? `<input type="text" id="uiIn" style="width:100%" value="${esc(input)}">` : ''}
      <div class="row" style="margin:14px 0 0"><button class="btn" value="ok">Aceptar</button>${cancel ? '<button class="btn sec" value="cancel" formnovalidate>Cancelar</button>' : ''}</div></form>`;
    document.body.appendChild(d);
    d.addEventListener('close', () => { const ok = d.returnValue === 'ok', v = d.querySelector('#uiIn')?.value; d.remove(); res(input !== null ? (ok ? v : null) : ok); });
    d.showModal(); d.querySelector('#uiIn')?.select();
  });
}
const uiConfirm = (msg) => uiAsk({ msg });
const uiPrompt = (msg, def = '') => uiAsk({ msg, input: def });
const uiAlert = (msg) => uiAsk({ msg, cancel: false });

let token = sessionStorage.getItem('token');
let data, tab = 'teams';
const TABS = [['teams', 'Equipos y jugadores'], ['schedule', 'Calendario'], ['results', 'Resultados'], ['settings', 'Torneo']];

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  if (r.status === 401 && path !== '/api/login') { logout(); throw new Error('Sesión expirada'); }
  return r;
}
async function save() {
  const r = await api('/api/data', { method: 'PUT', body: JSON.stringify(data) });
  if (!r.ok) { toast('Error al guardar'); return false; }
  toast('Guardado ✓'); return true;
}
function logout() { token = null; sessionStorage.removeItem('token'); init(); }
$('#logout').onclick = (e) => { e.preventDefault(); logout(); };

async function init() {
  if (token) {
    const ok = (await fetch('/api/check', { headers: { Authorization: 'Bearer ' + token } })).ok;
    if (!ok) { token = null; sessionStorage.removeItem('token'); }
  }
  if (!token) return showLogin();
  $('#tabs').hidden = false; $('#logout').hidden = false;
  data = await (await fetch('/api/data?fresh=' + Date.now())).json();
  render();
}

function showLogin() {
  $('#tabs').hidden = true; $('#logout').hidden = true;
  $('#view').innerHTML = `<div class="card login"><h2>Acceso de administrador</h2>
    <form id="lf"><div class="row"><input type="password" id="pw" placeholder="Contraseña" autofocus required></div>
    <button class="btn">Entrar</button> <span class="msg-err" id="err"></span></form></div>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) });
    if (!r.ok) { $('#err').textContent = 'Contraseña incorrecta'; return; }
    token = (await r.json()).token; sessionStorage.setItem('token', token); init();
  };
}

function render() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="${k === tab ? 'active' : ''}" data-t="${k}">${l}</button>`).join('');
  document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.t; render(); });
  ({ teams: viewTeams, schedule: viewSchedule, results: viewResults, settings: viewSettings }[tab])();
}
const team = (id) => data.teams.find((t) => t.id === id);
const tname = (id) => esc(team(id)?.name ?? '?');

// ---------- Imágenes ----------
const initials = (n) => String(n || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const avatar = (url, name, cls) => url ? `<img class="av ${cls}" src="${esc(url)}" alt="">` : `<span class="av ${cls} ph">${esc(initials(name))}</span>`;

// Reduce la imagen en el navegador y la sube. kind: 'logo' (conserva transparencia) | 'photo' (recorte cuadrado)
async function uploadImage(file, kind) {
  if (!file || !file.type.startsWith('image/')) { toast('Elige un archivo de imagen'); return null; }
  const bmp = await createImageBitmap(file);
  const MAX = 256, c = document.createElement('canvas'), ctx = c.getContext('2d');
  if (kind === 'photo') {
    const s = Math.min(bmp.width, bmp.height);
    c.width = c.height = Math.min(MAX, s);
    ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, c.width, c.height);
  } else {
    const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
  }
  const dataUrl = kind === 'photo' ? c.toDataURL('image/jpeg', 0.85) : c.toDataURL('image/png');
  const r = await api('/api/upload', { method: 'POST', body: JSON.stringify({ dataUrl }) });
  if (!r.ok) { toast('No se pudo subir la imagen'); return null; }
  return (await r.json()).url;
}

// ---------- Equipos ----------
function viewTeams() {
  $('#view').innerHTML = `<div class="card"><h2>Equipos del torneo (${data.teams.length})</h2>
    <form id="addTeam" class="row"><label>Nombre del equipo<input type="text" id="tn" required></label><button class="btn">Agregar equipo</button></form>
    ${data.teams.length ? '' : '<div class="empty">Agrega los equipos que participarán.</div>'}
    ${data.teams.map((t) => `<div class="team-card" data-id="${t.id}">
      <div class="team-title"><span class="lbl"><label class="filebtn" title="Cambiar logo">${avatar(t.logo, t.name, 'logo big')}<input type="file" accept="image/*" data-logo></label>
          <span>${esc(t.name)} <span class="muted">· ${t.players.length} jugadores</span></span></span>
        <span><button class="btn sec sm" data-act="rename">Renombrar</button> ${t.logo ? '<button class="btn sec sm" data-act="delLogo">Quitar logo</button>' : ''} <button class="btn danger sm" data-act="delTeam">Eliminar</button></span></div>
      <div class="chips">${t.players.map((p) => `<span class="chip"><label class="filebtn" title="Cambiar foto">${avatar(p.photo, p.name, 'photo')}<input type="file" accept="image/*" data-photo="${p.id}"></label>${p.number !== '' && p.number != null ? '#' + esc(p.number) + ' ' : ''}${esc(p.name)}<button data-act="editPlayer" data-p="${p.id}" title="Editar nombre, número o foto">✎</button><button data-act="delPlayer" data-p="${p.id}" title="Eliminar jugador">×</button></span>`).join('')}</div>
      <form class="row addPlayer"><label>Jugador<input type="text" name="name" required></label><label>Nº<input type="number" name="number" min="0" max="99" style="width:70px"></label><label>Foto (opcional)<input type="file" name="photo" accept="image/*"></label><button class="btn sm">Agregar jugador</button></form>
    </div>`).join('')}</div>`;
  $('#addTeam').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#tn').value.trim(); if (!name) return;
    data.teams.push({ id: uid(), name, players: [] }); await save(); render();
  };
  document.querySelectorAll('.addPlayer').forEach((f) => f.onsubmit = async (e) => {
    e.preventDefault();
    const t = team(f.closest('.team-card').dataset.id);
    const photo = f.photo.files[0] ? await uploadImage(f.photo.files[0], 'photo') : '';
    t.players.push({ id: uid(), name: f.name.value.trim(), number: f.number.value, photo: photo || '' }); await save(); render();
  });
  document.querySelectorAll('[data-logo]').forEach((i) => i.onchange = async () => {
    const t = team(i.closest('.team-card').dataset.id), url = await uploadImage(i.files[0], 'logo');
    if (url) { t.logo = url; await save(); render(); }
  });
  document.querySelectorAll('[data-photo]').forEach((i) => i.onchange = async () => {
    const p = data.teams.flatMap((t) => t.players).find((x) => x.id === i.dataset.photo), url = await uploadImage(i.files[0], 'photo');
    if (url) { p.photo = url; await save(); render(); }
  });
  document.querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => {
    const t = team(b.closest('.team-card').dataset.id);
    if (b.dataset.act === 'delPlayer') {
      if (data.games.some((g) => (g.stats || []).some((s) => s.playerId === b.dataset.p)) && !await uiConfirm('Este jugador tiene estadísticas registradas; se perderán. ¿Continuar?')) return;
      t.players = t.players.filter((p) => p.id !== b.dataset.p);
      data.games.forEach((g) => g.stats = (g.stats || []).filter((s) => s.playerId !== b.dataset.p));
    } else if (b.dataset.act === 'editPlayer') {
      const p = t.players.find((x) => x.id === b.dataset.p);
      const n = await uiPrompt('Nombre del jugador', p.name); if (n === null) return;
      const num = await uiPrompt('Número (vacío = sin número)', p.number ?? ''); if (num === null) return;
      p.name = n.trim() || p.name; p.number = num.trim();
      if (p.photo && await uiConfirm('¿Quitar también la foto de este jugador? (Aceptar = quitar, Cancelar = conservar)')) p.photo = '';
    } else if (b.dataset.act === 'delLogo') {
      t.logo = '';
    } else if (b.dataset.act === 'rename') {
      const n = await uiPrompt('Nuevo nombre', t.name); if (!n || !n.trim()) return; t.name = n.trim();
    } else if (b.dataset.act === 'delTeam') {
      if (!await uiConfirm(`¿Eliminar "${t.name}" y TODOS sus partidos?`)) return;
      data.teams = data.teams.filter((x) => x.id !== t.id);
      data.games = data.games.filter((g) => g.home !== t.id && g.away !== t.id);
    }
    await save(); render();
  });
}

// ---------- Calendario ----------
function roundRobin(ids, double) {
  const arr = [...ids]; if (arr.length % 2) arr.push(null);
  const n = arr.length, out = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i]; if (a === null || b === null) continue;
      pairs.push((r + i) % 2 ? [a, b] : [b, a]);
    }
    out.push(pairs);
    arr.splice(1, 0, arr.pop()); // rotación
  }
  return double ? [...out, ...out.map((rd) => rd.map(([h, a]) => [a, h]))] : out;
}
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

let mRound = null; const mDef = { date: '', time: '18:00', venue: '' };
const freeTeams = (n) => { const used = new Set(data.games.filter((g) => g.round === n).flatMap((g) => [g.home, g.away])); return data.teams.filter((t) => !used.has(t.id)); };

function viewSchedule() {
  const rounds = [...new Set(data.games.map((g) => g.round))].sort((a, b) => a - b);
  const last = rounds.at(-1) || 1;
  const mr = mRound ?? (rounds.length && freeTeams(last).length < 2 ? last + 1 : last);
  const teamOpts = (sel) => data.teams.map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  $('#view').innerHTML = `
  <div class="card"><h2>Generar calendario automático (todos contra todos)</h2>
    <form id="gen" class="row">
      <label>Fecha 1ª jornada<input type="date" id="g_start"></label>
      <label>Días entre jornadas<input type="number" id="g_gap" value="7" min="1" style="width:90px"></label>
      <label>Hora<input type="time" id="g_time" value="18:00"></label>
      <label>Lugar<input type="text" id="g_venue" placeholder="(opcional)"></label>
      <label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="g_double"> Ida y vuelta</label>
      <button class="btn">Generar</button>
    </form>
    <p class="muted">Necesitas al menos 2 equipos. Reemplaza el calendario actual (avisa antes si hay resultados). Después puedes ajustar fechas y partidos a mano.</p></div>
  <div class="card"><h2>Armar una jornada a mano</h2>
    <div class="row"><label>Jornada<input type="number" id="m_round" min="1" value="${mr}" style="width:80px"></label>
      <button type="button" class="btn sec sm" id="m_next">Ir a la siguiente jornada</button></div>
    ${(() => {
      const used = new Set(data.games.filter((g) => g.round === mr).flatMap((g) => [g.home, g.away]));
      const free = data.teams.filter((t) => !used.has(t.id));
      const fopts = free.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
      const aopts = free.map((t, i) => `<option value="${t.id}" ${i === 1 ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
      if (data.teams.length < 2) return '<p class="muted">Agrega al menos 2 equipos primero.</p>';
      return `<p class="muted">Equipos sin partido en la jornada ${mr}: ${free.length ? free.map((t) => `<span class="badge">${esc(t.name)}</span>`).join(' ') : '<b>ninguno, la jornada está completa</b>'}</p>
      ${free.length >= 2 ? `<form id="addGame" class="row">
        <label>Local<select id="m_home">${fopts}</select></label>
        <label>Visitante<select id="m_away">${aopts}</select></label>
        <label>Fecha<input type="date" id="m_date" value="${mDef.date}"></label>
        <label>Hora<input type="time" id="m_time" value="${mDef.time}"></label>
        <label>Lugar<input type="text" id="m_venue" value="${esc(mDef.venue)}"></label>
        <button class="btn">Agregar partido</button>
        <button type="button" class="btn sec" id="m_suggest">Sugerir el resto</button>
      </form>` : ''}`;
    })()}
    <p class="muted">Elige quién juega contra quién; cada partido que agregas quita a esos dos equipos de la lista. "Sugerir el resto" completa la jornada con los equipos que queden, evitando repetir cruces. Con número impar de equipos, el que sobre descansa.</p></div>
  <div class="card"><h2>Calendario por jornada</h2>
    ${rounds.length ? rounds.map((n) => `<div class="round-head"><h3>Jornada ${n}</h3><button class="btn danger sm" data-delround="${n}">Eliminar jornada ${n}</button></div><div class="tablewrap"><table class="sched">
      ${data.games.filter((g) => g.round === n).map((g) => `<tr data-id="${g.id}">
        <td class="l">${g.played ? `${tname(g.home)} vs ${tname(g.away)} <span class="badge">${g.homeScore}-${g.awayScore}</span>`
          : `<select data-f="home">${teamOpts(g.home)}</select> vs <select data-f="away">${teamOpts(g.away)}</select>`}</td>
        <td><input type="date" value="${g.date || ''}" data-f="date"></td><td><input type="time" value="${g.time || ''}" data-f="time"></td>
        <td><input type="number" value="${g.round}" min="1" data-f="round" style="width:60px" title="Jornada"></td>
        <td><button class="btn danger sm" data-del>Quitar</button></td></tr>`).join('')}</table></div>`).join('') : '<div class="empty">Sin partidos programados.</div>'}</div>`;

  $('#gen').onsubmit = async (e) => {
    e.preventDefault();
    if (data.teams.length < 2) return await uiAlert('Agrega al menos 2 equipos.');
    const played = data.games.filter((g) => g.played).length;
    if (data.games.length && !await uiConfirm(`Se reemplazarán ${data.games.length} partidos${played ? `, incluidos ${played} con resultado` : ''}. ¿Continuar?`)) return;
    const start = $('#g_start').value, gap = +$('#g_gap').value || 7;
    data.games = [];
    roundRobin(data.teams.map((t) => t.id), $('#g_double').checked).forEach((pairs, i) =>
      pairs.forEach(([home, away]) => data.games.push({
        id: uid(), round: i + 1, home, away, date: start ? addDays(start, i * gap) : '', time: $('#g_time').value,
        venue: $('#g_venue').value.trim(), played: false, homeScore: 0, awayScore: 0, stats: [],
      })));
    await save(); render();
  };
  const setRound = (n) => { mRound = Math.max(1, +n || 1); render(); };
  $('#m_round').onchange = (e) => setRound(e.target.value);
  $('#m_next').onclick = () => setRound(mr + 1);
  const keepDef = () => { mDef.date = $('#m_date').value; mDef.time = $('#m_time').value; mDef.venue = $('#m_venue').value.trim(); };
  const newGame = (home, away) => ({ id: uid(), round: mr, home, away, date: mDef.date, time: mDef.time, venue: mDef.venue, played: false, homeScore: 0, awayScore: 0, stats: [] });
  if ($('#addGame')) {
    $('#addGame').onsubmit = async (e) => {
      e.preventDefault();
      const home = $('#m_home').value, away = $('#m_away').value;
      if (home === away) return await uiAlert('Local y visitante deben ser distintos.');
      keepDef(); data.games.push(newGame(home, away)); mRound = mr; await save(); render();
    };
    $('#m_suggest').onclick = async () => {
      keepDef();
      const met = new Set(data.games.map((g) => [g.home, g.away].sort().join('|')));
      const pool = freeTeams(mr).map((t) => t.id);
      while (pool.length >= 2) {
        const a = pool.shift();
        let j = pool.findIndex((b) => !met.has([a, b].sort().join('|')));
        if (j < 0) j = 0; // no queda rival nuevo: se repite el cruce
        const b = pool.splice(j, 1)[0];
        data.games.push(newGame(a, b)); met.add([a, b].sort().join('|'));
      }
      mRound = mr; await save(); render();
    };
  }
  document.querySelectorAll('tr[data-id] select').forEach((sel) => sel.onchange = async () => {
    const g = data.games.find((x) => x.id === sel.closest('tr').dataset.id);
    const prev = g[sel.dataset.f]; g[sel.dataset.f] = sel.value;
    if (g.home === g.away) { g[sel.dataset.f] = prev; await uiAlert('Local y visitante deben ser distintos.'); return render(); }
    await save(); render();
  });
  document.querySelectorAll('tr[data-id] input').forEach((i) => i.onchange = async () => {
    const g = data.games.find((x) => x.id === i.closest('tr').dataset.id);
    g[i.dataset.f] = i.dataset.f === 'round' ? +i.value || g.round : i.value;
    await save(); if (i.dataset.f === 'round') render();
  });
  document.querySelectorAll('[data-delround]').forEach((b) => b.onclick = async () => {
    const n = +b.dataset.delround, gs = data.games.filter((g) => g.round === n), pl = gs.filter((g) => g.played).length;
    if (!await uiConfirm(`¿Eliminar la jornada ${n} con sus ${gs.length} partidos${pl ? ` (${pl} con resultado)` : ''}?`)) return;
    data.games = data.games.filter((g) => g.round !== n); mRound = null; await save(); render();
  });
  document.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    const g = data.games.find((x) => x.id === b.closest('tr').dataset.id);
    if (g.played && !await uiConfirm('Este partido ya tiene resultado. ¿Eliminar?')) return;
    data.games = data.games.filter((x) => x !== g); await save(); render();
  });
}

// ---------- Resultados ----------
let resRound = null;
function viewResults() {
  const rounds = [...new Set(data.games.map((g) => g.round))].sort((a, b) => a - b);
  if (!rounds.length) { $('#view').innerHTML = '<div class="card empty">Primero crea el calendario.</div>'; return; }
  if (resRound === null || !rounds.includes(resRound)) {
    resRound = rounds.find((n) => data.games.some((g) => g.round === n && !g.played)) ?? rounds.at(-1);
  }
  const games = data.games.filter((g) => g.round === resRound);
  const S = Stats.compute(data);
  const rd = S.rounds.find((r) => r.round === resRound);
  const mvpName = (m) => esc(S.players.get(m.playerId)?.name ?? '?');
  $('#view').innerHTML = `<div class="card">
    <div class="round-head"><h2>Resultados de la jornada</h2>
      <select id="rsel">${rounds.map((n) => `<option value="${n}" ${n === resRound ? 'selected' : ''}>Jornada ${n}</option>`).join('')}</select></div>
    ${rd?.mvp ? `<div class="mvp-round">🏆 MVP de la jornada${rd.complete ? '' : ' (provisional)'}: <b>${mvpName(rd.mvp)}</b></div>` : ''}
    ${games.map((g) => { const m = rd?.games.find((x) => x.id === g.id)?.mvp; return `<div class="game">
      <div class="team home">${tname(g.home)}</div>
      <div class="score ${g.played ? '' : 'pending'}">${g.played ? `${g.homeScore} - ${g.awayScore}` : 'Sin resultado'}</div>
      <div class="team">${tname(g.away)}</div>
      <div class="meta">${fmtDate(g.date)}${g.time ? ' · ' + esc(g.time) : ''}${m ? ` <span class="badge">MVP: ${mvpName(m)}</span>` : ''}
        <button class="btn sm" data-edit="${g.id}">${g.played ? 'Editar' : 'Registrar resultado'}</button>
        ${g.played ? `<button class="btn danger sm" data-clear="${g.id}">Anular</button>` : ''}</div></div>`; }).join('')}</div>`;
  $('#rsel').onchange = (e) => { resRound = +e.target.value; render(); };
  document.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openResult(b.dataset.edit));
  document.querySelectorAll('[data-clear]').forEach((b) => b.onclick = async () => {
    if (!await uiConfirm('¿Anular el resultado y las estadísticas de este partido?')) return;
    const g = data.games.find((x) => x.id === b.dataset.clear);
    Object.assign(g, { played: false, homeScore: 0, awayScore: 0, stats: [] }); await save(); render();
  });
}

function openResult(id) {
  const g = data.games.find((x) => x.id === id);
  const th = team(g.home), ta = team(g.away);
  const st = (pid) => (g.stats || []).find((s) => s.playerId === pid) || {};
  const block = (t) => `<h3>${esc(t.name)}</h3>
    <div class="stat-grid"><span></span><span class="h">PTS</span><span class="h">REB</span><span class="h">AST</span></div>
    ${t.players.length ? t.players.map((p) => `<div class="stat-grid" data-team="${t.id}" data-p="${p.id}">
      <span>${p.number !== '' && p.number != null ? '#' + esc(p.number) + ' ' : ''}${esc(p.name)}</span>
      <input type="number" min="0" data-k="pts" value="${st(p.id).pts ?? ''}"><input type="number" min="0" data-k="reb" value="${st(p.id).reb ?? ''}"><input type="number" min="0" data-k="ast" value="${st(p.id).ast ?? ''}"></div>`).join('')
      : '<p class="muted">Este equipo no tiene jugadores registrados (agrégalos en "Equipos").</p>'}`;
  const dlg = $('#dlg');
  dlg.innerHTML = `<form id="rf"><h2>${esc(th.name)} vs ${esc(ta.name)} · Jornada ${g.round}</h2>
    <div class="row"><label>${esc(th.name)}<input type="number" id="hs" min="0" required value="${g.played ? g.homeScore : ''}" style="width:90px"></label>
      <label>${esc(ta.name)}<input type="number" id="as" min="0" required value="${g.played ? g.awayScore : ''}" style="width:90px"></label>
      <button type="button" class="btn sec sm" id="autosum">Marcador = suma de puntos de jugadores</button></div>
    <p class="muted">Las estadísticas de jugadores son opcionales, pero sin ellas no se pueden calcular máximos anotadores ni MVP.</p>
    ${block(th)}${block(ta)}
    <p class="msg-err" id="rerr"></p>
    <div class="row" style="margin-top:12px"><button class="btn">Guardar resultado</button><button type="button" class="btn sec" id="cancel">Cancelar</button></div></form>`;
  dlg.showModal();
  const sumFor = (tid) => [...dlg.querySelectorAll(`[data-team="${tid}"]`)].reduce((a, r) => a + (+r.querySelector('[data-k=pts]').value || 0), 0);
  $('#autosum').onclick = () => { $('#hs').value = sumFor(th.id); $('#as').value = sumFor(ta.id); };
  $('#cancel').onclick = () => dlg.close();
  $('#rf').onsubmit = async (e) => {
    e.preventDefault();
    const hs = +$('#hs').value, as = +$('#as').value;
    if (hs === as) { $('#rerr').textContent = 'En baloncesto no hay empates: revisa el marcador (si hubo prórroga, incluye sus puntos).'; return; }
    const stats = [];
    dlg.querySelectorAll('.stat-grid[data-p]').forEach((row) => {
      const v = (k) => row.querySelector(`[data-k=${k}]`).value;
      if (v('pts') === '' && v('reb') === '' && v('ast') === '') return; // no jugó / sin datos
      stats.push({ playerId: row.dataset.p, teamId: row.dataset.team, pts: +v('pts') || 0, reb: +v('reb') || 0, ast: +v('ast') || 0 });
    });
    const sumH = stats.filter((s) => s.teamId === th.id).reduce((a, s) => a + s.pts, 0);
    const sumA = stats.filter((s) => s.teamId === ta.id).reduce((a, s) => a + s.pts, 0);
    if (stats.length && (sumH > hs || sumA > as) && !await uiConfirm('Los puntos de los jugadores superan el marcador del equipo. ¿Guardar de todos modos?')) return;
    Object.assign(g, { played: true, homeScore: hs, awayScore: as, stats });
    if (await save()) { dlg.close(); render(); }
  };
}

// ---------- Torneo ----------
function viewSettings() {
  $('#view').innerHTML = `<div class="card"><h2>Datos del torneo</h2>
    <form id="sf" class="row"><label>Nombre del torneo<input type="text" id="sn" value="${esc(data.name)}" required style="width:300px"></label><button class="btn">Guardar</button></form>
    <p class="muted">La contraseña de administrador se define al iniciar el servidor con la variable ADMIN_PASSWORD.</p></div>
    <div class="card"><h2>Borrar datos</h2><div class="row">
      <button class="btn danger" id="clrGames">Borrar calendario y resultados</button>
      <button class="btn danger" id="clrAll">Reiniciar torneo completo</button></div>
      <p class="muted">"Borrar calendario y resultados" conserva equipos y jugadores. "Reiniciar" borra además equipos y jugadores. Descarga un respaldo antes.</p></div>
    <div class="card"><h2>Respaldo</h2><button class="btn sec" id="dl">Descargar datos (JSON)</button></div>`;
  $('#sf').onsubmit = async (e) => { e.preventDefault(); data.name = $('#sn').value.trim(); await save(); };
  $('#clrGames').onclick = async () => {
    if (!await uiConfirm(`Se borrarán ${data.games.length} partidos y todos sus resultados. ¿Continuar?`)) return;
    data.games = []; mRound = null; await save(); toast('Calendario borrado');
  };
  $('#clrAll').onclick = async () => {
    if (await uiPrompt('Esto borra TODO (equipos, jugadores, calendario y resultados). Escribe BORRAR para confirmar') !== 'BORRAR') return;
    data.teams = []; data.games = []; mRound = null; await save(); toast('Torneo reiniciado');
  };
  $('#dl').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'torneo-respaldo.json'; a.click();
  };
}

init();
