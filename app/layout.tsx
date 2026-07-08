import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CallScope — RTC session analytics",
  description:
    "Analytics dashboard for voice call, meet and screen-share telemetry: volume, connect rates, ring latency and drop reasons, derived from an event-sourced store with SQL.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
