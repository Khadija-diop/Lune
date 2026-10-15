import * as C from './cycle.js';
import * as S from './store.js';

// ---------- Options de saisie ----------
const FLOWS = [
  { v: 0, label: 'Aucun', drops: '' },
  { v: 1, label: 'Spotting', drops: '•' },
  { v: 2, label: 'Léger', drops: '💧' },
  { v: 3, label: 'Moyen', drops: '💧💧' },
  { v: 4, label: 'Abondant', drops: '💧💧💧' },
];
const PAIN_TYPES = ['Crampes', 'Dos', 'Tête', 'Seins sensibles', 'Jambes', 'Ovulation'];
const MOODS = ['😊 Bien', '😌 Calme', '🥰 Câline', '⚡️ Énergique', '😴 Fatiguée', '😢 Triste', '😠 Irritable', '😰 Anxieuse', '🎭 Sautes d’humeur'];
const SYMPTOMS = ['Ballonnements', 'Acné', 'Fringales', 'Nausées', 'Insomnie', 'Pertes', 'Libido +', 'Libido −', 'Constipation', 'Diarrhée'];

// ---------- État ----------
let state = S.load();
let calMonth = monthStart(C.todayISO());
let sheetDate = null;

const $ = (sel) => document.querySelector(sel);
const today = () => C.todayISO();

function commit() {
  if (!S.save(state)) toast('Impossible d’enregistrer sur cet appareil');
  render();
}

// ---------- Formatage ----------
const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const long = (iso) => fmtLong.format(C.parseDate(iso));
const short = (iso) => fmtShort.format(C.parseDate(iso));
const plural = (n, w) => `${n} ${w}${Math.abs(n) > 1 ? 's' : ''}`;

function relDay(iso) {
  const d = C.diffDays(today(), iso);
  if (d === 0) return 'aujourd’hui';
  if (d === 1) return 'demain';
  if (d === -1) return 'hier';
  return short(iso);
}

