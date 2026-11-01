# Shift Calendar v2

React + TypeScript + Tailwind (GitHub Primer tokens), Firebase, GSAP and Framer Motion.

```
cp .env.example .env.local   # fill in your Firebase web app settings
npm install
npm run dev                  # http://localhost:5173  (add ?demo=1 for sample data, no Firebase)
npm test                     # engine/holiday parity tests plus v2 tests
npm run build
```

Deploying to GitHub Pages: see `.github/workflows/deploy.yml` (header comment lists the one-time setup). `public/sw.js` retires the old v1.x service worker on phones that installed it.

Publish `firestore.rules` unchanged: v2 reads and writes the same `users/{uid}` and `users/{uid}/days/{date}` documents as v1.6, so existing data and logins carry over.

## Layout
- `src/utils/` engine, banks, holidays: v1.6 maths ported to TypeScript, same results (see `tests/engine.test.ts`)
- `src/services/StorageService.ts` the only code that touches localStorage; every key is `shiftcal_v2_*`
- `src/services/firebase-config.ts` settings from `VITE_FIREBASE_*`
- `src/services/dayDoc.ts` + `backend.ts` typed, validated day writes that mirror `firestore.rules`
- `src/components/` AppLayout, CalendarGrid, DaySheet, LeaveDashboard, and small shared pieces

## Features
Calendar, day sheet (leave, lieu, overtime, notes), swap or extra shift log, leave banks (book a range, add and edit banks, ledger), upcoming, pay (rate, premiums, breaks, dates), rotation and shift library, setup wizard, settings, .ics export, sharing, invites, swap requests and notifications.

## Try it without Firebase
- `?demo=1` sample user (not saved)
- `?demo=1&as=alice` and `?demo=1&as=sam` named users saved in this browser, shared across tabs, so two tabs can share and swap
- add `&fresh=1` to start with no data and try the setup wizard

## Not in this build
The offline service worker. Everything else from v1.6 is ported. Firestore paths and rules are unchanged, so v1.6 accounts work as they are.
