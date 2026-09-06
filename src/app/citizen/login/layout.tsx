import type { Metadata } from 'next';

/**
 * A sign-in screen has nothing to offer a search result. The portal landing
 * page it belongs to stays indexable and links here.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
