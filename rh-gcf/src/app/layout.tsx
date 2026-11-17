import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RH GCF", template: "%s | RH GCF" },
  description: "Controle de dados e datas do RH do Grupo Conceito Fiscal",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0C1B33",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
