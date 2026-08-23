# NPH-FRONTEND

Frontend for the Kenya National Health Portal.

**Separate from the backend by design.** This repo talks to
[NHP-BACKEND](https://github.com/Roadpeak/NHP-BACKEND) over HTTP against its
`/api/v1` surface. No shared modules, no cross-repo imports — the API
contract is the only coupling.

## Quick start

```bash
pnpm install
cp .env.local.example .env.local   # point NEXT_PUBLIC_API_URL at the backend
pnpm dev                           # http://localhost:3100
```

Port 3100 is deliberate — 3000 and 3010 are already taken by other projects
on this machine.

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

## Screens to build

From the wireframes, in adoption-risk order:

1. **Encounter entry** — the screen that decides adoption. The 16-keystroke
   coded encounter, the fixed allergy banner, the contraindication interrupt.
2. **Clinician patient summary** — the most-viewed screen; home of the
   safety banner.
3. **Citizen timeline** — the same record in plain language, English and
   Swahili.
4. **Ministry map** — county choropleth, drill to subcounty, outbreak view.

## Non-negotiables

- **The safety banner never collapses.** Allergies, current medications and
  chronic conditions stay visible without scrolling, on every screen where a
  clinician can prescribe. It will come under pressure for vertical space —
  refuse.
- **Keyboard end to end.** A clinician on a shared desktop completes an
  encounter without touching the mouse. A lost focus ring is a broken screen.
- **Payload budget.** Built for a mid-range Android on 3G: first load under
  120 kB, every core flow usable at 360px wide, no horizontal scroll.
