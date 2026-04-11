import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Upper Assendon Farm Hub',
  description: 'M J Hunt & Son — Farm Management Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
