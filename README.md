# NPH-FRONTEND

Frontend for the Kenya National Health Portal.

**Separate from the backend by design.** This repo talks to
[NHP-BACKEND](https://github.com/Roadpeak/NHP-BACKEND) over HTTP against its
`/api/v1` surface. No shared modules, no cross-repo imports — the API
contract is the only coupling.

## Quick start

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev                           # http://localhost:3100
```

Needs the backend running:

```bash
cd ../nhp && pnpm db:up && pnpm seed && pnpm seed:demo && pnpm serve
```

`seed:demo` prints demo credentials and a TOTP secret. Sign in at
`/login`.

Ports 3100 (frontend) and 4400 (API) are deliberate — 3000, 3010 and 4000
are taken by other projects on this machine.

## Stack

| | |
|---|---|
| Framework | Next.js 15 · App Router · React 19 |
| Language | TypeScript, strict |
| Styling | Tailwind 3.4 |
| Fonts | Public Sans · Newsreader · JetBrains Mono |

## Design tokens

The palette from the wireframes lives as CSS variables in
`src/app/globals.css` and is surfaced through Tailwind in
`tailwind.config.ts`. Components never reference a hex value.

| Token | Use |
|---|---|
| `gov` | Government navy — the primary |
| `critical` | Kenyan flag red — severe allergy, red flag, denial |
| `caution` | Amber — stale claims, warnings, break-glass |
| `good` | Kenyan flag green — consented, verified, fresh |
| `ink` / `surface` / `rule` | Neutrals, biased toward the navy accent |

Flag colours are **semantic, never decorative**. Three theme states are
supported — light, dark, and the un-stamped "system" default — with dark
redefining tokens only, so no component knows which theme it is in.

## Screens

### Built

**Encounter entry** (`/encounter`) — the screen that decides adoption.

Verified in a browser: typing `mal` returns *Plasmodium falciparum malaria*
first, pre-highlighted, in **0ms** — the specific code ranking above
"Malaria, unspecified" because ties prefer specificity. `pressure` resolves
to hypertension, `kisukari` to diabetes, `URTI` to upper respiratory tract
infection. Two coded diagnoses recorded with no mouse and no navigation;
focus returns to the box after each.

Selecting amoxicillin for a penicillin-allergic patient fires the
contraindication interrupt **at selection**, names the allergy with its
provenance, offers three safe alternatives, and keeps "Prescribe anyway"
available — blocking a clinician outright is how people learn to route
around a system.

The search index is 20 KB of local JSON, so step 1 of the resolution ladder
never touches the network. Steps 2–4 (full local ICD-11, the WHO API, an
uncoded note) sit behind it and none may block typing.

### To build

1. **Clinician patient summary** — the most-viewed screen; home of the
   safety banner.
3. **Citizen timeline** — the same record in plain language, English and
   Swahili.
4. **Ministry map** — county choropleth, drill to subcounty, outbreak view.

Encounter entry runs against the **live backend**. The patient identity,
allergies, current medications and chronic conditions all come from
PostgreSQL through `/api/v1`, and the contraindication check is the real
`checkPrescribing` service — not a client-side approximation, because a
safety decision must not live somewhere a client can skip it.

The search index stays local (20 KB JSON) since step 1 of the resolution
ladder must never wait on the network.

**Auth is real.** Password, then a TOTP second factor for clinical accounts,
then a bearer token. `/encounter` redirects to `/login` without a session.

The access token is held **in memory, not localStorage** — a token in
localStorage is readable by any injected script, and this one reaches
patient data.

Sessions survive a reload via an **httpOnly refresh cookie** the page cannot
read. On load, `restoreSession()` asks the API to rotate it, echoing a
double-submit CSRF token from a separate readable cookie.

A restored session is authenticated but **not** MFA-satisfied — a 30-day
cookie must not silently confer a second factor — so a clinician returning
after a reload is sent to `/login?reason=mfa` with an explanation rather
than a bare error.

### If the banner cannot load

It shows a loud failure rather than an empty allergy list. An empty banner
reads as "no allergies", which is the most dangerous possible failure of
this screen.

## Non-negotiables

- **The safety banner never collapses.** Allergies, current medications and
  chronic conditions stay visible without scrolling, on every screen where a
  clinician can prescribe. It will come under pressure for vertical space —
  refuse.
- **Keyboard end to end.** A clinician on a shared desktop completes an
  encounter without touching the mouse. A lost focus ring is a broken screen.
- **Payload budget.** Built for a mid-range Android on 3G: first load under
  120 kB, every core flow usable at 360px wide, no horizontal scroll.
