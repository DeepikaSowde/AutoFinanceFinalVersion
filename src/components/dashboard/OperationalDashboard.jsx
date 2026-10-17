import { useEffect, useMemo, useState } from 'react';
import { Banknote, BarChart3, CircleDollarSign, ClipboardList, CreditCard, Gauge, Landmark, PieChart as PieChartIcon, ShieldCheck, Users, Bell, Download } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency, formatCompactCurrency } from '../../utils/currencyFormatter';
import { calculateLoanOutstanding } from '../../utils/loanCalculations';
import { calculateVehicleLoanOverdue } from '../../utils/vehicleOverdueCalculation';
import MonthYearFilter, { matchesDashboardDate, matchesMonthYear } from './MonthYearFilter';

const cardClass = 'rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5';
const chartColors = ['#047857', '#d97706', '#64748b', '#be123c'];

const MetricCard = ({ icon: Icon, label, value, tone = 'emerald', helper }) => {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-lime-50 text-lime-700',
  };

  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <p className="min-w-0 text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="mt-3 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
      {helper && <p className="mt-1 text-[11px] text-slate-400">{helper}</p>}
    </div>
  );
};

const CurrencyTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {entry.dataKey === 'rate' ? `${Number(entry.value).toFixed(1)}%` : formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
};

const EmptyChart = ({ message }) => (
  <div className="flex h-full min-h-[190px] items-center justify-center text-center text-sm text-slate-400">{message}</div>
);

