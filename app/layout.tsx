// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css"; // create this file if it doesn't exist
import '../src/index.css';   // adjust this to match your real CSS file(s)


import React from "react";

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Starting Over Medical",
  description: "Rehabilitation Farm App",
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
    ],
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body dir="rtl" className="text-right block">{children}</body>
    </html>
  );
}