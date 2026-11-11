import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NYX Financial Infrastructure',
  description:
    'Financial infrastructure platform modeling double-entry ledger and atomic transfers.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
