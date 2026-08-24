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
} from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { sectionsFor, type SectionId } from '@/lib/adminSections';

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
              {s.label}
            </button>
          ))}
        </nav>

        {!ready ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : (
          <>
            {section === 'overview' && <Overview data={overview} role={role} />}
            {section === 'facilities' && <Facilities nameOfCounty={nameOfCounty} />}
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
    </>
  );
}

function Postings() {
  return (
    <>
      <h2 className="eyebrow mb-2">Staff postings</h2>
      <p className="mb-4 max-w-prose text-sm text-ink-soft">
        The Ministry posts staff to <span className="font-semibold text-ink">public</span>{' '}
        facilities. Private, faith-based and NGO facilities engage their own
        clinicians from their facility portal — the server refuses a posting
        in the wrong direction, so a private employer cannot place someone in
        a county hospital and the Ministry cannot staff a private clinic.
      </p>
      <p className="rounded-md border border-rule bg-surface-alt px-4 py-3 text-sm text-ink-soft">
        Posting a clinician needs their practitioner record and the facility.
        The search that pairs them is the next piece of this screen; the
        endpoint behind it is built and tested.
      </p>
    </>
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
