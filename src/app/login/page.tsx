import { redirect } from 'next/navigation';

/**
 * The old single sign-in.
 *
 * NHP now has four portals with four front doors, so there is no longer one
 * correct answer to "sign in" without knowing who is asking. Anyone landing
 * here — from a bookmark, a printed link, or a stale redirect — is sent to
 * the chooser rather than shown a page that guesses.
 */
export default function LegacyLoginPage() {
  redirect('/');
}
