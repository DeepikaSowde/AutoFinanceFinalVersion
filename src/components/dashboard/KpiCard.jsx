import { formatCurrency } from '../../utils/currencyFormatter';

const KpiCard = ({ title, amount, icon: Icon }) => {
  return (
    <div className="bg-white rounded-xl p-4 sm:p-5 border border-slate-100 shadow-sm flex items-center gap-3.5 sm:gap-4 min-w-0 w-full h-full min-h-[92px] transition-shadow hover:shadow-md">
      <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
        {Icon && <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-700" strokeWidth={1.8} />}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-xs sm:text-sm font-medium text-slate-500 mb-0.5 sm:mb-1 leading-snug break-words">
          {title}
        </h3>
        <p 
          className="text-base sm:text-lg lg:text-xl font-bold text-slate-800 tracking-tight whitespace-nowrap leading-tight"
        >
          {formatCurrency(amount)}
        </p>
      </div>
    </div>
  );
};

export default KpiCard;
