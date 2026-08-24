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
} from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { CitizenHeader } from '@/components/CitizenHeader';
import { Icon, type IconName } from '@/components/icons';
import { Field, inputClass } from '@/components/PortalShell';

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

type Tab = 'RECORD' | 'FAMILY' | 'PROFILE' | 'ACCESS';
type Lang = 'en' | 'sw';

/** One icon per tab, so the row is scannable before it is read. */
const TAB_ICONS: Record<Tab, IconName> = {
  RECORD: 'record',
  FAMILY: 'family',
  PROFILE: 'citizen',
  ACCESS: 'access',
};

const TAB_LABELS: Record<Lang, Record<Tab, string>> = {
  en: { RECORD: 'Record', FAMILY: 'Family', PROFILE: 'Profile', ACCESS: 'Who has seen it' },
  sw: { RECORD: 'Rekodi', FAMILY: 'Familia', PROFILE: 'Wasifu', ACCESS: 'Nani ameiona' },
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
          {(['RECORD', 'FAMILY', 'PROFILE', 'ACCESS'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-4 py-3 text-center font-mono text-micro font-semibold ${
                tab === t
                  ? 'border-gov text-gov'
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
            <ul className="mb-6 space-y-2">
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
                <li className="rounded-lg border border-rule bg-surface px-4 py-3">
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
