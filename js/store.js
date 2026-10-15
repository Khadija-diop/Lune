// Stockage local (sur l'appareil uniquement).
const KEY = 'lune.v1';

export const DEFAULT_SETTINGS = {
  cycleLength: 28,
  periodLength: 5,
  remindBefore: 2,
  remindEndBefore: 0,
  reminderHour: 9,
};

function empty() {
  return { periods: [], days: {}, settings: { ...DEFAULT_SETTINGS }, notified: {} };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw);
    return {
      ...empty(),
      ...data,
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
    };
  } catch {
    return empty();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function validateImport(data) {
  if (!data || typeof data !== 'object') return false;
  if (!Array.isArray(data.periods)) return false;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  return data.periods.every((p) => iso.test(p.start) && (p.end == null || iso.test(p.end)));
}

export function reset() {
  localStorage.removeItem(KEY);
  return empty();
}

// Demande au navigateur de ne pas effacer les données en cas de manque d'espace.
export async function persist() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {}
}
