'use client';

import { IconLabel, type IconName } from './icons';

import type { BannerAllergy, BannerMedication, BannerCondition } from './SafetyBanner';

/**
 * The patient identity strip.
 *
 * Takes its shape from the EMR reference: photograph at the left, name and
 * contact beside it, then the clinical facts as labelled inline columns —
 * Allergies, Active issues, Medical problems — reading across in one line.
 *
 * Those columns are NOT a restyled SafetyBanner and do not replace it. They
 * are a summary a clinician reads while walking to the patient; the banner
 * below carries the full list, always expanded, and nothing here is
 * collapsible. Severity still reads in form as well as colour, because a
 * phone in Kenyan daylight washes out hue long before it washes out shape.
 */

const SEVERE = new Set(['SEVERE', 'ANAPHYLAXIS']);

export interface PatientHeaderProps {
  displayNumber: string;
  givenName: string;
  familyName: string;
  age: number;
  sexAtBirth: string;
  bloodGroup?: string | null;
  photo?: string | null;
  allergies: BannerAllergy[];
  medications: BannerMedication[];
  chronicConditions: BannerCondition[];
  /** Rendered at the right — "Not my patient", consent chip, and so on. */
  actions?: React.ReactNode;
}

function Column({
  label,
  icon,
  children,
  tone = 'plain',
}: {
  label: string;
  icon: IconName;
  children: React.ReactNode;
  tone?: 'plain' | 'critical';
}) {
  return (
    <div className="min-w-0 border-t border-rule pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
      <IconLabel name={icon} className="eyebrow mb-0.5 whitespace-nowrap">
        {label}
      </IconLabel>
      <p
        // NOT truncated: a clipped allergy is an allergy nobody reads.
        className={`break-words text-sm ${
          tone === 'critical' ? 'font-semibold text-critical' : 'text-ink'
        }`}
      >
        {children}
      </p>
    </div>
  );
}

export function PatientHeader({
  displayNumber,
  givenName,
  familyName,
  age,
  sexAtBirth,
  bloodGroup,
  photo,
  allergies,
  medications,
  chronicConditions,
  actions,
}: PatientHeaderProps) {
  const severe = allergies.filter((a) => SEVERE.has(a.severity));
  const sexMark = sexAtBirth === 'FEMALE' ? '♀' : sexAtBirth === 'MALE' ? '♂' : '⚥';

  return (
    <header className="border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-y-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-4 sm:px-6">
        {/* --- identity --- */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-rule bg-surface-alt">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt={`${givenName} ${familyName}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-serif text-lg text-ink-faint">
                {givenName[0]}
                {familyName[0]}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="truncate font-serif text-xl font-medium leading-tight tracking-tight">
              {givenName} {familyName}
            </h1>
            <p className="truncate font-mono text-micro text-ink-faint">
              {displayNumber} · {age} {sexMark}
              {bloodGroup
                ? ` · ${bloodGroup.replace('_POS', '+').replace('_NEG', '−')}`
                : ''}
            </p>
          </div>
        </div>

        {/* --- the clinical facts, inline --- */}
        <div className="flex min-w-0 flex-1 flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-6 sm:gap-y-3">
          <Column
            label="Allergies"
            icon="allergy"
            tone={severe.length > 0 ? 'critical' : 'plain'}
          >
            {allergies.length === 0 ? (
              <span className="text-ink-faint">None recorded</span>
            ) : (
              <>
                {/* Form, not only colour. */}
                {/* The character, not an SVG: it survives a failed icon
                    font, a text-only reader and a printed record. */}
                {severe.length > 0 && <span aria-hidden="true">▲ </span>}
                {allergies.map((a) => a.substanceLabel).join(', ')}
              </>
            )}
          </Column>

          <Column label="Active issues" icon="condition">
            {chronicConditions.length === 0 ? (
              <span className="text-ink-faint">None recorded</span>
            ) : (
              chronicConditions.map((c) => c.icd11Title).join(', ')
            )}
          </Column>

          <Column label="Medications" icon="medication">
            {medications.length === 0 ? (
              <span className="text-ink-faint">None recorded</span>
            ) : (
              medications.map((m) => m.genericName).join(', ')
            )}
          </Column>
        </div>

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
