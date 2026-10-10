import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { getSessionUser, logout } from '../services/api'
import { useTranslation } from 'react-i18next'
import {
  Menu,
  X,
  ChevronRight,
  ChevronLeft,
  LayoutDashboard,
  HandCoins,
  WalletCards,
  ReceiptText,
  UsersRound,
  Landmark,
  UserCog,
  BellRing,
  LogOut,
  UserRound,
  PanelLeftClose,
  PanelLeftOpen,
  Car
} from 'lucide-react'

const Sidebar = ({ onCollapsedChange }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth >= 640 && window.innerWidth < 1024)
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentUser = getSessionUser()
  const isAdmin = currentUser?.role === 'admin'

  const handleSignOut = () => {
    logout()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    const getBreakpoint = (width) => {
      if (width >= 1024) return 'desktop'
      if (width >= 640) return 'tablet'
      return 'mobile'
    }

    let lastBreakpoint = getBreakpoint(window.innerWidth)

    const handleResize = () => {
      const currentBreakpoint = getBreakpoint(window.innerWidth)
      if (currentBreakpoint !== lastBreakpoint) {
        lastBreakpoint = currentBreakpoint
        
        if (currentBreakpoint === 'desktop') {
          setIsCollapsed(false)
          onCollapsedChange(false)
          setIsOpen(false)
        } else if (currentBreakpoint === 'tablet') {
          setIsCollapsed(true)
          onCollapsedChange(true)
          setIsOpen(false)
        } else {
          setIsCollapsed(false)
          onCollapsedChange(false)
          setIsOpen(false)
        }
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [onCollapsedChange])

  const toggleCollapsed = () => {
    const next = !isCollapsed
    setIsCollapsed(next)
    onCollapsedChange(next)
  }

  const navLinkClasses = ({ isActive }) =>
    `group flex items-center rounded-lg py-1.5 xl:py-2 text-[13px] transition-all duration-200 ${isActive
      ? 'bg-[#006B52] text-[#FFFFFF] font-semibold shadow-sm'
      : 'text-[#A8D5C8] font-medium hover:bg-[#005344] hover:text-[#FFFFFF]'
    } ${isCollapsed ? 'justify-center px-2' : 'px-3 gap-3'}`

  const iconClasses = "h-[18px] w-[18px] shrink-0 transition-colors duration-200"

  const renderIcon = (IconComponent, isActive) => (
    <IconComponent
      className={`${iconClasses} ${isActive ? 'text-[#39D6A3]' : 'text-[#A8D5C8] group-hover:text-[#39D6A3]'}`}
      strokeWidth={isActive ? 2.5 : 2}
    />
  )

  const SectionLabel = ({ label }) => (
    <div className={`px-3 mb-1 mt-2 xl:mt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#46D8AE] transition-opacity duration-200 ${isCollapsed ? 'opacity-0 h-0 overflow-hidden m-0' : 'opacity-100'}`}>
      {label}
    </div>
  )

  const mainItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  ]

  const moduleItems = [
    { name: 'Loan', path: '/newloan', icon: HandCoins },
    { name: 'Collection', path: '/collection', icon: WalletCards },
    { name: 'Vehicle', path: '/vehicle', icon: Car },
    { name: 'Ledger', path: '/ledger', icon: ReceiptText },
    { name: 'Customer', path: '/customers', icon: UsersRound },
    { name: 'Investor', path: '/investors', icon: Landmark },
  ]

  // Only admins manage users (the server enforces this too).
  const userItems = isAdmin ? [
    { name: 'User Management', path: '/users', icon: UserCog },
  ] : []

  const notificationItems = [
    { name: 'Reminder', path: '/reminders', icon: BellRing },
  ]

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-lg bg-[#006B52] p-2.5 text-[#FFFFFF] shadow-md hover:bg-[#005344] focus:outline-none focus:ring-2 focus:ring-[#39D6A3] sm:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm sm:hidden"
          aria-label="Close navigation menu"
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-[100dvh] flex flex-col border-r border-[#145247] bg-[#003C32] p-4 text-[#E8F5F1] shadow-xl transition-all duration-300 sm:translate-x-0 sm:shadow-none ${isCollapsed ? 'w-20' : 'w-64'
          } ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className={`mb-3 xl:mb-5 flex items-start px-2 ${isCollapsed ? 'justify-center' : 'justify-between'} shrink-0`}>
          <div className="overflow-hidden">
            <div className={`flex items-center gap-3 text-xl font-bold tracking-tight ${isCollapsed ? 'justify-center' : ''}`}>
              <img
                src="/Motolend_logo.png"
                alt="MotoLend logo"
                className="h-8 w-8 rounded-lg object-contain bg-white/10"
              />
              <span className={`whitespace-nowrap transition-opacity duration-200 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>
                <span className="text-[#E8F5F1]">Moto</span>
                <span className="text-[#39D6A3]">Lend</span>
              </span>
            </div>
            {!isCollapsed && (
              <p className="mt-1.5 pl-11 text-[9px] font-bold tracking-[0.15em] text-[#A8D5C8] whitespace-nowrap">
                POWERING SMARTER FINANCE
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg p-2 text-[#A8D5C8] hover:bg-[#005344] hover:text-[#FFFFFF] transition-colors sm:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-between overflow-hidden pb-2">
          {/* Top Navigation */}
          <div className="flex flex-col space-y-0.5 xl:space-y-1">
            <SectionLabel label="MAIN" />
            <div className="space-y-0.5 xl:space-y-1">
              {mainItems.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={navLinkClasses}
                  title={isCollapsed ? item.name : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {renderIcon(item.icon, isActive)}
                      <span className={`whitespace-nowrap ${isCollapsed ? 'hidden' : ''}`}>{item.name}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>

            <SectionLabel label="MODULES" />
            <div className={`space-y-0.5 xl:space-y-1 ${isCollapsed ? '' : 'pl-3'}`}>
              {moduleItems.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={navLinkClasses}
                  title={isCollapsed ? item.name : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {renderIcon(item.icon, isActive)}
                      <span className={`whitespace-nowrap ${isCollapsed ? 'hidden' : ''}`}>{item.name}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>

          {/* Bottom Area */}
          <div className="shrink-0 flex flex-col gap-1 xl:gap-2 pt-2">
            <SectionLabel label="NOTIFICATIONS" />
            <div className="space-y-0.5 xl:space-y-1 mb-1">
              {notificationItems.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={navLinkClasses}
                  title={isCollapsed ? item.name : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {renderIcon(item.icon, isActive)}
                      <span className={`whitespace-nowrap ${isCollapsed ? 'hidden' : ''}`}>{item.name}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>

            <div className="mt-1 xl:mt-2 pt-2 xl:pt-3 border-t border-[#145247] flex flex-col gap-2 xl:gap-3">
              <SectionLabel label="USER" />

              {/* User Management Item */}
              <div className="-mt-1 space-y-0.5 xl:space-y-1">
                {userItems.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.path}
                    onClick={() => setIsOpen(false)}
                    className={navLinkClasses}
                    title={isCollapsed ? item.name : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        {renderIcon(item.icon, isActive)}
                        <span className={`whitespace-nowrap ${isCollapsed ? 'hidden' : ''}`}>{item.name}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>

              {/* Admin Profile Card */}
              <div className={`flex items-center gap-3 rounded-xl bg-[#005344] border border-[#145247] p-2.5 transition-all duration-300 ${isCollapsed ? 'justify-center' : ''}`}>
                <div className="h-8 w-8 rounded-full bg-[#006B52] flex items-center justify-center shrink-0 shadow-inner">
                  <UserRound className="h-4 w-4 text-[#39D6A3]" />
                </div>
                {!isCollapsed && (
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-[12px] font-bold text-[#E8F5F1] leading-tight truncate">{currentUser?.name || 'User'}</span>
                    <span className="text-[10px] font-medium text-[#A8D5C8] truncate">{isAdmin ? 'Administrator' : 'Staff'}</span>
                  </div>
                )}
              </div>

              {/* Sign Out Button */}
              <button
                type="button"
                onClick={handleSignOut}
                className={`flex items-center rounded-lg bg-[#EF1111] hover:bg-red-700 text-[#FFFFFF] transition-colors duration-200 shadow-sm ${isCollapsed ? 'justify-center p-2 mx-auto w-10 h-10' : 'justify-center px-3 py-2 w-full'
                  }`}
                title={isCollapsed ? 'Sign Out' : undefined}
              >
                {isCollapsed ? (
                  <LogOut className="h-[16px] w-[16px] shrink-0 text-[#FFFFFF]" />
                ) : (
                  <span className="text-[13px] font-medium whitespace-nowrap text-[#FFFFFF]">Sign Out</span>
                )}
              </button>

              {/* Collapse Button */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="p-1.5 rounded-lg text-[#A8D5C8] hover:text-[#E8F5F1] hover:bg-[#005344] transition-all duration-200"
                  aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {isCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4 shrink-0" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4 shrink-0" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
