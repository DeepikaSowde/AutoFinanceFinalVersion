import { Wallet } from 'lucide-react';
import { formatCurrency } from '../../utils/currencyFormatter';

const CapitalPositionCard = ({ data }) => {
  const safeData = data || {
    totalCapital: 0,
    openingCapital: 0,
    deployed: 0,
    available: 0,
    closingBalance: 0
  };

  const total = Number(safeData.totalCapital || 0);
  const hasRecords = Boolean(
    data && (total > 0 || Number(safeData.openingCapital || 0) > 0 || Number(safeData.deployed || 0) > 0)
  );

  const getPercentage = (value) => {
    if (!total || total === 0) return 0;
    return Math.min((Number(value || 0) / total) * 100, 100);
  };

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm col-span-1 lg:col-span-5 h-[360px] min-h-[360px] flex flex-col min-w-0">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
          <Wallet className="h-4 w-4 text-emerald-700" strokeWidth={1.8} />
        </div>
        <h3 className="text-base font-bold text-slate-800">Capital Position</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 items-center min-h-0">
        <div className="space-y-3.5">
          <div>
            <p className="text-2xl font-bold text-slate-800 tracking-tight">{formatCurrency(safeData.totalCapital)}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total Capital</p>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(safeData.openingCapital)}</p>
            <p className="text-xs text-slate-500">Opening Capital</p>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(safeData.closingBalance)}</p>
            <p className="text-xs text-slate-500">Closing Balance</p>
          </div>
        </div>

        {hasRecords ? (
          <div>
            <h4 className="text-xs font-semibold text-emerald-700 mb-2">Capital Utilization</h4>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-5">
              <div 
                className="bg-emerald-700 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${getPercentage(safeData.deployed)}%` }}
              ></div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                  <span className="text-slate-600">Available Capital</span>
                </div>
                <span className="font-medium text-slate-800">{formatCurrency(safeData.available)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-700"></div>
                  <span className="text-slate-600">Deployed</span>
                </div>
                <span className="font-medium text-slate-800">{formatCurrency(safeData.deployed)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-slate-50/80 border border-slate-100 text-center h-full min-h-[130px]">
            <div className="h-9 w-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mb-1.5 shrink-0 ring-4 ring-emerald-50/50">
              <Wallet className="h-4 w-4 text-emerald-700" strokeWidth={1.8} />
            </div>
            <p className="text-xs font-semibold text-slate-700">No capital deployed</p>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Capital utilization metrics will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CapitalPositionCard;
