import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slot Audio Studio",
  description:
    "Browser studio for original slot-game music and sound effects. Synthesis runs locally for Grim Hamster Studio.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14110e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