function monthStart(iso) {
  return iso.slice(0, 8) + '01';
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Règles : début / fin ----------
function periodAt(iso) {
  return state.periods.find((p) => iso >= p.start && iso <= C.displayEnd(p, today()));
}

function startPeriod(iso) {
  if (periodAt(iso)) return toast('Ce jour fait déjà partie de tes règles');
  const s = C.sortPeriods(state.periods);
  // Règles en cours encore ouvertes avant cette date → on les clôture
  const open = s.find((p) => !p.end && p.start < iso);
  if (open) {
    const estimated = C.addDays(open.start, C.averagePeriod(s, state.settings.periodLength) - 1);
    const dayBefore = C.addDays(iso, -1);
    open.end = estimated < dayBefore ? estimated : dayBefore;
  }

  const after = s.find((p) => p.start > iso);
  let end = null;
  if (after || iso < today()) {
    // saisie dans le passé : on propose une fin estimée
    end = C.addDays(iso, C.averagePeriod(s, state.settings.periodLength) - 1);
    if (end > today()) end = null;
    if (after && end && end >= after.start) end = C.addDays(after.start, -1);
  }
  if (after && after.start <= C.addDays(iso, 3)) {
    // règles qui commencent quelques jours plus tard : on fusionne
    after.start = iso;
  } else {
    state.periods.push({ id: Date.now(), start: iso, end });
  }
  // un début de règles implique un saignement ce jour-là
  const day = state.days[iso] || {};
  if (!day.flow) state.days[iso] = { ...day, flow: 2 };
  commit();
  toast(end ? `Règles ajoutées du ${short(iso)} au ${short(end)}` : 'Début des règles noté');
}

function endPeriod(iso) {
  const p = C.sortPeriods(state.periods).filter((x) => x.start <= iso).pop();
  if (!p) return toast('Indique d’abord le début de tes règles');
  if (C.diffDays(p.start, iso) > 14) return toast('Ce jour est trop loin du début des règles');
  p.end = iso;
  commit();
  toast(`Fin des règles notée (${plural(C.diffDays(p.start, iso) + 1, 'jour')})`);
}

function deletePeriod(iso) {
  const p = periodAt(iso);
  if (!p) return;
  if (!confirm(`Supprimer les règles du ${short(p.start)} ?`)) return;
  state.periods = state.periods.filter((x) => x !== p);
  commit();
}

// ---------- Accueil ----------
function renderHome() {
  const t = today();
  const st = C.status(state.periods, state.settings, t);
  $('#home-date').textContent = long(t);

  const wrap = document.querySelector('.ring-wrap');
  wrap.classList.remove('is-period', 'is-fertile');
  const bar = $('#ring-bar');
  const top = $('#ring-top'), big = $('#ring-big'), bottom = $('#ring-bottom');
  const btn = $('#btn-period');
  const cards = [];

  if (st.kind === 'empty') {
    top.textContent = 'Bienvenue';
    big.textContent = 'Commençons';
    bottom.textContent = 'Indique le premier jour de tes dernières règles';
    bar.style.strokeDasharray = '0 100';
    btn.textContent = 'Mes règles ont commencé aujourd’hui';
    btn.onclick = () => startPeriod(t);
    $('#btn-period-other').textContent = 'Elles ont commencé un autre jour';
    $('#btn-period-other').onclick = () => pickDate('Premier jour de tes dernières règles', t, startPeriod);
    $('#home-cards').innerHTML = '';
    renderTodaySummary();
    return;
  }

  if (st.kind === 'period') {
    wrap.classList.add('is-period');
    top.textContent = 'Règles';
    big.textContent = `Jour ${st.day}`;
    const total = C.diffDays(C.addDays(t, 1 - st.day), st.expectedEnd) + 1;
    bar.style.strokeDasharray = `${Math.min(100, (st.day / total) * 100)} 100`;
    if (st.ended) {
      bottom.textContent = st.daysLeft > 0 ? `dernier jour ${relDay(st.expectedEnd)}` : 'dernier jour aujourd’hui';
      btn.textContent = 'Noter ma journée';
      btn.onclick = () => openSheet(t);
      $('#btn-period-other').textContent = 'Modifier la date de fin';
    } else {
      bottom.textContent = st.daysLeft > 0 ? `fin prévue ${relDay(st.expectedEnd)}` : 'fin prévue aujourd’hui';
      btn.textContent = 'Mes règles sont terminées';
      btn.onclick = () => endPeriod(t);
      $('#btn-period-other').textContent = 'Terminées un autre jour ?';
    }
    $('#btn-period-other').onclick = () => pickDate('Dernier jour de tes règles', t, endPeriod);
  } else {
    if (st.kind === 'late') {
      top.textContent = 'Règles en retard de';
      big.textContent = plural(st.lateBy, 'jour');
      bottom.textContent = `jour ${st.cycleDay} du cycle · prévues le ${short(st.next.start)}`;
      bar.style.strokeDasharray = '100 100';
    } else {
      if (st.fertile) wrap.classList.add('is-fertile');
      top.textContent = st.daysUntil <= 1 ? 'Règles prévues' : 'Prochaines règles dans';
      big.textContent = st.daysUntil === 0 ? 'Aujourd’hui' : st.daysUntil === 1 ? 'Demain' : plural(st.daysUntil, 'jour');
      bottom.textContent = `jour ${st.cycleDay} du cycle${st.fertile ? ' · fertile (est.)' : ''}`;
      bar.style.strokeDasharray = `${Math.min(100, (st.cycleDay / st.cycle) * 100)} 100`;
    }
    btn.textContent = 'Mes règles ont commencé';
    btn.onclick = () => startPeriod(t);
    $('#btn-period-other').textContent = 'Elles ont commencé un autre jour ?';
    $('#btn-period-other').onclick = () => pickDate('Premier jour de tes règles', t, startPeriod);
  }

  const next = st.kind === 'period' ? C.predictCycles(state.periods, state.settings, C.addDays(t, 1), 1)[0] : st.next;
  cards.push(card('Prochaines règles', short(next.start), relativeLabel(next.start)));
  cards.push(card('Fin prévue', short(st.kind === 'period' ? st.expectedEnd : next.end), st.kind === 'period' ? relativeLabel(st.expectedEnd) : `${plural(st.periodLength, 'jour')} en moyenne`));
  cards.push(card('Cycle moyen', `${st.cycle} jours`, regularity()));
  cards.push(card('Ovulation (est.)', short(st.kind === 'period' ? next.ovulation : st.next.ovulation), 'fenêtre fertile ±5 j'));
  $('#home-cards').innerHTML = cards.join('');
  renderTodaySummary();
}

function relativeLabel(iso) {
  const d = C.diffDays(today(), iso);
  if (d === 0) return 'aujourd’hui';
  if (d > 0) return `dans ${plural(d, 'jour')}`;
  return `il y a ${plural(-d, 'jour')}`;
}

function regularity() {
  const v = C.cycleVariation(state.periods);
  if (!v) return 'pas encore assez de données';
  return v.max - v.min <= 4 ? `régulier (${v.min}–${v.max} j)` : `variable (${v.min}–${v.max} j)`;
}

function card(label, value, sub = '', cls = '') {
  return `<div class="card ${cls}"><p class="card-label">${label}</p><p class="card-value">${escapeHTML(value)}</p>${sub ? `<p class="card-sub">${escapeHTML(sub)}</p>` : ''}</div>`;
}

function renderTodaySummary() {
  const d = state.days[today()];
  const parts = [];
  if (d) {
    if (d.flow) parts.push(FLOWS[d.flow].label);
    if (d.pain) parts.push(`douleur ${d.pain}/10`);
    if (d.moods?.length) parts.push(d.moods.map((m) => m.split(' ')[0]).join(' '));
  }
  $('#today-summary').textContent = parts.length ? parts.join(' · ') : 'Note ton humeur, tes douleurs…';
}

// ---------- Calendrier ----------
function renderCalendar() {
  const t = today();
  const preds = C.predictCycles(state.periods, state.settings, t, 12);
  $('#cal-title').textContent = fmtMonth.format(C.parseDate(calMonth));
  const first = C.parseDate(calMonth);
  const offset = (first.getUTCDay() + 6) % 7; // lundi = 0
  const nextMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  const count = C.diffDays(calMonth, C.toISO(nextMonth));

  let html = '';
  for (let i = 0; i < offset; i++) html += '<span class="cal-day out"></span>';
  for (let i = 0; i < count; i++) {
    const iso = C.addDays(calMonth, i);
    let kind = periodAt(iso) ? 'period' : '';
    if (!kind) {
      kind = C.dayKind(iso, [], preds);
      if (kind === 'predicted' && iso <= t) kind = ''; // une prévision passée n'a plus de sens
    }
    const d = state.days[iso];
    const logged = d && (d.pain || d.moods?.length || d.painTypes?.length || d.symptoms?.length || d.note);
    const cls = ['cal-day', kind, iso === t ? 'today' : '', logged ? 'logged' : ''].join(' ');
    html += `<button class="${cls}" data-date="${iso}" aria-label="${long(iso)}">${i + 1}</button>`;
  }
  $('#cal-grid').innerHTML = html;
}

// ---------- Stats ----------
function renderStats() {
  const s = C.sortPeriods(state.periods);
  const el = $('#stats');
  if (!s.length) {
    el.innerHTML = '<p class="empty">Note tes premières règles pour voir tes statistiques ici.</p>';
    return;
  }
  const cycles = C.cycleLengths(s);
  const plens = Object.fromEntries(C.periodLengths(s).map((p) => [p.start, p.length]));
  const avgC = C.averageCycle(s, state.settings.cycleLength);
  const avgP = C.averagePeriod(s, state.settings.periodLength);

  let html = `<div class="cards">
    ${card('Cycle moyen', `${avgC} jours`, regularity())}
    ${card('Règles en moyenne', `${avgP} jours`, `${plural(s.length, 'cycle')} enregistré${s.length > 1 ? 's' : ''}`)}
  </div>`;

  // Graphique des durées de cycle
  const recent = cycles.slice(-12);
  if (recent.length) {
    const W = 320, H = 150, pad = 22, max = Math.max(35, ...recent.map((c) => c.length));
    const bw = (W - pad) / recent.length;
    const y = (v) => H - 20 - (v / max) * (H - 36);
    const bars = recent.map((c, i) => {
      const x = pad + i * bw + bw * 0.18, w = bw * 0.64;
      return `<rect class="bar" x="${x}" y="${y(c.length)}" width="${w}" height="${H - 20 - y(c.length)}" rx="4"/>
        <text x="${x + w / 2}" y="${y(c.length) - 4}" text-anchor="middle">${c.length}</text>
        <text x="${x + w / 2}" y="${H - 4}" text-anchor="middle">${fmtShort.format(C.parseDate(c.start)).replace('.', '')}</text>`;
    }).join('');
    html += `<div class="chart"><h3>Durée de tes cycles</h3>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Durée des derniers cycles">
        <line class="avg" x1="${pad}" x2="${W}" y1="${y(avgC)}" y2="${y(avgC)}"/>
        <text x="0" y="${y(avgC) + 4}">${avgC}</text>${bars}
      </svg></div>`;
  }

  // Historique
  const rows = [...s].reverse().slice(0, 12).map((p) => {
    const c = cycles.find((x) => x.start === p.start);
    const len = plens[p.start];
    return `<li><span>${short(p.start)}${p.end ? '' : ' <span class="muted">(en cours)</span>'}</span>
      <span class="muted">${len ? `règles ${len} j` : ''}${c ? ` · cycle ${c.length} j` : ''}</span></li>`;
  }).join('');
  html += `<div class="list"><h3>Historique</h3><ul>${rows}</ul></div>`;

  // Ressenti sur les 90 derniers jours
  const since = C.addDays(today(), -90);
  const entries = Object.entries(state.days).filter(([d]) => d >= since).map(([, v]) => v);
  const tally = (key) => {
    const m = {};
    entries.forEach((e) => (e[key] || []).forEach((x) => (m[x] = (m[x] || 0) + 1)));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  const meter = (list) => {
    const top = list[0]?.[1] || 1;
    return list.map(([k, n]) => `<li><span>${escapeHTML(k)}</span><span class="meter"><i style="width:${(n / top) * 80}px"></i><span class="muted">${n}</span></span></li>`).join('');
  };
  const pains = entries.filter((e) => e.pain > 0).map((e) => e.pain);
  const moods = tally('moods'), painTypes = tally('painTypes'), symptoms = tally('symptoms');

  if (pains.length || moods.length || painTypes.length || symptoms.length) {
    html += `<div class="list"><h3>Ces 3 derniers mois</h3><ul>
      ${pains.length ? `<li><span>Douleur moyenne</span><span class="muted">${(pains.reduce((a, b) => a + b, 0) / pains.length).toFixed(1)}/10 · ${plural(pains.length, 'jour')}</span></li>` : ''}
    </ul></div>`;
    if (moods.length) html += `<div class="list"><h3>Humeurs fréquentes</h3><ul>${meter(moods)}</ul></div>`;
    if (painTypes.length) html += `<div class="list"><h3>Douleurs fréquentes</h3><ul>${meter(painTypes)}</ul></div>`;
    if (symptoms.length) html += `<div class="list"><h3>Symptômes fréquents</h3><ul>${meter(symptoms)}</ul></div>`;
  }
  el.innerHTML = html;
}

// ---------- Réglages ----------
function renderSettings() {
  const st = state.settings;
  for (const k of ['remindBefore', 'remindEndBefore', 'reminderHour', 'cycleLength', 'periodLength']) {
    const el = $(`#set-${k}`);
    if (document.activeElement !== el) el.value = String(st[k]);
  }
  const btn = $('#btn-notif');
  const hint = $('#notif-hint');
  if (!('Notification' in window)) {
    btn.disabled = true;
    btn.textContent = 'Notifications de l’app indisponibles';
    hint.textContent = 'Sur iPhone, installe d’abord Lune sur l’écran d’accueil (Partager → Sur l’écran d’accueil). Les rappels du Calendrier, eux, fonctionnent toujours.';
  } else if (Notification.permission === 'granted') {
    btn.disabled = true;
    btn.textContent = 'Notifications de l’app activées ✓';
  } else if (Notification.permission === 'denied') {
    btn.disabled = true;
    btn.textContent = 'Notifications refusées';
    hint.textContent = 'Tu peux les réactiver dans Réglages iPhone → Notifications → Lune.';
  }
}

function bindSettings() {
  const hourSel = $('#set-reminderHour');
  for (let h = 6; h <= 22; h++) hourSel.insertAdjacentHTML('beforeend', `<option value="${h}">${h} h</option>`);

  const numeric = { cycleLength: [15, 60], periodLength: [1, 15] };
  for (const k of ['remindBefore', 'remindEndBefore', 'reminderHour', 'cycleLength', 'periodLength']) {
    $(`#set-${k}`).addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10);
      if (numeric[k]) {
        const [min, max] = numeric[k];
        if (Number.isNaN(v)) v = state.settings[k];
        v = Math.min(max, Math.max(min, v));
        e.target.value = v;
      }
      state.settings[k] = v;
      commit();
    });
  }

  $('#btn-ics').addEventListener('click', exportICS);
  $('#btn-notif').addEventListener('click', async () => {
    const res = await Notification.requestPermission();
    if (res === 'granted') {
      toast('Notifications activées');
      checkReminders(true);
    }
    renderSettings();
  });
  $('#btn-export').addEventListener('click', () => {
    const data = JSON.stringify({ ...state, exportedAt: new Date().toISOString(), app: 'lune', version: 1 }, null, 2);
    shareOrDownload(new Blob([data], { type: 'application/json' }), `lune-sauvegarde-${today()}.json`);
  });
  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!S.validateImport(data)) throw new Error();
      if (!confirm('Remplacer les données actuelles par cette sauvegarde ?')) return;
      state = { ...S.load(), periods: data.periods, days: data.days || {}, settings: { ...S.DEFAULT_SETTINGS, ...data.settings } };
      commit();
      toast('Sauvegarde importée');
    } catch {
      toast('Fichier de sauvegarde invalide');
    }
  });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Effacer toutes tes données ? Cette action est définitive.')) return;
    state = S.reset();
    commit();
    toast('Données effacées');
  });
}

