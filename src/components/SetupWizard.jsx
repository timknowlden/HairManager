import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './SetupWizard.css';

import { API_BASE } from '../config.js';

function SetupWizard({ onComplete }) {
  const { getAuthHeaders, login } = useAuth();
  const [step, setStep] = useState('credentials'); // 'credentials' | 'database'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Username and password are required');
      return;
    }
    if (username.toLowerCase() === 'admin') {
      setError('Please choose a different username than "admin"');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/setup-complete`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUsername: username, newPassword: password, newEmail: email })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Setup failed');
      }
      // Update auth with new token
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setStep('database');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartFresh = () => {
    onComplete();
  };

  const handleUploadDatabase = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.db') && !file.name.endsWith('.sqlite') && !file.name.endsWith('.sqlite3')) {
      setError('Please select a valid SQLite database file (.db, .sqlite, or .sqlite3)');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();

      const response = await fetch(`${API_BASE}/auth/restore-database`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/octet-stream'
        },
        body: buffer
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      // After restore, server restarts — clear auth and reload after a delay
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setError('');
      alert('Database restored successfully. The server is restarting — please log in with your existing credentials.');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'database') {
    return (
      <div className="setup-container">
        <div className="setup-box">
          <div className="setup-step">Step 2 of 2</div>
          <h1>Database Setup</h1>
          <p className="setup-desc">Would you like to start fresh or restore from an existing database?</p>

          <div className="setup-options">
            <div className="setup-option" onClick={handleStartFresh}>
              <div className="setup-option-icon">+</div>
              <div className="setup-option-title">Start Fresh</div>
              <p>Begin with a clean database and set up your services, locations, and appointments from scratch.</p>
            </div>

            <div className="setup-option">
              <label className="setup-option-label">
                <div className="setup-option-icon">&#8635;</div>
                <div className="setup-option-title">Restore from Backup</div>
                <p>Upload an existing HairManager database file to restore all your data.</p>
                <input
                  type="file"
                  accept=".db,.sqlite,.sqlite3"
                  onChange={handleUploadDatabase}
                  className="setup-file-input"
                />
                <span className="setup-file-btn">Choose Database File</span>
              </label>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
          {loading && <div className="setup-loading">Uploading and restoring database...</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="setup-container">
      <div className="setup-box">
        <div className="setup-step">Step 1 of 2</div>
        <h1>Create Your Admin Account</h1>
        <p className="setup-desc">Replace the default admin credentials with your own secure account.</p>

        <form onSubmit={handleCreateAdmin}>
          <div className="form-group">
            <label htmlFor="setup-username">Username</label>
            <input
              id="setup-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="setup-email">Email (optional)</label>
            <input
              id="setup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="setup-password">Password</label>
            <input
              id="setup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label htmlFor="setup-confirm">Confirm Password</label>
            <input
              id="setup-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading} className="submit-button">
            {loading ? 'Setting up...' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default SetupWizard;
