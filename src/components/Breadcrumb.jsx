import { useLocation, Link } from 'react-router-dom';

const ROUTE_LABELS = {
  '/dashboard': 'Dashboard',
  '/loans': 'Loans',
  '/newloan': 'Loan',
  '/customers': 'Customers',
  '/investors': 'Investors',
  '/ledger': 'Ledger',
  '/collection': 'Collection',
  '/vehicle': 'Vehicle',
  '/users': 'User Management',
  '/reminders': 'Reminder',
};

const Breadcrumb = () => {
  const location = useLocation();
  const currentPath = location.pathname;
  
  // Find matching label or format pathname
  const pageTitle = ROUTE_LABELS[currentPath] || 
    (currentPath.length > 1 
      ? currentPath.slice(1).split('/')[0].charAt(0).toUpperCase() + currentPath.slice(1).split('/')[0].slice(1)
      : 'Dashboard');

  return (
    <nav 
      aria-label="Breadcrumb" 
      className="sm:hidden flex items-center min-h-[48px] px-4 pl-16 pt-3 pb-1 bg-transparent select-none shrink-0"
    >
      <div className="flex items-center gap-1.5 min-w-0 overflow-hidden text-xs text-slate-500">
        <Link 
          to="/dashboard" 
          className="text-slate-400 hover:text-emerald-700 transition-colors shrink-0 font-medium"
        >
          Home
        </Link>
        <span className="text-slate-300 shrink-0 select-none">/</span>
        <span className="font-medium text-slate-600 truncate" title={pageTitle}>
          {pageTitle}
        </span>
      </div>
    </nav>
  );
};

export default Breadcrumb;
