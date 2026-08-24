'use client';

import { useRef, useState } from 'react';

/**
 * Passport photo capture.
 *
 * Resized in the browser before it ever leaves the device: a modern phone
 * camera produces 4–8MB, and the server caps a stored photo at 200KB. Doing
 * the resize here means someone on a metered connection uploads 15KB rather
 * than several megabytes and then a refusal.
 *
 * Square-cropped from the centre, because a passport photo is a face and a
 * 4:3 frame with a shoulder in it is not what a clinician needs to confirm
 * they have the right patient.
 */

/** What the server accepts. Anything else is refused before upload. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const OUTPUT_PX = 320;

export interface PhotoFieldProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  /** Shown under the control; the reason this is being asked for. */
  hint?: string;
}

/** Centre-crops to a square and re-encodes as JPEG at the target size. */
async function resizeToSquare(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_PX;
  canvas.height = OUTPUT_PX;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the photo on this device');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_PX, OUTPUT_PX);
  bitmap.close?.();

  // JPEG at 0.8 lands around 15KB at this size — well inside the server's
  // 200KB ceiling, with room for a device that encodes badly.
  return canvas.toDataURL('image/jpeg', 0.8);
}

export function PhotoField({ value, onChange, hint }: PhotoFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      // Said here rather than after an upload that was always going to fail.
      setError('Use a JPEG, PNG or WebP photograph.');
      return;
    }

    setBusy(true);
    try {
      onChange(await resizeToSquare(file));
    } catch {
      setError('That photo could not be read. Try taking it again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <p className="eyebrow mb-1.5">Passport photograph</p>

      <div className="flex items-center gap-4">
        <div
          className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-rule bg-surface-alt"
          aria-hidden={!value}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Your passport photograph" className="h-full w-full object-cover" />
          ) : (
            <span className="text-micro text-ink-faint">No photo</span>
          )}
        </div>

        <div>
          <input
            ref={input}
            type="file"
            accept={ACCEPTED.join(',')}
            // `capture` opens the camera directly on a phone, which is how
            // most of these will be taken.
            capture="user"
            className="sr-only"
            id="photo"
            onChange={(e) => handle(e.target.files?.[0])}
          />
          <label
            htmlFor="photo"
            className="inline-block cursor-pointer rounded-md border border-gov px-4 py-2 text-sm font-semibold text-gov"
          >
            {busy ? 'Processing…' : value ? 'Change photo' : 'Take or choose a photo'}
          </label>

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                if (input.current) input.current.value = '';
              }}
              className="ml-2 text-sm text-ink-soft underline"
            >
              Remove
            </button>
          )}

          <p className="mt-1.5 max-w-prose text-micro text-ink-faint">
            {hint ??
              'Optional. It helps a clinician confirm they have the right ' +
                'record before treating you. Stored encrypted, and only ' +
                'visible to someone already treating you.'}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-critical">
          {error}
        </p>
      )}
    </div>
  );
}
