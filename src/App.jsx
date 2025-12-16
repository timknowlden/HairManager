import { useState } from 'react';
import EntryForm from './components/EntryForm';
import AppointmentsList from './components/AppointmentsList';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('entry');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleAppointmentsAdded = () => {
    setRefreshTrigger(prev => prev + 1);
    setActiveTab('list');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Kate's Cuts - Appointment Management</h1>
        <nav className="tabs">
          <button
            className={activeTab === 'entry' ? 'active' : ''}
            onClick={() => setActiveTab('entry')}
          >
            New Entry
          </button>
          <button
            className={activeTab === 'list' ? 'active' : ''}
            onClick={() => setActiveTab('list')}
          >
            View Appointments
          </button>
        </nav>
      </header>

      <main className="app-main">
        {activeTab === 'entry' && (
          <EntryForm onAppointmentsAdded={handleAppointmentsAdded} />
        )}
        {activeTab === 'list' && (
          <AppointmentsList refreshTrigger={refreshTrigger} />
        )}
      </main>
    </div>
  );
}

export default App;
