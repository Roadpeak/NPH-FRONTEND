'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  admin,
  auth,
  ministry,
  hasSession,
  restoreSession,
  ApiError,
  type AdminOverview,
  type PendingFacility,
  type ExpiringLicence,
  type PendingBreakGlass,
  type CountyRef,
  type PractitionerHit,
  type FacilityHit,
  type CitizenStats,
  type CitizenLookupResult,
  type WorkforceStats,
  type PractitionerRow,
  type FacilityStats,
} from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { sectionsFor, type SectionId } from '@/lib/adminSections';
import { Icon, type IconName } from '@/components/icons';
import { inputClass } from '@/components/PortalShell';

/**
 * The Ministry administration dashboard.
 *
 * The Ministry portal is the platform administrator, and its four roles
 * operate different sectors: a REGISTRAR approves facilities and posts
 * staff, an AUDITOR reviews emergency access, an ANALYST reads aggregates,
 * SURVEILLANCE watches notifiable disease. SUPER_ADMIN holds all of it.
 *
 * So the navigation is built from the signed-in role rather than being a
 * fixed list with disabled entries. A section someone cannot open should not
 * be visible at all — a greyed-out "Audit" tab tells an analyst that an
 * audit queue exists and that they are not trusted with it, which is a
 * disclosure and an invitation in one.
 *
 * The server refuses regardless. Nothing here is the authorisation; it only
 * decides what is worth rendering.
 */