const OperationalDashboard = ({
  data,
  dateFilter,
  setDateFilter,
  selectedMonth = 'All',
  setSelectedMonth,
  selectedYear = 'All',
  setSelectedYear,
}) => {
  const operational = data?.operational;
  const [records, setRecords] = useState([]);
  const [payments, setPayments] = useState([]);

  const activeDateFilter = dateFilter || {
    filterType: (selectedMonth && selectedMonth !== 'All') || (selectedYear && selectedYear !== 'All') ? 'month' : 'all',
    selectedMonth: selectedMonth || 'All',
    selectedYear: selectedYear || 'All'
  };

  useEffect(() => {
    const loadDashboardRecords = () => {
      try {
        setRecords(JSON.parse(window.localStorage.getItem('motoLendCustomersList_data') || '[]'));
      } catch (error) {
        console.error('Failed to load operational dashboard loan records:', error);
        setRecords([]);
      }
      try {
        setPayments(JSON.parse(window.localStorage.getItem('motoLendPaymentHistory') || '[]'));
      } catch (error) {
        console.error('Failed to load operational dashboard payments:', error);
        setPayments([]);
      }
    };

    loadDashboardRecords();
    window.addEventListener('storage', loadDashboardRecords);
    return () => window.removeEventListener('storage', loadDashboardRecords);
  }, []);

  const dashboardOnlyData = useMemo(() => {
    const isFilterActive = activeDateFilter && activeDateFilter.filterType !== 'all';
    const matchesDate = (dateStr) => matchesDashboardDate(dateStr, activeDateFilter);

    const now = new Date();
    const isToday = (value) => {
      const date = new Date(value);
      return !Number.isNaN(date.getTime())
        && date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
    };
    const vehicleTypes = ['Two Wheeler', 'Three Wheeler', 'Four Wheeler'];
    const uniqueRecords = Array.from(new Map(records.map((record, index) => [
      String(record.loanId || record.loan?.loanId || `record-${index}`),
      record,
    ])).values());

    const filteredRecords = isFilterActive
      ? uniqueRecords.filter(r => matchesDate(r.customer?.applicationDate || r.loan?.applicationDate || r.createdAt || r.date))
      : uniqueRecords;

    const classifiedRecords = filteredRecords.map((record) => {
      const calculation = calculateLoanOutstanding(record, payments);
      const overdue = calculateVehicleLoanOverdue(record, payments);
      const rawStatus = String(record.status || record.loan?.status || '').toLowerCase();
      const vehicleStatus = String(record.vehicleStatus || record.vehicle?.status || '').toLowerCase();
      let status = 'Active';
      if (vehicleStatus === 'seized') status = 'Seized';
      else if (rawStatus === 'closed' || rawStatus === 'foreclosed' || calculation.outstandingAmount <= 0.01) status = 'Closed';
      else if (overdue.hasOverdue) status = 'Overdue';
      return { record, calculation, overdue, status };
    });
    const activeVehicleRecords = classifiedRecords
      .filter(({ status }) => status === 'Active')
      .map(({ record }) => record);
    const vehicleCounts = vehicleTypes.map((type) => ({
      name: type,
      value: activeVehicleRecords.filter((record) => {
        const currentType = String(record.vehicle?.type || record.vehicleType || '').toLowerCase();
        return currentType === type.toLowerCase();
      }).length,
    }));

    const collectionByMonth = new Map();
    classifiedRecords.forEach(({ calculation }) => {
      calculation.effectiveSchedule.forEach((installment) => {
        const dueDate = new Date(installment.dueDate);
        if (Number.isNaN(dueDate.getTime()) || dueDate.getTime() > new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) return;
        if (isFilterActive && !matchesDate(installment.dueDate)) return;
        const monthKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
        const current = collectionByMonth.get(monthKey) || {
          date: new Date(dueDate.getFullYear(), dueDate.getMonth(), 1),
          name: dueDate.toLocaleString('default', { month: 'short' }) + `-${String(dueDate.getFullYear()).slice(-2)}`,
          expected: 0,
          collected: 0,
        };
        current.expected += Number(installment.emi || 0);
        current.collected += Number(installment.amountPaid || 0);
        collectionByMonth.set(monthKey, current);
      });
    });
    const portfolioCounts = classifiedRecords.reduce((counts, { status }) => {
      counts[status] += 1;
      return counts;
    }, { Active: 0, Overdue: 0, Closed: 0, Seized: 0 });

    const collectionTrend = Array.from(collectionByMonth.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((item) => {
        const chartItem = { ...item };
        delete chartItem.date;
        return chartItem;
      });

    return {
      collectionToday: payments
        .filter((payment) => isToday(payment.date || payment.createdAt) && (!isFilterActive || matchesDate(payment.date || payment.createdAt)))
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      vehicleCounts,
      collectionTrend,
      collectionExpected: collectionTrend.reduce((sum, item) => sum + item.expected, 0),
      collectionCollected: collectionTrend.reduce((sum, item) => sum + item.collected, 0),
      portfolio: portfolioCounts,
      totalLoans: classifiedRecords.length,
    };
  }, [
    payments,
    records,
    activeDateFilter?.filterType,
    activeDateFilter?.startDate,
    activeDateFilter?.endDate,
    activeDateFilter?.selectedMonth,
    activeDateFilter?.selectedYear,
    activeDateFilter?.label
  ]);

  if (!operational) return null;

  const { keyMetrics, loanActivity, moneyMovement } = operational;
  const activeLoans = dashboardOnlyData.portfolio.Active + dashboardOnlyData.portfolio.Overdue;
  const collectionChartData = dashboardOnlyData.collectionTrend.map((item) => ({
    ...item,
    rate: item.expected > 0 ? (item.collected / item.expected) * 100 : 0,
  }));
  const loanDistribution = [
    { name: 'Active Loans', value: dashboardOnlyData.portfolio.Active, color: chartColors[0] },
    { name: 'Overdue Loans', value: dashboardOnlyData.portfolio.Overdue, color: chartColors[1] },
    { name: 'Closed Loans', value: dashboardOnlyData.portfolio.Closed, color: chartColors[2] },
    { name: 'Seized Vehicle Loans', value: dashboardOnlyData.portfolio.Seized, color: chartColors[3] },
  ];
  const totalVehicleLoans = dashboardOnlyData.vehicleCounts.reduce((sum, item) => sum + item.value, 0);
  const sectionHeadingClass = 'flex items-center gap-2';

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">Operational Dashboard</h1>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 self-stretch sm:self-auto justify-end flex-wrap">
          <MonthYearFilter
            dateFilter={activeDateFilter}
            setDateFilter={setDateFilter}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            selectedYear={selectedYear}
            setSelectedYear={setSelectedYear}
          />
          <button 
            aria-label="Notifications"
            className="bg-white border border-slate-200/80 rounded-lg p-2 text-slate-600 hover:bg-slate-50 cursor-not-allowed opacity-80 shadow-xs"
          >
            <Bell className="h-4 w-4" />
          </button>
          <button 
            className="bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-not-allowed opacity-80 shadow-xs"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Gauge className="h-5 w-5 text-emerald-700" />
          <h2 className="text-base font-bold text-slate-800">Key Metrics</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
          <MetricCard icon={Users} label="Total Customers" value={keyMetrics.activeCustomers.toLocaleString('en-IN')} tone="blue" />
          <MetricCard icon={ClipboardList} label="Total Active Loans" value={activeLoans.toLocaleString('en-IN')} />
          <MetricCard icon={ShieldCheck} label="Closed Loans" value={dashboardOnlyData.portfolio.Closed.toLocaleString('en-IN')} tone="blue" />
          <MetricCard icon={CircleDollarSign} label="Today's Collections" value={formatCurrency(dashboardOnlyData.collectionToday)} tone="violet" />
          <MetricCard icon={Gauge} label="Overdue Amount" value={formatCurrency(keyMetrics.overdueAmount)} tone="amber" />
        </div>
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(270px,0.72fr)_minmax(0,1.7fr)]">
      <section className={`${cardClass} min-w-0 overflow-hidden`}>
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-emerald-700" />
          <div>
            <h2 className="text-base font-bold text-slate-800">Loan Activity</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard icon={CircleDollarSign} label="New Loans Created" value={loanActivity.newLoans.toLocaleString('en-IN')} helper="First loan for a customer" />
          <MetricCard icon={CreditCard} label="Re-loans Created" value={loanActivity.reLoans.toLocaleString('en-IN')} helper="Additional loans for existing customers" tone="blue" />
        </div>
      </section>

        <section className={`${cardClass} min-w-0 overflow-hidden`}>
          <div className="mb-3">
            <div className={sectionHeadingClass}>
              <BarChart3 className="h-5 w-5 text-emerald-700" />
              <h2 className="text-base font-bold text-slate-800">Collection Performance</h2>
            </div>
          </div>
          {collectionChartData.length ? (
            <div className="h-[245px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={collectionChartData} margin={{ top: 8, right: 4, left: -15, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis yAxisId="amount" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatCompactCurrency} />
                  <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(value) => `${value}%`} />
                  <Tooltip content={<CurrencyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="amount" dataKey="expected" name="Expected Collections" fill="#34d399" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="amount" dataKey="collected" name="Actual Collections" fill="#047857" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="rate" dataKey="rate" name="Collection Rate" type="monotone" stroke="#65a30d" strokeWidth={2.5} dot={{ r: 3, fill: '#65a30d' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyChart message="No scheduled collections available." />}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-500">Collection Achievement</span>
            <span className="text-lg font-bold text-emerald-700">
              {(dashboardOnlyData.collectionExpected > 0
                ? (dashboardOnlyData.collectionCollected / dashboardOnlyData.collectionExpected) * 100
                : 0
              ).toFixed(1)}%
            </span>
          </div>
        </section>

      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
        <section className={`${cardClass} min-w-0 overflow-hidden`}>
          <div className={sectionHeadingClass}>
            <Banknote className="h-5 w-5 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-800">Money Movement</h2>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard icon={Banknote} label="Cash" value={formatCurrency(moneyMovement.cash)} />
            <MetricCard icon={CreditCard} label="UPI" value={formatCurrency(moneyMovement.upi)} tone="blue" />
            <MetricCard icon={Landmark} label="Bank Transfer" value={formatCurrency(moneyMovement.bankTransfer)} tone="violet" />
          </div>
          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-emerald-800">Total Money Movement</span>
              <span className="text-lg font-bold text-emerald-900">{formatCurrency(moneyMovement.total)}</span>
            </div>
          </div>
        </section>

      <section className={`${cardClass} min-w-0 overflow-hidden`}>
        <div className="mb-4">
          <div className={sectionHeadingClass}>
            <PieChartIcon className="h-5 w-5 text-emerald-700" />
            <h2 className="text-base font-bold text-slate-800">Loan Portfolio</h2>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.1fr)]">
          <div className="flex min-w-0 flex-col items-center justify-center">
            <div className="h-[220px] w-full max-w-[280px]">
              {loanDistribution.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={loanDistribution} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3}>
                      {loanDistribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyChart message="No loan data available." />}
            </div>
            <p className="text-xs text-slate-500">Total Loans</p>
            <p className="text-2xl font-bold text-slate-900">{dashboardOnlyData.totalLoans.toLocaleString('en-IN')}</p>
          </div>
          <div className="grid content-center gap-2 sm:grid-cols-2">
            {loanDistribution.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="ml-2 font-semibold text-slate-800">{item.value.toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div className="mt-2 border-t border-slate-100 pt-3 sm:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Vehicle Type</h3>
                <span className="text-xs text-slate-400">{totalVehicleLoans.toLocaleString('en-IN')} loans</span>
              </div>
              <div className="space-y-2">
                {dashboardOnlyData.vehicleCounts.map((item) => {
                  return (
                    <div key={item.name} className="flex items-center gap-3 text-xs">
                      <span className="w-24 shrink-0 text-slate-500">{item.name}</span>
                      <span className="ml-auto font-semibold text-slate-700">{item.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
    </div>
  );
};

export default OperationalDashboard;
