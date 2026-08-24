import { PortalWelcome } from '@/components/PortalWelcome';
import { PORTALS } from '@/lib/portals';

export const metadata = {
  title: PORTALS.facility.welcomeName,
};

export default function FacilityWelcomePage() {
  return (
    <PortalWelcome
      portal={PORTALS.facility}
      blurb="Register your facility, manage the clinicians who work there, and declare the services you can offer."
      blurbSw="Sajili kituo chako, simamia wahudumu, na tangaza huduma unazotoa."
      primary={{ href: '/facility/login', label: 'Sign in' }}
      secondary={{ href: '/facility/register', label: 'Register a facility' }}
    />
  );
}
