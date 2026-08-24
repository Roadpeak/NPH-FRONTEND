/**
 * The official-website banner.
 *
 * Runs edge to edge above everything, on every page, the way government
 * portals worldwide mark themselves — and for the same reason: a health
 * portal that asks for a National ID and a password is exactly what a
 * phishing site imitates. A constant, unmissable band at the top of the
 * real one gives people something to look for.
 *
 * Deliberately quiet: pale blue, small type, no interaction. It is a mark
 * of provenance, not a message competing with the page.
 */

/** The Kenyan flag, drawn rather than fetched. */
function KenyanFlag() {
  return (
    <svg
      viewBox="0 0 18 12"
      className="h-3 w-[18px] shrink-0 rounded-[1px] ring-1 ring-black/10"
      aria-hidden="true"
    >
      {/* Black, white-fimbriated red, white, green — the horizontal bands. */}
      <rect width="18" height="12" fill="#fff" />
      <rect width="18" height="3.4" y="0" fill="#000" />
      <rect width="18" height="3.4" y="4.3" fill="#BB0000" />
      <rect width="18" height="3.4" y="8.6" fill="#006600" />
      {/* The Maasai shield and spears, reduced to a readable silhouette at
          18px — a faithful rendering would be mud at this size. */}
      <g transform="translate(9 6)">
        {/* Crossed spears, then the shield over them. Kept to three strokes:
            a faithful Maasai shield is unreadable at 18 pixels, and a muddy
            one looks like a rendering fault rather than a flag. */}
        <path d="M-3.4 -5 L3.4 5" stroke="#fff" strokeWidth="0.6" />
        <path d="M3.4 -5 L-3.4 5" stroke="#fff" strokeWidth="0.6" />
        <ellipse cx="0" cy="0" rx="2.1" ry="5" fill="#fff" />
        <ellipse cx="0" cy="0" rx="1.5" ry="4.2" fill="#BB0000" />
      </g>
    </svg>
  );
}

export function GovBanner() {
  return (
    <div className="w-full border-b border-[#c7dced] bg-[#eaf3fb] dark:border-gov/25 dark:bg-gov/15">
      <div className="flex items-center gap-2 px-4 py-1.5 sm:px-6">
        <KenyanFlag />
        <p className="text-micro text-ink-soft">
          An official website of the Kenyan government
        </p>
      </div>
    </div>
  );
}
