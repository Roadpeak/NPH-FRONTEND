/**
 * ENROLLING A SECOND FACTOR.
 *
 * Reached by a clinician who has just registered and cannot sign in yet —
 * a privileged account with no factor is refused a session, and before this
 * existed every enrolment route needed the session they could not obtain.
 * They were locked out permanently while the registration screen told them
 * to sign in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const authStub = {
  enrolSms: vi.fn(),
  confirmSms: vi.fn(),
  enrolTotp: vi.fn(),
  confirmTotp: vi.fn(),
};

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, auth: { ...actual.auth, ...authStub } };
});

const { MfaEnrolment } = await import('@/components/MfaEnrolment');

beforeEach(() => {
  authStub.enrolSms.mockResolvedValue({ sentTo: '+2547***555', expiresInMinutes: 10 });
  authStub.confirmSms.mockResolvedValue({ confirmed: true });
  authStub.enrolTotp.mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://x' });
  authStub.confirmTotp.mockResolvedValue({ confirmed: true });
});

afterEach(() => vi.clearAllMocks());

describe('choosing a method', () => {
  it('offers both, and explains what each needs', () => {
    render(<MfaEnrolment onDone={vi.fn()} />);

    expect(screen.getByText(/text message/i)).toBeInTheDocument();
    expect(screen.getByText(/authenticator app/i)).toBeInTheDocument();
    // The distinction that decides it for a clinician at a rural facility.
    expect(screen.getByText(/no network needed/i)).toBeInTheDocument();
    expect(screen.getByText(/needs no app/i)).toBeInTheDocument();
  });

  it('says why a second factor is being asked for', () => {
    render(<MfaEnrolment onDone={vi.fn()} />);
    // Someone blocked from signing in needs to know this is a requirement,
    // not a failure.
    expect(screen.getByText(/reach patient records/i)).toBeInTheDocument();
  });
});

describe('SMS enrolment', () => {
  it('sends a code and confirms it', async () => {
    const onDone = vi.fn();
    render(<MfaEnrolment enrolToken="tok" onDone={onDone} />);

    await userEvent.click(screen.getByText(/text message/i));
    await waitFor(() => expect(authStub.enrolSms).toHaveBeenCalledWith('tok'));

    // Masked, so they can confirm which handset without the screen
    // disclosing a full number.
    expect(await screen.findByText('+2547***555')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/six-digit code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => expect(authStub.confirmSms).toHaveBeenCalledWith('123456', 'tok'));
    expect(onDone).toHaveBeenCalled();
  });

  it('will not submit an incomplete code', async () => {
    render(<MfaEnrolment onDone={vi.fn()} />);
    await userEvent.click(screen.getByText(/text message/i));
    await screen.findByLabelText(/six-digit code/i);

    await userEvent.type(screen.getByLabelText(/six-digit code/i), '123');
    expect(screen.getByRole('button', { name: /finish setup/i })).toBeDisabled();
  });
});

describe('authenticator enrolment', () => {
  it('THE FALLBACK — shows the setup key as text, not only a QR', async () => {
    render(<MfaEnrolment enrolToken="tok" onDone={vi.fn()} />);
    await userEvent.click(screen.getByText(/authenticator app/i));

    // A camera that will not focus, or a cracked screen, must not end the
    // enrolment.
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
  });

  it('confirms with the code from the app', async () => {
    const onDone = vi.fn();
    render(<MfaEnrolment enrolToken="tok" onDone={onDone} />);

    await userEvent.click(screen.getByText(/authenticator app/i));
    await screen.findByLabelText(/six-digit code/i);
    await userEvent.type(screen.getByLabelText(/six-digit code/i), '654321');
    await userEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => expect(authStub.confirmTotp).toHaveBeenCalledWith('654321', 'tok'));
    expect(onDone).toHaveBeenCalled();
  });
});

describe('when something goes wrong', () => {
  it('shows the server refusal and clears the code', async () => {
    const { ApiError } = await import('@/lib/api');
    authStub.confirmSms.mockRejectedValue(
      new ApiError('That code is not correct', 400, 'MFA_INVALID'),
    );

    render(<MfaEnrolment enrolToken="tok" onDone={vi.fn()} />);
    await userEvent.click(screen.getByText(/text message/i));
    await screen.findByLabelText(/six-digit code/i);
    await userEvent.type(screen.getByLabelText(/six-digit code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not correct/i);
    // Cleared, so the next attempt starts from an empty field rather than
    // a stale one they have to select and delete on a phone.
    expect((screen.getByLabelText(/six-digit code/i) as HTMLInputElement).value).toBe('');
  });

  it('lets them go back and pick the other method', async () => {
    render(<MfaEnrolment onDone={vi.fn()} />);
    await userEvent.click(screen.getByText(/text message/i));
    await screen.findByLabelText(/six-digit code/i);

    // A clinician who chose SMS and then found they have no signal must not
    // be stuck on that choice.
    await userEvent.click(screen.getByRole('button', { name: /different method/i }));
    expect(await screen.findByText(/authenticator app/i)).toBeInTheDocument();
  });

  it('surfaces a failed send rather than showing an empty code box', async () => {
    const { ApiError } = await import('@/lib/api');
    authStub.enrolSms.mockRejectedValue(
      new ApiError('Could not send the code', 502, 'SMS_SEND_FAILED'),
    );

    render(<MfaEnrolment onDone={vi.fn()} />);
    await userEvent.click(screen.getByText(/text message/i));

    // Waiting for a code that was never sent is the worst version of this.
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not send/i);
  });
});

describe('the two callers', () => {
  it('passes the enrolment token when the account cannot sign in yet', async () => {
    render(<MfaEnrolment enrolToken="scoped-token" onDone={vi.fn()} />);
    await userEvent.click(screen.getByText(/text message/i));
    await waitFor(() => expect(authStub.enrolSms).toHaveBeenCalledWith('scoped-token'));
  });

  it('omits it when the caller already has a session', async () => {
    render(<MfaEnrolment onDone={vi.fn()} />);
    await userEvent.click(screen.getByText(/text message/i));
    // The server then falls back to the session, which is the ordinary
    // path for someone changing their factor while signed in.
    await waitFor(() => expect(authStub.enrolSms).toHaveBeenCalledWith(undefined));
  });
});
