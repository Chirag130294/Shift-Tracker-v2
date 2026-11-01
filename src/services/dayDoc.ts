// Validation for users/{uid}/days/{date}. Mirrors the day rule in firestore.rules:
//   isDate(day), keys().hasOnly([type, shiftId, hours, person, note, lieu, noLieu, bank, splits, toBank]),
//   note <= 500, person <= 100, splits is a list of at most 6.
// Writes go through parseDayDoc, so a payload the database would reject throws here, before any network call.
import { DAY_KEYS, DAY_TYPES, type BankSplit, type DateStr, type DayDoc, type DayType } from '../types';

export class DayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DayValidationError';
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_MAX = 64;
const NOTE_MAX = 500;
const PERSON_MAX = 100;
const SPLITS_MAX = 6;

export function assertDate(date: string): asserts date is DateStr {
  if (!DATE_RE.test(date)) throw new DayValidationError(`"${date}" is not a YYYY-MM-DD date.`);
  const [y, m, d] = date.split('-').map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) {
    throw new DayValidationError(`"${date}" is not a real calendar date.`);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDayKey = (k: string): k is keyof DayDoc => (DAY_KEYS as readonly string[]).includes(k);
const isDayType = (v: unknown): v is DayType => typeof v === 'string' && (DAY_TYPES as readonly string[]).includes(v);

function text(key: string, v: unknown, max: number): string {
  if (typeof v !== 'string') throw new DayValidationError(`"${key}" must be text.`);
  if (v.length > max) throw new DayValidationError(`"${key}" can be at most ${max} characters.`);
  return v;
}

function hours(key: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new DayValidationError(`"${key}" must be a number of hours, zero or more.`);
  return v;
}

function flag(key: string, v: unknown): boolean {
  if (typeof v !== 'boolean') throw new DayValidationError(`"${key}" must be true or false.`);
  return v;
}

function splits(v: unknown): BankSplit[] {
  if (!Array.isArray(v)) throw new DayValidationError('"splits" must be a list.');
  if (v.length > SPLITS_MAX) throw new DayValidationError(`"splits" can hold at most ${SPLITS_MAX} banks.`);
  return v.map((s, i) => {
    if (!isRecord(s)) throw new DayValidationError(`splits[${i}] must be { bank, h }.`);
    return { bank: text(`splits[${i}].bank`, s.bank, ID_MAX), h: hours(`splits[${i}].h`, s.h) };
  });
}

/** Drops values that mean "not set" (undefined, null, '' and false), the way v1.6 did before every save. */
export function cleanDay(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    out[k] = v;
  }
  return out;
}

/** Strict: throws DayValidationError for anything the database would refuse. */
export function parseDayDoc(input: unknown): DayDoc {
  if (!isRecord(input)) throw new DayValidationError('A day must be an object.');
  const out: DayDoc = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (!isDayKey(k)) throw new DayValidationError(`"${k}" is not a field a day can have.`);
    switch (k) {
      case 'type':
        if (!isDayType(v)) throw new DayValidationError(`"${String(v)}" is not a day type.`);
        out.type = v;
        break;
      case 'shiftId': out.shiftId = text(k, v, ID_MAX); break;
      case 'bank': out.bank = text(k, v, ID_MAX); break;
      case 'toBank': out.toBank = text(k, v, ID_MAX); break;
      case 'person': out.person = text(k, v, PERSON_MAX); break;
      case 'note': out.note = text(k, v, NOTE_MAX); break;
      case 'hours': out.hours = hours(k, v); break;
      case 'lieu': out.lieu = flag(k, v); break;
      case 'noLieu': out.noLieu = flag(k, v); break;
      case 'splits': out.splits = splits(v); break;
    }
  }
  return out;
}

/**
 * Lenient: used for data coming back from the database. Keeps the fields a day may have and ignores
 * the rest, so one odd document cannot stop the calendar from drawing.
 */
export function readDayDoc(data: unknown): DayDoc {
  if (!isRecord(data)) return {};
  const out: DayDoc = {};
  if (isDayType(data.type)) out.type = data.type;
  if (typeof data.shiftId === 'string') out.shiftId = data.shiftId;
  if (typeof data.hours === 'number' && Number.isFinite(data.hours)) out.hours = data.hours;
  if (typeof data.person === 'string') out.person = data.person;
  if (typeof data.note === 'string') out.note = data.note;
  if (data.lieu === true) out.lieu = true;
  if (data.noLieu === true) out.noLieu = true;
  if (typeof data.bank === 'string') out.bank = data.bank;
  if (typeof data.toBank === 'string') out.toBank = data.toBank;
  if (Array.isArray(data.splits)) {
    out.splits = data.splits
      .filter(isRecord)
      .map(s => ({ bank: typeof s.bank === 'string' ? s.bank : '', h: typeof s.h === 'number' && Number.isFinite(s.h) ? s.h : 0 }))
      .filter(s => s.bank !== '');
  }
  return out;
}

/** The one place a day becomes a database payload. Cleans "not set" values, then validates strictly. */
export function toDayPayload(date: DateStr, day: DayDoc): DayDoc {
  assertDate(date);
  return parseDayDoc(cleanDay({ ...day }));
}

/** Removes everything about what kind of day this is, keeping the note and lieu flags (v1.6 TYPE_KEYS). */
export function withoutTypeKeys(day: DayDoc): DayDoc {
  const { type, shiftId, hours, person, bank, splits, toBank, ...rest } = day;
  return rest;
}
