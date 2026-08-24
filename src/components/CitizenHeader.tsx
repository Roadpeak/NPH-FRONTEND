'use client';

/**
 * The citizen's own identity strip.
 *
 * Same shape as the clinician's PatientHeader — photograph, name, then the
 * facts as labelled inline columns — so one system looks like one system.
 *
 * The WORDS are completely different, and that is the point. A clinician
 * reads "Allergies · Active issues · Medications". Someone with no clinical
 * training, possibly worried, possibly reading in Swahili on a shared
 * handset, reads "Things that could harm you · Long-term conditions ·
 * Medicines you take". Same data, same layout, language that does not
 * require a medical degree.
 *
 * Nothing here collapses, for the same reason it does not on the clinician
 * screen: an allergy hidden behind a tap is an allergy nobody mentions at
 * the counter.
 */

export interface CitizenHeaderItem {
  kind: 'MEDICATION' | 'CHRONIC' | 'ALLERGY';
  title: string;
  detail: string;
  tone: 'good' | 'caution' | 'critical';
}

export interface CitizenHeaderProps {
  name: string;
  displayNumber: string;
  age: number;
  photo?: string | null;
  items: CitizenHeaderItem[];
  /**
   * Medicines come from `dailyMedicines`, NOT from `items` — the summary
   * payload keeps them in a separate array, and filtering `items` for
   * MEDICATION silently produced an empty column beside a record that
   * plainly listed two.
   */
  medicines: Array<{ name: string }>;
  /** Localised labels, so the columns translate with the content. */
  labels: {
    harmful: string;
    longTerm: string;
    medicines: string;
    none: string;
    yourNumber: string;
  };
  /** The language toggle and anything else that belongs top-right. */
  actions?: React.ReactNode;
}

function Column({
  label,
  entries,
  none,
  critical = false,
}: {
  label: string;
  entries: CitizenHeaderItem[];
  none: string;
  critical?: boolean;
}) {
  const severe = critical && entries.some((e) => e.tone === 'critical');

  return (
    <div className="min-w-0 border-t border-rule pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
      <p className="eyebrow mb-0.5">{label}</p>
      <p
        className={`break-words text-sm ${severe ? 'font-semibold text-critical' : 'text-ink'}`}
      >
        {entries.length === 0 ? (
          <span className="text-ink-faint">{none}</span>
        ) : (
          <>
            {/* Form as well as colour — a shared handset in daylight loses
                hue long before it loses shape. */}
            {severe && <span aria-hidden="true">▲ </span>}
            {entries.map((e) => e.title).join(', ')}
          </>
        )}
      </p>
    </div>
  );
}

export function CitizenHeader({
  name,
  displayNumber,
  age,
  photo,
  items,
  medicines,
  labels,
  actions,
}: CitizenHeaderProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

  return (
    <header className="border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-4xl flex-col gap-y-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-rule bg-surface-alt">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center font-serif text-lg text-ink-faint">
                {initials}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="truncate font-serif text-xl font-medium leading-tight tracking-tight">
              {name}
            </h1>
            <p className="truncate font-mono text-micro text-ink-faint">
              {/* Labelled, because a citizen has no reason to know what a
                  bare NHP number is or why it matters at a counter. */}
              {labels.yourNumber} {displayNumber} · {age}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-y-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-6 sm:gap-y-3">
          <Column
            label={labels.harmful}
            entries={items.filter((i) => i.kind === 'ALLERGY')}
            none={labels.none}
            critical
          />
          <Column
            label={labels.longTerm}
            entries={items.filter((i) => i.kind === 'CHRONIC')}
            none={labels.none}
          />
          <Column
            label={labels.medicines}
            entries={medicines.map((m) => ({
              kind: 'MEDICATION' as const,
              title: m.name,
              detail: '',
              tone: 'good' as const,
            }))}
            none={labels.none}
          />
        </div>

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
