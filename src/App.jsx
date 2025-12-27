import { useState, useEffect, useRef } from 'react';
import { FaPlus, FaList, FaMapMarkerAlt, FaCut, FaUser, FaSignOutAlt, FaChartLine, FaEnvelope } from 'react-icons/fa';
import { useAuth } from './contexts/AuthContext';
import EntryForm from './components/EntryForm';
import AppointmentsList from './components/AppointmentsList';
import LocationsManager from './components/LocationsManager';
import ServicesManager from './components/ServicesManager';
import AdminManager from './components/AdminManager';
import Invoice from './components/Invoice';
import Financial from './components/Financial';
import EmailLogs from './components/EmailLogs';
import Login from './components/Login';
import './App.css';
import { API_BASE } from './config.js';

function App() {
      const { isAuthenticated, loading, user, logout, getAuthHeaders } = useAuth();
      const [activeTab, setActiveTab] = useState('list');
      const [refreshTrigger, setRefreshTrigger] = useState(0);
      const [newAppointmentIds, setNewAppointmentIds] = useState(null);
      const [pageTitle, setPageTitle] = useState("HairManager");
      const [invoiceAppointments, setInvoiceAppointments] = useState(null);
      const [profileSettings, setProfileSettings] = useState(null);
      const [showProfileMenu, setShowProfileMenu] = useState(false);
      const profileMenuRef = useRef(null);

      useEffect(() => {
        if (isAuthenticated) {
          fetchProfileSettings();
        }
      }, [isAuthenticated]);

      // Refetch profile settings when Profile tab becomes active
      useEffect(() => {
        if (activeTab === 'admin' && isAuthenticated) {
          fetchProfileSettings();
        }
      }, [activeTab, isAuthenticated]);

      // Close profile menu when clicking outside
      useEffect(() => {
        const handleClickOutside = (event) => {
          if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
            setShowProfileMenu(false);
          }
        };

        if (showProfileMenu) {
          document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
          document.removeEventListener('mousedown', handleClickOutside);
        };
      }, [showProfileMenu]);

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
        setActiveTab('list');
      };

      const handleCreateInvoice = (appointments) => {
        console.log('handleCreateInvoice called with appointments:', appointments);
        setInvoiceAppointments(appointments);
        setActiveTab('invoice');
        console.log('Active tab set to invoice');
      };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-content">
          <div className="header-row">
            <h1 className="business-name">{pageTitle}</h1>
            <nav className="tabs">
          <button
            className={activeTab === 'entry' ? 'active' : ''}
            onClick={() => setActiveTab('entry')}
          >
            <FaPlus /> New Entry
          </button>
          <button
            className={activeTab === 'list' ? 'active' : ''}
            onClick={() => setActiveTab('list')}
          >
            <FaList /> View Appointments
          </button>
          <button
            className={activeTab === 'locations' ? 'active' : ''}
            onClick={() => setActiveTab('locations')}
          >
            <FaMapMarkerAlt /> Locations
          </button>
          <button
            className={activeTab === 'services' ? 'active' : ''}
            onClick={() => setActiveTab('services')}
          >
            <FaCut /> Services
          </button>
          <button
            className={activeTab === 'financial' ? 'active' : ''}
            onClick={() => setActiveTab('financial')}
          >
            <FaChartLine /> Financial
          </button>
            </nav>
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
                        setActiveTab('admin');
                        setShowProfileMenu(false);
                      }}
                    >
                      <FaUser /> Profile
                    </button>
                    <button
                      className="profile-dropdown-item"
                      onClick={() => {
                        setActiveTab('email-logs');
                        setShowProfileMenu(false);
                      }}
                    >
                      <FaEnvelope /> Email Logs
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
      </header>

      <main className="app-main">
        {activeTab === 'entry' && (
          <EntryForm onAppointmentsAdded={handleAppointmentsAdded} />
        )}
            {activeTab === 'list' && (
              <AppointmentsList 
                refreshTrigger={refreshTrigger} 
                newAppointmentIds={newAppointmentIds}
                onCreateInvoice={handleCreateInvoice}
              />
            )}
        {activeTab === 'locations' && (
          <LocationsManager />
        )}
        {activeTab === 'services' && (
          <ServicesManager />
        )}
        {activeTab === 'admin' && (
          <AdminManager onSettingsSaved={fetchProfileSettings} />
        )}
        {activeTab === 'invoice' && (
          <Invoice appointments={invoiceAppointments} onBack={() => setActiveTab('list')} />
        )}
        {activeTab === 'financial' && (
          <Financial />
        )}
        {activeTab === 'email-logs' && (
          <EmailLogs />
        )}
      </main>
    </div>
  );
}

export default App;
