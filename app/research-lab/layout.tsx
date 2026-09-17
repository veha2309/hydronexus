import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Restricted workspace',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function ResearchLabLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
