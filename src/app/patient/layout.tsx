import type { Metadata } from 'next';

/**
 * Keep patient record URLs out of search results.\n *\n * Nothing here is reachable without a session, and the page is a client\n * component, so no clinical data can reach a crawler. This keeps the URL\n * SHAPE — /patient/<NHP number> — out of any index as well.
 *
 * See src/app/ministry/layout.tsx for why this is hygiene rather than a
 * security control, and why the robots.txt rule alone would not be enough.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return children;
}
