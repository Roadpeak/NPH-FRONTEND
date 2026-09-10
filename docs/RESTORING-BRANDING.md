# Restoring the government branding

The portals were unbranded on 2026-09-09 in commit `7542f0a`, "Remove the
government branding, for now". This file exists so that restoring it does not
depend on anyone remembering which commit did it.

Nothing was deleted. Every asset is still on disk, `GovBanner` is unmounted
rather than removed, and the whole change is one revert away.

## The one-command restore

```sh
git revert --no-commit 7542f0a
# review, then:
git commit -m "Restore the government branding"
```

The revert conflicts only if a file it touched has since been rewritten. If
that happens, the manual list below is the authority on what has to come back.

## What was removed, and where it goes back

| What | File | Restore |
|---|---|---|
| "An official website of the Kenyan government" banner | `src/app/layout.tsx` | Re-import `GovBanner` and mount it above `{children}` |
| Coat of Arms on the sign-in card | `src/components/PortalShell.tsx` | Re-add the `<Image src="/img/coat-of-arms.png">` block before the wordmark |
| Coat of Arms in the portal header | `src/components/PortalWelcome.tsx` | Restore the exported `CoatOfArms` component and its use in `PortalHeader` |
| Flag stripe beside the wordmark | Both shells | Replace the plain `bg-gov-bright` rule with the three-band `<span>` |
| "Republic of Kenya" eyebrow | `src/app/page.tsx`, `PortalWelcome.tsx` | Re-add the eyebrow paragraph above the heading |
| `FlagBar` on the landing page | `src/app/page.tsx` | Re-import from `PortalShell` and place above the heading |
| `147` helpline and `help@nhp.health.go.ke` | Both shells | Replace the "Get help" link with the two original anchors |
| Kenya's red/green favicon | `src/app/icon.svg`, `apple-icon.svg` | `git show 38e9701:src/app/icon.svg > src/app/icon.svg` (same for `apple-icon.svg`) |
| "Ministry of Health" as the fourth portal's name | `src/lib/portals.ts`, `ministry/page.tsx`, `SignInForm.tsx` | Rename `Administration` back; `nameSw` was `Wizara ya Afya` |
| Refusal wording | `src/lib/portals.ts` | "Ministry accounts are issued by the Ministry of Health." |

## Assets that never left

- `public/img/coat-of-arms.png` — still present, still referenced by nothing
- `src/components/GovBanner.tsx` — intact, including the hand-drawn flag SVG
- `FlagBar` in `src/components/PortalShell.tsx` — still exported

## One test to update

`test/portals.test.ts` asserts the Ministry refusal message. It currently
matches `/issued centrally/i` and would go back to `/issued by the Ministry/i`.

## What was deliberately NOT removed

Four references to the Ministry of Health are functional rather than
decorative, and they stayed:

- `PUBLIC_MOH` — a real facility ownership type in the schema
- `src/app/facility/profile/page.tsx` and `facility/register/page.tsx` — the
  label for that ownership type
- `src/app/worker/shift/page.tsx` and `worker/register/page.tsx` — the
  explanation that the Ministry posts staff to public facilities while a
  private employer engages their own

Removing those would need a schema change, not a UI one, and would break what
the screens mean.

## Why the branding matters when it returns

The banner is not decoration. A phishing site can copy a layout exactly; a
constant, consistent mark of provenance across every page is what gives
somebody something to look for. That is the argument for putting it back
promptly once the portal is adopted — not just for appearance.
