import type { Config } from 'tailwindcss';

/**
 * NHP design tokens.
 *
 * Taken from the wireframes: government navy as the primary, Kenyan flag
 * colours used semantically rather than decoratively, and neutrals biased
 * toward the navy accent so they read as chosen rather than defaulted.
 *
 * Everything is defined as a CSS variable in globals.css so the same tokens
 * work in light and dark without duplicating the palette here.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          alt: 'rgb(var(--surface-alt) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        rule: {
          DEFAULT: 'rgb(var(--rule) / <alpha-value>)',
          soft: 'rgb(var(--rule-soft) / <alpha-value>)',
        },
        /** Government navy — the primary. */
        gov: {
          DEFAULT: 'rgb(var(--gov) / <alpha-value>)',
          soft: 'rgb(var(--gov-soft) / <alpha-value>)',
          /* The Ministry's royal blue — the second of its two official
             blues. See --gov-bright in globals.css. */
          bright: 'rgb(var(--gov-bright) / <alpha-value>)',
        },
        /**
         * What to write ON solid gov.
         *
         * A colour of its own rather than a key under `gov`, because
         * `gov-on` reads as the `gov` scale with an `on` modifier and
         * Tailwind does not generate it.
         *
         * It has to flip with the theme: in dark mode --gov becomes a LIGHT
         * blue, and white on it is 2.1:1 — unreadable.
         */
        ongov: 'rgb(var(--on-gov) / <alpha-value>)',
        /**
         * The categorical chart series — see --c1..--c6 in globals.css.
         *
         * Separate from the semantic colours on purpose: these distinguish
         * categories and mean nothing on their own, so a reader never
         * learns that the third bar is "the bad one".
         */
        c1: 'rgb(var(--c1) / <alpha-value>)',
        c2: 'rgb(var(--c2) / <alpha-value>)',
        c3: 'rgb(var(--c3) / <alpha-value>)',
        c4: 'rgb(var(--c4) / <alpha-value>)',
        c5: 'rgb(var(--c5) / <alpha-value>)',
        c6: 'rgb(var(--c6) / <alpha-value>)',
        /** Semantic, from the Kenyan flag. Never decorative. */
        good: {
          DEFAULT: 'rgb(var(--green) / <alpha-value>)',
          soft: 'rgb(var(--green-soft) / <alpha-value>)',
        },
        critical: {
          DEFAULT: 'rgb(var(--red) / <alpha-value>)',
          soft: 'rgb(var(--red-soft) / <alpha-value>)',
        },
        caution: {
          DEFAULT: 'rgb(var(--amber) / <alpha-value>)',
          soft: 'rgb(var(--amber-soft) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // A real type scale, so headings are chosen rather than defaulted.
        'label': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
        'micro': ['0.75rem', { lineHeight: '1.1rem' }],
      },
      spacing: {
        // The clinician banner height, referenced in layout maths.
        banner: '4.75rem',
      },
      maxWidth: {
        prose: '65ch',
      },
      /*
       * Motion for the matching surface.
       *
       * Deliberately small and short. This screen tells somebody where to
       * take a sick child; movement here is to show that work is happening,
       * never to entertain. Everything below is disabled wholesale by the
       * prefers-reduced-motion block in globals.css.
       */
      keyframes: {
        'step-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        /** The pulse on the step currently being worked. */
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.45', transform: 'scale(0.82)' },
        },
        /** A slow sheen across the panel while matching runs. */
        sheen: {
          '0%': { backgroundPosition: '-160% 0' },
          '100%': { backgroundPosition: '260% 0' },
        },
      },
      animation: {
        'step-in': 'step-in 260ms ease-out both',
        'pulse-dot': 'pulse-dot 1.1s ease-in-out infinite',
        sheen: 'sheen 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
