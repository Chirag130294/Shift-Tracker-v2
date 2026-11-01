// Statutory holidays. Canada and the US are calculated offline from rules. Every other country loads from the free
// public Nager.Date list the first time it is chosen, then stays saved on this phone.
// Always check against your employer's list: use "Add my own holiday" for anything missing or different.
//
// Ported from v1.6 holidays.js. The holiday rules are unchanged. The one difference is that the saved
// lists now go through StorageService instead of calling localStorage directly.
import { ymd, weekday, addDays, mod, daysInMonth } from './engine';
import { StorageKey, StorageService, type HolidayEntry } from '../services/StorageService';
import type { DateStr } from '../types';

export interface Region {
  id: string;
  name: string;
}
export type HolidayMap = Record<DateStr, string>;

// nth weekday (0 = Sunday) of a month (1 to 12)
function nth(y: number, m: number, wd: number, n: number): DateStr {
  const first = ymd(y, m, 1);
  return addDays(first, mod(wd - weekday(first), 7) + (n - 1) * 7);
}
function lastWeekday(y: number, m: number, wd: number): DateStr {
  const end = ymd(y, m, daysInMonth(y, m));
  return addDays(end, -mod(weekday(end) - wd, 7));
}
function easter(y: number): DateStr {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}
// Monday before May 25
function victoriaDay(y: number): DateStr {
  const d = ymd(y, 5, 24);
  return addDays(d, -mod(weekday(d) - 1, 7));
}

export const REGIONS: Record<string, Region[]> = {
  CA: [
    { id: 'AB', name: 'Alberta' }, { id: 'BC', name: 'British Columbia' }, { id: 'MB', name: 'Manitoba' }, { id: 'NB', name: 'New Brunswick' },
    { id: 'NL', name: 'Newfoundland and Labrador' }, { id: 'NT', name: 'Northwest Territories' }, { id: 'NS', name: 'Nova Scotia' },
    { id: 'NU', name: 'Nunavut' }, { id: 'ON', name: 'Ontario' }, { id: 'PE', name: 'Prince Edward Island' }, { id: 'QC', name: 'Quebec' },
    { id: 'SK', name: 'Saskatchewan' }, { id: 'YT', name: 'Yukon' }, { id: 'FED', name: 'Federal holidays only' }
  ],
  US: [{ id: 'US', name: 'Federal holidays' }]
};
export const BUILT_IN: readonly string[] = ['CA', 'US'];
export const REGION_TITLE: Record<string, string> = { CA: 'Province or territory', US: 'State', AU: 'State or territory', GB: 'Nation', DE: 'State' };

// Friendly names for the region codes the public list uses
const NAMES: Record<string, string> = {
  'GB-ENG': 'England', 'GB-SCT': 'Scotland', 'GB-WLS': 'Wales', 'GB-NIR': 'Northern Ireland',
  'AU-NSW': 'New South Wales', 'AU-VIC': 'Victoria', 'AU-QLD': 'Queensland', 'AU-SA': 'South Australia', 'AU-WA': 'Western Australia', 'AU-TAS': 'Tasmania', 'AU-ACT': 'Australian Capital Territory', 'AU-NT': 'Northern Territory',
  'DE-BW': 'Baden-Wurttemberg', 'DE-BY': 'Bavaria', 'DE-BE': 'Berlin', 'DE-BB': 'Brandenburg', 'DE-HB': 'Bremen', 'DE-HH': 'Hamburg', 'DE-HE': 'Hesse', 'DE-MV': 'Mecklenburg-Vorpommern', 'DE-NI': 'Lower Saxony', 'DE-NW': 'North Rhine-Westphalia', 'DE-RP': 'Rhineland-Palatinate', 'DE-SL': 'Saarland', 'DE-SN': 'Saxony', 'DE-ST': 'Saxony-Anhalt', 'DE-SH': 'Schleswig-Holstein', 'DE-TH': 'Thuringia'
};
export const regionLabel = (code: string): string => NAMES[code] || String(code).replace(/^[A-Z]{2}-/, '');