async function shareOrDownload(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  // Sur iPhone, la feuille de partage est la façon la plus fiable de sortir un fichier
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function exportICS() {
  if (!state.periods.length) return toast('Note d’abord tes dernières règles');
  const preds = C.predictCycles(state.periods, state.settings, today(), 6).filter((c) => c.end >= today());
  const ics = C.buildICS(preds, state.settings);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  // Sur iOS, ouvrir le fichier .ics affiche « Ajouter tous les événements »
  const url = URL.createObjectURL(blob);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    URL.revokeObjectURL(url);
    shareOrDownload(blob, 'lune-rappels.ics');
  }
}

// ---------- Rappels dans l'app ----------
async function checkReminders(force = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const t = today();
  const st = C.status(state.periods, state.settings, t);
  let key = null, title = '', body = '';
  if (st.kind === 'cycle' && st.daysUntil <= state.settings.remindBefore) {
    key = `start-${st.next.start}`;
    title = st.daysUntil === 0 ? 'Tes règles sont prévues aujourd’hui' : `Tes règles arrivent ${st.daysUntil === 1 ? 'demain' : `dans ${st.daysUntil} jours`}`;
    body = 'Pense à avoir ce qu’il te faut sur toi 🌙';
  } else if (st.kind === 'late') {
    key = `late-${st.next.start}`;
    title = `Règles en retard de ${plural(st.lateBy, 'jour')}`;
    body = 'Si elles ont commencé, note-le dans Lune.';
  } else if (st.kind === 'period' && st.daysLeft <= state.settings.remindEndBefore) {
    key = `end-${st.expectedEnd}`;
    title = st.daysLeft === 0 ? 'Fin de tes règles prévue aujourd’hui' : 'Fin de tes règles prévue demain';
    body = 'Quand elles sont terminées, indique-le dans Lune.';
  }
  if (!key || (state.notified[key] && !force)) return;
  state.notified = { [key]: t }; // on ne garde que le dernier rappel
  S.save(state);
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: key });
    else new Notification(title, { body });
  } catch {}
}

