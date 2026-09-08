import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'HydroNexus — Ocean Intelligence',
  description:
    'Explore ocean models and instrument profiles across depth and time in an interactive 3D scientific workspace.',
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
