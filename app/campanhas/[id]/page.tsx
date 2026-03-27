'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { Navbar } from '@/components/dashboard/navbar';
import { LoginWrapper } from '@/components/dashboard/login-wrapper';
import { CampaignDetailView } from '@/components/dashboard/campaign-detail-view';

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <LoginWrapper>
      <Navbar />
      <div className="h-[80px]" />
      <main className="px-6 max-w-[1600px] mx-auto pt-20 pb-20">
        <CampaignDetailView id={id} />
      </main>
    </LoginWrapper>
  );
}
