import type { Metadata } from 'next';

/**
 * Keep this signed-in workspace out of search results. The portal landing
 * page and its registration page stay indexable — someone looking for how to
 * join should find them.
 *
 * See src/app/ministry/layout.tsx for why this is hygiene, not a security
 * control.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
