import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/components/providers/language-provider";
import { TenantProvider } from "@/components/providers/tenant-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: {
    default: "ESTINAD Central",
    template: "%s · ESTINAD Central",
  },
  description: "Centre de contrôle ESTINAD — catalogues, commandes, rapports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} flex min-h-full flex-col font-sans antialiased`}
      >
        <ThemeProvider>
          <LanguageProvider>
            <TenantProvider>
              <ToastProvider>{children}</ToastProvider>
            </TenantProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
