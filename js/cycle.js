// Logique pure du cycle : aucune dépendance au DOM, testable avec Node.
// Toutes les dates sont des chaînes "YYYY-MM-DD" (jour local), pour éviter
// les décalages de fuseau horaire.

export const DAY_MS = 86400000;

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  return toISO(new Date(parseDate(iso).getTime() + n * DAY_MS));
}

export function diffDays(a, b) {
  // nombre de jours de a vers b (b - a)
  return Math.round((parseDate(b) - parseDate(a)) / DAY_MS);
}

export function sortPeriods(periods) {
  return [...periods].sort((a, b) => a.start.localeCompare(b.start));
}

const MIN_CYCLE = 15;
const MAX_CYCLE = 60;
const HISTORY = 6; // nombre de cycles récents pris en compte pour la moyenne

/** Longueurs des cycles terminés (écart entre deux débuts consécutifs). */
export function cycleLengths(periods) {
  const s = sortPeriods(periods);
  const out = [];
  for (let i = 1; i < s.length; i++) {
    out.push({ start: s[i - 1].start, length: diffDays(s[i - 1].start, s[i].start) });
  }
  return out;
}

/** Durée (en jours) des règles terminées. */
export function periodLengths(periods) {
  return sortPeriods(periods)
    .filter((p) => p.end)
    .map((p) => ({ start: p.start, length: diffDays(p.start, p.end) + 1 }));
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function averageCycle(periods, fallback = 28) {
  const lens = cycleLengths(periods)
    .map((c) => c.length)
    .filter((l) => l >= MIN_CYCLE && l <= MAX_CYCLE)
    .slice(-HISTORY);
  return lens.length ? Math.round(mean(lens)) : fallback;
}

export function averagePeriod(periods, fallback = 5) {
  const lens = periodLengths(periods)
    .map((p) => p.length)
    .filter((l) => l >= 1 && l <= 15)
    .slice(-HISTORY);
  return lens.length ? Math.round(mean(lens)) : fallback;
}

/** Écart (min / max) des cycles récents, pour savoir si le cycle est régulier. */
export function cycleVariation(periods) {
  const lens = cycleLengths(periods)
    .map((c) => c.length)
    .filter((l) => l >= MIN_CYCLE && l <= MAX_CYCLE)
    .slice(-HISTORY);
  if (lens.length < 2) return null;
  return { min: Math.min(...lens), max: Math.max(...lens) };
}

/** Règles en cours (débutées, sans date de fin) au jour donné. */
export function currentPeriod(periods, today) {
  const s = sortPeriods(periods);
  const last = s[s.length - 1];
  if (!last) return null;
  if (last.start > today) return null;
  if (last.end) return last.end >= today ? last : null;
  // Règles sans date de fin : considérées en cours au plus OPEN_MAX jours
  // (au-delà, c'est probablement un oubli de saisie de la fin).
  return diffDays(last.start, today) < OPEN_MAX ? last : null;
}

export const OPEN_MAX = 10;

/** Dernier jour affiché pour des règles (fin saisie, ou fin provisoire si en cours). */
export function displayEnd(p, today) {
  if (p.end) return p.end;
  const cap = addDays(p.start, OPEN_MAX - 1);
  return today < cap ? today : cap;
}

/**
 * Prédictions des prochains cycles.
 * Renvoie une liste de { start, end, ovulation, fertileStart, fertileEnd }.
 */
export function predictCycles(periods, settings, today, count = 6) {
  const s = sortPeriods(periods);
  const cycle = averageCycle(s, settings.cycleLength);
  const len = averagePeriod(s, settings.periodLength);
  const out = [];
  if (!s.length) return out;

  let start = addDays(s[s.length - 1].start, cycle);
  // Si la date prévue est déjà passée (retard ou oubli de saisie), on ne
  // saute pas de cycle : on considère que les règles sont attendues dès aujourd'hui.
  const lateBy = diffDays(start, today);
  const late = lateBy > 0 && !currentPeriod(s, today);

  for (let i = 0; i < count; i++) {
    const ovulation = addDays(start, -14);
    out.push({
      start,
      end: addDays(start, len - 1),
      ovulation,
      fertileStart: addDays(ovulation, -5),
      fertileEnd: addDays(ovulation, 1),
      late: i === 0 && late ? lateBy : 0,
    });
    start = addDays(start, cycle);
  }
  return out;
}

/** Résumé pour l'écran d'accueil. */
export function status(periods, settings, today) {
  const s = sortPeriods(periods);
  const cycle = averageCycle(s, settings.cycleLength);
  const len = averagePeriod(s, settings.periodLength);
  if (!s.length) return { kind: 'empty', cycle, periodLength: len };

  const last = s[s.length - 1];
  const cycleDay = diffDays(last.start, today) + 1;
  const ongoing = currentPeriod(s, today);
  const next = predictCycles(s, settings, today, 1)[0];

  if (ongoing) {
    const day = diffDays(ongoing.start, today) + 1;
    const expectedEnd = ongoing.end || addDays(ongoing.start, len - 1);
    return {
      kind: 'period',
      day,
      cycleDay,
      cycle,
      periodLength: len,
      expectedEnd,
      ended: !!ongoing.end, // fin déjà saisie (aujourd'hui ou plus tard)
      daysLeft: Math.max(0, diffDays(today, expectedEnd)),
      next,
    };
  }
  if (next.late) {
    return { kind: 'late', lateBy: next.late, cycleDay, cycle, periodLength: len, next };
  }
  return {
    kind: 'cycle',
    cycleDay,
    cycle,
    periodLength: len,
    daysUntil: diffDays(today, next.start),
    fertile: today >= next.fertileStart && today <= next.fertileEnd,
    next,
  };
}

/** Classe chaque jour d'un intervalle pour le calendrier. */
export function dayKind(iso, periods, predictions, today = iso) {
  for (const p of periods) {
    const end = displayEnd(p, today);
    if (iso >= p.start && iso <= end) return 'period';
  }
  for (const c of predictions) {
    if (iso >= c.start && iso <= c.end) return 'predicted';
    if (iso === c.ovulation) return 'ovulation';
    if (iso >= c.fertileStart && iso <= c.fertileEnd) return 'fertile';
  }
  return '';
}

// ---------- Rappels calendrier (.ics) ----------

function icsDate(iso) {
  return iso.replace(/-/g, '');
}

/** Durée iCalendar à partir d'un nombre de minutes (peut être négatif). */
export function icsDuration(minutes) {
  const sign = minutes < 0 ? '-' : '';
  let m = Math.abs(minutes);
  const d = Math.floor(m / 1440);
  m -= d * 1440;
  const h = Math.floor(m / 60);
  m -= h * 60;
  let out = `${sign}P`;
  if (d) out += `${d}D`;
  if (h || m || !d) {
    out += 'T';
    if (h) out += `${h}H`;
    if (m || !h) out += `${m}M`;
  }
  return out;
}

function escapeText(t) {
  return t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsEvent({ uid, date, summary, description, alarmDaysBefore, hour, stamp }) {
  // Événement "journée entière" ; l'alarme se déclenche à `hour` h,
  // `alarmDaysBefore` jours avant.
  const trigger = icsDuration(-alarmDaysBefore * 1440 + hour * 60);
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(date)}`,
    `DTEND;VALUE=DATE:${icsDate(addDays(date, 1))}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(summary)}`,
    `TRIGGER:${trigger}`,
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}

export function buildICS(predictions, settings, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const hour = settings.reminderHour ?? 9;
  const events = [];
  predictions.forEach((c) => {
    events.push(
      icsEvent({
        uid: `lune-start-${c.start}@lune.app`,
        date: c.start,
        summary: '🌙 Règles prévues',
        description: 'Début prévu de tes règles (estimation Lune).',
        alarmDaysBefore: settings.remindBefore ?? 2,
        hour,
        stamp,
      }),
      icsEvent({
        uid: `lune-end-${c.end}@lune.app`,
        date: c.end,
        summary: '🌙 Fin prévue des règles',
        description: 'Fin prévue de tes règles (estimation Lune). Pense à la noter dans l’app.',
        alarmDaysBefore: settings.remindEndBefore ?? 0,
        hour,
        stamp,
      })
    );
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lune//Suivi de cycle//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Lune – cycle', ...events, 'END:VCALENDAR', ''].join('\r\n');
}
