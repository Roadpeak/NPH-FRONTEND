'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  citizen,
  photo,
  hasSession,
  restoreSession,
  ApiError,
  type CitizenSummaryPayload,
  type CitizenVisit,
  type AccessEntry,
  type CitizenProfile,
  type FamilyMember,
  type SymptomGroup,
  type CareRecommendation,
} from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { CitizenHeader } from '@/components/CitizenHeader';
import { Icon, type IconName } from '@/components/icons';
import { Field, inputClass } from '@/components/PortalShell';
import { MatchingSteps, MatchTrace } from '@/components/MatchingSteps';

/**
 * The citizen timeline.
 *
 * The same record the clinician sees, for a reader with no clinical
 * training, possibly reading in Swahili, possibly on a shared handset,
 * possibly worried.
 *
 * What this screen must never do:
 *   - show a bare abnormal result (fear, or false calm)
 *   - let a serious diagnosis arrive before a clinician has spoken
 *   - let the patient edit clinical content
 *   - use fear or urgency to drive engagement
 *
 * Four tabs, no more. Record · Family · Access · Find care.
 */

type Tab = 'RECORD' | 'CARE' | 'FAMILY' | 'PROFILE' | 'ACCESS';
type Lang = 'en' | 'sw';

/** One icon per tab, so the row is scannable before it is read. */
const TAB_ICONS: Record<Tab, IconName> = {
  RECORD: 'record',
  CARE: 'location',
  FAMILY: 'family',
  PROFILE: 'citizen',
  ACCESS: 'access',
};

const TAB_LABELS: Record<Lang, Record<Tab, string>> = {
  en: {
    RECORD: 'Record',
    CARE: 'Find care',
    FAMILY: 'Family',
    PROFILE: 'Profile',
    ACCESS: 'Who has seen it',
  },
  sw: {
    RECORD: 'Rekodi',
    CARE: 'Tafuta huduma',
    FAMILY: 'Familia',
    PROFILE: 'Wasifu',
    ACCESS: 'Nani ameiona',
  },
};

