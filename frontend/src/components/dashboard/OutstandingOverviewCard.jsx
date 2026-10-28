import { Database, Wallet } from 'lucide-react';
import { formatCurrency } from '../../utils/currencyFormatter';
import { useDashboardText } from '../../i18n/dashboardLanguage';

const OutstandingOverviewCard = ({ data }) => {
  const t = useDashboardText('Capital, Chit & Outstanding');
  const safeData = data || { totalOutstanding: 0, debit: 0, credit: 0, balance: 0 };
  const hasRecords = Boolean(
    data && (Number(data.debit || 0) > 0 || Number(data.credit || 0) > 0 || Number(data.totalOutstanding || 0) > 0)
  );

  const total = Math.max(Number(safeData.debit || 0), Number(safeData.credit || 0));

  const getPercentage = (value) => {
    if (!total || total === 0) return 0;
    return Math.min((Number(value || 0) / total) * 100, 100);
  };

  const items = [
    { label: t('Debit Outstanding'), value: safeData.debit },
    { label: t('Credit'), value: safeData.credit },
    { label: t('Balance'), value: safeData.balance }
  ];

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm col-span-1 lg:col-span-4 h-[360px] min-h-[360px] flex flex-col min-w-0">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
          <Database className="h-4 w-4 text-emerald-700" strokeWidth={1.8} />
        </div>
        <h3 className="text-base font-bold text-slate-800">{t('Outstanding Overview')}</h3>
      </div>
      
      <div className="mb-5 shrink-0">
        <p className="text-2xl font-bold text-slate-800 tracking-tight">{formatCurrency(safeData.totalOutstanding)}</p>
        <p className="text-xs text-slate-500 mt-0.5">{t('Total Outstanding')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 flex-1 items-center min-h-0">
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center text-sm">
              <span className="text-slate-600 truncate mr-2">{item.label}</span>
              <span className="font-medium text-slate-800 shrink-0">{formatCurrency(item.value)}</span>
            </div>
          ))}
        </div>
        
        {hasRecords ? (
          <div className="space-y-3.5 mt-2 md:mt-0">
            {items.map((item, idx) => (
              <div key={idx} className="w-full">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="text-slate-600 truncate mr-1">{item.label}</span>
                  <span className="text-slate-800 font-medium shrink-0">{formatCurrency(item.value)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div 
                    className="bg-emerald-700 h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${getPercentage(item.value)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50/80 border border-slate-100 text-center h-full min-h-[120px]">
            <div className="h-9 w-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mb-1.5 shrink-0 ring-4 ring-emerald-50/50">
              <Wallet className="h-4 w-4 text-emerald-700" strokeWidth={1.8} />
            </div>
            <p className="text-xs font-semibold text-slate-700">{t('No outstanding records')}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{t('Balances will reflect once loans are recorded')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OutstandingOverviewCard;
