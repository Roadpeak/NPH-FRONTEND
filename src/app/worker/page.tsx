import { PortalWelcome } from '@/components/PortalWelcome';
import { PORTALS } from '@/lib/portals';

export const metadata = {
  title: PORTALS.worker.welcomeName,
};

export default function WorkerWelcomePage() {
  return (
    <PortalWelcome
      portal={PORTALS.worker}
      blurb="Record encounters, prescribe safely, and read the history of the patients you treat — wherever they were treated before."
      blurbSw="Andika matibabu, agiza dawa, na soma historia ya wagonjwa unaowahudumia."
      primary={{ href: '/worker/login', label: 'Sign in' }}
      secondary={{ href: '/worker/register', label: 'Register as a health worker' }}
    />
  );
}
