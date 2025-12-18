import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const API_BASE = 'http://localhost:3001/api';

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
  const { login, register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (isLogin) {
      const result = await login(username, password);
      if (!result.success) {
        setError(result.error);
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
          
          {!resetToken ? (
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
            </form>
          ) : (
            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label htmlFor="resetToken">Reset Token</label>
                <input
                  id="resetToken"
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  required
                  autoFocus
                  placeholder="Paste your reset token here"
                />
              </div>

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

