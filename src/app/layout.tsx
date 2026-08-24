import type { Metadata, Viewport } from 'next';
import { Public_Sans, Newsreader, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { GovBanner } from '@/components/GovBanner';

/**
 * Public Sans — the US federal design system face. Built for government
 * interfaces, legible at small sizes, and not one of the defaults every
 * other product reaches for.
 */
const sans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

/** A transitional serif, so headings read as an official document. */
const serif = Newsreader({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

/** Codes, licence numbers, NHP numbers — anything that must not be misread. */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'National Health Portal',
    template: '%s · NHP',
  },
  description:
    'Kenya National Health Portal — a longitudinal health record and care-routing system.',
};

export const viewport: Viewport = {
  // Clinicians work on shared desktops and mid-range Android phones. The
  // layout must survive both without a horizontal scrollbar.
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#111b24' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        {/* Above everything, on every page: a phishing site can copy a
            layout, and a constant mark of provenance is what gives someone
            something to look for. */}
        <GovBanner />
        {children}
      </body>
    </html>
  );
}
