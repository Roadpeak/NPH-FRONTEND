'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SignInForm } from '@/components/SignInForm';
import { PORTALS } from '@/lib/portals';

function Form() {
  const reason = useSearchParams().get('reason');
  return <SignInForm portal={PORTALS.worker} reason={reason} />;
}

export default function WorkerLoginPage() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}
