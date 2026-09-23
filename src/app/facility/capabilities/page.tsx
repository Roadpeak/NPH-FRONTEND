'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  facility,
  hasSession,
  restoreSession,
  ApiError,
  type CapabilityRegister,
  type CapabilityRow,
} from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { FacilityNav } from '@/components/FacilityNav';
import { Icon } from '@/components/icons';

/**
 * The capability register.
 *
 * Every routing decision NHP makes rests on this screen being true. A
 * capability ticked here and not honoured in the building sends a patient
 * past a hospital that could have treated them to one that cannot — so the
 * screen is built to make a claim easy to withdraw and hard to forget.
 *
 * Two deliberate choices:
 *
 *   - The whole vocabulary is listed, held or not, because it is a
 *     checklist. Showing only what is already claimed gives nobody a way
 *     to add what is missing.
 *   - Anything above the facility's KEPH level appears greyed with the
 *     reason, rather than being hidden. Hidden would read as a missing
 *     feature; greyed reads as a rule, which is what it is.
 */

const DOMAINS: Array<{ key: CapabilityRow['domain']; label: string; blurb: string }> = [
  { key: 'SERVICE', label: 'Services', blurb: 'Treatment this facility provides.' },
  { key: 'DIAGNOSTIC', label: 'Diagnostics', blurb: 'Tests that can be run here.' },
  { key: 'SPECIALTY', label: 'Specialties', blurb: 'Disciplines with a clinician on staff.' },
  { key: 'EQUIPMENT', label: 'Equipment', blurb: 'Machines on site and working.' },
];

const AVAILABILITY: Array<{ value: NonNullable<CapabilityRow['availability']>; label: string }> = [
  { value: 'ROUTINE', label: 'Always' },
  { value: 'BUSINESS_HOURS', label: 'Working hours' },
  { value: 'ON_CALL', label: 'On call' },
  { value: 'REFERRAL_ONLY', label: 'By referral' },
];

function freshnessTone(f: CapabilityRow['freshness']) {
  if (f === 'EXPIRED') return 'border-critical/30 bg-critical-soft text-critical';
  if (f === 'STALE') return 'border-caution/40 bg-caution-soft text-caution';
  return 'border-gov/25 bg-gov-soft text-gov';
}

