/**
 * PASSPORT PHOTO CAPTURE.
 *
 * Resized in the browser before it leaves the device: a phone camera
 * produces 4–8MB and the server caps a stored photo at 200KB. Doing it here
 * means someone on a metered connection uploads 15KB rather than several
 * megabytes and then a refusal.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoField } from '@/components/PhotoField';

describe('the photo field', () => {
  it('says the photo is optional and why it is asked for', () => {
    render(<PhotoField value={null} onChange={vi.fn()} />);
    // Someone with no way to take a photograph must not think they are
    // blocked from registering.
    expect(screen.getByText(/optional/i)).toBeInTheDocument();
    expect(screen.getByText(/right record/i)).toBeInTheDocument();
  });

  it('says where the photo goes, before it is taken', () => {
    render(<PhotoField value={null} onChange={vi.fn()} />);
    // A face is biometric data. Saying "stored encrypted" after the upload
    // is too late for someone deciding whether to give it.
    expect(screen.getByText(/stored encrypted/i)).toBeInTheDocument();
  });

  it('shows a placeholder rather than a broken frame', () => {
    render(<PhotoField value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/no photo/i)).toBeInTheDocument();
  });

  it('previews the photo once chosen', () => {
    render(<PhotoField value="data:image/jpeg;base64,AAAA" onChange={vi.fn()} />);
    const img = screen.getByAltText(/passport photograph/i) as HTMLImageElement;
    expect(img.src).toContain('data:image/jpeg');
  });

  it('lets someone remove a photo they changed their mind about', async () => {
    const onChange = vi.fn();
    render(<PhotoField value="data:image/jpeg;base64,AAAA" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('only offers formats a browser can display', () => {
    const { container } = render(<PhotoField value={null} onChange={vi.fn()} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;

    // SVG is an executable document, not a photograph, and the server
    // refuses it — offering it here would produce a pointless refusal.
    expect(input.accept).toContain('image/jpeg');
    expect(input.accept).not.toContain('svg');
  });

  it('opens the camera on a phone rather than a file browser', () => {
    const { container } = render(<PhotoField value={null} onChange={vi.fn()} />);
    const input = container.querySelector('input[type=file]');
    // Most of these will be taken on the spot, not chosen from a gallery.
    expect(input?.getAttribute('capture')).toBe('user');
  });
});
