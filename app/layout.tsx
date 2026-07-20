import React from 'react'
import type { Metadata } from 'next'
import { DM_Sans, Syne } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'
import { SpeedInsights } from '@vercel/speed-insights/next'

// Self-host de fuentes con next/font — elimina round trip a Google Fonts,
// preload automático, CLS = 0. Reemplaza el <link rel="stylesheet"> que
// bloqueaba render y agregaba ~300ms de latencia a Google.
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
  variable: '--font-dm-sans',
})
const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
  variable: '--font-syne',
})

export const metadata: Metadata = {
  title: 'BL Food · Dashboard BI',
  description: 'Business Intelligence Dashboard — BL Foods Corporation',
  icons: { icon: '/borden-logo.png', shortcut: '/borden-logo.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${dmSans.variable} ${syne.variable}`}>
      <body>
        {children}
        <Toaster richColors position="top-right" />
        <SpeedInsights />
      </body>
    </html>
  )
}
