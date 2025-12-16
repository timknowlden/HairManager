import { useState, useEffect } from 'react';
import './AppointmentsList.css';

const API_BASE = 'http://localhost:3001/api';

function AppointmentsList({ refreshTrigger }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAppointments();
  }, [refreshTrigger]);

  const fetchAppointments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/appointments`);
      if (!response.ok) {
        throw new Error('Failed to fetch appointments');
      }
      const data = await response.json();
      setAppointments(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePaid = async (id, currentPaidStatus) => {
    try {
      const endpoint = currentPaidStatus 
        ? `${API_BASE}/appointments/${id}/unpay`
        : `${API_BASE}/appointments/${id}/pay`;
      
      const response = await fetch(endpoint, {
        method: 'PATCH',
      });

      if (!response.ok) {
        throw new Error('Failed to update payment status');
      }

      fetchAppointments();
    } catch (err) {
      setError(err.message);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount);
  };

  if (loading) {
    return <div className="loading">Loading appointments...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="appointments-list">
      <div className="appointments-header">
        <h2>Appointments</h2>
        <button onClick={fetchAppointments} className="refresh-btn">
          Refresh
        </button>
      </div>

      {appointments.length === 0 ? (
        <div className="no-appointments">No appointments found</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client Name</th>
                <th>Service</th>
                <th>Type</th>
                <th>Location</th>
                <th>Price</th>
                <th>Distance</th>
                <th>Paid</th>
                <th>Payment Date</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((apt) => (
                <tr key={apt.id} className={apt.paid ? 'paid' : 'unpaid'}>
                  <td>{formatDate(apt.date)}</td>
                  <td>{apt.client_name}</td>
                  <td>{apt.service}</td>
                  <td>{apt.type}</td>
                  <td>{apt.location}</td>
                  <td>{formatCurrency(apt.price)}</td>
                  <td>{apt.distance ? `${apt.distance} mi` : '-'}</td>
                  <td>
                    <button
                      className={`paid-toggle ${apt.paid ? 'paid' : 'unpaid'}`}
                      onClick={() => handleTogglePaid(apt.id, apt.paid)}
                    >
                      {apt.paid ? '✓ Paid' : 'Unpaid'}
                    </button>
                  </td>
                  <td>{apt.payment_date ? formatDate(apt.payment_date) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AppointmentsList;

