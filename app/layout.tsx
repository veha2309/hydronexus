import type { Metadata } from 'next';
import './globals.css';
import './atlas.css';
export const metadata: Metadata = {
  title: 'HydroNexus — Ocean Atlas',
  description:
    'Explore ocean models and instrument profiles across depth and time in an interactive 3D scientific workspace.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