// ---------- Fiche du jour ----------
function openSheet(iso) {
  sheetDate = iso;
  $('#sheet-title').textContent = iso === today() ? `Aujourd’hui, ${short(iso)}` : long(iso);
  renderSheet();
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  $('#sheet').hidden = true;
  document.body.style.overflow = '';
  sheetDate = null;
  render();
}

function dayData() {
  return state.days[sheetDate] || {};
}

function updateDay(patch) {
  const next = { ...dayData(), ...patch };
  const isEmpty = !next.flow && !next.pain && !next.moods?.length && !next.painTypes?.length && !next.symptoms?.length && !next.note;
  if (isEmpty) delete state.days[sheetDate];
  else state.days[sheetDate] = next;
  S.save(state);
}

function renderSheet() {
  const iso = sheetDate;
  const d = dayData();
  const inPeriod = periodAt(iso);
  const future = iso > today();

  let pa = '';
  if (inPeriod) {
    const n = C.diffDays(inPeriod.start, iso) + 1;
    pa = `<p class="tag">Règles · jour ${n}</p>`;
    if (iso !== inPeriod.end) pa += `<button class="btn" data-act="end">Fin des règles</button>`;
    pa += `<button class="btn" data-act="delete">Supprimer ces règles</button>`;
  } else if (!future) {
    pa = `<button class="btn primary" data-act="start">Début des règles</button>
          <button class="btn" data-act="end">Fin des règles</button>`;
  }
  $('#sheet-period').innerHTML = pa;

  $('#sheet-flow').innerHTML = FLOWS.map((f) => `<button data-flow="${f.v}" class="${(d.flow || 0) === f.v ? 'on' : ''}"><span class="drops">${f.drops}</span>${f.label}</button>`).join('');
  $('#sheet-pain').value = d.pain || 0;
  $('#pain-value').textContent = d.pain ? `${d.pain}/10` : 'aucune';
  const chips = (list, key) => list.map((x) => `<button data-v="${escapeHTML(x)}" class="${(d[key] || []).includes(x) ? 'on' : ''}">${escapeHTML(x)}</button>`).join('');
  $('#sheet-painTypes').innerHTML = chips(PAIN_TYPES, 'painTypes');
  $('#sheet-moods').innerHTML = chips(MOODS, 'moods');
  $('#sheet-symptoms').innerHTML = chips(SYMPTOMS, 'symptoms');
  $('#sheet-note').value = d.note || '';
}

