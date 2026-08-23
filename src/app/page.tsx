/**
 * Placeholder landing page.
 *
 * Exists to prove the design tokens, fonts and dark mode work end to end.
 * Replaced by the role-aware entry screen when auth lands.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <div className="mb-8 flex h-[7px] w-16 overflow-hidden rounded-sm">
        <div className="flex-1 bg-ink" />
        <div className="flex-1 bg-critical" />
        <div className="flex-1 bg-good" />
      </div>

      <p className="eyebrow mb-2">Republic of Kenya</p>
      <h1 className="mb-4 font-serif text-5xl font-medium leading-none tracking-tight">
        National Health Portal
      </h1>
      <p className="mb-12 max-w-prose text-lg text-ink-soft">
        A longitudinal health record and care-routing system. The record
        follows the person, not the building.
      </p>

      <div className="rounded-lg border border-rule bg-surface p-6">
        <p className="eyebrow mb-4">Scaffold check</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-faint">Framework</dt>
            <dd className="font-mono">Next.js 15 · React 19</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Styling</dt>
            <dd className="font-mono">Tailwind 3.4</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Backend</dt>
            <dd className="font-mono">NHP-BACKEND · /api/v1</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Theme</dt>
            <dd className="font-mono">light · dark · system</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-rule-soft pt-6">
          <span className="chip chip-critical">Penicillin · ANAPHYLAXIS</span>
          <span className="chip chip-caution">Sulfa · MODERATE</span>
          <span className="chip chip-good">Consented</span>
          <span className="chip chip-gov">Tier 2</span>
        </div>
      </div>
    </main>
  );
}
