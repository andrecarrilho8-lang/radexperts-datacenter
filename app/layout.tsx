import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import { DashboardProvider } from "./lib/context";
import { Suspense } from "react";
import { PageLoader } from "@/components/ui/page-loader";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const inter   = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RadExperts - Data Center",
  description: "RadExperts Analytics Dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${jakarta.variable} ${inter.variable} h-full antialiased`}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      </head>
      <body className="min-h-full flex flex-col font-body" style={{ background: '#001a35' }}>
        <DashboardProvider>
          <Suspense fallback={null}>
            <PageLoader />
          </Suspense>
          {children}
          <footer className="mt-auto border-t py-4 px-8" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)' }}>
            <div className="max-w-[1600px] mx-auto flex items-center justify-between flex-wrap gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#A8B2C0' }}>
                Desenvolvido por <span className="font-black" style={{ color: '#E8B14F' }}>André Carrilho</span>
              </p>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#A8B2C0' }}>RadExperts · Data Center</span>
                <span className="w-1 h-1 rounded-full" style={{ background: '#E8B14F' }} />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#A8B2C0' }}>v 1.0</span>
              </div>
            </div>
          </footer>
        </DashboardProvider>
      </body>
    </html>
  );
}
