import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Incident Desk — Nemotron on-call investigations",
  description:
    "On-call investigation desk. NVIDIA Nemotron on Nebius Token Factory plans the investigation, tool calls stay visible, and a scorecard checks the trace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}