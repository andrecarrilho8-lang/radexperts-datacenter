import { Navbar } from '@/components/dashboard/navbar';

export const metadata = { title: 'Análise de Tráfego · RadExperts' };

export default function AnaliseLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="pt-[80px] min-h-screen">{children}</main>
    </>
  );
}
