import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Task Management - Elevator Service",
  description: "Διαχείριση ασανσέρ, εργασιών & ραντεβού",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}