export default function AdminPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [counties, setCounties] = useState<CountyRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.ministry.signInPath);
          return;
        }
        const [me, ov] = await Promise.all([auth.me(), admin.overview()]);
        if (cancelled) return;

        if (!me.ministryUserId) {
          // A clinician or citizen who reached this URL belongs elsewhere.
          router.replace(PORTALS.ministry.signInPath);
          return;
        }
        setRole(me.ministryRole);
        setOverview(ov);
        setReady(true);

        // Counties are reference data every Ministry role may read; used to
        // name a facility's county rather than showing a raw id.
        ministry.counties().then(setCounties).catch(() => setCounties([]));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && ['NO_SESSION', 'MFA_REQUIRED'].includes(err.code)) {
          router.replace(`${PORTALS.ministry.signInPath}?reason=mfa`);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const sections = sectionsFor(role);
  const nameOfCounty = (id: string) => counties.find((c) => c.id === id)?.name ?? '—';

  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="border-b border-rule bg-surface-alt">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <h1 className="text-base font-semibold">National Health Portal · Administration</h1>
            <p className="font-mono text-micro text-ink-faint">
              {role ?? '…'}
              {overview?.geoScope ? ` · ${overview.geoScope} scope` : ''}
            </p>
          </div>
          <Link href="/ministry" className="text-sm font-semibold text-gov underline">
            National statistics
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-sm text-critical"
          >
            {error}
          </p>
        )}

        {/* Built from the role. A section this account cannot open is absent,
            not disabled. */}
        <nav className="mb-6 flex flex-wrap gap-1.5">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`rounded px-3 py-1.5 text-sm ${
                section === s.id
                  ? 'bg-gov font-semibold text-surface'
                  : 'border border-rule text-ink-soft hover:bg-surface'
              }`}
            >
              <Icon name={s.icon as IconName} size={14} className="mr-1.5 -mt-0.5" />
              {s.label}
            </button>
          ))}
        </nav>

        {!ready ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : (
          <>
            {section === 'overview' && <Overview data={overview} role={role} />}
            {section === 'citizens' && <Citizens nameOfCounty={nameOfCounty} />}
            {section === 'facilities' && <Facilities nameOfCounty={nameOfCounty} />}
            {section === 'workforce' && <Workforce nameOfCounty={nameOfCounty} />}
            {section === 'postings' && <Postings />}
            {section === 'licences' && <Licences />}
            {section === 'audit' && <Audit />}
            {section === 'analytics' && (
              <Redirected
                to="/ministry"
                label="Disease burden, referral closure and workforce"
              />
            )}
            {section === 'surveillance' && (
              <Redirected to="/ministry" label="Notifiable disease signals" />
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** Analytics and surveillance already have a screen; this points at it. */
function Redirected({ to, label }: { to: string; label: string }) {
  return (
    <p className="text-sm text-ink-soft">
      {label} are on the{' '}
      <Link href={to} className="font-semibold text-gov underline">
        national statistics screen
      </Link>
      .
    </p>
  );
}

function Tile({
  label,
  value,
  hint,
  urgent = false,
}: {
  label: string;
  value: number;
  hint: string;
  urgent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        urgent && value > 0 ? 'border-caution/40 bg-caution-soft' : 'border-rule bg-surface'
      }`}
    >
      <p className="eyebrow mb-1">{label}</p>
      <p
        className={`text-2xl font-semibold tabular ${
          urgent && value > 0 ? 'text-caution' : ''
        }`}
      >
        {value.toLocaleString()}
      </p>
      <p className="text-micro text-ink-faint">{hint}</p>
    </div>
  );
}

function Overview({ data, role }: { data: AdminOverview | null; role: string | null }) {
  if (!data) return <p className="text-sm text-ink-faint">Loading…</p>;

  const waiting = [data.pendingFacilities, data.pendingBreakGlassReviews]
    .filter((n): n is number => n !== null)
    .reduce((a, b) => a + b, 0);

  return (
    <>
      <h2 className="eyebrow mb-2">Waiting for you</h2>
      {waiting === 0 ? (
        <p className="mb-6 rounded-md border border-good/30 bg-good-soft px-4 py-3 text-sm text-good">
          Nothing is waiting for a decision.
        </p>
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Rendered only when the role may act. `null` from the server means
              "not your role", and a zero here would advertise a section that
              then refuses to open. */}
          {data.pendingFacilities !== null && (
            <Tile
              label="Facilities awaiting approval"
              value={data.pendingFacilities}
              hint="No clinician can check in until approved"
              urgent
            />
          )}
          {data.pendingBreakGlassReviews !== null && (
            <Tile
              label="Emergency access to review"
              value={data.pendingBreakGlassReviews}
              hint="Each one opened a record without consent"
              urgent
            />
          )}
          {data.licencesExpiringSoon !== null && (
            <Tile
              label="Licences lapsing in 30 days"
              value={data.licencesExpiringSoon}
              hint="A lapsed licence stops a clinician writing"
              urgent
            />
          )}
        </div>
      )}

      {(data.activeFacilities !== null || data.practitioners !== null) && (
        <>
          <h2 className="eyebrow mb-2">The register</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.activeFacilities !== null && (
              <Tile
                label="Active facilities"
                value={data.activeFacilities}
                hint="Approved and able to host care"
              />
            )}
            {data.practitioners !== null && (
              <Tile
                label="Registered practitioners"
                value={data.practitioners}
                hint="Holding a professional registration"
              />
            )}
          </div>
        </>
      )}

      <p className="mt-6 max-w-prose text-micro text-ink-faint">
        {role === 'SUPER_ADMIN'
          ? 'You hold every Ministry role, so every section is shown.'
          : `Sections you cannot open are not shown. Your role is ${role ?? 'unknown'}.`}
      </p>
    </>
  );
}

function Facilities({ nameOfCounty }: { nameOfCounty: (id: string) => string }) {
  const [pending, setPending] = useState<PendingFacility[] | null>(null);
  const [stats, setStats] = useState<FacilityStats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    admin
      .pendingFacilities()
      .then(setPending)
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'Could not load');
        setPending([]);
      });

  useEffect(() => {
    load();
    admin.facilityStats().then(setStats).catch(() => setStats(null));
  }, []);

  async function approve(id: string) {
    setBusy(id);
    setError(null);
    try {
      await admin.approveFacility(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not approve');
    } finally {
      setBusy(null);
    }
  }

  if (!pending) return <p className="text-sm text-ink-faint">Loading…</p>;

  return (
    <>
      <h2 className="eyebrow mb-2">Awaiting approval</h2>
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {pending.length === 0 ? (
        <p className="text-sm text-ink-faint">No facilities are waiting for approval.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold">{f.name}</p>
                <p className="font-mono text-micro text-ink-faint">
                  {f.mflCode} · KEPH {f.kephLevel} · {nameOfCounty(f.countyId)}
                </p>
                <p className="text-micro text-ink-soft">
                  {/* Ownership decides who may staff it for the rest of its
                      life, so it belongs in the approval decision. */}
                  {f.ownership.replace(/_/g, ' ').toLowerCase()}
                </p>
              </div>
              <button
                onClick={() => approve(f.id)}
                disabled={busy === f.id}
                className="rounded-md bg-gov px-4 py-2 text-sm font-semibold text-surface disabled:opacity-60"
              >
                {busy === f.id ? 'Approving…' : 'Approve'}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 max-w-prose text-micro text-ink-faint">
        An unapproved facility can grant no affiliation and host no check-in,
        so no patient record can be opened there.
      </p>

      {stats && (
        <>
          <hr className="my-6 border-rule" />
          <h2 className="eyebrow mb-2">The national register</h2>

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Tile
              label="Registered facilities"
              value={stats.total}
              hint="Every status"
            />
            <Tile
              label="Active"
              value={stats.byStatus.find((x) => x.status === 'ACTIVE')?.count ?? 0}
              hint="Approved and able to host care"
            />
            <Tile
              label="No declared services"
              value={stats.activeWithoutCapabilities}
              // Registered but invisible to care routing: a patient will
              // never be sent here, and nobody at the facility knows.
              hint="Active, but cannot be recommended to a patient"
              urgent
            />
          </div>

          <div className="grid gap-x-8 lg:grid-cols-2">
            <Distribution
              title="By KEPH level"
              rows={stats.byKephLevel.map((k) => ({
                label: `Level ${k.kephLevel}`,
                count: k.count,
              }))}
              note="Level 2 is a dispensary; level 6 a national referral hospital."
            />
            <Distribution
              title="By ownership"
              rows={stats.byOwnership.map((o) => ({ label: pretty(o.ownership), count: o.count }))}
              note="Ownership decides who staffs each one: the Ministry posts to public facilities, private ones engage their own."
            />
          </div>

          <Distribution
            title="By county"
            rows={stats.byCounty.slice(0, 10).map((c) => ({
              label: nameOfCounty(c.countyId),
              count: c.count,
            }))}
          />
        </>
      )}
    </>
  );
}

/** A labelled distribution bar, for the register breakdowns. */
function Distribution({
  title,
  rows,
  note,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
  note?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return null;

  return (
    <div>
      <h3 className="eyebrow mb-2">{title}</h3>
      <ul className="mb-4 space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-sm">{r.label}</span>
            <span className="h-3.5 flex-1 overflow-hidden rounded-sm bg-rule-soft">
              <span
                className="block h-full bg-gov/70"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right font-mono text-sm tabular">
              {r.count.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      {note && <p className="mb-4 max-w-prose text-micro text-ink-faint">{note}</p>}
    </div>
  );
}

const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase();

/**
 * The population register.
 *
 * Statistics, and a lookup for ONE citizen. There is deliberately no list:
 * a browsable register of every citizen in Kenya would be the single
 * highest-value target in the country, and the defence is that the
 * endpoint does not exist rather than that a screen declines to call it.
 */
function Citizens({ nameOfCounty }: { nameOfCounty: (id: string) => string }) {
  const [stats, setStats] = useState<CitizenStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [identifier, setIdentifier] = useState('');
  const [result, setResult] = useState<CitizenLookupResult['match'] | 'NONE' | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    admin
      .citizenStats()
      .then(setStats)
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'Could not load');
        setStats(null);
      });
  }, []);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLookupError(null);
    setResult(null);
    try {
      const res = await admin.lookupCitizen(identifier);
      setResult(res.match ?? 'NONE');
    } catch (e) {
      setLookupError(e instanceof ApiError ? e.message : 'Could not look up');
    } finally {
      setBusy(false);
    }
  }

  const verified = stats?.byVerification.find((v) => v.state === 'VERIFIED')?.count ?? 0;

  return (
    <>
      <h2 className="eyebrow mb-2">Population register</h2>

      {error && (
        <p role="alert" className="mb-4 rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {stats && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Tile
              label="Registered citizens"
              value={stats.total}
              hint="Holding a health record"
            />
            <Tile
              label="Registered this month"
              value={stats.registeredThisMonth}
              hint="New records opened"
            />
            <Tile
              label="Identity verified"
              value={verified}
              hint={
                stats.total > 0
                  ? `${Math.round((verified / stats.total) * 100)}% — the gap to close`
                  : 'No records yet'
              }
            />
          </div>

          <div className="grid gap-x-8 lg:grid-cols-2">
            <Distribution
              title="By county"
              rows={stats.byCounty.slice(0, 10).map((c) => ({
                label: nameOfCounty(c.countyId),
                count: c.count,
              }))}
            />
            <div>
              <Distribution
                title="By maturity"
                rows={stats.byMaturity.map((m) => ({ label: pretty(m.maturity), count: m.count }))}
                note="A dependant is a child tied to a guardian. At 18 the record is promoted, keeping its history."
              />
              <Distribution
                title="By verification"
                rows={stats.byVerification.map((v) => ({ label: pretty(v.state), count: v.count }))}
                note="An unverified person still has a record, but a facility cannot trust the ID they present."
              />
            </div>
          </div>
        </>
      )}

      <hr className="my-6 border-rule" />

      <h2 className="eyebrow mb-2">Look up one citizen</h2>
      <p className="mb-4 max-w-prose text-sm text-ink-soft">
        For a support case. An exact National ID or NHP number returns one
        person — there is no way to browse the register.
      </p>

      <form onSubmit={lookup} className="max-w-md">
        <label htmlFor="cid" className="eyebrow mb-1.5 block">
          National ID or NHP number
        </label>
        <div className="flex gap-2">
          <input
            id="cid"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="12345678 or NHP-XXXX-XXXX"
            className={`${inputClass} font-mono`}
          />
          <button
            type="submit"
            disabled={busy || identifier.trim().length < 4}
            className="shrink-0 rounded-md bg-gov px-4 py-2.5 font-semibold text-surface disabled:opacity-60"
          >
            {busy ? 'Looking…' : 'Look up'}
          </button>
        </div>
        {/* Said before the search, not after. An administrative power the
            subject cannot see is the one that gets abused. */}
        <p className="mt-2 text-micro text-caution">
          This lookup is recorded and shown to that citizen on their own
          access screen.
        </p>
      </form>

      {lookupError && (
        <p role="alert" className="mt-4 max-w-md rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
          {lookupError}
        </p>
      )}

      {result === 'NONE' && (
        <p className="mt-4 text-sm text-ink-faint">
          No citizen holds that identifier.
        </p>
      )}

      {result && result !== 'NONE' && (
        <div className="mt-4 max-w-md rounded-lg border border-rule bg-surface px-4 py-3">
          <p className="font-semibold">
            {result.givenName} {result.familyName}
          </p>
          <p className="font-mono text-micro text-ink-faint">{result.displayNumber}</p>
          <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">
            <dt className="text-ink-faint">Date of birth</dt>
            <dd>{new Date(result.dateOfBirth).toLocaleDateString('en-GB')}</dd>
            <dt className="text-ink-faint">Maturity</dt>
            <dd>{pretty(result.maturity)}</dd>
            <dt className="text-ink-faint">Verification</dt>
            <dd>{pretty(result.verificationState)}</dd>
          </dl>
          {/* The boundary, stated on the screen that could most easily be
              mistaken for a patient record. */}
          <p className="mt-3 border-t border-rule-soft pt-2 text-micro text-ink-faint">
            Registration details only. No Ministry role can read clinical
            data.
          </p>
        </div>
      )}
    </>
  );
}

/** The national workforce: registered, licensed, and able to work. */
function Workforce({ nameOfCounty }: { nameOfCounty: (id: string) => string }) {
  const [stats, setStats] = useState<WorkforceStats | null>(null);
  const [list, setList] = useState<PractitionerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([admin.workforceStats(), admin.practitioners()])
      .then(([s, l]) => {
        setStats(s);
        setList(l.rows);
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'Could not load');
        setList([]);
      });
  }, []);

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
        {error}
      </p>
    );
  }
  if (!stats || !list) return <p className="text-sm text-ink-faint">Loading…</p>;

  return (
    <>
      <h2 className="eyebrow mb-2">The workforce</h2>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Tile label="Registered" value={stats.total} hint="Holding a professional registration" />
        <Tile
          label="With an active licence"
          value={stats.withActiveLicence}
          hint="Licence current and unexpired"
        />
        <Tile
          label="Not posted anywhere"
          value={stats.unaffiliated}
          // The distinction that matters: registered is not the same as
          // able to treat anyone.
          hint="Registered but cannot treat a patient"
          urgent
        />
      </div>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <Distribution
          title="By cadre"
          rows={stats.byCadre.map((c) => ({ label: pretty(c.cadre), count: c.count }))}
        />
        <Distribution
          title="By county"
          rows={stats.byCounty.slice(0, 10).map((c) => ({
            label: nameOfCounty(c.countyId),
            count: c.count,
          }))}
          note="Derived from where each clinician registered, not where they are posted."
        />
      </div>

      <h3 className="eyebrow mb-2 mt-4">Recently registered</h3>
      {list.length === 0 ? (
        <p className="text-sm text-ink-faint">No practitioners registered.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {['Cadre', 'Licence', 'Posted at', 'Status'].map((h) => (
                  <th
                    key={h}
                    className="pb-2 text-left font-mono text-label uppercase tracking-wider text-ink-faint"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.practitionerId} className="border-t border-rule-soft">
                  <td className="py-2">{pretty(p.cadre)}</td>
                  <td className="py-2 font-mono text-micro">
                    {p.licence?.licenceNumber ?? '—'}
                  </td>
                  <td className="py-2">
                    {p.facilities.length > 0 ? (
                      p.facilities.join(', ')
                    ) : (
                      /* Not a blank: an unposted clinician is the thing a
                         registrar is looking for on this screen. */
                      <span className="text-caution">Not posted</span>
                    )}
                  </td>
                  <td className="py-2 font-mono text-micro">{pretty(p.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Ownership values the Ministry may post into. Mirrors the server's rule. */
const PUBLIC_OWNERSHIP = new Set(['PUBLIC_MOH', 'PUBLIC_OTHER']);

function Postings() {
  const [pracQuery, setPracQuery] = useState('');
  const [pracHits, setPracHits] = useState<PractitionerHit[]>([]);
  const [practitioner, setPractitioner] = useState<PractitionerHit | null>(null);

  const [facQuery, setFacQuery] = useState('');
  const [facHits, setFacHits] = useState<FacilityHit[]>([]);
  const [facility, setFacility] = useState<FacilityHit | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Debounced so a registrar typing a licence number does not fire a
  // request per keystroke.
  useEffect(() => {
    if (pracQuery.trim().length < 3) {
      setPracHits([]);
      return;
    }
    const t = setTimeout(() => {
      admin.searchPractitioners(pracQuery).then(setPracHits).catch(() => setPracHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [pracQuery]);

  useEffect(() => {
    if (facQuery.trim().length < 2) {
      setFacHits([]);
      return;
    }
    const t = setTimeout(() => {
      admin.searchFacilities(facQuery).then(setFacHits).catch(() => setFacHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [facQuery]);

  const isPublic = facility ? PUBLIC_OWNERSHIP.has(facility.ownership) : false;
  const alreadyThere =
    practitioner && facility
      ? practitioner.affiliations.some((a) => a.facilityId === facility.id)
      : false;

  // Every reason the server would refuse, checked here so the button can
  // explain instead of failing. The server still refuses regardless.
  const blocker = !practitioner
    ? 'Find the clinician by licence number'
    : !facility
      ? 'Find the facility'
      : !isPublic
        ? `${facility.name} is not a public facility — it engages its own staff`
        : alreadyThere
          ? `${practitioner.name} is already posted to ${facility.name}`
          : null;

  async function post() {
    if (!practitioner || !facility) return;
    setBusy(true);
    setError(null);
    try {
      await admin.postStaff({
        practitionerId: practitioner.practitionerId,
        facilityId: facility.id,
      });
      setDone(`${practitioner.name} posted to ${facility.name}`);
      setPractitioner(null);
      setFacility(null);
      setPracQuery('');
      setFacQuery('');
      setPracHits([]);
      setFacHits([]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="eyebrow mb-2">Staff postings</h2>
      <p className="mb-5 max-w-prose text-sm text-ink-soft">
        The Ministry posts staff to <span className="font-semibold text-ink">public</span>{' '}
        facilities. Private, faith-based and NGO facilities engage their own
        clinicians from their facility portal — the server refuses a posting
        in the wrong direction, so a private employer cannot place someone in
        a county hospital and the Ministry cannot staff a private clinic.
      </p>

      {done && (
        <p className="mb-4 rounded-md border border-good/30 bg-good-soft px-4 py-3 text-sm text-good">
          {done}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------------------------------------------- the clinician --- */}
        <div>
          <label htmlFor="prac" className="eyebrow mb-1.5 block">
            Clinician
          </label>
          <input
            id="prac"
            value={pracQuery}
            onChange={(e) => {
              setPracQuery(e.target.value);
              setPractitioner(null);
            }}
            placeholder="Licence number, e.g. NCK/2026/0038"
            className={`${inputClass} font-mono`}
          />
          {/* By licence, not by name: names are encrypted, and two
              clinicians share a name far more often than a licence. */}
          <p className="mt-1 text-micro text-ink-faint">
            Searched by licence number. At least three characters.
          </p>

          {practitioner ? (
            <div className="mt-3 rounded-lg border border-gov/40 bg-surface px-4 py-3">
              <p className="font-semibold">{practitioner.name}</p>
              <p className="font-mono text-micro text-ink-faint">
                {practitioner.cadre.replace(/_/g, ' ').toLowerCase()} ·{' '}
                {practitioner.licences[0]?.licenceNumber}
              </p>
              {practitioner.affiliations.length > 0 && (
                <p className="mt-1 text-micro text-ink-soft">
                  Already at{' '}
                  {practitioner.affiliations.map((a) => a.facilityName).join(', ')}
                </p>
              )}
              <button
                onClick={() => setPractitioner(null)}
                className="mt-2 text-sm text-gov underline"
              >
                Change
              </button>
            </div>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {pracHits.map((p) => (
                <li key={p.practitionerId}>
                  <button
                    onClick={() => setPractitioner(p)}
                    className="w-full rounded-lg border border-rule bg-surface px-4 py-3 text-left hover:border-gov"
                  >
                    <span className="block font-semibold">{p.name}</span>
                    <span className="block font-mono text-micro text-ink-faint">
                      {p.cadre.replace(/_/g, ' ').toLowerCase()} ·{' '}
                      {p.licences[0]?.licenceNumber ?? 'no licence'}
                    </span>
                    {p.affiliations.length > 0 && (
                      <span className="block text-micro text-ink-soft">
                        Already at {p.affiliations.map((a) => a.facilityName).join(', ')}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ----------------------------------------------- the facility --- */}
        <div>
          <label htmlFor="fac" className="eyebrow mb-1.5 block">
            Facility
          </label>
          <input
            id="fac"
            value={facQuery}
            onChange={(e) => {
              setFacQuery(e.target.value);
              setFacility(null);
            }}
            placeholder="Name or MFL code"
            className={inputClass}
          />
          <p className="mt-1 text-micro text-ink-faint">
            Approved facilities only.
          </p>

          {facility ? (
            <div className="mt-3 rounded-lg border border-gov/40 bg-surface px-4 py-3">
              <p className="font-semibold">{facility.name}</p>
              <p className="font-mono text-micro text-ink-faint">
                {facility.mflCode} · KEPH {facility.kephLevel}
              </p>
              <OwnershipNote ownership={facility.ownership} />
              <button
                onClick={() => setFacility(null)}
                className="mt-2 text-sm text-gov underline"
              >
                Change
              </button>
            </div>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {facHits.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => setFacility(f)}
                    className="w-full rounded-lg border border-rule bg-surface px-4 py-3 text-left hover:border-gov"
                  >
                    <span className="block font-semibold">{f.name}</span>
                    <span className="block font-mono text-micro text-ink-faint">
                      {f.mflCode} · KEPH {f.kephLevel}
                    </span>
                    {/* Shown on every row: choosing blind means picking a
                        private clinic and being refused after the fact. */}
                    <span
                      className={`block text-micro ${
                        PUBLIC_OWNERSHIP.has(f.ownership) ? 'text-good' : 'text-caution'
                      }`}
                    >
                      {f.ownership.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-rule pt-5">
        <button
          onClick={post}
          disabled={busy || blocker !== null}
          className="rounded-md bg-gov px-5 py-2.5 font-semibold text-surface disabled:opacity-60"
        >
          {busy ? 'Posting…' : 'Post to facility'}
        </button>

        {blocker && (
          <p className="mt-2 text-sm text-ink-soft">{blocker}</p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical"
          >
            {error}
          </p>
        )}
      </div>
    </>
  );
}

/** Says what the ownership means for staffing, not just what it is. */
function OwnershipNote({ ownership }: { ownership: string }) {
  const isPublic = PUBLIC_OWNERSHIP.has(ownership);
  return (
    <p className={`mt-1 text-micro ${isPublic ? 'text-good' : 'text-caution'}`}>
      {ownership.replace(/_/g, ' ').toLowerCase()} —{' '}
      {isPublic
        ? 'the Ministry posts staff here'
        : 'this facility engages its own staff, so the Ministry cannot post here'}
    </p>
  );
}

function Licences() {
  const [rows, setRows] = useState<ExpiringLicence[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    admin
      .expiringLicences(30)
      .then(setRows)
      .catch((e) => {
        // A silent catch here would show "no licences lapse in the next 30
        // days" when the truth is that nobody knows — the reassuring
        // reading of a failure.
        setError(e instanceof ApiError ? e.message : 'Could not load');
        setRows([]);
      });
  }, []);

  if (!rows) return <p className="text-sm text-ink-faint">Loading…</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
        {error}
      </p>
    );
  }

  return (
    <>
      <h2 className="eyebrow mb-2">Lapsing within 30 days</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-faint">No licences lapse in the next 30 days.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded border border-caution/40 bg-caution-soft px-3 py-2"
            >
              <span className="font-mono text-sm">
                {l.regulator} · {l.licenceNumber}
              </span>
              <span className="font-mono text-sm text-caution">
                {new Date(l.expiresOn).toLocaleDateString('en-GB')}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 max-w-prose text-micro text-ink-faint">
        A clinician whose licence lapses cannot record clinical data — the
        check-in gate refuses them, mid-shift, without warning.
      </p>
    </>
  );
}

function Audit() {
  const [pending, setPending] = useState<PendingBreakGlass[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    admin
      .pendingBreakGlass()
      .then(setPending)
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'Could not load');
        // Leave the list at `null` and this renders "Loading…" for ever —
        // a failed fetch looking exactly like a slow one, with the error
        // message never reached. An empty list plus the error is honest.
        setPending([]);
      });

  useEffect(() => {
    load();
  }, []);

  async function review(id: string, outcome: string) {
    setBusy(id);
    setError(null);
    try {
      await admin.reviewBreakGlass(id, outcome);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not record the review');
    } finally {
      setBusy(null);
    }
  }

  if (!pending) return <p className="text-sm text-ink-faint">Loading…</p>;

  return (
    <>
      <h2 className="eyebrow mb-2">Emergency access awaiting review</h2>
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {pending.length === 0 ? (
        <p className="text-sm text-ink-faint">Nothing is awaiting review.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((b) => (
            <li key={b.id} className="rounded-lg border border-critical/30 bg-critical-soft px-4 py-3">
              {/* The justification the clinician typed, verbatim. It is the
                  thing being reviewed, and it is append-only in the database —
                  nobody can rewrite their own reason after the fact. */}
              <p className="mb-1 text-sm font-semibold text-critical">{b.justification}</p>
              <p className="font-mono text-micro text-ink-soft">
                {new Date(b.openedAt).toLocaleString('en-GB')}
              </p>
              <p className="text-micro text-ink-faint">
                {b.patientNotifiedAt
                  ? `Patient notified ${new Date(b.patientNotifiedAt).toLocaleDateString('en-GB')}`
                  : 'Patient not yet notified'}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => review(b.id, 'REVIEWED_OK')}
                  disabled={busy === b.id}
                  className="rounded-md border border-rule bg-surface px-3 py-1.5 text-sm disabled:opacity-60"
                >
                  Justified
                </button>
                <button
                  onClick={() => review(b.id, 'FLAGGED')}
                  disabled={busy === b.id}
                  className="rounded-md border border-caution/40 bg-caution-soft px-3 py-1.5 text-sm text-caution disabled:opacity-60"
                >
                  Flag
                </button>
                <button
                  onClick={() => review(b.id, 'ESCALATED')}
                  disabled={busy === b.id}
                  className="rounded-md bg-critical px-3 py-1.5 text-sm font-semibold text-surface disabled:opacity-60"
                >
                  Escalate
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 max-w-prose text-micro text-ink-faint">
        Break-glass grants access first and asks afterwards, which is correct
        for an unconscious patient and dangerous without this queue. The
        patient is told either way.
      </p>
    </>
  );
}