function formatDate(iso: string, lang: Lang) {
  return new Date(iso).toLocaleDateString(lang === 'sw' ? 'sw-KE' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function CitizenPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('en');
  const [tab, setTab] = useState<Tab>('RECORD');
  const [summary, setSummary] = useState<CitizenSummaryPayload | null>(null);
  const [visits, setVisits] = useState<CitizenVisit[]>([]);
  const [access, setAccess] = useState<AccessEntry[]>([]);
  const [openVisit, setOpenVisit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fetched separately and separately caught: a photo that fails to load
  // must never delay or block the record itself.
  const [myPhoto, setMyPhoto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!hasSession() && !(await restoreSession())) {
          router.replace(PORTALS.citizen.signInPath);
          return;
        }
        const [s, v, a] = await Promise.all([
          citizen.summary(lang),
          citizen.visits(lang),
          citizen.accessLog(),
        ]);
        if (cancelled) return;
        setSummary(s);
        setVisits(v);
        setAccess(a);

        photo
          .mine()
          .then((p) => !cancelled && setMyPhoto(p.photo))
          .catch(() => !cancelled && setMyPhoto(null));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'NO_SESSION') {
          router.replace(PORTALS.citizen.signInPath);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load your record');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lang, router]);

  const ui = summary?.ui ?? {};

  return (
    <div className="min-h-screen bg-surface-sunken">
      <CitizenHeader
        name={summary?.name ?? '…'}
        displayNumber={summary?.displayNumber ?? ''}
        age={summary?.age ?? 0}
        photo={myPhoto}
        items={summary?.rightNow ?? []}
        medicines={summary?.dailyMedicines ?? []}
        labels={{
          harmful: ui.harmful ?? '',
          longTerm: ui.longTerm ?? '',
          medicines: ui.medicines ?? '',
          none: ui.none ?? '',
          yourNumber: ui.yourNumber ?? '',
        }}
        actions={
          /* Swahili is not a toggle bolted on — it is the language of
             everyday life in Kenya, and the interface translates with the
             content. */
          <button
            onClick={() => setLang((l) => (l === 'en' ? 'sw' : 'en'))}
            className="rounded-full border border-rule px-3 py-1 font-mono text-micro font-semibold text-gov"
            aria-label={lang === 'en' ? 'Badilisha lugha kwa Kiswahili' : 'Switch to English'}
          >
            {lang === 'en' ? 'SW' : 'EN'}
          </button>
        }
      />

      {/*
        Directly under the identity strip, the way the clinician screen
        carries its tab row. It scrolls away with the page rather than
        sitting fixed: a bar pinned to the bottom of a mid-range Android
        browser competes with the system navigation bar and loses.
      */}
      <nav className="border-b border-rule bg-surface-alt">
        <div className="mx-auto flex max-w-4xl overflow-x-auto px-4 sm:px-6">
          {(['RECORD', 'CARE', 'FAMILY', 'PROFILE', 'ACCESS'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-4 py-3 text-center font-mono text-micro font-semibold ${
                tab === t
                  ? 'border-gov-bright text-gov-bright'
                  : 'border-transparent text-ink-faint hover:text-ink-soft'
              }`}
            >
              <Icon name={TAB_ICONS[t]} size={14} className="mr-1.5 -mt-0.5" />
              {TAB_LABELS[lang][t]}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
        {error && (
          <p className="mb-4 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-sm text-critical">
            {error}
          </p>
        )}

        {tab === 'RECORD' && (
          <>
            {summary?.pendingClinicianContact && (
              /* Sequencing, not secrecy. A serious result reaching someone
                 cold on a phone is a real harm. */
              <p className="mb-4 rounded-md border border-caution/40 bg-caution-soft px-3 py-2.5 text-sm text-caution">
                {ui.pendingReview}
              </p>
            )}

            <h2 className="eyebrow mb-2">{ui.rightNow}</h2>
            {/*
              A grid, not a stack.

              These are the four or five facts a citizen most needs to see —
              allergies, long-term conditions, daily medicines. As full-width
              bands they filled the screen one at a time and pushed the
              visit history below the fold; two columns lets somebody take
              them in together, which is how a safety summary should read.
            */}
            <ul className="mb-7 grid gap-2 sm:grid-cols-2">
              {summary?.rightNow.map((item, i) => (
                <li
                  key={`${item.kind}-${i}`}
                  className={`rounded-lg border px-4 py-3 ${
                    item.tone === 'critical'
                      ? 'border-critical/30 bg-critical-soft'
                      : item.tone === 'caution'
                        ? 'border-caution/40 bg-caution-soft'
                        : 'border-good/30 bg-good-soft'
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${
                      item.tone === 'critical'
                        ? 'text-critical'
                        : item.tone === 'caution'
                          ? 'text-caution'
                          : 'text-good'
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="text-micro text-ink-soft">{item.detail}</p>
                </li>
              ))}

              {summary && summary.dailyMedicines.length > 0 && (
                <li className="card px-4 py-3 sm:col-span-2">
                  <p className="mb-1 text-sm font-semibold">{ui.dailyMedicines}</p>
                  {summary.dailyMedicines.map((m, i) => (
                    <p key={i} className="text-sm text-ink-soft">
                      {m.name}
                      {/* "for your sugar", not "indication 5A11". */}
                      {m.forWhat && (
                        <span className="text-ink-faint"> — {m.forWhat.toLowerCase()}</span>
                      )}
                    </p>
                  ))}
                </li>
              )}
            </ul>

            <h2 className="eyebrow mb-2">{ui.yourVisits}</h2>
            {visits.length === 0 ? (
              <p className="text-sm text-ink-faint">{ui.noVisits}</p>
            ) : (
              <ol className="relative space-y-0 border-l border-rule pl-5">
                {visits.map((v) => (
                  <li key={v.encounterId} className="relative pb-5">
                    <span
                      className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${
                        v.withheld ? 'bg-caution' : 'bg-gov'
                      }`}
                    />
                    <button
                      onClick={() =>
                        setOpenVisit(openVisit === v.encounterId ? null : v.encounterId)
                      }
                      className="w-full text-left"
                    >
                      <p className="text-sm font-semibold">{v.whatHappened}</p>
                      <p className="text-micro text-ink-soft">{v.facilityName}</p>
                      <p className="text-micro text-ink-faint">
                        {formatDate(v.when, lang)} · {v.treatedBy}
                      </p>
                    </button>

                    {openVisit === v.encounterId && !v.withheld && (
                      <div className="mt-2 space-y-2 rounded-lg border border-rule bg-surface p-3">
                        {v.clinicalTitle && (
                          <div>
                            <p className="eyebrow mb-0.5">{ui.medicalTerm}</p>
                            {/* The clinical term is available BELOW the plain
                                one, never above — a patient carrying their
                                record to a specialist needs the real term. */}
                            <p className="font-mono text-micro text-ink-soft">
                              {v.clinicalTitle}
                            </p>
                            <p className="font-mono text-micro text-ink-faint">
                              {ui.medicalTerm === 'Neno la kitaalamu' ? 'Msimbo' : 'Code'}{' '}
                              {v.icd11Code}
                            </p>
                          </div>
                        )}

                        {v.medicines.length > 0 && (
                          <div>
                            <p className="eyebrow mb-0.5">{ui.medicineGiven}</p>
                            {v.medicines.map((m, i) => (
                              <p key={i} className="text-sm">
                                {m.name}{' '}
                                <span className="text-micro text-ink-faint">{m.regimen}</span>
                              </p>
                            ))}
                          </div>
                        )}

                        {/* A patient can flag an error; they can never edit a
                            clinical row, and the screen says so plainly. */}
                        <div className="rounded border border-caution/40 bg-caution-soft px-3 py-2">
                          <p className="text-sm font-semibold text-caution">
                            {ui.somethingWrong}
                          </p>
                          <p className="text-micro text-ink-soft">{ui.tellUs}</p>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}

            <p className="mt-6 text-micro text-ink-faint">{ui.cannotChange}</p>
          </>
        )}

        {tab === 'CARE' && <CarePanel lang={lang} />}
        {tab === 'FAMILY' && <FamilyPanel lang={lang} />}

        {tab === 'PROFILE' && <ProfilePanel lang={lang} />}

        {tab === 'ACCESS' && (
          <>
            <h2 className="eyebrow mb-1">
              {lang === 'sw' ? 'Nani ameona rekodi yako' : 'Who has seen your record'}
            </h2>
            <p className="mb-4 text-micro text-ink-faint">
              {lang === 'sw'
                ? `Miezi 12 iliyopita · mara ${access.length}`
                : `Last 12 months · ${access.length} times`}
            </p>

            <ul className="space-y-2">
              {access.map((a, i) => (
                <li
                  key={i}
                  className={`rounded-lg border px-4 py-3 ${
                    a.isEmergencyAccess
                      ? 'border-critical/30 bg-critical-soft'
                      : 'border-rule bg-surface'
                  }`}
                >
                  {a.isEmergencyAccess && (
                    /* Break-glass is the most prominent entry deliberately:
                       an override the patient can see and query is a very
                       different thing from one they cannot. */
                    <p className="text-sm font-semibold text-critical">
                      {lang === 'sw' ? 'Ufikiaji wa dharura' : 'Emergency access'}
                    </p>
                  )}
                  <p className="text-micro text-ink-soft">
                    {formatDate(a.occurredAt, lang)}
                  </p>
                  <p className="text-micro text-ink-faint">
                    {/* Plain reasons, not enum codes. The enum is for the
                        auditor; the citizen gets a sentence. */}
                    {a.reasonPlain}
                  </p>
                </li>
              ))}
              {access.length === 0 && (
                <li className="text-sm text-ink-faint">
                  {lang === 'sw'
                    ? 'Hakuna aliyeiona rekodi yako bado'
                    : 'Nobody has opened your record yet'}
                </li>
              )}
            </ul>
          </>
        )}
      </main>

    </div>
  );
}

/**
 * Bilingual copy for the two new panels.
 *
 * Kept here rather than in the backend UI strings because these are screen
 * furniture, not clinical content — the labels the server owns are the ones
 * that must stay in step with the record itself.
 */
const T = {
  en: {
    yourChildren: 'Your children',
    noChildren: 'No children added yet',
    notConfirmed: 'Not yet confirmed',
    confirmedHint:
      'Take their birth certificate to any facility and they will confirm the record. Until then a facility cannot find it.',
    confirmed: 'Confirmed',
    addChild: 'Add a child',
    addChildNote:
      'You must be their parent or guardian. Adding a child is recorded.',
    firstName: 'First name',
    familyName: 'Family name',
    dob: 'Date of birth',
    sex: 'Sex at birth',
    relationship: 'Your relationship to them',
    birthCert: 'Birth certificate number',
    birthCertHint: 'Optional. Providing it speeds up confirmation.',
    save: 'Add child',
    cancel: 'Cancel',
    years: 'years',
    yourDetails: 'Your details',
    phone: 'Phone number',
    email: 'Email address',
    edit: 'Edit',
    saveChanges: 'Save',
    cannotChangeHere: 'These cannot be changed here',
    cannotChangeWhy:
      'A facility matches you on these. If something is wrong, report it and the facility will correct it.',
    reportError: 'Report an error',
    name: 'Name',
    nationalId: 'National ID',
    born: 'Born',
    notSet: 'Not set',
    saved: 'Saved',
  },
  sw: {
    yourChildren: 'Watoto wako',
    noChildren: 'Hakuna watoto walioongezwa bado',
    notConfirmed: 'Bado haijathibitishwa',
    confirmedHint:
      'Peleka cheti chake cha kuzaliwa kwenye kituo chochote nao watathibitisha rekodi. Hadi wakati huo kituo hakiwezi kuipata.',
    confirmed: 'Imethibitishwa',
    addChild: 'Ongeza mtoto',
    addChildNote: 'Lazima uwe mzazi au mlezi wake. Kuongeza mtoto kunarekodiwa.',
    firstName: 'Jina la kwanza',
    familyName: 'Jina la familia',
    dob: 'Tarehe ya kuzaliwa',
    sex: 'Jinsia wakati wa kuzaliwa',
    relationship: 'Uhusiano wako naye',
    birthCert: 'Nambari ya cheti cha kuzaliwa',
    birthCertHint: 'Si lazima. Kuitoa kunaharakisha uthibitisho.',
    save: 'Ongeza mtoto',
    cancel: 'Ghairi',
    years: 'miaka',
    yourDetails: 'Maelezo yako',
    phone: 'Nambari ya simu',
    email: 'Barua pepe',
    edit: 'Hariri',
    saveChanges: 'Hifadhi',
    cannotChangeHere: 'Haya hayawezi kubadilishwa hapa',
    cannotChangeWhy:
      'Kituo kinakutambua kwa haya. Kama kuna kosa, ripoti nao watakirekebisha.',
    reportError: 'Ripoti kosa',
    name: 'Jina',
    nationalId: 'Kitambulisho',
    born: 'Alizaliwa',
    notSet: 'Haijawekwa',
    saved: 'Imehifadhiwa',
  },
} as const;

const RELATIONSHIPS = [
  { value: 'MOTHER', en: 'Mother', sw: 'Mama' },
  { value: 'FATHER', en: 'Father', sw: 'Baba' },
  { value: 'LEGAL_GUARDIAN', en: 'Legal guardian', sw: 'Mlezi wa kisheria' },
  { value: 'GRANDPARENT', en: 'Grandparent', sw: 'Babu au bibi' },
  { value: 'FOSTER', en: 'Foster parent', sw: 'Mlezi wa kambo' },
  { value: 'OTHER', en: 'Other', sw: 'Nyingine' },
];

/**
 * The family panel.
 *
 * A child added here is unverified and invisible to facility search until a
 * clinician attests it. That is stated on the child's own row, in the words
 * a parent needs — not as a status enum — because discovering it at a
 * facility counter is the failure this screen exists to prevent.
 */
function FamilyPanel({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [family, setFamily] = useState<FamilyMember[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [sexAtBirth, setSexAtBirth] = useState('');
  const [relationship, setRelationship] = useState('');
  const [birthCertNumber, setBirthCertNumber] = useState('');

  const load = () =>
    citizen
      .family()
      .then(setFamily)
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'Could not load');
        setFamily([]);
      });

  useEffect(() => {
    load();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await citizen.addChild({
        givenName,
        familyName,
        sexAtBirth,
        dateOfBirth,
        relationship,
        birthCertNumber: birthCertNumber || undefined,
      });
      setAdding(false);
      setGivenName('');
      setFamilyName('');
      setDateOfBirth('');
      setSexAtBirth('');
      setRelationship('');
      setBirthCertNumber('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add');
    } finally {
      setBusy(false);
    }
  }

  if (!family) return <p className="text-sm text-ink-faint">…</p>;

  return (
    <>
      <h2 className="eyebrow mb-2">{t.yourChildren}</h2>

      {error && (
        <p role="alert" className="mb-3 rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {family.length === 0 && !adding && (
        <p className="mb-4 text-sm text-ink-faint">{t.noChildren}</p>
      )}

      <ul className="mb-5 space-y-2">
        {family.map((m) => (
          <li
            key={m.guardianshipId}
            className={`rounded-lg border px-4 py-3 ${
              m.child.verified ? 'border-rule bg-surface' : 'border-caution/40 bg-caution-soft'
            }`}
          >
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Icon name="child" size={15} className="text-ink-faint" />
              {m.child.givenName} {m.child.familyName}
            </p>
            <p className="text-micro text-ink-soft">
              {m.child.ageYears} {t.years} · {m.child.displayNumber}
            </p>
            {m.child.verified ? (
              <p className="mt-1 inline-flex items-center gap-1 text-micro text-good">
                <Icon name="confirmed" size={13} />
                {t.confirmed}
              </p>
            ) : (
              /* Said in the words a parent needs, not as a status enum. */
              <>
                <p className="mt-1 inline-flex items-center gap-1 text-micro font-semibold text-caution">
                  <Icon name="pending" size={13} />
                  {t.notConfirmed}
                </p>
                <p className="text-micro text-ink-soft">{t.confirmedHint}</p>
              </>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <form onSubmit={submit} className="rounded-lg border border-rule bg-surface p-4">
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field id="cGiven" label={t.firstName}>
              <input
                id="cGiven"
                required
                value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id="cFamily" label={t.familyName}>
              <input
                id="cFamily"
                required
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field id="cDob" label={t.dob}>
              <input
                id="cDob"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id="cSex" label={t.sex}>
              <select
                id="cSex"
                required
                value={sexAtBirth}
                onChange={(e) => setSexAtBirth(e.target.value)}
                className={inputClass}
              >
                <option value="">…</option>
                <option value="FEMALE">{lang === 'sw' ? 'Mke' : 'Female'}</option>
                <option value="MALE">{lang === 'sw' ? 'Mume' : 'Male'}</option>
                <option value="INTERSEX">{lang === 'sw' ? 'Jinsia mbili' : 'Intersex'}</option>
              </select>
            </Field>
          </div>

          <Field id="cRel" label={t.relationship}>
            <select
              id="cRel"
              required
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className={inputClass}
            >
              <option value="">…</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r.value} value={r.value}>
                  {lang === 'sw' ? r.sw : r.en}
                </option>
              ))}
            </select>
          </Field>

          <Field id="cCert" label={t.birthCert} hint={t.birthCertHint}>
            <input
              id="cCert"
              value={birthCertNumber}
              onChange={(e) => setBirthCertNumber(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </Field>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-gov px-4 py-2.5 font-semibold text-surface disabled:opacity-60"
            >
              {busy ? '…' : t.save}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-md px-4 py-2.5 text-sm text-ink-soft"
            >
              {t.cancel}
            </button>
          </div>
        </form>
      ) : (
        <>
          <button
            onClick={() => setAdding(true)}
            className="rounded-md border border-gov px-4 py-2.5 font-semibold text-gov"
          >
            <Icon name="child" size={15} className="mr-1.5 -mt-0.5" />
            {t.addChild}
          </button>
          <p className="mt-2 max-w-prose text-micro text-ink-faint">{t.addChildNote}</p>
        </>
      )}
    </>
  );
}

/**
 * The profile panel.
 *
 * Contact details are editable. Identity is not: a facility matches a
 * person on name, National ID, date of birth and sex, and a self-service
 * edit there is how someone quietly becomes a different person. They are
 * SHOWN, so an error can be seen and reported — hiding them would make a
 * wrong date of birth undiscoverable until it mattered clinically.
 */
function ProfilePanel({ lang }: { lang: Lang }) {
  const t = T[lang];
  const [profile, setProfile] = useState<CitizenProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    citizen
      .profile()
      .then((p) => {
        setProfile(p);
        setPhone(p.contact.phone ?? '');
        setEmail(p.contact.email ?? '');
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load'));

  useEffect(() => {
    load();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await citizen.updateProfile({ phone, email });
      setEditing(false);
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    return error ? (
      <p role="alert" className="text-sm text-critical">
        {error}
      </p>
    ) : (
      <p className="text-sm text-ink-faint">…</p>
    );
  }

  const id = profile.identity;

  return (
    <>
      <h2 className="eyebrow mb-2">{t.yourDetails}</h2>

      {saved && !editing && (
        <p className="mb-3 rounded-md border border-good/30 bg-good-soft px-3 py-2 text-sm text-good">
          {t.saved}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {editing ? (
        <form onSubmit={save} className="mb-6 rounded-lg border border-rule bg-surface p-4">
          <Field id="pPhone" label={t.phone}>
            <input
              id="pPhone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="pEmail" label={t.email}>
            <input
              id="pEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-gov px-4 py-2.5 font-semibold text-surface disabled:opacity-60"
            >
              {busy ? '…' : t.saveChanges}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md px-4 py-2.5 text-sm text-ink-soft"
            >
              {t.cancel}
            </button>
          </div>
        </form>
      ) : (
        <dl className="mb-6 rounded-lg border border-rule bg-surface p-4 text-sm">
          <div className="mb-2 flex justify-between gap-4">
            <dt className="inline-flex items-center gap-1.5 text-ink-faint">
              <Icon name="phone" size={14} />
              {t.phone}
            </dt>
            <dd className="font-mono">{profile.contact.phone ?? t.notSet}</dd>
          </div>
          <div className="mb-3 flex justify-between gap-4">
            <dt className="inline-flex items-center gap-1.5 text-ink-faint">
              <Icon name="email" size={14} />
              {t.email}
            </dt>
            <dd className="truncate">{profile.contact.email ?? t.notSet}</dd>
          </div>
          <button
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
            className="text-sm font-semibold text-gov underline"
          >
            {t.edit}
          </button>
        </dl>
      )}

      {/* Read-only, and said so. */}
      <h2 className="eyebrow mb-2">{t.cannotChangeHere}</h2>
      <dl className="rounded-lg border border-rule bg-surface-alt p-4 text-sm">
        <div className="mb-2 flex justify-between gap-4">
          <dt className="text-ink-faint">{t.name}</dt>
          <dd className="text-right">
            {id.givenName} {id.familyName}
          </dd>
        </div>
        <div className="mb-2 flex justify-between gap-4">
          <dt className="inline-flex items-center gap-1.5 text-ink-faint">
            <Icon name="nationalId" size={14} />
            {t.nationalId}
          </dt>
          {/* Masked: a citizen knows their own number, and showing it in
              full only creates a shoulder-surfing target. */}
          <dd className="font-mono">{id.nationalIdMasked ?? t.notSet}</dd>
        </div>
        <div className="mb-2 flex justify-between gap-4">
          <dt className="text-ink-faint">{t.born}</dt>
          <dd>{formatDate(id.dateOfBirth, lang)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-faint">{t.sex}</dt>
          <dd>{id.sexAtBirth}</dd>
        </div>
      </dl>
      <p className="mt-2 max-w-prose text-micro text-ink-faint">{t.cannotChangeWhy}</p>
    </>
  );
}

/**
 * Find care.
 *
 * The citizen-facing half of the routing engine, and the screen where the
 * system is most tempted to overreach. Four rules hold it in place:
 *
 *   - Symptoms are PICKED, never typed. Free text into a rules engine
 *     promises an understanding the engine does not have.
 *   - The disclaimer is never conditional. NHP says where to go; it does
 *     not say what is wrong.
 *   - When something serious matches, the screen gives ONE instruction and
 *     no facility list. Every red-flag rule is still unreviewed, and
 *     offering a destination would be acting on a rule nobody has signed.
 *   - When the person's own record changed the answer, the screen says so.
 *     Someone who cannot see why they were sent somewhere cannot disagree.
 */
const CARE_T = {
  en: {
    title: 'Find the right facility',
    intro:
      'Tell us what is wrong and we will suggest where to go. This is guidance on where to seek care, not a diagnosis.',
    matching: 'Smart care matching',
    stepRules: 'Matching your symptoms to care rules',
    stepRecord: 'Checking your health record',
    stepFacilities: 'Finding facilities that can treat this',
    how: 'How this was worked out',
    lblRules: 'Rules matched',
    lblNeeds: 'Facility needs',
    lblSearched: 'Searched',
    lblRecord: 'From your record',
    countRules: (n: number) => `${n} matched`,
    countFacilities: (n: number) => `${n} found`,
    bestMatch: 'Best match',
    pick: 'What are you feeling?',
    picked: 'selected',
    find: 'Find a facility',
    finding: 'Finding…',
    clear: 'Start again',
    noneChosen: 'Choose at least one symptom.',
    emergencyTitle: 'Go now',
    whyTitle: 'Why these facilities',
    because: 'Because your record shows you are living with',
    results: 'Where to go',
    noneFound:
      'We could not find a facility with what you need nearby. Go to your nearest health facility and they will refer you.',
    level: 'Level',
    open24: 'Open 24 hours',
    away: 'km away',
    urgency: {
      EMERGENCY: 'Emergency — go now',
      URGENT_24H: 'Urgent — go within 24 hours',
      SOON_7D: 'Go within a week',
      ROUTINE: 'Routine — book a visit',
    } as Record<string, string>,
  },
  sw: {
    title: 'Tafuta kituo sahihi',
    intro:
      'Tuambie tatizo lako na tutapendekeza mahali pa kwenda. Huu ni mwongozo wa mahali pa kupata huduma, si utambuzi wa ugonjwa.',
    matching: 'Ulinganishaji mahiri',
    stepRules: 'Kulinganisha dalili zako na kanuni za huduma',
    stepRecord: 'Kuangalia rekodi yako ya afya',
    stepFacilities: 'Kutafuta vituo vinavyoweza kutibu hili',
    how: 'Hili lilipatikanaje',
    lblRules: 'Kanuni',
    lblNeeds: 'Kituo kinahitaji',
    lblSearched: 'Ilitafutwa',
    lblRecord: 'Kutoka rekodi yako',
    countRules: (n: number) => `${n} zimelingana`,
    countFacilities: (n: number) => `${n} vimepatikana`,
    bestMatch: 'Linalofaa zaidi',
    pick: 'Unahisi nini?',
    picked: 'zimechaguliwa',
    find: 'Tafuta kituo',
    finding: 'Inatafuta…',
    clear: 'Anza upya',
    noneChosen: 'Chagua angalau dalili moja.',
    emergencyTitle: 'Nenda sasa',
    whyTitle: 'Kwa nini vituo hivi',
    because: 'Kwa sababu rekodi yako inaonyesha unaishi na',
    results: 'Mahali pa kwenda',
    noneFound:
      'Hatukupata kituo chenye unachohitaji karibu. Nenda kituo cha afya kilicho karibu nawe na watakuelekeza.',
    level: 'Ngazi',
    open24: 'Wazi saa 24',
    away: 'km kutoka hapa',
    urgency: {
      EMERGENCY: 'Dharura — nenda sasa',
      URGENT_24H: 'Haraka — nenda ndani ya saa 24',
      SOON_7D: 'Nenda ndani ya wiki moja',
      ROUTINE: 'Kawaida — panga ziara',
    } as Record<string, string>,
  },
};

function CarePanel({ lang }: { lang: Lang }) {
  const t = CARE_T[lang];
  const [groups, setGroups] = useState<SymptomGroup[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [result, setResult] = useState<CareRecommendation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    citizen
      .symptoms(lang)
      .then((r) => !cancelled && setGroups(r.groups))
      .catch(() => !cancelled && setGroups([]));
    return () => {
      cancelled = true;
    };
  }, [lang]);

  function toggle(code: string) {
    setResult(null);
    setChosen((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]));
  }

  async function find() {
    if (!chosen.length) {
      setError(t.noneChosen);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await citizen.recommend({ symptoms: chosen, lang }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not find a facility');
    } finally {
      setBusy(false);
    }
  }

  const advice = result ? (lang === 'sw' ? result.adviceSw : result.adviceEn) : '';

  return (
    <section>
      <h2 className="eyebrow mb-1">{t.title}</h2>
      <p className="mb-5 max-w-2xl text-sm text-ink-soft">{t.intro}</p>

      {error && (
        <p role="alert" className="mb-4 text-sm text-critical">
          {error}
        </p>
      )}

      {/*
        The engine's reasoning, made visible.
        
        Each step names work the engine genuinely does — match numbered
        rules, read the person's record, filter facilities by declared
        capability. Shown while the request is in flight and replaced by
        the result, so it informs rather than performs.
      */}
      {(busy || result) && (
        <div className="mb-4">
          <MatchingSteps
            title={t.matching}
            done={!busy}
            steps={[
              {
                label: t.stepRules,
                detail:
                  !busy && result && !result.emergency
                    ? t.countRules(result.rulesFired.length)
                    : undefined,
              },
              { label: t.stepRecord },
              {
                label: t.stepFacilities,
                detail:
                  !busy && result && !result.emergency
                    ? t.countFacilities(result.facilities.length)
                    : undefined,
              },
            ]}
          />
        </div>
      )}

      {/*
        A red flag. One instruction, no facility list, and no rule id —
        a citizen has no use for "RF001" and the rule is unreviewed anyway.
      */}
      {result?.emergency && (
        <div className="mb-6 rounded-lg border-2 border-critical bg-critical-soft px-5 py-4">
          <p className="mb-1 font-serif text-lg font-semibold text-critical">
            {t.emergencyTitle}
          </p>
          <p className="text-sm text-ink">{advice}</p>
        </div>
      )}

      {result && !result.emergency && (
        <div className="mb-6 space-y-4">
          {result.urgency && (
            <p className="inline-block rounded-full border border-gov/30 bg-gov-soft px-3 py-1 text-xs font-semibold text-gov">
              {t.urgency[result.urgency] ?? result.urgency}
            </p>
          )}
          <p className="text-sm text-ink">{advice}</p>

          {/*
            Why the search was widened. Said out loud, because a citizen who
            cannot see the reason has no way to tell us it is wrong.
          */}
          {result.historyFactors.length > 0 && (
            <p className="rounded-md border border-rule bg-surface-alt px-3 py-2 text-sm text-ink-soft">
              <span className="font-semibold text-ink">{t.whyTitle}: </span>
              {t.because}{' '}
              {result.historyFactors.map((f) => f.label).join(', ')}.
            </p>
          )}

          <div>
            <h3 className="eyebrow mb-2">{t.results}</h3>
            {result.facilities.length === 0 ? (
              <p className="rounded-md border border-rule bg-surface px-4 py-6 text-sm text-ink-soft">
                {t.noneFound}
              </p>
            ) : (
              <ul className="space-y-2">
                {result.facilities.map((f, i) => (
                  <li
                    key={f.id}
                    className={`animate-step-in rounded-lg border bg-surface px-4 py-3 ${
                      /* The first result is the engine's best match, and
                         saying so beats making somebody infer it from
                         list order. */
                      i === 0 ? 'border-gov/40 shadow-sm' : 'border-rule'
                    }`}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="flex-1 text-sm font-semibold text-ink">{f.name}</span>
                      {i === 0 && (
                        <span className="rounded-full bg-gov-bright/12 px-2 py-0.5 font-mono text-micro font-semibold uppercase tracking-wide text-gov-bright">
                          {t.bestMatch}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-ink-faint">
                      <span className="rounded border border-rule px-1.5 py-0.5">
                        {t.level} {f.kephLevel}
                      </span>
                      {f.is24Hour && (
                        <span className="rounded border border-rule px-1.5 py-0.5">
                          {t.open24}
                        </span>
                      )}
                      {typeof f.distanceKm === 'number' && (
                        <span className="rounded border border-rule px-1.5 py-0.5">
                          {f.distanceKm.toFixed(0)} {t.away}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* The disclaimer is not conditional and never has been. */}
      {result && (
        <p className="mb-3 text-xs text-ink-faint">{result.disclaimer}</p>
      )}

      {/*
        Kept on screen after the fact, unlike the steps above.
        
        This is the difference between a system that felt clever for a
        moment and one a person can interrogate — and interrogability is
        the whole argument for routing on rules rather than a model. Not
        shown for a gated emergency: a citizen has no use for a rule id,
        and the rule that matched is unreviewed anyway.
      */}
      {result && !result.emergency && (
        <div className="mb-6">
          <MatchTrace
            rulesFired={result.rulesFired}
            capabilities={result.requiredCapabilities ?? []}
            scope={result.scope}
            historyLabels={result.historyFactors.map((f) => f.label)}
            labels={{
              how: t.how,
              rules: t.lblRules,
              needs: t.lblNeeds,
              searched: t.lblSearched,
              record: t.lblRecord,
            }}
          />
        </div>
      )}

      <h3 className="eyebrow mb-2">{t.pick}</h3>
      {groups === null ? (
        <p className="text-sm text-ink-faint">…</p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.bodySystem}>
              <p className="mb-2 font-mono text-micro font-semibold uppercase tracking-wide text-ink-faint">
                {g.bodySystem.replace(/_/g, ' ')}
              </p>
              <div className="flex flex-wrap gap-2">
                {g.items.map((item) => {
                  const on = chosen.includes(item.code);
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => toggle(item.code)}
                      aria-pressed={on}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${
                        on
                          ? 'border-gov bg-gov text-ongov'
                          : 'border-rule bg-surface text-ink hover:border-gov/40'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={find}
          disabled={busy}
          className="rounded-lg bg-gov px-5 py-2.5 text-sm font-medium text-ongov transition hover:bg-gov-bright disabled:opacity-50"
        >
          {busy ? t.finding : t.find}
        </button>
        {chosen.length > 0 && (
          <>
            <span className="text-sm text-ink-soft">
              {chosen.length} {t.picked}
            </span>
            <button
              type="button"
              onClick={() => {
                setChosen([]);
                setResult(null);
                setError(null);
              }}
              className="text-sm text-ink-faint underline hover:text-ink"
            >
              {t.clear}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
