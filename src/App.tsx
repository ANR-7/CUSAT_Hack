import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bell,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Gauge,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import {
  apiRequest,
  getStoredOrgId,
  getStoredToken,
  setStoredOrgId,
  setStoredToken,
} from './api';
import { Organization, Profile } from '../server/types';
import { AuthScreen } from './components/AuthScreen';
import { OnboardingModal } from './components/OnboardingModal';
import { OverviewView } from './components/OverviewView';
import { CustomersView } from './components/CustomersView';
import { PlansView, SubscriptionsView } from './components/SubscriptionsPlansView';
import { InvoicesView, PaymentsView } from './components/InvoicesPaymentsView';
import { BusinessSimulatorView, RevenueCopilotView } from './components/CopilotSimulatorView';
import { SettingsView } from './components/SettingsView';

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('revive_theme') as 'dark' | 'light') || 'dark'
  );
  const [authChecking, setAuthChecking] = useState(true);
  const [user, setUser] = useState<Profile | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [integrations, setIntegrations] = useState({
    supabase: false,
    openai: false,
    razorpay: false,
    email: false,
  });

  const [page, setPage] = useState('Overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [creatingNewOrg, setCreatingNewOrg] = useState(false);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [toast, setToast] = useState('');

  // Workspace Data State
  const [range, setRange] = useState('12m');
  const [customFrom, setCustomFrom] = useState('2026-05-01');
  const [customTo, setCustomTo] = useState('2026-10-31');
  const [overviewData, setOverviewData] = useState<any | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [openSubModalNext, setOpenSubModalNext] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('revive_theme', theme);
  }, [theme]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    if (!getStoredToken() || !getStoredOrgId()) return;
    try {
      const rangeParams = new URLSearchParams({ range });
      if (range === 'custom') {
        rangeParams.set('from', customFrom);
        rangeParams.set('to', customTo);
      }

      const [ovRes, custRes, planRes, subRes, invRes, payRes] = await Promise.all([
        apiRequest(`/api/analytics/overview?${rangeParams.toString()}`),
        apiRequest('/api/customers?limit=100'),
        apiRequest('/api/plans'),
        apiRequest('/api/subscriptions'),
        apiRequest('/api/invoices'),
        apiRequest('/api/payments'),
      ]);

      setOverviewData(ovRes);
      if (ovRes.organization) {
        setActiveOrg(ovRes.organization);
      }
      setCustomers(custRes.customers || []);
      setPlans(planRes.plans || []);
      setSubscriptions(subRes.subscriptions || []);
      setInvoices(invRes.invoices || []);
      setPayments(payRes.payments || []);
    } catch (err: any) {
      if (err.status === 401) {
        setStoredToken(null);
        setUser(null);
      }
    }
  }, [range, customFrom, customTo]);

  // Initial session check (auto-login to Demo Workspace if no stored session so first load works seamlessly while supporting full logout/login)
  useEffect(() => {
    const initSession = async () => {
      setAuthChecking(true);
      try {
        const existingToken = getStoredToken();
        if (existingToken) {
          const me = await apiRequest('/api/auth/me');
          setUser(me.user);
          setOrganizations(me.organizations || []);
          const org = me.activeOrganization || me.organizations?.[0] || null;
          setActiveOrg(org);
          if (org) setStoredOrgId(org.id);
          if (me.integrations) setIntegrations(me.integrations);
        } else {
          // Auto-initialize Demo Workspace session on first visit
          const demo = await apiRequest('/api/auth/demo-login', { method: 'POST' });
          setStoredToken(demo.token);
          if (demo.activeOrganization?.id) {
            setStoredOrgId(demo.activeOrganization.id);
          }
          setUser(demo.user);
          setOrganizations(demo.organizations || []);
          setActiveOrg(demo.activeOrganization || null);
          const me = await apiRequest('/api/auth/me');
          if (me.integrations) setIntegrations(me.integrations);
        }
      } catch {
        setStoredToken(null);
        setUser(null);
      } finally {
        setAuthChecking(false);
      }
    };
    initSession();
  }, []);

  useEffect(() => {
    if (user && activeOrg) {
      loadWorkspaceData();
    }
  }, [user, activeOrg?.id, loadWorkspaceData]);

  const handleLogout = () => {
    setStoredToken(null);
    setStoredOrgId(null);
    setUser(null);
    setActiveOrg(null);
    setOverviewData(null);
    notify('Signed out of workspace');
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'PUT' });
      loadWorkspaceData();
    } catch {
      // ignore
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      notify('All notifications marked as read');
      loadWorkspaceData();
    } catch {
      // ignore
    }
  };

  if (authChecking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--bg-app)',
          color: 'var(--text-secondary)',
        }}
      >
        Initializing Revive Subscription Intelligence...
      </div>
    );
  }

  if (!user || !activeOrg) {
    return (
      <AuthScreen
        onAuthenticated={async ({
          user: authedUser,
          organizations: orgs,
          activeOrganization,
          isNewOnboarding,
        }) => {
          setUser(authedUser);
          setOrganizations(orgs);
          setActiveOrg(activeOrganization);
          if (activeOrganization) {
            setStoredOrgId(activeOrganization.id);
          }
          if (isNewOnboarding) {
            setCreatingNewOrg(false);
            setShowOnboardingModal(true);
          }
          try {
            const me = await apiRequest('/api/auth/me');
            if (me.integrations) setIntegrations(me.integrations);
          } catch {
            // ignore
          }
        }}
      />
    );
  }

  const navItems: Array<{ section: string; items: Array<[string, any]> }> = [
    {
      section: 'OPERATIONS',
      items: [
        ['Overview', Gauge],
        ['Customers', Users],
        ['Subscriptions', RefreshCw],
        ['Plans & products', Package],
        ['Invoices', Receipt],
        ['Payments', CreditCard],
      ],
    },
    {
      section: 'INTELLIGENCE',
      items: [
        ['Revenue intelligence', BrainCircuit],
        ['Business simulator', Activity],
      ],
    },
  ];

  const unreadCount = (overviewData?.notifications || []).filter((n: any) => !n.is_read).length;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Activity size={16} />
          </div>
          <div>
            <div className="brand-name">
              revive<span>.</span>
            </div>
            <div className="brand-sub">SUBSCRIPTION INTELLIGENCE</div>
          </div>
          <button
            type="button"
            className="mobile-close icon-button"
            style={{ marginLeft: 'auto' }}
            onClick={() => setMobileNav(false)}
          >
            <X size={16} />
          </button>
        </div>

        {/* Organization Switcher */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="workspace-switch"
            onClick={() => setShowOrgSwitcher(!showOrgSwitcher)}
          >
            <div className="workspace-avatar">
              {activeOrg.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="workspace-copy">
              <strong>{activeOrg.name}</strong>
              <span>
                {activeOrg.business_type} · {activeOrg.currency}
              </span>
            </div>
            <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
          </button>

          {showOrgSwitcher && (
            <div
              className="panel"
              style={{
                position: 'absolute',
                left: 4,
                right: 4,
                top: 52,
                zIndex: 45,
                padding: 6,
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  padding: '4px 8px',
                }}
              >
                ORGANIZATIONS
              </div>
              {organizations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  className={`nav-item ${org.id === activeOrg.id ? 'active' : ''}`}
                  style={{ height: 32 }}
                  onClick={() => {
                    setStoredOrgId(org.id);
                    setActiveOrg(org);
                    setShowOrgSwitcher(false);
                    notify(`Switched to ${org.name}`);
                  }}
                >
                  <Building2 size={13} />
                  <span>{org.name}</span>
                </button>
              ))}
              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  marginTop: 4,
                  paddingTop: 4,
                }}
              >
                <button
                  type="button"
                  className="nav-item"
                  style={{ height: 32, color: 'var(--accent-primary)' }}
                  onClick={() => {
                    setShowOrgSwitcher(false);
                    setCreatingNewOrg(true);
                    setShowOnboardingModal(true);
                  }}
                >
                  <Plus size={13} />
                  <span>New Organization</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="nav-wrap">
          {navItems.map((group) => (
            <div className="nav-group" key={group.section}>
              <div className="nav-label">{group.section}</div>
              {group.items.map(([label, Icon]) => (
                <button
                  key={label}
                  type="button"
                  className={`nav-item ${page === label ? 'active' : ''}`}
                  onClick={() => {
                    setPage(label);
                    setMobileNav(false);
                  }}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                  {label === 'Revenue intelligence' && <span className="nav-badge">AI</span>}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="env-status-box">
            <div className="env-status-header">
              <span>Runtime Mode</span>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 0,
                  color: 'var(--accent-primary)',
                  fontSize: 10,
                  padding: 0,
                }}
                onClick={async () => {
                  await apiRequest('/api/demo/reset', { method: 'POST' });
                  notify('Demo data reset to clean baseline');
                  loadWorkspaceData();
                }}
                title="Reset Demo Data"
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>
            <div className="env-pills">
              <span className={`env-pill ${integrations.supabase ? 'live' : ''}`}>
                DB: {integrations.supabase ? 'Supabase' : 'Local Persist'}
              </span>
              <span className={`env-pill ${integrations.razorpay ? 'live' : ''}`}>
                Pay: {integrations.razorpay ? 'Razorpay' : 'Test/Demo'}
              </span>
              <span className={`env-pill ${integrations.openai ? 'live' : ''}`}>
                AI: {integrations.openai ? 'OpenAI' : 'Analytics'}
              </span>
            </div>
          </div>

          <button
            type="button"
            className={`nav-item ${page === 'Settings' ? 'active' : ''}`}
            onClick={() => {
              setPage('Settings');
              setMobileNav(false);
            }}
          >
            <Settings size={15} />
            <span>Settings & Integrations</span>
          </button>

          <div className="profile-bar">
            <div className="profile-avatar">
              {user.full_name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <div className="profile-copy">
              <strong>{user.full_name}</strong>
              <span>{user.email}</span>
            </div>
            <button
              type="button"
              className="icon-button"
              style={{ width: 28, height: 28 }}
              onClick={handleLogout}
              title="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>

      {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="mobile-menu icon-button"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={17} />
            </button>
            <div className="breadcrumbs">
              <span>{activeOrg.name}</span>
              <span>/</span>
              <strong>{page}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <div className="global-search">
              <Search size={14} />
              <input
                placeholder="Search customers, plans, invoices..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && globalSearch.trim()) {
                    setCustomerSearch(globalSearch.trim());
                    setPage('Customers');
                  }
                }}
              />
              <kbd>↵</kbd>
            </div>

            <button
              type="button"
              className="icon-button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <button
              type="button"
              className="icon-button"
              onClick={() => setShowNotificationsDrawer(!showNotificationsDrawer)}
              title="Notifications"
            >
              <Bell size={15} />
              {unreadCount > 0 && <span className="notification-dot" />}
            </button>
          </div>
        </header>

        <div className="page-content">
          {page === 'Overview' && (
            <OverviewView
              organization={activeOrg}
              overviewData={overviewData}
              invoices={invoices}
              range={range}
              setRange={setRange}
              customFrom={customFrom}
              setCustomFrom={setCustomFrom}
              customTo={customTo}
              setCustomTo={setCustomTo}
              onNavigate={setPage}
              onMarkNotificationRead={handleMarkNotificationRead}
              onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
              onOpenNewCustomer={() => setPage('Customers')}
              onOpenNewSubscription={() => {
                setOpenSubModalNext(true);
                setPage('Subscriptions');
              }}
            />
          )}

          {page === 'Customers' && (
            <CustomersView
              organization={activeOrg}
              plans={plans}
              searchQuery={customerSearch}
              setSearchQuery={setCustomerSearch}
              onDataMutated={loadWorkspaceData}
              notify={notify}
            />
          )}

          {page === 'Subscriptions' && (
            <SubscriptionsView
              organization={activeOrg}
              subscriptions={subscriptions}
              customers={customers}
              plans={plans}
              openCreateInitially={openSubModalNext}
              onClearOpenCreate={() => setOpenSubModalNext(false)}
              onDataMutated={loadWorkspaceData}
              notify={notify}
            />
          )}

          {page === 'Plans & products' && (
            <PlansView
              organization={activeOrg}
              plans={plans}
              onDataMutated={loadWorkspaceData}
              notify={notify}
            />
          )}

          {page === 'Invoices' && (
            <InvoicesView
              organization={activeOrg}
              invoices={invoices}
              customers={customers}
              subscriptions={subscriptions}
              onDataMutated={loadWorkspaceData}
              notify={notify}
            />
          )}

          {page === 'Payments' && (
            <PaymentsView
              organization={activeOrg}
              payments={payments}
              invoices={invoices}
              razorpayConfigured={integrations.razorpay}
              onDataMutated={loadWorkspaceData}
              notify={notify}
            />
          )}

          {page === 'Revenue intelligence' && (
            <RevenueCopilotView
              organization={activeOrg}
              openaiConfigured={integrations.openai}
              overviewData={overviewData}
              customers={customers}
              onNavigate={setPage}
              notify={notify}
            />
          )}

          {page === 'Business simulator' && (
            <BusinessSimulatorView
              organization={activeOrg}
              overviewData={overviewData}
              notify={notify}
            />
          )}

          {page === 'Settings' && (
            <SettingsView
              user={user}
              organization={activeOrg}
              integrations={integrations}
              onUpdated={async () => {
                const me = await apiRequest('/api/auth/me');
                setUser(me.user);
                setOrganizations(me.organizations || []);
                if (me.activeOrganization) setActiveOrg(me.activeOrganization);
                loadWorkspaceData();
              }}
              notify={notify}
            />
          )}
        </div>
      </main>

      {showOnboardingModal && (
        <OnboardingModal
          organization={creatingNewOrg ? null : activeOrg}
          isCreatingNew={creatingNewOrg}
          onClose={() => setShowOnboardingModal(false)}
          onCompleted={async (org) => {
            setShowOnboardingModal(false);
            const me = await apiRequest('/api/auth/me');
            setOrganizations(me.organizations || []);
            setActiveOrg(org);
            setStoredOrgId(org.id);
            notify(`Organization "${org.name}" configured`);
            loadWorkspaceData();
          }}
        />
      )}

      {showNotificationsDrawer && (
        <div
          className="modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setShowNotificationsDrawer(false)}
        >
          <div className="modal">
            <div className="modal-header">
              <h2>Workspace Notifications ({unreadCount} unread)</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowNotificationsDrawer(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(overviewData?.notifications || []).length === 0 ? (
                <div className="empty-state">
                  <p>No notifications yet.</p>
                </div>
              ) : (
                (overviewData?.notifications || []).map((n: any) => (
                  <div
                    key={n.id}
                    style={{
                      padding: 12,
                      borderRadius: 6,
                      border: '1px solid var(--border-subtle)',
                      background: n.is_read ? 'var(--bg-subtle)' : 'var(--bg-surface-elevated)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 12 }}>{n.title}</strong>
                      {!n.is_read && (
                        <button
                          type="button"
                          className="mini-action"
                          onClick={() => handleMarkNotificationRead(n.id)}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: 11.5,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {n.message}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast">
          <CheckCircle2 size={15} style={{ color: 'var(--status-success)' }} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

