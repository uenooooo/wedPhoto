import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sota & Momoka's Wedding Photo Gallery",
  description: "結婚式の写真・動画共有ページ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
