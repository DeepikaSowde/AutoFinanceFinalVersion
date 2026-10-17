import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';

export default function SmartSearchFloatingButton() {
  const navigate = useNavigate();
  const location = useLocation();

  // Do not render floating button on the Dashboard or on the Smart Search page itself
  const isDashboard = location.pathname === '/' || location.pathname === '/dashboard';
  const isSmartSearch = location.pathname === '/smart-search';
  if (isDashboard || isSmartSearch) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/smart-search')}
      aria-label="Smart Search"
      title="Smart Search"
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 inline-flex items-center justify-center h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-[#07111F] hover:bg-[#0e1f36] border border-slate-700/60 text-white shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-[#FACC15]/40"
      style={{
        bottom: 'max(1.25rem, env(safe-area-inset-bottom, 1.25rem))',
        right: 'max(1.25rem, env(safe-area-inset-right, 1.25rem))',
      }}
    >
      <Search className="h-5 w-5 sm:h-5.5 sm:w-5.5 text-[#FACC15] stroke-[2.5] transition-transform duration-200 group-hover:scale-110 shrink-0" />
      <span className="sr-only">Smart Search</span>
    </button>
  );
}
