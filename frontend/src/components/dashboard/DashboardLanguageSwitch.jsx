const OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
];

// Compact English | தமிழ் toggle shown beside Smart Search on the Dashboard.
const DashboardLanguageSwitch = ({ language, onChange }) => (
  <div
    role="group"
    aria-label="Language"
    className="inline-flex items-center rounded-xl border border-emerald-200 bg-white p-0.5 shadow-sm"
  >
    {OPTIONS.map((option, index) => {
      const selected = language === option.code;
      return (
        <div key={option.code} className="flex items-center">
          {index > 0 && <span className="px-0.5 text-xs text-emerald-200" aria-hidden="true">|</span>}
          <button
            type="button"
            onClick={() => onChange(option.code)}
            aria-pressed={selected}
            lang={option.code}
            className={`rounded-lg px-2.5 py-1 sm:py-1.5 text-xs sm:text-[13px] font-semibold transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600/40 ${
              selected ? 'bg-emerald-700 text-white shadow-xs' : 'text-emerald-800 hover:bg-emerald-50'
            }`}
          >
            {option.label}
          </button>
        </div>
      );
    })}
  </div>
);

export default DashboardLanguageSwitch;
