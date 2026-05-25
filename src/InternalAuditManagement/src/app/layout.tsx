import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Facility Expense Control",
  description: "Internal audit and expense control system for facility management companies."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
