import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DM_Sans } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Plumbing Tools API',
  description: 'ElevenLabs-ready plumbing voice agent backend — Google Sheet tools, triage, SMS, call logs.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={dmSans.variable} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
