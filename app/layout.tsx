import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interview Agent",
  description: "Resume-custom voice interviews for software roles",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
