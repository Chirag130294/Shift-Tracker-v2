// The only place in the app that touches window.localStorage.
// Every key is prefixed with `shiftcal_v2_`, so v2 can never read or overwrite state left behind by v1.x
// (v1 used `shiftcal_*` and `shiftcal_hol_*`). Components and utilities go through this service.
//
// Reads are validated per key, writes never throw, and when localStorage is blocked (private window,
// cleared site data, quota) the service falls back to memory so the app keeps working for the session.

export enum StorageKey {
  /** Nager.Date public-holiday lists, keyed 'CC|year' */
  CACHE_HOLIDAYS = 'cache_holidays',
  /** choices that belong to this device rather than the account */
  USER_PREFS = 'user_prefs',
  /** what the last calendar export held, per account, so the next one can say what changed */
  EXPORT_LAST = 'export_last'
}

export interface HolidayEntry {
  date: string;
  name: string;
  global: boolean;
  counties: string[];
}

export type LedgerFilter = 'all' | 'earn' | 'used' | 'booked';
export const LEDGER_FILTERS: readonly LedgerFilter[] = ['all', 'earn', 'used', 'booked'];

export type ExportRange = '3' | '6' | '12' | 'custom';
export interface ExportPrefs { range: ExportRange; rems: number[]; leave: boolean; hol: boolean; pay: boolean }
export interface ExportRecord { at: number; seq: number; ev: Record<string, string> }

export interface UserPrefs {
  /** last choices on the export screen */
  exportPrefs?: ExportPrefs;
  /** the bank last booked from */
  lastBank?: string;
  /** which ledger rows the leave screen shows */
  ledgerFilter?: LedgerFilter;
}

export interface StorageSchema {
  [StorageKey.CACHE_HOLIDAYS]: Record<string, HolidayEntry[]>;
  [StorageKey.USER_PREFS]: UserPrefs;
  [StorageKey.EXPORT_LAST]: Record<string, ExportRecord>;
}

type Validator<T> = (value: unknown) => value is T;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isHolidayEntry = (v: unknown): v is HolidayEntry =>
  isRecord(v) && typeof v.date === 'string' && typeof v.name === 'string' && typeof v.global === 'boolean' &&
  Array.isArray(v.counties) && v.counties.every(c => typeof c === 'string');

const VALIDATORS: { [K in StorageKey]: Validator<StorageSchema[K]> } = {
  [StorageKey.CACHE_HOLIDAYS]: (v): v is StorageSchema[StorageKey.CACHE_HOLIDAYS] =>
    isRecord(v) && Object.values(v).every(list => Array.isArray(list) && list.every(isHolidayEntry)),
  [StorageKey.USER_PREFS]: (v): v is UserPrefs =>
    isRecord(v) && (v.ledgerFilter === undefined || LEDGER_FILTERS.includes(v.ledgerFilter as LedgerFilter))
    && (v.lastBank === undefined || typeof v.lastBank === 'string')
    && (v.exportPrefs === undefined || (isRecord(v.exportPrefs) && Array.isArray(v.exportPrefs.rems) && v.exportPrefs.rems.every(n => typeof n === 'number'))),
  [StorageKey.EXPORT_LAST]: (v): v is Record<string, ExportRecord> =>
    isRecord(v) && Object.values(v).every(r => isRecord(r) && typeof r.at === 'number' && typeof r.seq === 'number' && isRecord(r.ev))
};

const PREFIX = 'shiftcal_v2_';
const fullKey = (key: StorageKey): string => PREFIX + key;

const fallback = new Map<string, string>();

function backing(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readRaw(key: StorageKey): string | null {
  const k = fullKey(key);
  try {
    const store = backing();
    if (store) return store.getItem(k);
  } catch {
    /* blocked: use the in-memory copy */
  }
  return fallback.get(k) ?? null;
}

function writeRaw(key: StorageKey, value: string | null): void {
  const k = fullKey(key);
  try {
    const store = backing();
    if (store) {
      if (value === null) store.removeItem(k); else store.setItem(k, value);
      fallback.delete(k);
      return;
    }
  } catch {
    /* quota or blocked: keep it in memory for this session */
  }
  if (value === null) fallback.delete(k); else fallback.set(k, value);
}

export const StorageService = {
  get<K extends StorageKey>(key: K): StorageSchema[K] | null {
    const raw = readRaw(key);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return VALIDATORS[key](parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  set<K extends StorageKey>(key: K, value: StorageSchema[K]): void {
    writeRaw(key, JSON.stringify(value));
  },

  remove(key: StorageKey): void {
    writeRaw(key, null);
  },

  /** Read-modify-write for map-shaped keys, such as the holiday cache. */
  update<K extends StorageKey>(key: K, fn: (current: StorageSchema[K] | null) => StorageSchema[K]): void {
    this.set(key, fn(this.get(key)));
  }
};
