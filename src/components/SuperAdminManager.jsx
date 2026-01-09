import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config.js';
import { 
  FaPlus, FaEdit, FaTrash, FaKey, FaUserShield, FaUser, 
  FaDownload, FaUsers, FaCalendarAlt, FaMapMarkerAlt, FaCut,
  FaSignInAlt, FaCrown, FaTimes, FaSearch, FaSortUp, FaSortDown, FaSort
} from 'react-icons/fa';
import SubscriptionManager from './SubscriptionManager';
import './SuperAdminManager.css';

function SuperAdminManager() {
  const { getAuthHeaders, login } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    is_super_admin: false
  });

  // Filter states
  const [filters, setFilters] = useState({
    id: '',
    username: '',
    email: '',
    role: ''
  });

  // Sort state
  const [sortConfig, setSortConfig] = useState({ column: 'id', direction: 'desc' });

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/admin/users`, {
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Super admin access required');
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/users/stats`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      setSuccess('User created successfully!');
      setFormData({ username: '', password: '', email: '', is_super_admin: false });
      setShowCreateForm(false);
      fetchUsers();
      fetchStats();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          is_super_admin: formData.is_super_admin
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      setSuccess('User updated successfully!');
      setEditingUser(null);
      setFormData({ username: '', password: '', email: '', is_super_admin: false });
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"?\n\nThis will permanently delete all their:\n• Appointments\n• Locations\n• Services\n\nThis action cannot be undone!`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      setSuccess(`User "${username}" deleted successfully!`);
      fetchUsers();
      fetchStats();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetPassword = async (userId, username) => {
    const newPassword = prompt(`Enter new password for "${username}" (minimum 6 characters):`);
    if (!newPassword || newPassword.length < 6) {
      if (newPassword !== null) {
        setError('Password must be at least 6 characters long');
      }
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ newPassword })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setSuccess(`Password reset successfully for "${username}"!`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleImpersonate = async (userId, username) => {
    if (!window.confirm(`Login as "${username}"?\n\nYou can return to your admin session using the toolbar at the top.`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/admin/users/${userId}/impersonate`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to impersonate user');
      }

      // Store the impersonation data to allow returning
      localStorage.setItem('impersonation', JSON.stringify(data.impersonation));
      
      // Store the token and user data
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Reload the page to apply the new session
      window.location.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const exportUsersCSV = () => {
    if (users.length === 0) {
      setError('No users to export');
      return;
    }

    const headers = ['ID', 'Username', 'Email', 'Role', 'Appointments', 'Locations', 'Services', 'Created'];
    const rows = users.map(user => [
      user.id,
      user.username,
      user.email || '',
      user.is_super_admin === 1 ? 'Super Admin' : 'User',
      user.appointment_count || 0,
      user.location_count || 0,
      user.service_count || 0,
      new Date(user.created_at).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    setSuccess('Users exported successfully!');
  };

  // Filter handlers
  const handleFilterChange = (column, value) => {
    setFilters(prev => ({
      ...prev,
      [column]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      id: '',
      username: '',
      email: '',
      role: ''
    });
  };

  const hasActiveFilters = Object.values(filters).some(f => f !== '');

  // Sort handler
  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sort icon helper
  const getSortIcon = (column) => {
    if (sortConfig.column !== column) return <FaSort className="sort-icon inactive" />;
    return sortConfig.direction === 'asc' 
      ? <FaSortUp className="sort-icon active" /> 
      : <FaSortDown className="sort-icon active" />;
  };

  // Filtered and sorted users
  const filteredUsers = useMemo(() => {
    let result = users.filter(user => {
      // ID filter
      if (filters.id && !user.id.toString().includes(filters.id)) return false;
      
      // Username filter
      if (filters.username && !user.username.toLowerCase().includes(filters.username.toLowerCase())) return false;
      
      // Email filter
      if (filters.email) {
        const email = user.email || '';
        if (!email.toLowerCase().includes(filters.email.toLowerCase())) return false;
      }
      
      // Role filter
      if (filters.role) {
        const isAdmin = user.is_super_admin === 1;
        if (filters.role === 'admin' && !isAdmin) return false;
        if (filters.role === 'user' && isAdmin) return false;
      }
      
      return true;
    });

    // Sort
    if (sortConfig.column) {
      result.sort((a, b) => {
        let aVal = a[sortConfig.column];
        let bVal = b[sortConfig.column];

        // Handle special columns
        if (sortConfig.column === 'role') {
          aVal = a.is_super_admin;
          bVal = b.is_super_admin;
        }

        // Handle null/undefined
        if (aVal == null) aVal = '';
        if (bVal == null) bVal = '';

        // String comparison
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [users, filters, sortConfig]);

  const startEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      email: user.email || '',
      is_super_admin: user.is_super_admin === 1
    });
    setShowCreateForm(false);
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setFormData({ username: '', password: '', email: '', is_super_admin: false });
  };

  const cancelCreate = () => {
    setShowCreateForm(false);
    setFormData({ username: '', password: '', email: '', is_super_admin: false });
  };

  if (loading && activeTab === 'users') {
    return <div className="super-admin-manager"><div className="loading">Loading users...</div></div>;
  }

  return (
    <div className="super-admin-manager">
      <div className="super-admin-header">
        <h2>Super Admin Dashboard</h2>
        <p className="admin-subtitle">Manage all user accounts and system data</p>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button 
          className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <FaUsers /> Users
        </button>
        <button 
          className={`admin-tab ${activeTab === 'subscriptions' ? 'active' : ''}`}
          onClick={() => setActiveTab('subscriptions')}
        >
          <FaCrown /> Subscriptions
        </button>
      </div>

      {activeTab === 'subscriptions' ? (
        <SubscriptionManager />
      ) : (
        <>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* Stats Cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card users">
            <div className="stat-icon"><FaUsers /></div>
            <div className="stat-value">{stats.totalUsers}</div>
            <div className="stat-label">Total Users</div>
          </div>
          <div className="stat-card appointments">
            <div className="stat-icon"><FaCalendarAlt /></div>
            <div className="stat-value">{stats.totalAppointments}</div>
            <div className="stat-label">Total Appointments</div>
          </div>
          <div className="stat-card locations">
            <div className="stat-icon"><FaMapMarkerAlt /></div>
            <div className="stat-value">{stats.totalLocations}</div>
            <div className="stat-label">Total Locations</div>
          </div>
          <div className="stat-card services">
            <div className="stat-icon"><FaCut /></div>
            <div className="stat-value">{stats.totalServices}</div>
            <div className="stat-label">Total Services</div>
          </div>
        </div>
      )}

      <div className="super-admin-actions">
        {!showCreateForm && !editingUser && (
          <>
            <button
              className="create-user-btn"
              onClick={() => {
                setShowCreateForm(true);
                setEditingUser(null);
                setFormData({ username: '', password: '', email: '', is_super_admin: false });
              }}
            >
              <FaPlus /> Create New User
            </button>
            <button className="export-btn" onClick={exportUsersCSV}>
              <FaDownload /> Export Users CSV
            </button>
          </>
        )}
      </div>

      {(showCreateForm || editingUser) && (
        <div className="user-form-container">
          <h3>{editingUser ? 'Edit User' : 'Create New User'}</h3>
          <form onSubmit={editingUser ? handleUpdateUser : handleCreateUser} className="user-form">
            <div className="form-group">
              <label htmlFor="username">Username *</label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                required
                placeholder="Enter username"
              />
            </div>

            {!editingUser && (
              <div className="form-group">
                <label htmlFor="password">Password *</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                  minLength={6}
                  placeholder="Minimum 6 characters"
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="user@example.com"
              />
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="is_super_admin"
                  checked={formData.is_super_admin}
                  onChange={handleInputChange}
                />
                <span>Super Admin</span>
              </label>
              <p className="field-help">Grant super admin privileges to this user</p>
            </div>

            <div className="form-actions">
              <button type="submit" className="submit-btn">
                {editingUser ? 'Update User' : 'Create User'}
              </button>
              <button type="button" className="cancel-btn" onClick={editingUser ? cancelEdit : cancelCreate}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="users-table-container">
        <div className="users-table-header">
          <h3>All Users ({filteredUsers.length}{filteredUsers.length !== users.length ? ` of ${users.length}` : ''})</h3>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="clear-filters-btn">
              <FaTimes /> Clear Filters
            </button>
          )}
        </div>
        <table className="users-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => handleSort('id')}>ID {getSortIcon('id')}</th>
              <th className="sortable" onClick={() => handleSort('username')}>Username {getSortIcon('username')}</th>
              <th className="sortable" onClick={() => handleSort('email')}>Email {getSortIcon('email')}</th>
              <th className="sortable" onClick={() => handleSort('role')}>Role {getSortIcon('role')}</th>
              <th className="sortable" onClick={() => handleSort('appointment_count')}>Appointments {getSortIcon('appointment_count')}</th>
              <th className="sortable" onClick={() => handleSort('location_count')}>Locations {getSortIcon('location_count')}</th>
              <th className="sortable" onClick={() => handleSort('service_count')}>Services {getSortIcon('service_count')}</th>
              <th className="sortable" onClick={() => handleSort('created_at')}>Created {getSortIcon('created_at')}</th>
              <th>Actions</th>
            </tr>
            <tr className="filter-row">
              <th>
                <input
                  type="text"
                  placeholder="#"
                  value={filters.id}
                  onChange={(e) => handleFilterChange('id', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th>
                <input
                  type="text"
                  placeholder="Search..."
                  value={filters.username}
                  onChange={(e) => handleFilterChange('username', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th>
                <input
                  type="text"
                  placeholder="Search..."
                  value={filters.email}
                  onChange={(e) => handleFilterChange('email', e.target.value)}
                  className="filter-input"
                />
              </th>
              <th>
                <select
                  value={filters.role}
                  onChange={(e) => handleFilterChange('role', e.target.value)}
                  className="filter-select"
                >
                  <option value="">All</option>
                  <option value="admin">Super Admin</option>
                  <option value="user">User</option>
                </select>
              </th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="9" className="empty-state">
                  {hasActiveFilters ? 'No users match your filters' : 'No users found'}
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td><strong>{user.username}</strong></td>
                  <td>{user.email || <span style={{ color: '#999' }}>—</span>}</td>
                  <td>
                    {user.is_super_admin === 1 ? (
                      <span className="badge super-admin-badge">
                        <FaUserShield /> Super Admin
                      </span>
                    ) : (
                      <span className="badge user-badge">
                        <FaUser /> User
                      </span>
                    )}
                  </td>
                  <td>{user.appointment_count || 0}</td>
                  <td>{user.location_count || 0}</td>
                  <td>{user.service_count || 0}</td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="action-btn edit-btn"
                        onClick={() => startEdit(user)}
                        title="Edit user"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="action-btn password-btn"
                        onClick={() => handleResetPassword(user.id, user.username)}
                        title="Reset password"
                      >
                        <FaKey />
                      </button>
                      <button
                        className="action-btn impersonate-btn"
                        onClick={() => handleImpersonate(user.id, user.username)}
                        title="Login as this user"
                      >
                        <FaSignInAlt />
                      </button>
                      <button
                        className="action-btn delete-btn"
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        title="Delete user"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
}

export default SuperAdminManager;
