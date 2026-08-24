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
} from '@/lib/api';
import { PORTALS } from '@/lib/portals';
import { CitizenHeader } from '@/components/CitizenHeader';

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

type Tab = 'RECORD' | 'ACCESS';
type Lang = 'en' | 'sw';

const TAB_LABELS: Record<Lang, Record<Tab, string>> = {
  en: { RECORD: 'Record', ACCESS: 'Who has seen it' },
  sw: { RECORD: 'Rekodi', ACCESS: 'Nani ameiona' },
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
    <div className="min-h-screen bg-surface-sunken pb-20">
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

      {/* Four tabs, no more — Family and Find care land with their screens. */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-rule bg-surface-alt">
        <div className="mx-auto flex max-w-4xl">
          {(['RECORD', 'ACCESS'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-3 text-center font-mono text-micro font-semibold ${
                tab === t ? 'text-gov' : 'text-ink-faint'
              }`}
            >
              {TAB_LABELS[lang][t]}
              {tab === t && <span className="mx-auto mt-1 block h-0.5 w-8 bg-gov" />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
