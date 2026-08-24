import { PortalWelcome } from '@/components/PortalWelcome';
import { PORTALS } from '@/lib/portals';

export const metadata = {
  title: PORTALS.citizen.welcomeName,
};

export default function CitizenWelcomePage() {
  return (
    <PortalWelcome
      portal={PORTALS.citizen}
      blurb="See your visits, your medicines, and every person who has opened your record. Any facility in Kenya can find it with your National ID."
      blurbSw="Ona matembezi yako, dawa zako, na kila mtu aliyefungua rekodi yako."
      primary={{ href: '/citizen/login', label: 'Sign in' }}
      secondary={{ href: '/citizen/register', label: 'Create your record' }}
    />
  );
}
