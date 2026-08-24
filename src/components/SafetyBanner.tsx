import { IconLabel } from './icons';

/**
 * The clinical safety banner.
 *
 * DO NOT make this collapsible, tabbed, or conditionally rendered.
 *
 * It will come under pressure — it costs vertical space, and someone will
 * propose hiding it behind a disclosure to fit more of the form on screen.
 * Every "allergy was visible but missed" incident in the literature traces
 * to exactly that change. If space runs short, cut something else.
 *
 * Severity is encoded in FORM as well as colour — the icon and the weight
 * differ — so it reads at a glance and does not depend on hue alone.
 */

export interface BannerAllergy {
  substanceLabel: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'ANAPHYLAXIS';
  reaction?: string;
}

export interface BannerMedication {
  genericName: string;
  doseAmount: string | number;
  doseUnit: string;
  frequency: string;
}

export interface BannerCondition {
  icd11Title: string;
}

export interface SafetyBannerProps {
  allergies: BannerAllergy[];
  medications: BannerMedication[];
  chronicConditions: BannerCondition[];
  /** Shown beside the allergies — changes drug safety for almost everything. */
  alerts?: string[];
  restrictedRecordsExist?: boolean;
}

const SEVERE = new Set(['SEVERE', 'ANAPHYLAXIS']);

export function SafetyBanner({
  allergies,
  medications,
  chronicConditions,
  alerts = [],
  restrictedRecordsExist = false,
}: SafetyBannerProps) {
  const hasSevere = allergies.some((a) => SEVERE.has(a.severity));

  return (
    <section
      // Fixed, full contrast, above the work area. Not a disclosure.
      className={`border-y ${
        hasSevere
          ? 'border-critical/30 bg-critical-soft'
          : 'border-rule bg-surface-alt'
      }`}
      aria-label="Critical patient safety information"
    >
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
        <p className={`eyebrow mb-2 ${hasSevere ? 'text-critical' : ''}`}>
          Critical · always visible
        </p>

        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
          {/* --- allergies --- */}
          <div>
            <IconLabel name="allergy" className="eyebrow mb-1.5">
              Allergies{allergies.length > 0 && ` · ${allergies.length}`}
            </IconLabel>
            {allergies.length === 0 ? (
              <p className="text-sm text-ink-faint">None recorded</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {allergies.map((a) => {
                  const severe = SEVERE.has(a.severity);
                  return (
                    <li
                      key={a.substanceLabel}
                      className={`chip ${severe ? 'chip-critical' : 'chip-caution'}`}
                      title={a.reaction}
                    >
                      {/* Form, not just colour — and the icon is a fourth
                          channel beside shape, weight and hue, never a
                          replacement for them. */}
                      <span aria-hidden="true">{severe ? '▲' : '●'}</span>
                      <span className={severe ? 'font-bold' : ''}>
                        {a.substanceLabel}
                      </span>
                      <span className="opacity-70">· {a.severity}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* --- current medications --- */}
          <div>
            <IconLabel name="medication" className="eyebrow mb-1.5">
              Current medications{medications.length > 0 && ` · ${medications.length}`}
            </IconLabel>
            {medications.length === 0 ? (
              <p className="text-sm text-ink-faint">None recorded</p>
            ) : (
              <p className="text-sm leading-relaxed text-ink-soft">
                {medications.map((m, i) => (
                  <span key={`${m.genericName}-${i}`}>
                    {i > 0 && ' · '}
                    <span className="text-ink">{m.genericName}</span>{' '}
                    <span className="font-mono text-micro">
                      {m.doseAmount}
                      {m.doseUnit} {m.frequency}
                    </span>
                  </span>
                ))}
              </p>
            )}
          </div>

          {/* --- chronic + alerts --- */}
          <div>
            <IconLabel name="condition" className="eyebrow mb-1.5">
              Chronic &amp; alerts
            </IconLabel>
            <div className="flex flex-wrap items-center gap-1.5">
              {alerts.map((alert) => (
                // Pregnancy belongs here, not buried in a problem list — it
                // changes drug safety for almost everything.
                <span key={alert} className="chip chip-caution">
                  {alert}
                </span>
              ))}
              {chronicConditions.length === 0 && alerts.length === 0 ? (
                <span className="text-sm text-ink-faint">None recorded</span>
              ) : (
                <span className="text-sm text-ink-soft">
                  {chronicConditions.map((c) => c.icd11Title).join(' · ')}
                </span>
              )}
            </div>

            {restrictedRecordsExist && (
              /* The withholding rule: the clinician is told restricted
                 records EXIST without being shown them, so they know to ask
                 the patient. Hiding their existence defeats the tier. */
              <p className="mt-2 text-micro text-caution">
                Restricted records exist — ask the patient, or use emergency
                access
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
