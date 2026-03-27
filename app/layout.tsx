import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import { DashboardProvider } from "./lib/context";
import { Suspense } from "react";
import { PageLoader } from "@/components/ui/page-loader";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Advogado10x - Data Center",
  description: "Lumina Analytics Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${jakarta.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      </head>
      <body className="min-h-full flex flex-col font-body bg-slate-50">
        <DashboardProvider>
          <Suspense fallback={null}>
            <PageLoader />
          </Suspense>
          {children}
          <footer className="mt-auto border-t border-slate-200 bg-white/60 backdrop-blur-sm py-4 px-8">
            <div className="max-w-[1600px] mx-auto flex items-center justify-between flex-wrap gap-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Desenvolvido por <span className="text-slate-600 font-black">André Carrilho</span>
              </p>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Advogado10x · Data Center</span>
                <span className="w-1 h-1 bg-slate-300 rounded-full" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">v 1.0</span>
              </div>
            </div>
          </footer>
        </DashboardProvider>
      </body>
    </html>
  );
}
