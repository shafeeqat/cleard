# clear'd.

> Every month. clear'd.

A financial obligations tracker — not a budgeting app. Its one job is to
answer, reliably: **what do I still need to clear this month?**

Nothing disappears until it's actually finished.

---

## Tech stack

Deliberately simple, no build step:

- **Frontend** — a single `index.html` shell + plain ES modules under `js/`, styled with Tailwind CSS via the Play CDN, Newsreader + Inter (Google Fonts), Material Symbols icons. No framework, no bundler.
- **Backend** — Firebase Authentication (Google sign-in) + Cloud Firestore.
- **Hosting** — static hosting on GitHub Pages, served directly from the repo (same zero-build deploy model as the RepSprout reference project).

Business logic (obligation lifecycle, monthly generation, integrity
checking) lives in framework-free modules under `js/models/` that are
imported both by the app and directly by the Node test suite in `tests/`.

## Project layout

```
index.html                 App shell: header, nav, view containers, theme tokens
manifest.json               PWA manifest
firestore.rules             Security rules — per-user data isolation
js/
  firebaseConfig.js         Your Firebase project config (fill this in)
  firebase.js               All direct Firebase SDK usage lives here
  state.js                  App state + default settings
  main.js                   Auth flow, routing, theming, monthly-generation trigger
  ui.js                     Toasts, modal/sheet host, confirm dialogs
  models/
    obligations.js          Lifecycle rules: scheduling, remaining count, completion
    monthlyInstances.js     Instance snapshots, pay/GIRO/amount-known transitions
    monthlyGeneration.js    Idempotent monthly instance generation
    integrity.js            Missing-instance detection
  views/                    One render function per screen + the add/edit form and pay-flow modal
  ai/openai.js               Optional AI features (user's own OpenAI key only)
  utils/                    Dates, formatting, the write-timeout guard
tests/                      Plain Node assertion tests (no framework) — node tests/run-all.mjs
```

## Setup

### 1. Firebase project

1. Create a project at the [Firebase console](https://console.firebase.google.com/).
2. **Authentication** → Sign-in method → enable **Google**.
3. **Firestore Database** → create a database (production mode).
4. Publish the security rules in `firestore.rules` (Firestore → Rules tab, or `firebase deploy --only firestore:rules` with the Firebase CLI).
5. Project settings → General → Your apps → add a **Web app** → copy the config object.
6. Paste it into `js/firebaseConfig.js`, replacing the placeholder values.

This config is not a secret — Firebase web API keys are meant to be public.
The actual protection is `firestore.rules`, which restricts every read/write
to `request.auth.uid == uid` under `users/{uid}/**`. Never commit a service
account JSON or any server-side credential to this repo.

### 2. Run locally

No build step — just serve the directory over HTTP (opening `index.html`
directly via `file://` will break ES module imports):

```bash
python3 -m http.server 8765
# then open http://localhost:8765/index.html
```

### 3. Run the test suite

```bash
node tests/run-all.mjs
```

Covers: user isolation (static rules check), empty-user state, recurring
generation across months, finite-occurrence exact counts, final-payment
completion, unknown-amount and unknown-collection-date persistence,
historical integrity after editing a master obligation, monthly-instance
deletion not touching the master, duplicate-generation idempotency, missing-
obligation integrity detection, end-date boundaries, occurrence-count
decrementing, lifecycle extension, and early explicit end.

Real enforcement testing of `firestore.rules` (two different uids actually
attempting cross-user reads) needs the Firebase Local Emulator Suite +
`@firebase/rules-unit-testing`, which isn't wired up here — see
`tests/securityRules.test.mjs` for what's covered today (a static check that
the rules file hasn't regressed) versus what a follow-up emulator suite
would add.

## Deployment (GitHub Pages)

1. Push this repo to GitHub.
2. Repo Settings → Pages → Source: deploy from the `main` branch, root (`/`).
3. In the Firebase console, add your GitHub Pages domain (`<user>.github.io`) to Authentication → Settings → Authorized domains, or Google sign-in will be rejected.

No GitHub Actions workflow is needed — there's no build step to run. This
mirrors RepSprout's own deploy model.

## AI features (optional)

Entirely optional — the app is fully functional with no AI configured.
Users enter their own OpenAI API key in Settings → AI Integration. There is
no shared developer key anywhere in this codebase. AI can:

- Fill in the Add Obligation form from a plain-English description (still requires manual review + submit — never auto-creates).
- Generate a short monthly review from this month's/last month's numbers.
- Answer plain questions about the signed-in user's own obligations.

All three send only the signed-in user's own already-scoped data, and none
of them can create, edit, delete, or mark anything paid on their own.

## Data model

```
users/{uid}                          profile fields
users/{uid}/settings/preferences     theme, payment day, currency, notifications, AI key
users/{uid}/obligations/{id}         master recurring obligations (source of truth)
users/{uid}/monthlyInstances/{id}    id = `${obligationId}_${YYYY-MM}` — one snapshot per occurrence
users/{uid}/backups/{timestamp}      point-in-time exports, written by Settings → Backup
```

Monthly instances snapshot their obligation's fields at generation time, so
editing a master obligation later never rewrites history. Deterministic
instance IDs make monthly generation idempotent — running it twice for the
same month never creates duplicates.
