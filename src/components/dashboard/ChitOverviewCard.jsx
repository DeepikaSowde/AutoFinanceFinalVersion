import { Users } from 'lucide-react';
import { formatCurrency } from '../../utils/currencyFormatter';
import DashboardEmptyState from './DashboardEmptyState';

const ChitOverviewCard = ({ data }) => {
  const hasData = Boolean(
    data && 
    Object.keys(data).length > 0 && 
    (Number(data.paid || 0) > 0 || Number(data.amount || 0) > 0 || Number(data.investment || 0) > 0 || Number(data.inward || 0) > 0)
  );

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm flex flex-col h-[360px] min-h-[360px] col-span-1 lg:col-span-4 w-full min-w-0">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-emerald-700" strokeWidth={1.8} />
          </div>
          <h3 className="text-base font-bold text-slate-800">Chit Overview</h3>
        </div>
        <span className="text-xs text-emerald-600 font-medium cursor-not-allowed hover:text-emerald-700 select-none">
          View Details &rarr;
        </span>
      </div>

      {!hasData ? (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <DashboardEmptyState
            icon={Users}
            title="No chit records available."
            subtitle="Chit details will appear here when records are added."
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between min-h-0 py-2">
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
              <span className="text-slate-600">Chit Paid</span>
              <span className="font-medium text-slate-800">{formatCurrency(data.paid)}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
              <span className="text-slate-600">Chit Amount</span>
              <span className="font-medium text-slate-800">{formatCurrency(data.amount)}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
              <span className="text-slate-600">Chit Investment</span>
              <span className="font-medium text-slate-800">{formatCurrency(data.investment)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">Chit Inward</span>
              <span className="font-medium text-slate-800">{formatCurrency(data.inward)}</span>
            </div>
          </div>
          
          {Number(data.paid || 0) > 0 && Number(data.amount || 0) > 0 && (
            <div className="mt-4 pt-2 border-t border-slate-50">
              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                <div 
                  className="bg-emerald-700 h-1.5 rounded-full transition-all duration-300" 
                  style={{ width: `${Math.min((Number(data.paid) / Number(data.amount)) * 100, 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>Paid vs Received</span>
                <span>{formatCurrency(data.paid)} / {formatCurrency(data.amount)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChitOverviewCard;
