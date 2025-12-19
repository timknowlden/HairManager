import { useState, useEffect } from 'react';
import { FaPlus, FaList, FaMapMarkerAlt, FaCut, FaUser, FaSignOutAlt, FaChartLine } from 'react-icons/fa';
import { useAuth } from './contexts/AuthContext';
import EntryForm from './components/EntryForm';
import AppointmentsList from './components/AppointmentsList';
import LocationsManager from './components/LocationsManager';
import ServicesManager from './components/ServicesManager';
import AdminManager from './components/AdminManager';
import Invoice from './components/Invoice';
import Financial from './components/Financial';
import Login from './components/Login';
import './App.css';
import { API_BASE } from './config.js';

function App() {
      const { isAuthenticated, loading, user, logout, getAuthHeaders } = useAuth();
      const [activeTab, setActiveTab] = useState('list');
      const [refreshTrigger, setRefreshTrigger] = useState(0);
      const [newAppointmentIds, setNewAppointmentIds] = useState(null);
      const [pageTitle, setPageTitle] = useState("HairManager - Appointment Management");
      const [invoiceAppointments, setInvoiceAppointments] = useState(null);

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

      const fetchProfileSettings = async () => {
        try {
          const response = await fetch(`${API_BASE}/profile`, {
            headers: getAuthHeaders()
          });
          if (response.ok) {
            const data = await response.json();
            if (data.business_name && data.business_name.trim()) {
              setPageTitle(`${data.business_name} - Appointment Management`);
            }
            // If no business_name, keep default title
          }
        } catch (err) {
          console.error('Error fetching profile settings:', err);
          // Keep default title on error
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
        <div style={{ position: 'relative', marginBottom: '20px' }}>
          <h1 style={{ margin: 0 }}>{pageTitle}</h1>
          <div style={{ 
            position: 'absolute', 
            right: 0, 
            top: '50%', 
            transform: 'translateY(-50%)',
            display: 'flex', 
            alignItems: 'center', 
            gap: '15px' 
          }}>
            <span style={{ color: '#666' }}>Welcome, {user?.username}</span>
            <button
              onClick={logout}
              style={{
                padding: '8px 16px',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <FaSignOutAlt /> Logout
            </button>
          </div>
        </div>
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
          <button
            className={activeTab === 'admin' ? 'active' : ''}
            onClick={() => setActiveTab('admin')}
          >
            <FaUser /> Profile
          </button>
        </nav>
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
      </main>
    </div>
  );
}

export default App;
