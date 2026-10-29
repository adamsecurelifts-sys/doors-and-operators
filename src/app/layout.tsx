import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Doors & Operators | Wholesale Supply', description: 'Wholesale garage doors, operators, springs, rollers and parts.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
