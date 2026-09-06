import type { Metadata } from 'next';

/**
 * Keep the encounter workspace out of search results.
 *
 * See src/app/ministry/layout.tsx for why this is hygiene rather than a
 * security control, and why the robots.txt rule alone would not be enough.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function EncounterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
