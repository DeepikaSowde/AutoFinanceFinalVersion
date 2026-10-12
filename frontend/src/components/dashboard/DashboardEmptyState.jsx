
const DashboardEmptyState = ({ 
  icon: Icon, 
  title, 
  subtitle, 
  className = "" 
}) => {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-6 my-auto select-none ${className}`}>
      {Icon && (
        <div className="h-11 w-11 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3 shrink-0 ring-4 ring-emerald-50/50">
          <Icon className="h-5 w-5 text-emerald-700" strokeWidth={1.8} />
        </div>
      )}
      <p className="text-sm font-semibold text-slate-700 max-w-xs">{title}</p>
      {subtitle && (
        <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
};

export default DashboardEmptyState;
