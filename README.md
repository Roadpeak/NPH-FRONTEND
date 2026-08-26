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

**Clinician patient summary** (`/patient/[nhpId]`) — the most-viewed screen.

Three columns answering three questions: *what is wrong with them · what has
been happening · what are the numbers doing*. Everything capable of causing
harm is visible without scrolling.

Key results carry a **sparkline over the series**, not just the latest value
— a single HbA1c of 8.4% is a number, six readings trending upward is a
clinical finding. Hand-drawn SVG rather than a chart library, because the
component is smaller than the import would be.

Past procedures distinguish documented from remembered history: a
`patient-recalled · not verified` chip on anything the patient only recalls.
And every encounter names its author — *Dr Amina Wanjiru · KMPDC/12345* —
because raw ids build no trust and let nobody call whoever saw the patient
last.

**Do not reorganise this into tabs.** Someone will propose it to reclaim
vertical space, and the moment allergies live behind a tab the safety
guarantee is gone.

**Citizen timeline** (`/me`) — the same record in plain language.

"A long-term condition where your blood sugar is too high" is the heading;
"Type 2 diabetes mellitus · Code 5A11" sits underneath. English and Swahili
throughout, interface as well as content — *Habari, Achieng' · Kwa sasa ·
Una mzio wa Penicillin · Dkt Amina Wanjiru*.

Login routes by role: a citizen goes to `/me`, a clinician to `/encounter`.
Sending a citizen to a clinical screen produces a permission wall through no
fault of their own, which reads as the system being broken.

Two tabs so far — Record and Who has seen it. Break-glass entries are the
most prominent thing in the access log deliberately: an override the patient
can see and query is a very different thing from one they cannot.

**Ministry map** (`/ministry`) — aggregates, and what they are not.

Four views: disease burden, referral loop closure, workforce and
surveillance. Geography is a ranked county list rather than a choropleth —
NHP does not ship Kenya's boundary TopoJSON, and a decorative approximation
of a national map would be worse than an honest table.

A county expands to its subcounties on demand. That drill is a **separate
suppression decision**, not a decomposition: a cell that survived at county
level can fall below the threshold once split, so the breakdown says
outright that its parts do not sum to the county figure. A suppressed area
is named, dashed and marked with an em dash — never a zero, which is a false
statement, and never blank, which is the same lie told quietly.

Surveillance ranks by **facility spread before raw count**. Several
facilities in one county suggests community transmission; the same count
inside one facility may be one household or one referral chain. Six cases of
cholera across three facilities therefore outranks twenty-two typhoid cases
in one.

There is deliberately no "view patients" affordance — not greyed out,
absent — because the data to populate it does not exist in the tables this
role can reach.

**Facility administration** (`/facility`) — running a facility.

A facility administrator is not a fourth credential type. They are a
practitioner holding `FACILITY_ADMIN` at one facility, so the licence
checks, MFA and audit trail apply to them unchanged. Three screens: the
facility profile, the staff roster, and the reception desk.

Reception is the constrained one. A queue row carries a name, an age and a
photo, and nothing else — no allergy, no diagnosis, no medicine — because a
receptionist has no clinical reason to know any of it and a busy waiting
room is the least private place in the building.

### To build

Every screen in the plan is built. What remains is not screens:

1. **Kenya boundary TopoJSON** — would turn the ranked county list into a
   real choropleth. Blocked on sourcing authoritative boundaries, not on UI.
2. **Swahili review by a native speaker** — interface strings and seed
   labels alike. Nothing here was machine-translated, and nothing should be.

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

The second factor is **SMS or TOTP**. For SMS the screen shows a masked
destination (`+2547***333`) and offers a resend; for TOTP it asks for the
authenticator code. Resend is offered once, because each new code
invalidates the previous one and repeated taps only confuse the clinician.

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
