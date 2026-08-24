import { PortalWelcome } from '@/components/PortalWelcome';
import { PORTALS } from '@/lib/portals';

export const metadata = {
  title: PORTALS.ministry.welcomeName,
};

export default function MinistryWelcomePage() {
  return (
    <PortalWelcome
      portal={PORTALS.ministry}
      blurb="National statistics, facility approvals, staff postings and audit — the administration of the health record system."
      blurbSw="Takwimu za kitaifa, idhini ya vituo, uwekaji wa wafanyakazi na ukaguzi."
      primary={{ href: '/ministry/login', label: 'Sign in' }}
    />
  );
}
