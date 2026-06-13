import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Console — WebSocket agent debug UI",
  description:
    "Open-source UI for debugging AI agent backends: streaming, tool calls, trace timeline, context diffs, reconnect/RESUME.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}