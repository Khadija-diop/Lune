import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/cycle.js';

const settings = { cycleLength: 28, periodLength: 5, remindBefore: 2, remindEndBefore: 0, reminderHour: 9 };
const periods = [
  { id: 1, start: '2026-07-01', end: '2026-07-05' },
  { id: 2, start: '2026-07-30', end: '2026-08-03' }, // 29 j
  { id: 3, start: '2026-08-27', end: '2026-09-01' }, // 28 j
  { id: 4, start: '2026-09-25', end: '2026-09-29' }, // 29 j
];

test('dates', () => {
  assert.equal(C.addDays('2026-02-27', 2), '2026-03-01');
  assert.equal(C.diffDays('2026-03-28', '2026-03-30'), 2); // passage heure d'été
  assert.equal(C.diffDays('2026-10-24', '2026-10-26'), 2); // passage heure d'hiver
});

test('moyennes', () => {
  assert.deepEqual(C.cycleLengths(periods).map((c) => c.length), [29, 28, 29]);
  assert.equal(C.averageCycle(periods), 29);
  assert.equal(C.averagePeriod(periods), 5);
  assert.equal(C.averageCycle([], 30), 30);
  // cycle aberrant (oubli de saisie) ignoré
  assert.equal(C.averageCycle([...periods, { start: '2026-12-20' }]), 29);
});

test('prédictions', () => {
  const p = C.predictCycles(periods, settings, '2026-10-15', 2);
  assert.equal(p[0].start, '2026-10-24');
  assert.equal(p[0].end, '2026-10-28');
  assert.equal(p[0].ovulation, '2026-10-10');
  assert.equal(p[1].start, '2026-11-22');
});

test('statut', () => {
  const s = C.status(periods, settings, '2026-10-15');
  assert.equal(s.kind, 'cycle');
  assert.equal(s.cycleDay, 21);
  assert.equal(s.daysUntil, 9);

  const inP = C.status([...periods, { start: '2026-10-14', end: null }], settings, '2026-10-15');
  assert.equal(inP.kind, 'period');
  assert.equal(inP.day, 2);

  const late = C.status(periods, settings, '2026-10-27');
  assert.equal(late.kind, 'late');
  assert.equal(late.lateBy, 3);

  assert.equal(C.status([], settings, '2026-10-15').kind, 'empty');
});

test('durées ICS', () => {
  assert.equal(C.icsDuration(-2 * 1440 + 540), '-P1DT15H');
  assert.equal(C.icsDuration(540), 'PT9H');
  assert.equal(C.icsDuration(-1440 + 540), '-PT15H');
  assert.equal(C.icsDuration(-3 * 1440), '-P3D');
  assert.equal(C.icsDuration(0), 'PT0M');
});

test('fichier ICS', () => {
  const ics = C.buildICS(C.predictCycles(periods, settings, '2026-10-15', 3), settings);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 6);
  assert.match(ics, /DTSTART;VALUE=DATE:20261024/);
  assert.match(ics, /TRIGGER:-P1DT15H/);
  assert.ok(ics.includes('\r\n'));
});