function bindSheet() {
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

  $('#sheet-period').addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'start') startPeriod(sheetDate);
    if (act === 'end') endPeriod(sheetDate);
    if (act === 'delete') deletePeriod(sheetDate);
    if (sheetDate) renderSheet();
  });
  $('#sheet-flow').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    updateDay({ flow: Number(b.dataset.flow) });
    renderSheet();
  });
  $('#sheet-pain').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    $('#pain-value').textContent = v ? `${v}/10` : 'aucune';
    updateDay({ pain: v });
  });
  for (const key of ['painTypes', 'moods', 'symptoms']) {
    $(`#sheet-${key}`).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const v = b.dataset.v;
      const cur = new Set(dayData()[key] || []);
      cur.has(v) ? cur.delete(v) : cur.add(v);
      updateDay({ [key]: [...cur] });
      b.classList.toggle('on');
    });
  }
  $('#sheet-note').addEventListener('input', (e) => updateDay({ note: e.target.value.trim() ? e.target.value : '' }));
}

// ---------- Sélecteur de date ----------
function pickDate(title, value, onOk) {
  $('#datepick-title').textContent = title;
  const input = $('#datepick-input');
  input.value = value;
  input.max = today();
  $('#datepick').hidden = false;
  $('#datepick-ok').onclick = () => {
    const v = input.value;
    $('#datepick').hidden = true;
    if (v && v <= today()) onOk(v);
    else if (v) toast('Choisis une date passée ou aujourd’hui');
  };
}

