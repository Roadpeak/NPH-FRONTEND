import type { Metadata } from 'next';

/**
 * Keep the Ministry portal out of search results.
 *
 * This is hygiene, not a security control. What protects this portal is the
 * sign-in, the MFA enrolment and the ministry-role checks on every route —
 * the path itself is guessable, and treating obscurity as a defence would be
 * a mistake. It is here because an administrative door to a national health
 * system has no business being advertised to opportunistic scanners, and
 * because a government admin portal surfacing in a search result reads as
 * carelessness whether or not it is.
 *
 * `noindex` is the tag that actually removes pages already indexed: Google
 * has to crawl the page to see it. The matching robots.txt rule stops FUTURE
 * crawling. Both are needed and in that order — a robots.txt disallow on its
 * own would forbid the crawl that discovers this tag, and Google can leave a
 * URL listed on the strength of inbound links alone.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function MinistryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