function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function CapabilitiesPage() {
  const router = useRouter();
  const [register, setRegister] = useState<CapabilityRegister | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [heldOnly, setHeldOnly] = useState(false);

  const load = async () => setRegister(await facility.capabilities());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.facility.signInPath);
          return;
        }
        if (!cancelled) await load();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && ['NO_SESSION', 'MFA_REQUIRED'].includes(err.code)) {
          router.replace(`${PORTALS.facility.signInPath}?reason=mfa`);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load the register');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function toggle(row: CapabilityRow) {
    setBusy(row.code);
    setError(null);
    setNotice(null);
    try {
      if (row.held) {
        await facility.withdrawCapability(row.code);
        setNotice(`${row.labelEn} withdrawn. Patients will no longer be routed here for it.`);
      } else {
        await facility.claimCapability(row.code, row.availability ?? 'ROUTINE');
        setNotice(`${row.labelEn} added.`);
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change that claim');
    } finally {
      setBusy(null);
    }
  }

  async function setAvailability(row: CapabilityRow, availability: CapabilityRow['availability']) {
    setBusy(row.code);
    setError(null);
    try {
      await facility.claimCapability(row.code, availability);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change that claim');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Confirm the register in one action.
   *
   * A facility asked to re-tick forty boxes every quarter will not do it,
   * and a register nobody renews is worse than none — it is confidently
   * wrong. This sends exactly what is currently held, which is also how a
   * lapsed capability gets suspended.
   */
  async function reconfirmAll() {
    if (!register) return;
    setBusy('__all__');
    setError(null);
    setNotice(null);
    try {
      const held = register.capabilities.filter((c) => c.held).map((c) => c.code);
      const r = await facility.reconfirmCapabilities(held);
      setNotice(
        `${r.confirmed} ${r.confirmed === 1 ? 'capability' : 'capabilities'} confirmed as still true.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not confirm the register');
    } finally {
      setBusy(null);
    }
  }

  const visible = useMemo(() => {
    if (!register) return [];
    const q = filter.trim().toLowerCase();
    return register.capabilities.filter((c) => {
      if (heldOnly && !c.held) return false;
      if (!q) return true;
      return (
        c.labelEn.toLowerCase().includes(q) ||
        c.labelSw.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
      );
    });
  }, [register, filter, heldOnly]);

  const oldestDays = daysSince(register?.summary.oldestConfirmedAt ?? null);

  return (
    <div className="min-h-screen bg-surface-sunken">
      <FacilityNav />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="mb-1 font-serif text-2xl font-medium tracking-tight">Capabilities</h1>
        <p className="mb-6 max-w-2xl text-sm text-ink-soft">
          What this facility can treat. Patients are routed here on the strength
          of this list, so it is worth keeping exact — and worth removing
          anything that is no longer true.
        </p>

        {error && (
          <p className="mb-4 rounded-lg border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-4 rounded-lg border border-gov/30 bg-gov-soft px-4 py-3 text-sm text-ink">
            {notice}
          </p>
        )}

        {register && (
          <>
            <section className="mb-6 grid gap-3 sm:grid-cols-4">
              {[
                { label: 'Claimed', value: register.summary.claimed },
                { label: 'Verified', value: register.summary.verified },
                { label: 'Needs confirming', value: register.summary.stale },
                { label: 'Expired', value: register.summary.expired },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-rule bg-surface px-4 py-3">
                  <p className="text-2xl font-semibold tabular-nums text-ink">{s.value}</p>
                  <p className="text-xs text-ink-soft">{s.label}</p>
                </div>
              ))}
            </section>

            {/*
              * The decay is deliberately visible. A claim older than the
              * staleness threshold still routes patients until it expires,
              * so the window between the two is exactly when somebody
              * should act — and silence there is how a register rots.
              */}
            {(register.summary.stale > 0 || register.summary.expired > 0) && (
              <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-caution/40 bg-caution-soft px-4 py-3">
                <Icon name="facility" size={18} className="shrink-0 text-caution" />
                <p className="flex-1 text-sm text-ink">
                  {register.summary.expired > 0 ? (
                    <>
                      <span className="font-semibold">
                        {register.summary.expired} claim
                        {register.summary.expired === 1 ? ' has' : 's have'} expired.
                      </span>{' '}
                      Patients are no longer routed here for them.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">
                        {register.summary.stale} claim
                        {register.summary.stale === 1 ? '' : 's'} not confirmed in{' '}
                        {register.staleAfterDays} days.
                      </span>{' '}
                      They stop routing patients after {register.expiredAfterDays}.
                    </>
                  )}
                </p>
              </div>
            )}

            <div className="mb-5 flex flex-wrap items-center gap-3">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search capabilities…"
                className="min-w-[14rem] flex-1 rounded-lg border border-rule bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-gov focus:outline-none"
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={heldOnly}
                  onChange={(e) => setHeldOnly(e.target.checked)}
                  className="h-4 w-4 accent-gov"
                />
                Only what we offer
              </label>
              <button
                type="button"
                onClick={reconfirmAll}
                disabled={busy !== null || register.summary.claimed === 0}
                className="rounded-lg bg-gov px-4 py-2 text-sm font-medium text-ongov transition hover:bg-gov-bright disabled:opacity-50"
              >
                {busy === '__all__' ? 'Confirming…' : 'Confirm all still true'}
              </button>
            </div>

            {oldestDays !== null && register.summary.claimed > 0 && (
              <p className="mb-6 text-xs text-ink-faint">
                Oldest confirmation: {oldestDays} day{oldestDays === 1 ? '' : 's'} ago.
                Confirming re-dates everything ticked below and withdraws anything
                left unticked.
              </p>
            )}

            {DOMAINS.map((d) => {
              const rows = visible.filter((c) => c.domain === d.key);
              if (!rows.length) return null;
              return (
                <section key={d.key} className="mb-8">
                  <h2 className="font-serif text-lg font-medium text-ink">{d.label}</h2>
                  <p className="mb-3 text-xs text-ink-soft">{d.blurb}</p>

                  <ul className="divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-surface">
                    {rows.map((c) => (
                      <li
                        key={c.code}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                      >
                        <label
                          className={`flex flex-1 items-start gap-3 ${
                            c.eligible ? 'cursor-pointer' : 'cursor-not-allowed'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={c.held}
                            disabled={!c.eligible || busy !== null}
                            onChange={() => toggle(c)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-gov disabled:opacity-40"
                          />
                          <span className="min-w-0">
                            <span
                              className={`block text-sm font-medium ${
                                c.eligible ? 'text-ink' : 'text-ink-faint'
                              }`}
                            >
                              {c.labelEn}
                            </span>
                            <span className="block text-xs text-ink-faint">{c.labelSw}</span>
                            {!c.eligible && (
                              <span className="mt-1 block text-xs text-ink-faint">
                                Needs a KEPH level {c.minKephLevel} facility. This one is
                                level {register.kephLevel}.
                              </span>
                            )}
                          </span>
                        </label>

                        {c.held && (
                          <>
                            <select
                              value={c.availability ?? 'ROUTINE'}
                              disabled={busy !== null}
                              onChange={(e) =>
                                setAvailability(
                                  c,
                                  e.target.value as CapabilityRow['availability'],
                                )
                              }
                              className="rounded-md border border-rule bg-surface px-2 py-1 text-xs text-ink focus:border-gov focus:outline-none"
                            >
                              {AVAILABILITY.map((a) => (
                                <option key={a.value} value={a.value}>
                                  {a.label}
                                </option>
                              ))}
                            </select>

                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${freshnessTone(
                                c.freshness,
                              )}`}
                            >
                              {c.status === 'VERIFIED' ? 'Verified' : 'Declared'}
                              {c.freshness === 'STALE' && ' · confirm'}
                              {c.freshness === 'EXPIRED' && ' · expired'}
                            </span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            {visible.length === 0 && (
              <p className="rounded-lg border border-rule bg-surface px-4 py-8 text-center text-sm text-ink-soft">
                Nothing matches “{filter}”.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
