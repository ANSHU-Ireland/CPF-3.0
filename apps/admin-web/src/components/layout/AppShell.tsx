import { useState, useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  LogOut,
  User,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';
import { iconMap, type NavGroup } from '@/lib/routes';
import { useAuth } from '@/lib/auth';
import { IconButton } from '@/components/ui/Button';

interface AppShellProps {
  navGroups: NavGroup[];
  orgSwitcher?: { current: string; options: Array<{ id: string; name: string }>; onSwitch: (id: string) => void };
  children: ReactNode;
  /** Max width: 'dashboard' | 'reading' | 'full' */
  maxWidth?: 'dashboard' | 'reading' | 'full';
}

export function AppShell({ navGroups, orgSwitcher, children, maxWidth = 'dashboard' }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const accountRef = useRef<HTMLDivElement>(null);
  const orgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
      if (orgRef.current && !orgRef.current.contains(e.target as Node)) {
        setOrgMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const maxW = maxWidth === 'dashboard' ? 'max-w-dashboard' : maxWidth === 'reading' ? 'max-w-reading mx-auto' : 'w-full';

  const sidebar = (
    <nav aria-label="Primary" className="flex flex-col h-full bg-surface border-r border-border">
      <div className="flex items-center justify-between p-4 border-b border-border h-16 flex-shrink-0">
        <Link to="/" className="flex items-center gap-2.5" aria-label="CPF home">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          {!collapsed && <span className="font-bold text-ink text-lg">CPF</span>}
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex text-ink-secondary hover:text-ink p-1.5 rounded-control hover:bg-surface-subtle"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-6">
            {!collapsed && (
              <h3 className="px-4 mb-2 text-xs font-semibold text-ink-secondary uppercase tracking-wider">
                {group.label}
              </h3>
            )}
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const Icon = iconMap[item.icon] ?? HelpCircle;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
                          collapsed ? 'justify-center' : ''
                        } ${
                          isActive
                            ? 'bg-brand/10 text-brand'
                            : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink'
                        }`
                      }
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" aria-hidden />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen bg-page-bg overflow-hidden">
      <a href="#main-content" className="cpf-skip-link">Skip to main content</a>

      {/* Desktop sidebar */}
      <div
        className={`hidden lg:block flex-shrink-0 transition-all duration-200 ${collapsed ? 'w-20' : 'w-64'}`}
      >
        {sidebar}
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-slide-in-right">
            <div className="flex items-center justify-end p-2">
              <IconButton label="Close navigation" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            {sidebar}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-4 px-4 sm:px-6 h-16 bg-surface border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <IconButton
              label="Open navigation"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </IconButton>
            {orgSwitcher && (
              <div ref={orgRef} className="relative">
                <button
                  onClick={() => setOrgMenuOpen(!orgMenuOpen)}
                  className="flex items-center gap-2 rounded-control px-3 py-2 text-sm font-medium text-ink hover:bg-surface-subtle min-h-[44px]"
                  aria-haspopup="menu"
                  aria-expanded={orgMenuOpen}
                >
                  <span className="truncate max-w-[160px]">{orgSwitcher.current}</span>
                  <ChevronDown className="h-4 w-4 text-ink-secondary flex-shrink-0" />
                </button>
                {orgMenuOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full mt-1 w-64 rounded-card border border-border bg-surface shadow-elevated py-1 z-40"
                  >
                    <p className="px-3 py-1.5 text-xs font-semibold text-ink-secondary uppercase">Switch organisation</p>
                    {orgSwitcher.options.map((opt) => (
                      <button
                        key={opt.id}
                        role="menuitem"
                        onClick={() => {
                          orgSwitcher.onSwitch(opt.id);
                          setOrgMenuOpen(false);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-surface-subtle text-left"
                      >
                        {opt.name}
                        {opt.name === orgSwitcher.current && (
                          <span className="ml-auto text-brand text-xs">Current</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <IconButton label="Help" onClick={() => navigate('/help')}>
              <HelpCircle className="h-5 w-5" />
            </IconButton>
            <div ref={accountRef} className="relative">
              <button
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-surface-subtle min-h-[44px]"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                aria-label="Account menu"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand text-sm font-semibold">
                  {session?.displayName?.charAt(0).toUpperCase() ?? <User className="h-4 w-4" />}
                </span>
                <span className="hidden sm:block text-sm text-ink max-w-[120px] truncate">
                  {session?.displayName ?? 'Account'}
                </span>
                <ChevronDown className="h-4 w-4 text-ink-secondary" />
              </button>
              {accountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 w-56 rounded-card border border-border bg-surface shadow-elevated py-1 z-40"
                >
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium text-ink truncate">{session?.displayName}</p>
                    <p className="text-xs text-ink-secondary truncate">{session?.email}</p>
                    {session?.mfaEnrolled && (
                      <p className="text-xs text-status-success mt-1 flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> MFA active
                      </p>
                    )}
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => {
                      navigate('/account/security');
                      setAccountMenuOpen(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-ink hover:bg-surface-subtle text-left"
                  >
                    <User className="h-4 w-4" /> Account & security
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      signOut();
                      navigate('/login');
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-status-danger hover:bg-surface-subtle text-left"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="main-content" className={`flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 ${maxW}`} tabIndex={-1}>
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