// ---------- Canada and US, from rules ----------
export function holidaysFor(y: number, country: string, region?: string): HolidayMap {
  const H: HolidayMap = {};
  const add = (d: DateStr, name: string): void => { H[d] = name; };
  if (country === 'CA') {
    const gf = addDays(easter(y), -2), r = region || 'FED';
    add(ymd(y, 1, 1), "New Year's Day");
    add(ymd(y, 7, 1), r === 'NL' ? 'Memorial Day' : 'Canada Day');
    add(nth(y, 9, 1, 1), 'Labour Day');
    add(ymd(y, 12, 25), 'Christmas Day');
    if (r !== 'QC') add(gf, 'Good Friday');
    if (['AB', 'BC', 'MB', 'NT', 'NU', 'ON', 'SK', 'YT', 'FED'].includes(r)) add(victoriaDay(y), 'Victoria Day');
    if (['AB', 'BC', 'MB', 'NT', 'NU', 'ON', 'SK', 'YT', 'FED'].includes(r)) add(nth(y, 10, 1, 2), 'Thanksgiving');
    if (['AB', 'BC', 'NB', 'NL', 'NT', 'NU', 'NS', 'PE', 'SK', 'YT', 'FED'].includes(r)) add(ymd(y, 11, 11), 'Remembrance Day');
    if (['AB', 'BC', 'ON', 'SK', 'NB', 'PE'].includes(r)) add(nth(y, 2, 1, 3), r === 'PE' ? 'Islander Day' : 'Family Day');
    if (r === 'NS') add(nth(y, 2, 1, 3), 'Heritage Day');
    if (r === 'MB') add(nth(y, 2, 1, 3), 'Louis Riel Day');
    if (r === 'ON') add(ymd(y, 12, 26), 'Boxing Day');
    if (r === 'NT' || r === 'FED') add(ymd(y, 12, 26), 'Boxing Day');
    if (r === 'BC') add(nth(y, 8, 1, 1), 'BC Day');
    if (r === 'SK') add(nth(y, 8, 1, 1), 'Saskatchewan Day');
    if (r === 'NB') add(nth(y, 8, 1, 1), 'New Brunswick Day');
    if (r === 'NT' || r === 'NU') add(nth(y, 8, 1, 1), 'Civic Holiday');
    if (r === 'YT') add(nth(y, 8, 1, 3), 'Discovery Day');
    if (r === 'NU') add(ymd(y, 7, 9), 'Nunavut Day');
    if (r === 'NT' || r === 'YT') add(ymd(y, 6, 21), 'National Indigenous Peoples Day');
    if (['BC', 'MB', 'NB', 'NT', 'NU', 'YT', 'FED'].includes(r)) add(ymd(y, 9, 30), 'Truth and Reconciliation Day');
    if (r === 'QC') {
      add(addDays(easter(y), 1), 'Easter Monday');
      add(victoriaDay(y), 'National Patriots Day');
      add(ymd(y, 6, 24), 'National Holiday (Saint-Jean-Baptiste)');
      add(nth(y, 10, 1, 2), 'Thanksgiving');
    }
    if (r === 'FED') add(addDays(easter(y), 1), 'Easter Monday');
  } else if (country === 'US') {
    add(ymd(y, 1, 1), "New Year's Day");
    add(nth(y, 1, 1, 3), 'Martin Luther King Jr. Day');
    add(nth(y, 2, 1, 3), "Presidents' Day");
    add(lastWeekday(y, 5, 1), 'Memorial Day');
    add(ymd(y, 6, 19), 'Juneteenth');
    add(ymd(y, 7, 4), 'Independence Day');
    add(nth(y, 9, 1, 1), 'Labor Day');
    add(nth(y, 10, 1, 2), 'Columbus Day');
    add(ymd(y, 11, 11), 'Veterans Day');
    add(nth(y, 11, 4, 4), 'Thanksgiving');
    add(ymd(y, 12, 25), 'Christmas Day');
  }
  return H;
}

// ---------- every other country, from the public Nager.Date list (cached on the phone) ----------
const MEM: Record<string, HolidayEntry[] | null> = {}; // 'CC|year' -> list, or null while loading or failed
const TRY: Record<string, number> = {};                // 'CC|year' -> time of last attempt
const key = (cc: string, y: number): string => `${cc}|${y}`;
let onLoaded: (cc: string, y: number) => void = () => {};
export const setOnLoaded = (f: (cc: string, y: number) => void): void => { onLoaded = f; };

interface NagerHoliday {
  date?: unknown;
  name?: unknown;
  localName?: unknown;
  global?: unknown;
  counties?: unknown;
}

export function cachedList(cc: string, y: number): HolidayEntry[] | null {
  const k = key(cc, y);
  if (MEM[k] === undefined) MEM[k] = StorageService.get(StorageKey.CACHE_HOLIDAYS)?.[k] ?? null;
  return MEM[k];
}
/** Start loading in the background if we do not have it. Returns nothing: screens redraw when it arrives. */
export function ensureList(cc: string, y: number): void {
  const k = key(cc, y);
  if (!cc || BUILT_IN.includes(cc) || cachedList(cc, y)) return;
  if (TRY[k] && Date.now() - TRY[k] < 60000) return;
  TRY[k] = Date.now();
  if (typeof fetch !== 'function' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/${encodeURIComponent(cc)}`)
    .then(r => (r.ok ? (r.json() as Promise<unknown>) : Promise.reject(new Error('no list'))))
    .then(list => {
      const clean: HolidayEntry[] = (Array.isArray(list) ? (list as NagerHoliday[]) : []).map(h => ({
        date: String(h.date),
        name: String(h.name || h.localName || 'Holiday'),
        global: h.global !== false,
        counties: Array.isArray(h.counties) ? h.counties.map(String) : []
      }));
      MEM[k] = clean;
      StorageService.update(StorageKey.CACHE_HOLIDAYS, cur => ({ ...(cur ?? {}), [k]: clean }));
      onLoaded(cc, y);
    })
    .catch(() => { /* stays empty; the holiday screen offers manual holidays */ });
}
export const loadState = (cc: string, y: number): 'ready' | 'loading' | 'idle' =>
  (BUILT_IN.includes(cc) ? 'ready' : cachedList(cc, y) ? 'ready' : TRY[key(cc, y)] ? 'loading' : 'idle');
export function externalHolidays(y: number, cc: string, region?: string): HolidayMap {
  const list = cachedList(cc, y) || [], H: HolidayMap = {};
  for (const h of list) if (h.global || !region || (h.counties || []).includes(region)) H[h.date] = h.name;
  return H;
}
/** The regions a country's list mentions (empty when the whole country shares one list) */
export function externalRegions(cc: string, y: number): Region[] {
  const set = new Set<string>();
  for (const h of cachedList(cc, y) || []) for (const c of h.counties || []) set.add(c);
  return Array.from(set).sort().map(id => ({ id, name: regionLabel(id) }));
}
export const regionsOf = (cc: string, y: number): Region[] => (REGIONS[cc] ? REGIONS[cc] : externalRegions(cc, y));
export const holidaysAny = (y: number, cc: string, region?: string): HolidayMap =>
  (BUILT_IN.includes(cc) ? holidaysFor(y, cc, region) : externalHolidays(y, cc, region));
