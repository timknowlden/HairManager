import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaPlus, FaList, FaMapMarkerAlt, FaCut, FaUser, FaSignOutAlt, FaChartLine, FaEnvelope, FaUserShield, FaArrowLeft, FaEye, FaCrown, FaBars, FaTimes } from 'react-icons/fa';
import { useAuth } from './contexts/AuthContext';
import EntryForm from './components/EntryForm';
import AppointmentsList from './components/AppointmentsList';
import LocationsManager from './components/LocationsManager';
import ServicesManager from './components/ServicesManager';
import AdminManager from './components/AdminManager';
import SuperAdminManager from './components/SuperAdminManager';
import Invoice from './components/Invoice';
import Financial from './components/Financial';
import EmailLogs from './components/EmailLogs';
import Login from './components/Login';
import UsageIndicator from './components/UsageIndicator';
import MyPlan from './components/MyPlan';
import './App.css';
import { API_BASE } from './config.js';

function App() {
      const navigate = useNavigate();
      const location = useLocation();
      const { isAuthenticated, loading, user, logout, getAuthHeaders, isSuperAdmin } = useAuth();
      const [impersonation, setImpersonation] = useState(null);
      const [userPlan, setUserPlan] = useState(null);
      const [isLoadingPlan, setIsLoadingPlan] = useState(true);
      
      // Map URL paths to tab names
      const pathToTab = {
        '/entry': 'entry',
        '/appointments': 'list',
        '/locations': 'locations',
        '/services': 'services',
        '/financial': 'financial',
        '/super-admin': 'super-admin',
        '/invoice': 'invoice',
        '/email-logs': 'email-logs',
        '/my-plan': 'my-plan'
      };
      
      // Get active tab from URL
      const activeTab = pathToTab[location.pathname] || 'list';
      
      // Check for impersonation data on mount
      useEffect(() => {
        const impersonationData = localStorage.getItem('impersonation');
        if (impersonationData) {
          setImpersonation(JSON.parse(impersonationData));
        }
      }, []);

      // Fetch user's subscription plan
      useEffect(() => {
        const fetchUserPlan = async () => {
          if (!isAuthenticated) {
            setUserPlan(null);
            setIsLoadingPlan(false);
            return;
          }
          setIsLoadingPlan(true);
          try {
            const response = await fetch(`${API_BASE}/subscriptions/usage`, {
              headers: getAuthHeaders()
            });
            if (response.ok) {
              const data = await response.json();
              console.log('[App.jsx] Subscription usage data:', data);
              console.log('[App.jsx] Plan data:', data.plan);
              if (data.plan) {
                setUserPlan(data.plan);
              } else {
                console.warn('[App.jsx] No plan data in response');
                setUserPlan(null);
              }
            } else {
              const errorText = await response.text();
              console.error('[App.jsx] Failed to fetch subscription usage:', response.status, response.statusText, errorText);
              setUserPlan(null);
            }
          } catch (err) {
            console.error('[App.jsx] Error fetching user plan:', err);
            setUserPlan(null);
          } finally {
            setIsLoadingPlan(false);
          }
        };
        fetchUserPlan();
      }, [isAuthenticated]);

      // Check if user has access to paid features (case-insensitive check)
      // First check user object from auth (available immediately), then fall back to userPlan
      const planName = user?.plan_name || (userPlan && userPlan.name) || 'free';
      const hasPaidPlan = planName && planName.toLowerCase() !== 'free';
      
      // Debug logging
      useEffect(() => {
        console.log('[App.jsx] User object:', user);
        console.log('[App.jsx] Plan name from user:', user?.plan_name);
        console.log('[App.jsx] User plan state:', userPlan);
        console.log('[App.jsx] Final plan name:', planName);
        console.log('[App.jsx] Has paid plan?', hasPaidPlan);
        console.log('[App.jsx] Is super admin?', isSuperAdmin);
        console.log('[App.jsx] Will show Financial tab?', hasPaidPlan || isSuperAdmin);
      }, [user, userPlan, planName, hasPaidPlan, isSuperAdmin]);
      
      // Return to original admin account
      const returnToAdmin = () => {
        if (impersonation) {
          // Restore the original admin token
          localStorage.setItem('token', impersonation.returnToken);
          localStorage.setItem('user', JSON.stringify({
            id: impersonation.originalAdminId,
            username: impersonation.originalAdminUsername,
            is_super_admin: 1
          }));
          // Clear impersonation data
          localStorage.removeItem('impersonation');
          // Reload to apply changes
          window.location.reload();
        }
      };
      
      // Debug: Log super admin status
      useEffect(() => {
        if (user) {
          console.log('Current user:', user);
          console.log('isSuperAdmin:', isSuperAdmin);
        }
      }, [user, isSuperAdmin]);
      
      // Redirect to /appointments if on root path
      useEffect(() => {
        if (isAuthenticated && location.pathname === '/') {
          navigate('/appointments', { replace: true });
        }
      }, [isAuthenticated, location.pathname, navigate]);
      
      const [refreshTrigger, setRefreshTrigger] = useState(0);
      const [newAppointmentIds, setNewAppointmentIds] = useState(null);
      const [pageTitle, setPageTitle] = useState("HairManager");
      const [invoiceAppointments, setInvoiceAppointments] = useState(null);
      const [profileSettings, setProfileSettings] = useState(null);
      const [showProfileMenu, setShowProfileMenu] = useState(false);
      const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
      const profileMenuRef = useRef(null);
      const mobileMenuRef = useRef(null);

      useEffect(() => {
        if (isAuthenticated) {
          fetchProfileSettings();
        }
      }, [isAuthenticated]);

      // Refetch profile settings when Profile tab becomes active
      useEffect(() => {
        if (location.pathname === '/admin' && isAuthenticated) {
          fetchProfileSettings();
        }
      }, [location.pathname, isAuthenticated]);

      // Close profile menu when clicking outside
      useEffect(() => {
        const handleClickOutside = (event) => {
          if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
            setShowProfileMenu(false);
          }
          if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target) && 
              !event.target.closest('.mobile-menu-toggle')) {
            setIsMobileMenuOpen(false);
          }
        };

        if (showProfileMenu || isMobileMenuOpen) {
          document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
          document.removeEventListener('mousedown', handleClickOutside);
        };
      }, [showProfileMenu, isMobileMenuOpen]);

      // Close mobile menu when navigating
      useEffect(() => {
        setIsMobileMenuOpen(false);
      }, [location.pathname]);

      const fetchProfileSettings = async () => {
        try {
          const response = await fetch(`${API_BASE}/profile`, {
            headers: getAuthHeaders()
          });
          if (response.ok) {
            const data = await response.json();
            setProfileSettings(data);
            if (data.business_name && data.business_name.trim()) {
              setPageTitle(data.business_name);
            } else {
              setPageTitle("HairManager");
            }
          }
        } catch (err) {
          console.error('Error fetching profile settings:', err);
          // Keep default title on error
        }
      };

      // Get user's display name and initials
      const getUserDisplayName = () => {
        if (profileSettings?.name) {
          return profileSettings.name;
        }
        return user?.username || 'User';
      };

      const getUserInitials = () => {
        const name = getUserDisplayName();
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
          // First letter of first name + first letter of last name
          return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        } else if (parts.length === 1 && parts[0].length >= 2) {
          // If only one word, use first two letters
          return parts[0].substring(0, 2).toUpperCase();
        } else {
          // Fallback to first letter
          return name.charAt(0).toUpperCase();
        }
      };

      if (loading) {
        return (
          <div className="app">
            <div style={{ textAlign: 'center', padding: '50px' }}>Loading...</div>
          </div>
        );
      }

      if (!isAuthenticated) {
        return <Login />;
      }

      const handleAppointmentsAdded = (newIds) => {
        setNewAppointmentIds(newIds);
        setRefreshTrigger(prev => prev + 1);
        navigate('/appointments');
      };

      const handleCreateInvoice = (appointments) => {
        console.log('handleCreateInvoice called with appointments:', appointments);
        setInvoiceAppointments(appointments);
        navigate('/invoice');
        console.log('Navigated to invoice');
      };

  return (
    <div className={`app ${isSuperAdmin ? 'super-admin-active' : ''}`}>
      {impersonation && (
        <div className="impersonation-banner">
          <div className="impersonation-content">
            <FaEye className="impersonation-icon" />
            <span>
              Viewing as <strong>{user?.username}</strong> — Logged in from {impersonation.originalAdminUsername}
            </span>
            <button className="return-btn" onClick={returnToAdmin}>
              <FaArrowLeft /> Return to Admin
            </button>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="app-header-content">
          <div className="header-row">
            <h1 className="business-name">{pageTitle}</h1>
            <button 
              className="mobile-menu-toggle"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <FaTimes /> : <FaBars />}
            </button>
            <nav className="tabs desktop-nav">
          <button
            className={`entry-btn ${activeTab === 'entry' ? 'active' : ''}`}
            onClick={() => navigate('/entry')}
          >
            <FaPlus /> <span className="entry-btn-text">New Entry</span>
          </button>
          <div className="nav-divider"></div>
          <button
            className={activeTab === 'list' ? 'active' : ''}
            onClick={() => navigate('/appointments')}
          >
            <FaList /> Appointments
          </button>
          <button
            className={`locations-nav-btn ${activeTab === 'locations' ? 'active' : ''}`}
            onClick={() => navigate('/locations')}
          >
            <FaMapMarkerAlt /> Locations
          </button>
          <button
            className={`services-nav-btn ${activeTab === 'services' ? 'active' : ''}`}
            onClick={() => navigate('/services')}
          >
            <FaCut /> Services
          </button>
          {(isSuperAdmin || hasPaidPlan) && (
            <button
              className={`financial-nav-btn ${activeTab === 'financial' ? 'active' : ''}`}
              onClick={() => navigate('/financial')}
              style={{
                animation: 'fadeIn 0.3s ease-in'
              }}
            >
              <FaChartLine /> Financial
            </button>
          )}
            </nav>
            {/* Mobile Menu */}
            {isMobileMenuOpen && (
              <div 
                className="mobile-nav-overlay"
                onClick={() => setIsMobileMenuOpen(false)}
              />
            )}
            <nav ref={mobileMenuRef} className={`mobile-nav ${isMobileMenuOpen ? 'open' : ''}`}>
              <button
                className={`mobile-nav-item ${activeTab === 'entry' ? 'active' : ''}`}
                onClick={() => navigate('/entry')}
              >
                <FaPlus /> New Entry
              </button>
              <button
                className={`mobile-nav-item ${activeTab === 'list' ? 'active' : ''}`}
                onClick={() => navigate('/appointments')}
              >
                <FaList /> Appointments
              </button>
              {(isSuperAdmin || hasPaidPlan) && (
                <button
                  className={`mobile-nav-item mobile-nav-financial ${activeTab === 'financial' ? 'active' : ''}`}
                  onClick={() => navigate('/financial')}
                >
                  <FaChartLine /> Financial
                </button>
              )}
              <button
                className={`mobile-nav-item mobile-nav-locations ${activeTab === 'locations' ? 'active' : ''}`}
                onClick={() => navigate('/locations')}
              >
                <FaMapMarkerAlt /> Locations
              </button>
              <button
                className={`mobile-nav-item mobile-nav-services ${activeTab === 'services' ? 'active' : ''}`}
                onClick={() => navigate('/services')}
              >
                <FaCut /> Services
              </button>
              {isSuperAdmin && (
                <button
                  className={`mobile-nav-item ${activeTab === 'super-admin' ? 'active' : ''}`}
                  onClick={() => navigate('/super-admin')}
                >
                  <FaUserShield /> Super Admin
                </button>
              )}
              {/* Divider before profile items */}
              <div className="mobile-nav-divider"></div>
              {/* Profile Menu Items */}
              <button
                className={`mobile-nav-item ${activeTab === 'admin' ? 'active' : ''}`}
                onClick={() => {
                  navigate('/admin');
                  setIsMobileMenuOpen(false);
                }}
              >
                <FaUser /> Profile
              </button>
              <button
                className={`mobile-nav-item ${activeTab === 'my-plan' ? 'active' : ''}`}
                onClick={() => {
                  navigate('/my-plan');
                  setIsMobileMenuOpen(false);
                }}
              >
                <FaCrown /> My Plan
              </button>
              <button
                className={`mobile-nav-item ${activeTab === 'email-logs' ? 'active' : ''}`}
                onClick={() => {
                  navigate('/email-logs');
                  setIsMobileMenuOpen(false);
                }}
              >
                <FaEnvelope /> Email Logs
              </button>
              <button
                className="mobile-nav-item mobile-nav-item-signout"
                onClick={() => {
                  logout();
                  setIsMobileMenuOpen(false);
                }}
              >
                <FaSignOutAlt /> Sign out
              </button>
            </nav>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              {isSuperAdmin && (
                <button
                  className={`super-admin-header-btn ${activeTab === 'super-admin' ? 'active' : ''}`}
                  onClick={() => navigate('/super-admin')}
                  style={{
                    animation: 'fadeIn 0.3s ease-in'
                  }}
                >
                  <FaUserShield /> Super Admin
                </button>
              )}
              <div 
                ref={profileMenuRef}
                className="profile-menu-container"
                onMouseEnter={() => setShowProfileMenu(true)}
                onMouseLeave={() => setShowProfileMenu(false)}
              >
                <div className="profile-trigger">
                  <div className="profile-avatar">
                    {getUserInitials()}
                  </div>
                  <span className="profile-name">{getUserDisplayName()}</span>
                </div>
                {showProfileMenu && (
                  <>
                    <div className="profile-dropdown-bridge"></div>
                    <div className="profile-dropdown">
                      <button
                        className="profile-dropdown-item"
                        onClick={() => {
                          navigate('/admin');
                          setShowProfileMenu(false);
                        }}
                      >
                        <FaUser /> Profile
                      </button>
                      <button
                        className="profile-dropdown-item"
                        onClick={() => {
                          navigate('/my-plan');
                          setShowProfileMenu(false);
                        }}
                      >
                        <FaCrown /> My Plan
                      </button>
                      <button
                        className="profile-dropdown-item"
                        onClick={() => {
                          navigate('/email-logs');
                          setShowProfileMenu(false);
                        }}
                      >
                        <FaEnvelope /> Email Logs
                      </button>
                      {(isSuperAdmin || hasPaidPlan) && (
                        <button
                          className={`profile-dropdown-item profile-dropdown-financial ${activeTab === 'financial' ? 'active' : ''}`}
                          onClick={() => {
                            navigate('/financial');
                            setShowProfileMenu(false);
                          }}
                        >
                          <FaChartLine /> Financial
                        </button>
                      )}
                      <button
                        className={`profile-dropdown-item profile-dropdown-locations ${activeTab === 'locations' ? 'active' : ''}`}
                        onClick={() => {
                          navigate('/locations');
                          setShowProfileMenu(false);
                        }}
                      >
                        <FaMapMarkerAlt /> Locations
                      </button>
                      <button
                        className={`profile-dropdown-item profile-dropdown-services ${activeTab === 'services' ? 'active' : ''}`}
                        onClick={() => {
                          navigate('/services');
                          setShowProfileMenu(false);
                        }}
                      >
                        <FaCut /> Services
                      </button>
                      <button
                        className="profile-dropdown-item"
                        onClick={() => {
                          logout();
                          setShowProfileMenu(false);
                        }}
                      >
                        <FaSignOutAlt /> Sign out
                      </button>
                    </div>
                </>
              )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        {location.pathname === '/entry' && (
          <EntryForm onAppointmentsAdded={handleAppointmentsAdded} />
        )}
        {location.pathname === '/appointments' && (
          <AppointmentsList 
            refreshTrigger={refreshTrigger} 
            newAppointmentIds={newAppointmentIds}
            onCreateInvoice={handleCreateInvoice}
          />
        )}
        {location.pathname === '/locations' && (
          <LocationsManager />
        )}
        {location.pathname === '/services' && (
          <ServicesManager />
        )}
        {location.pathname === '/admin' && (
          <AdminManager onSettingsSaved={fetchProfileSettings} />
        )}
        {location.pathname === '/invoice' && (
          <Invoice appointments={invoiceAppointments} onBack={() => navigate('/appointments')} />
        )}
        {location.pathname === '/financial' && (hasPaidPlan || isSuperAdmin) && (
          <Financial />
        )}
        {location.pathname === '/email-logs' && (
          <EmailLogs />
        )}
        {location.pathname === '/my-plan' && (
          <MyPlan />
        )}
        {location.pathname === '/super-admin' && isSuperAdmin && (
          <SuperAdminManager />
        )}
      </main>
    </div>
  );
}

export default App;
