import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Imprest Claim",
  description: "Imprest claim, audit, and finance control system for facility management companies."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
