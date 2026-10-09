import React from 'react';
import { Construction } from 'lucide-react';

const Vehicle = () => {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-slate-50 p-6">
      <div className="flex max-w-md flex-col items-center rounded-2xl bg-white p-8 text-center shadow-sm border border-slate-200">
        <div className="mb-4 rounded-full bg-emerald-100 p-4 text-emerald-600">
          <Construction size={48} strokeWidth={1.5} />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-slate-800">Vehicle Module</h1>
        <p className="text-slate-500">
          This page is currently under construction. Check back later for vehicle management features.
        </p>
      </div>
    </div>
  );
};

export default Vehicle;