// ---------- Navigation ----------
let currentView = 'home';
function show(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach((v) => (v.hidden = v.dataset.view !== view));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === view));
  window.scrollTo(0, 0);
  render();
}

function render() {
  if (currentView === 'home') renderHome();
  if (currentView === 'calendar') renderCalendar();
  if (currentView === 'stats') renderStats();
  if (currentView === 'settings') renderSettings();
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function init() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  $('#btn-today').addEventListener('click', () => openSheet(today()));
  $('#cal-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-date]');
    if (b) openSheet(b.dataset.date);
  });
  const shiftMonth = (n) => {
    const d = C.parseDate(calMonth);
    calMonth = C.toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
    renderCalendar();
  };
  $('#cal-prev').addEventListener('click', () => shiftMonth(-1));
  $('#cal-next').addEventListener('click', () => shiftMonth(1));
  $('#datepick-cancel').addEventListener('click', () => ($('#datepick').hidden = true));
  $('#datepick').addEventListener('click', (e) => { if (e.target.id === 'datepick') $('#datepick').hidden = true; });

  bindSheet();
  bindSettings();
  render();
  S.persist();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  checkReminders();
  // À chaque retour dans l'app : mise à jour (le jour a pu changer) + rappels
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      render();
      checkReminders();
    }
  });
}

init();
