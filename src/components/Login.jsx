import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

import { API_BASE } from '../config.js';

const REMEMBER_ME_KEY = 'rememberedCredentials';

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [defaultCreds, setDefaultCreds] = useState(null);
  const [tokenFromLink, setTokenFromLink] = useState(false);
  const [showTokenEntry, setShowTokenEntry] = useState(false);
  const { login, register } = useAuth();

  // Check for reset token in URL query params
  useEffect(() => {
    const search = window.location.search || '';
    if (search.includes('reset')) {
      const params = new URLSearchParams(search);
      const token = params.get('reset');
      setShowResetPassword(true);
      if (token && token.length > 10) {
        setResetToken(token);
        setTokenFromLink(true);
      } else {
        setShowTokenEntry(true);
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Check setup status and load saved credentials on mount
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/setup-status`);
        if (response.ok) {
          const data = await response.json();
          if (data.needsSetup) {
            setNeedsSetup(true);
            setDefaultCreds({ username: data.defaultUsername, password: data.defaultPassword });
            setUsername(data.defaultUsername);
            setPassword(data.defaultPassword);
            return; // Skip loading remembered credentials during setup
          }
        }
      } catch (err) {
        console.error('Error checking setup status:', err);
      }
      // Load saved credentials if not in setup mode
      try {
        const saved = localStorage.getItem(REMEMBER_ME_KEY);
        if (saved) {
          const credentials = JSON.parse(saved);
          setUsername(credentials.username || '');
          setPassword(credentials.password || '');
          setRememberMe(true);
        }
      } catch (err) {
        console.error('Error loading saved credentials:', err);
      }
    };
    checkSetup();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (isLogin) {
      const result = await login(username, password);
      if (!result.success) {
        setError(result.error);
      } else {
        // Save credentials if remember me is checked
        if (rememberMe) {
          try {
            localStorage.setItem(REMEMBER_ME_KEY, JSON.stringify({ username, password }));
          } catch (err) {
            console.error('Error saving credentials:', err);
          }
        } else {
          // Clear saved credentials if remember me is unchecked
          localStorage.removeItem(REMEMBER_ME_KEY);
        }
      }
    } else {
      if (!username || !password) {
        setError('Username and password are required');
        setLoading(false);
        return;
      }
      const result = await register(username, password, email);
      if (!result.success) {
        setError(result.error);
      }
    }

    setLoading(false);
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/request-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: resetEmail,
          email: resetEmail
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccess(data.message);
        // In development, show the token (remove in production)
        if (data.resetToken) {
          setResetToken(data.resetToken);
          setSuccess(`${data.message} Your reset token: ${data.resetToken}`);
        }
      } else {
        setError(data.error || 'Failed to request password reset');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!resetToken || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          resetToken,
          newPassword
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccess('Password reset successfully! You can now login with your new password.');
        setResetToken('');
        setNewPassword('');
        setConfirmPassword('');
        setShowResetPassword(false);
      } else {
        setError(data.error || 'Failed to reset password');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (showResetPassword) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>HairManager</h1>
          <h2>Reset Password</h2>
          
          {!resetToken && !showTokenEntry ? (
            <form onSubmit={handleRequestReset}>
              <div className="form-group">
                <label htmlFor="resetEmail">Username or Email</label>
                <input
                  id="resetEmail"
                  type="text"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="Enter your username or email"
                />
              </div>

              {error && <div className="error-message">{error}</div>}
              {success && <div className="success-message">{success}</div>}

              <button type="submit" disabled={loading} className="submit-button">
                {loading ? 'Please wait...' : 'Request Reset Token'}
              </button>
              <div className="switch-mode">
                <button type="button" onClick={() => setShowTokenEntry(true)} className="link-button">
                  I already have a reset token
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword}>
              {tokenFromLink ? (
                <input type="hidden" value={resetToken} />
              ) : (
                <div className="form-group">
                  <label htmlFor="resetToken">Reset Token</label>
                  <textarea
                    id="resetToken"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    required
                    autoFocus
                    placeholder="Paste your reset token here"
                    autoComplete="off"
                    rows={3}
                    style={{ fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              {error && <div className="error-message">{error}</div>}
              {success && <div className="success-message">{success}</div>}

              <button type="submit" disabled={loading} className="submit-button">
                {loading ? 'Please wait...' : 'Reset Password'}
              </button>
            </form>
          )}

          <div className="switch-mode">
            <button type="button" onClick={() => { setShowResetPassword(false); setResetToken(''); setError(''); setSuccess(''); }} className="link-button">
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>HairManager</h1>
        <h2>{isLogin ? 'Login' : 'Register'}</h2>

        {needsSetup && defaultCreds && (
          <div className="setup-banner">
            <div className="setup-banner-title">First Time Setup</div>
            <p>Use the default credentials below to log in, then you'll be guided to create your own admin account.</p>
            <div className="setup-creds">
              <div><strong>Username:</strong> {defaultCreds.username}</div>
              <div><strong>Password:</strong> {defaultCreds.password}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          {!isLogin && (
            <div className="form-group">
              <label htmlFor="email">Email (optional)</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isLogin && (
            <div className="form-group remember-me-group">
              <label className="remember-me-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button type="submit" disabled={loading} className="submit-button">
            {loading ? 'Please wait...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>

        <div className="switch-mode">
          {isLogin ? (
            <>
              <div>
                Don't have an account?{' '}
                <button type="button" onClick={() => setIsLogin(false)} className="link-button">
                  Register
                </button>
              </div>
              <div>
                <button type="button" onClick={() => setShowResetPassword(true)} className="link-button">
                  Forgot Password?
                </button>
              </div>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" onClick={() => setIsLogin(true)} className="link-button">
                Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;

