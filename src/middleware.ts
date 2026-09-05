import { NextResponse, type NextRequest } from 'next/server';

/**
 * Subdomain routing.
 *
 * Six hostnames serve one Next.js app. The apex and www show the portal
 * chooser; each portal subdomain should open on its own portal instead of
 * repeating the chooser.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not prefix every path with the portal. That was the obvious
 * shape, and it breaks the app: five routes deliberately sit OUTSIDE the
 * portal trees — `/me`, `/encounter`, `/patient/[nhpId]`, `/login` and the
 * chooser itself. A citizen who signs in lands on `/me`, and rewriting that
 * to `/citizen/me` 404s a screen that exists. The same for a clinician on
 * `/encounter`.
 *
 * Those routes are shared on purpose: `/patient/[nhpId]` is the same record
 * whether a doctor or a facility administrator opens it, and duplicating it
 * under four prefixes would be four screens to keep in step.
 *
 * So only the ROOT is rewritten. Every other path is already unambiguous —
 * it either names its portal or is deliberately shared — and passing it
 * through untouched is both correct and the smaller behaviour to reason
 * about later.
 *
 * SECURITY
 *
 * This is presentation, not authorisation. A subdomain decides which door
 * someone arrives at; it decides nothing about what they may read. Every
 * screen still checks its own session, and the API still enforces roles —
 * `worker.` is a URL, not a credential, and nothing here should ever be
 * mistaken for one.
 */

/** Which portal each host opens on. Anything unlisted gets the chooser. */
const PORTAL_ROOT: Record<string, string> = {
  citizen: '/citizen',
  worker: '/worker',
  facility: '/facility',
  ministry: '/ministry',
};

/**
 * The portal named by a host, or null.
 *
 * Matched on the leading label rather than the full hostname, so the same
 * build serves production, staging and a preview domain without a list of
 * every environment's hostnames — one that would silently fail closed the
 * first time a new domain appeared.
 *
 * The port is stripped because a Host header carries one in development.
 */
function portalForHost(host: string): string | null {
  const label = host.split(':')[0].split('.')[0].toLowerCase();
  return PORTAL_ROOT[label] ?? null;
}

export function middleware(req: NextRequest) {
  const portal = portalForHost(req.headers.get('host') ?? '');

  // Apex, www, or anything unrecognised: the chooser, unchanged.
  if (!portal) return NextResponse.next();

  // Only the root. Every other path already names its own portal or is
  // deliberately shared, and rewriting it would break the shared ones.
  if (req.nextUrl.pathname !== '/') return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = portal;
  return NextResponse.rewrite(url);
}

export const config = {
  /*
   * Never the framework's own paths.
   *
   * `_next/*` is the build output and `api/*` is reserved; rewriting either
   * would break the page while it loads rather than route it. The trailing
   * clause skips anything with a file extension, so static assets are
   * served as themselves.
   */
  matcher: ['/((?!_next/|api/|favicon.ico|.*\\..*).*)'],
};
