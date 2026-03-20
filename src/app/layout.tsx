import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Canopy — Dependency Analyzer',
  description: 'Polyglot dependency graph analyzer',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-white antialiased">{children}</body>
    </html>
  )
}