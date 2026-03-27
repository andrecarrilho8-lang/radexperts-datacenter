import React from 'react';

export const SkeletonCardBig = () => (
  <div className="bg-white p-8 rounded-2xl animate-pulse min-h-[160px] flex flex-col justify-between border border-slate-100">
    <div className="w-12 h-12 bg-slate-200 rounded-lg mb-4" />
    <div>
      <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
      <div className="h-8 w-32 bg-slate-200 rounded" />
    </div>
  </div>
);

export const SkeletonCard = () => (
  <div className="bg-white p-6 rounded-2xl animate-pulse flex flex-col justify-between h-full border border-slate-100">
    <div className="w-8 h-8 bg-slate-200 rounded-md mb-4" />
    <div>
      <div className="h-2 w-16 bg-slate-200 rounded mb-2" />
      <div className="h-6 w-20 bg-slate-200 rounded" />
    </div>
  </div>
);

export const SkeletonRow = ({ cols }: { cols: number }) => (
  <tr className="border-b border-slate-100">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="py-4 px-4">
        <div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: i <= 1 ? '70%' : '50%' }} />
      </td>
    ))}
  </tr>
);

export const SkeletonAdCard = () => (
  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse">
    <div className="flex gap-4 mb-5">
      <div className="w-20 h-20 rounded-xl bg-slate-200 flex-shrink-0" />
      <div className="flex-1 flex flex-col justify-between">
        <div className="h-4 bg-slate-200 rounded w-4/5" />
        <div className="h-3 bg-slate-100 rounded w-3/5" />
        <div className="h-3 bg-slate-100 rounded w-2/5" />
      </div>
    </div>
    <div className="grid grid-cols-3 gap-3">
      {[1,2,3,4,5,6].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg" />)}
    </div>
  </div>
);
