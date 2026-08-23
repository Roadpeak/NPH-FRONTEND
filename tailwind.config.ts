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
        },
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
    },
  },
  plugins: [],
};

export default config;
