import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config.js';
import { 
  FaPlus, FaEdit, FaTrash, FaCrown, FaUsers, FaCheck, FaTimes,
  FaInfinity, FaSave, FaChevronDown, FaChevronUp, FaSort, FaSortUp, FaSortDown
} from 'react-icons/fa';
import './SubscriptionManager.css';

function SubscriptionManager() {
  const { getAuthHeaders } = useAuth();
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [assigningUser, setAssigningUser] = useState(null);

  // Filter and sort states for user subscriptions
  const [userFilters, setUserFilters] = useState({ username: '', email: '', plan: '' });
  const [userSortConfig, setUserSortConfig] = useState({ column: 'username', direction: 'asc' });
  
  const [planForm, setPlanForm] = useState({
    name: '',
    display_name: '',
    description: '',
    price_monthly: 0,
    price_yearly: 0,
    max_appointments: -1,
    max_locations: -1,
    max_services: -1,
    features: [],
    is_active: true,
    sort_order: 0
  });

  const [newFeature, setNewFeature] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, subsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/subscriptions/admin/plans`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/subscriptions/admin/subscriptions`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/admin/users`, { headers: getAuthHeaders() })
      ]);

      if (!plansRes.ok || !subsRes.ok || !usersRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const [plansData, subsData, usersData] = await Promise.all([
        plansRes.json(),
        subsRes.json(),
        usersRes.json()
      ]);

      setPlans(plansData);
      setSubscriptions(subsData);
      setUsers(usersData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPlanForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : 
              type === 'number' ? (value === '' ? '' : parseFloat(value)) : value
    }));
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setPlanForm(prev => ({
        ...prev,
        features: [...prev.features, newFeature.trim()]
      }));
      setNewFeature('');
    }
  };

  const removeFeature = (index) => {
    setPlanForm(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
  };

  const handleCreatePlan = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/subscriptions/admin/plans`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(planForm)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create plan');
      }

      setSuccess('Plan created successfully!');
      setShowCreatePlan(false);
      resetPlanForm();
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdatePlan = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/subscriptions/admin/plans/${editingPlan.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(planForm)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update plan');
      }

      setSuccess('Plan updated successfully!');
      setEditingPlan(null);
      resetPlanForm();
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeletePlan = async (planId) => {
    if (!window.confirm('Are you sure you want to delete this plan?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/subscriptions/admin/plans/${planId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete plan');
      }

      setSuccess('Plan deleted successfully!');
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssignSubscription = async (userId, planId) => {
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_BASE}/subscriptions/admin/subscriptions`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ user_id: userId, plan_id: planId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign subscription');
      }

      setSuccess('Subscription assigned successfully!');
      setAssigningUser(null);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEditPlan = (plan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      display_name: plan.display_name,
      description: plan.description || '',
      price_monthly: plan.price_monthly || 0,
      price_yearly: plan.price_yearly || 0,
      max_appointments: plan.max_appointments,
      max_locations: plan.max_locations,
      max_services: plan.max_services,
      features: plan.features || [],
      is_active: plan.is_active === 1,
      sort_order: plan.sort_order || 0
    });
    setShowCreatePlan(false);
  };

  const resetPlanForm = () => {
    setPlanForm({
      name: '',
      display_name: '',
      description: '',
      price_monthly: 0,
      price_yearly: 0,
      max_appointments: -1,
      max_locations: -1,
      max_services: -1,
      features: [],
      is_active: true,
      sort_order: 0
    });
  };

  const formatLimit = (limit) => {
    return limit === -1 ? <><FaInfinity /> Unlimited</> : limit;
  };

  const getUserSubscription = (userId) => {
    return subscriptions.find(s => s.user_id === userId);
  };

  // User filter handlers
  const handleUserFilterChange = (column, value) => {
    setUserFilters(prev => ({ ...prev, [column]: value }));
  };

  const clearUserFilters = () => {
    setUserFilters({ username: '', email: '', plan: '' });
  };

  const hasActiveUserFilters = Object.values(userFilters).some(f => f !== '');

  // User sort handler
  const handleUserSort = (column) => {
    setUserSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sort icon helper
  const getUserSortIcon = (column) => {
    if (userSortConfig.column !== column) return <FaSort className="sort-icon inactive" />;
    return userSortConfig.direction === 'asc' 
      ? <FaSortUp className="sort-icon active" /> 
      : <FaSortDown className="sort-icon active" />;
  };

  // Filtered and sorted users
  const filteredUsers = useMemo(() => {
    let result = users.filter(user => {
      // Username filter
      if (userFilters.username && !user.username.toLowerCase().includes(userFilters.username.toLowerCase())) return false;
      
      // Email filter
      if (userFilters.email) {
        const email = user.email || '';
        if (!email.toLowerCase().includes(userFilters.email.toLowerCase())) return false;
      }
      
      // Plan filter
      if (userFilters.plan) {
        const subscription = getUserSubscription(user.id);
        const planName = subscription ? subscription.plan_display_name : 'Free';
        if (!planName.toLowerCase().includes(userFilters.plan.toLowerCase())) return false;
      }
      
      return true;
    });

    // Sort
    if (userSortConfig.column) {
      result.sort((a, b) => {
        let aVal, bVal;

        if (userSortConfig.column === 'plan') {
          const aSub = getUserSubscription(a.id);
          const bSub = getUserSubscription(b.id);
          aVal = aSub ? aSub.plan_display_name : 'Free';
          bVal = bSub ? bSub.plan_display_name : 'Free';
        } else if (userSortConfig.column === 'status') {
          const aSub = getUserSubscription(a.id);
          const bSub = getUserSubscription(b.id);
          aVal = aSub?.status || 'active';
          bVal = bSub?.status || 'active';
        } else {
          aVal = a[userSortConfig.column];
          bVal = b[userSortConfig.column];
        }

        // Handle null/undefined
        if (aVal == null) aVal = '';
        if (bVal == null) bVal = '';

        // String comparison
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

        if (aVal < bVal) return userSortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return userSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [users, userFilters, userSortConfig, subscriptions]);

  if (loading) {
    return <div className="subscription-manager"><div className="loading">Loading subscription data...</div></div>;
  }

  return (
    <div className="subscription-manager">
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* Plans Section */}
      <div className="section">
        <div className="section-header">
          <h3><FaCrown /> Subscription Plans</h3>
          {!showCreatePlan && !editingPlan && (
            <button className="add-btn" onClick={() => { setShowCreatePlan(true); setEditingPlan(null); resetPlanForm(); }}>
              <FaPlus /> Add Plan
            </button>
          )}
        </div>

        {(showCreatePlan || editingPlan) && (
          <div className="plan-form-container">
            <h4>{editingPlan ? 'Edit Plan' : 'Create New Plan'}</h4>
            <form onSubmit={editingPlan ? handleUpdatePlan : handleCreatePlan} className="plan-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Internal Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={planForm.name}
                    onChange={handlePlanInputChange}
                    placeholder="e.g., starter"
                    required
                    disabled={!!editingPlan}
                  />
                </div>
                <div className="form-group">
                  <label>Display Name *</label>
                  <input
                    type="text"
                    name="display_name"
                    value={planForm.display_name}
                    onChange={handlePlanInputChange}
                    placeholder="e.g., Starter Plan"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={planForm.description}
                  onChange={handlePlanInputChange}
                  placeholder="Brief description of the plan"
                  rows={2}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Monthly Price (£)</label>
                  <input
                    type="number"
                    name="price_monthly"
                    value={planForm.price_monthly}
                    onChange={handlePlanInputChange}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>Yearly Price (£)</label>
                  <input
                    type="number"
                    name="price_yearly"
                    value={planForm.price_yearly}
                    onChange={handlePlanInputChange}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>Sort Order</label>
                  <input
                    type="number"
                    name="sort_order"
                    value={planForm.sort_order}
                    onChange={handlePlanInputChange}
                    min="0"
                  />
                </div>
              </div>

              <div className="limits-section">
                <h5>Limits (-1 = unlimited)</h5>
                <div className="form-row">
                  <div className="form-group">
                    <label>Max Appointments</label>
                    <input
                      type="number"
                      name="max_appointments"
                      value={planForm.max_appointments}
                      onChange={handlePlanInputChange}
                      min="-1"
                    />
                  </div>
                  <div className="form-group">
                    <label>Max Locations</label>
                    <input
                      type="number"
                      name="max_locations"
                      value={planForm.max_locations}
                      onChange={handlePlanInputChange}
                      min="-1"
                    />
                  </div>
                  <div className="form-group">
                    <label>Max Services</label>
                    <input
                      type="number"
                      name="max_services"
                      value={planForm.max_services}
                      onChange={handlePlanInputChange}
                      min="-1"
                    />
                  </div>
                </div>
              </div>

              <div className="features-section">
                <h5>Features</h5>
                <div className="feature-input">
                  <input
                    type="text"
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    placeholder="Add a feature..."
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                  />
                  <button type="button" className="add-feature-btn" onClick={addFeature}>
                    <FaPlus />
                  </button>
                </div>
                <ul className="features-list">
                  {planForm.features.map((feature, index) => (
                    <li key={index}>
                      <FaCheck className="check-icon" />
                      <span>{feature}</span>
                      <button type="button" className="remove-feature-btn" onClick={() => removeFeature(index)}>
                        <FaTimes />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={planForm.is_active}
                    onChange={handlePlanInputChange}
                  />
                  <span>Active (visible to users)</span>
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="save-btn">
                  <FaSave /> {editingPlan ? 'Update Plan' : 'Create Plan'}
                </button>
                <button type="button" className="cancel-btn" onClick={() => { setEditingPlan(null); setShowCreatePlan(false); resetPlanForm(); }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="plans-grid">
          {plans.map(plan => (
            <div key={plan.id} className={`plan-card ${!plan.is_active ? 'inactive' : ''}`}>
              <div className="plan-header">
                <h4>{plan.display_name}</h4>
                {!plan.is_active && <span className="inactive-badge">Inactive</span>}
              </div>
              <div className="plan-price">
                <span className="amount">£{plan.price_monthly}</span>
                <span className="period">/month</span>
              </div>
              <p className="plan-description">{plan.description}</p>
              <div className="plan-limits">
                <div className="limit-item">
                  <span className="limit-label">Appointments</span>
                  <span className="limit-value">{formatLimit(plan.max_appointments)}</span>
                </div>
                <div className="limit-item">
                  <span className="limit-label">Locations</span>
                  <span className="limit-value">{formatLimit(plan.max_locations)}</span>
                </div>
                <div className="limit-item">
                  <span className="limit-label">Services</span>
                  <span className="limit-value">{formatLimit(plan.max_services)}</span>
                </div>
              </div>
              {plan.features && plan.features.length > 0 && (
                <div className="plan-features">
                  <button 
                    className="toggle-features"
                    onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                  >
                    Features {expandedPlan === plan.id ? <FaChevronUp /> : <FaChevronDown />}
                  </button>
                  {expandedPlan === plan.id && (
                    <ul>
                      {plan.features.map((feature, i) => (
                        <li key={i}><FaCheck /> {feature}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="plan-actions">
                <button className="edit-btn" onClick={() => startEditPlan(plan)}>
                  <FaEdit /> Edit
                </button>
                <button className="delete-btn" onClick={() => handleDeletePlan(plan.id)}>
                  <FaTrash /> Delete
                </button>
              </div>
              <div className="plan-subscribers">
                <FaUsers /> {subscriptions.filter(s => s.plan_id === plan.id).length} subscribers
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User Subscriptions Section */}
      <div className="section">
        <div className="section-header">
          <h3><FaUsers /> User Subscriptions ({filteredUsers.length}{filteredUsers.length !== users.length ? ` of ${users.length}` : ''})</h3>
          {hasActiveUserFilters && (
            <button onClick={clearUserFilters} className="clear-filters-btn">
              <FaTimes /> Clear Filters
            </button>
          )}
        </div>
        
        <div className="subscriptions-table-container">
          <table className="subscriptions-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleUserSort('username')}>User {getUserSortIcon('username')}</th>
                <th className="sortable" onClick={() => handleUserSort('email')}>Email {getUserSortIcon('email')}</th>
                <th className="sortable" onClick={() => handleUserSort('plan')}>Current Plan {getUserSortIcon('plan')}</th>
                <th className="sortable" onClick={() => handleUserSort('status')}>Status {getUserSortIcon('status')}</th>
                <th>Actions</th>
              </tr>
              <tr className="filter-row">
                <th>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={userFilters.username}
                    onChange={(e) => handleUserFilterChange('username', e.target.value)}
                    className="filter-input"
                  />
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={userFilters.email}
                    onChange={(e) => handleUserFilterChange('email', e.target.value)}
                    className="filter-input"
                  />
                </th>
                <th>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={userFilters.plan}
                    onChange={(e) => handleUserFilterChange('plan', e.target.value)}
                    className="filter-input"
                  />
                </th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => {
                const subscription = getUserSubscription(user.id);
                return (
                  <tr key={user.id}>
                    <td><strong>{user.username}</strong></td>
                    <td>{user.email || '—'}</td>
                    <td>
                      {subscription ? (
                        <span className="plan-badge">{subscription.plan_display_name}</span>
                      ) : (
                        <span className="plan-badge free">Free</span>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${subscription?.status || 'active'}`}>
                        {subscription?.status || 'Active'}
                      </span>
                    </td>
                    <td>
                      {assigningUser === user.id ? (
                        <div className="assign-dropdown">
                          <select onChange={(e) => e.target.value && handleAssignSubscription(user.id, parseInt(e.target.value))}>
                            <option value="">Select plan...</option>
                            {plans.filter(p => p.is_active).map(plan => (
                              <option key={plan.id} value={plan.id}>{plan.display_name}</option>
                            ))}
                          </select>
                          <button className="cancel-assign" onClick={() => setAssigningUser(null)}>
                            <FaTimes />
                          </button>
                        </div>
                      ) : (
                        <button className="assign-btn" onClick={() => setAssigningUser(user.id)}>
                          Change Plan
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SubscriptionManager;
