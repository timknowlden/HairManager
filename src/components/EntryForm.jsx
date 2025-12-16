import { useState, useEffect } from 'react';
import './EntryForm.css';

const API_BASE = 'http://localhost:3001/api';

function EntryForm({ onAppointmentsAdded }) {
  const [locations, setLocations] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointments, setAppointments] = useState([{ client_name: '', service: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetchLocations();
    fetchServices();
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await fetch(`${API_BASE}/locations`);
      const data = await response.json();
      setLocations(data);
      if (data.length > 0 && !selectedLocation) {
        setSelectedLocation(data[0].location_name);
      }
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await fetch(`${API_BASE}/services`);
      const data = await response.json();
      setServices(data);
    } catch (err) {
      console.error('Error fetching services:', err);
    }
  };

  const addAppointmentRow = () => {
    setAppointments([...appointments, { client_name: '', service: '' }]);
  };

  const removeAppointmentRow = (index) => {
    if (appointments.length > 1) {
      setAppointments(appointments.filter((_, i) => i !== index));
    }
  };

  const updateAppointment = (index, field, value) => {
    const updated = [...appointments];
    updated[index][field] = value;
    setAppointments(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedLocation || !selectedDate) {
      setError('Please select a location and date');
      return;
    }

    const validAppointments = appointments.filter(
      apt => apt.client_name.trim() && apt.service.trim()
    );

    if (validAppointments.length === 0) {
      setError('Please add at least one appointment');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/appointments/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: selectedLocation,
          date: selectedDate,
          appointments: validAppointments,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create appointments');
      }

      setSuccess(`Successfully created ${data.appointments.length} appointment(s)`);
      
      // Reset form
      setAppointments([{ client_name: '', service: '' }]);
      
      // Notify parent component
      if (onAppointmentsAdded) {
        onAppointmentsAdded();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="entry-form">
      <h2>New Appointment Entry</h2>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="location">Location *</label>
          <select
            id="location"
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            required
          >
            <option value="">Select Location</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.location_name}>
                {loc.location_name} {loc.distance ? `(${loc.distance} mi)` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="date">Date *</label>
          <input
            type="date"
            id="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            required
          />
        </div>

        <div className="appointments-list">
          <h3>Appointments</h3>
          {appointments.map((apt, index) => (
            <div key={index} className="appointment-row">
              <div className="form-group">
                <label>Client Name</label>
                <input
                  type="text"
                  value={apt.client_name}
                  onChange={(e) => updateAppointment(index, 'client_name', e.target.value)}
                  placeholder="Enter client name"
                />
              </div>
              <div className="form-group">
                <label>Service</label>
                <select
                  value={apt.service}
                  onChange={(e) => updateAppointment(index, 'service', e.target.value)}
                >
                  <option value="">Select Service</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.service_name}>
                      {service.service_name} - {service.type} (£{service.price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => removeAppointmentRow(index)}
                className="remove-btn"
                disabled={appointments.length === 1}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" onClick={addAppointmentRow} className="add-btn">
            + Add Another Appointment
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Creating...' : 'Create Appointments'}
        </button>
      </form>
    </div>
  );
}

export default EntryForm;

