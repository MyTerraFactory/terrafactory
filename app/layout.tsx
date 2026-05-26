import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TerraFactory",
  description: "Visual Terraform Infrastructure Composer for production-ready cloud stacks.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
