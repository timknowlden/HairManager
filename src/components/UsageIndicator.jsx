import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config.js';
import { FaCalendarAlt, FaMapMarkerAlt, FaCut, FaCrown, FaExclamationTriangle } from 'react-icons/fa';
import './UsageIndicator.css';

function UsageIndicator({ compact = false }) {
  const { getAuthHeaders, user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [subRes, usageRes] = await Promise.all([
        fetch(`${API_BASE}/subscriptions/my-subscription`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/subscriptions/my-usage`, { headers: getAuthHeaders() })
      ]);

      if (subRes.ok && usageRes.ok) {
        const [subData, usageData] = await Promise.all([
          subRes.json(),
          usageRes.json()
        ]);
        setSubscription(subData);
        setUsage(usageData);
      }
    } catch (err) {
      console.error('Error fetching usage data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;
  if (!subscription || !usage) return null;

  const calculatePercent = (current, max) => {
    if (max === -1) return 0; // Unlimited
    return Math.min(100, Math.round((current / max) * 100));
  };

  const isNearLimit = (current, max) => {
    if (max === -1) return false;
    return current >= max * 0.8;
  };

  const isAtLimit = (current, max) => {
    if (max === -1) return false;
    return current >= max;
  };

  const items = [
    { 
      icon: FaCalendarAlt, 
      label: 'Appointments', 
      current: usage.appointments, 
      max: subscription.max_appointments 
    },
    { 
      icon: FaMapMarkerAlt, 
      label: 'Locations', 
      current: usage.locations, 
      max: subscription.max_locations 
    },
    { 
      icon: FaCut, 
      label: 'Services', 
      current: usage.services, 
      max: subscription.max_services 
    }
  ];

  // Check if any item is near or at limit
  const hasWarning = items.some(item => isNearLimit(item.current, item.max));
  const hasLimit = items.some(item => isAtLimit(item.current, item.max));

  if (compact) {
    return (
      <div className={`usage-indicator compact ${hasLimit ? 'at-limit' : hasWarning ? 'near-limit' : ''}`}>
        <span className="plan-name">
          <FaCrown /> {subscription.plan_display_name}
        </span>
        {(hasWarning || hasLimit) && (
          <FaExclamationTriangle className="warning-icon" />
        )}
      </div>
    );
  }

  return (
    <div className="usage-indicator">
      <div className="usage-header">
        <div className="plan-info">
          <FaCrown className="crown-icon" />
          <span className="plan-name">{subscription.plan_display_name} Plan</span>
        </div>
        {hasLimit && (
          <a href="#" className="upgrade-link">Upgrade</a>
        )}
      </div>

      <div className="usage-items">
        {items.map((item, index) => {
          const Icon = item.icon;
          const percent = calculatePercent(item.current, item.max);
          const nearLimit = isNearLimit(item.current, item.max);
          const atLimit = isAtLimit(item.current, item.max);
          const isUnlimited = item.max === -1;

          return (
            <div key={index} className={`usage-item ${atLimit ? 'at-limit' : nearLimit ? 'near-limit' : ''}`}>
              <div className="usage-item-header">
                <Icon className="usage-icon" />
                <span className="usage-label">{item.label}</span>
                <span className="usage-count">
                  {item.current} / {isUnlimited ? '∞' : item.max}
                </span>
              </div>
              {!isUnlimited && (
                <div className="usage-bar">
                  <div 
                    className="usage-bar-fill" 
                    style={{ width: `${percent}%` }}
                  />
                </div>
              )}
              {isUnlimited && (
                <div className="unlimited-badge">Unlimited</div>
              )}
            </div>
          );
        })}
      </div>

      {hasLimit && (
        <div className="limit-warning">
          <FaExclamationTriangle />
          <span>You've reached your plan limit. Upgrade to continue adding more.</span>
        </div>
      )}
    </div>
  );
}

export default UsageIndicator;
