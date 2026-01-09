import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config.js';
import { 
  FaCalendarAlt, FaMapMarkerAlt, FaCut, FaCrown, FaCheck, 
  FaArrowUp, FaInfinity, FaRocket
} from 'react-icons/fa';
import './MyPlan.css';

function MyPlan() {
  const { getAuthHeaders, user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [subRes, usageRes, plansRes] = await Promise.all([
        fetch(`${API_BASE}/subscriptions/my-subscription`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/subscriptions/my-usage`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/subscriptions/plans`, { headers: getAuthHeaders() })
      ]);

      if (subRes.ok && usageRes.ok && plansRes.ok) {
        const [subData, usageData, plansData] = await Promise.all([
          subRes.json(),
          usageRes.json(),
          plansRes.json()
        ]);
        setSubscription(subData);
        setUsage(usageData);
        setPlans(plansData);
      }
    } catch (err) {
      console.error('Error fetching plan data:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculatePercent = (current, max) => {
    if (max === -1) return 0;
    return Math.min(100, Math.round((current / max) * 100));
  };

  const getProgressColor = (percent) => {
    if (percent >= 90) return '#ef4444';
    if (percent >= 70) return '#f59e0b';
    return '#10b981';
  };

  if (loading) {
    return (
      <div className="my-plan-page">
        <div className="loading">Loading your plan details...</div>
      </div>
    );
  }

  if (!subscription || !usage) {
    return (
      <div className="my-plan-page">
        <div className="error">Unable to load plan information</div>
      </div>
    );
  }

  const usageItems = [
    { 
      icon: FaCalendarAlt, 
      label: 'Appointments', 
      current: usage.appointments, 
      max: subscription.max_appointments,
      color: '#3b82f6'
    },
    { 
      icon: FaMapMarkerAlt, 
      label: 'Locations', 
      current: usage.locations, 
      max: subscription.max_locations,
      color: '#10b981'
    },
    { 
      icon: FaCut, 
      label: 'Services', 
      current: usage.services, 
      max: subscription.max_services,
      color: '#8b5cf6'
    }
  ];

  return (
    <div className="my-plan-page">
      <div className="plan-header">
        <div className="plan-title-section">
          <h2><FaCrown className="crown" /> My Subscription</h2>
          <p>Manage your subscription and monitor usage</p>
        </div>
      </div>

      {/* Current Plan Card */}
      <div className="current-plan-card">
        <div className="plan-badge">
          <FaCrown /> Current Plan
        </div>
        <h3>{subscription.plan_display_name}</h3>
        <div className="plan-price">
          {subscription.price_monthly > 0 ? (
            <>
              <span className="amount">£{subscription.price_monthly}</span>
              <span className="period">/month</span>
            </>
          ) : (
            <span className="free-tag">Free</span>
          )}
        </div>
        {subscription.features && subscription.features.length > 0 && (
          <ul className="current-features">
            {subscription.features.map((feature, i) => (
              <li key={i}><FaCheck /> {feature}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Usage Section */}
      <div className="usage-section">
        <h3>Your Usage</h3>
        <div className="usage-grid">
          {usageItems.map((item, index) => {
            const Icon = item.icon;
            const percent = calculatePercent(item.current, item.max);
            const isUnlimited = item.max === -1;

            return (
              <div key={index} className="usage-card">
                <div className="usage-card-header">
                  <div className="usage-icon-wrapper" style={{ background: `${item.color}15` }}>
                    <Icon style={{ color: item.color }} />
                  </div>
                  <div className="usage-label">{item.label}</div>
                </div>
                <div className="usage-numbers">
                  <span className="current">{item.current}</span>
                  <span className="separator">/</span>
                  <span className="max">
                    {isUnlimited ? <><FaInfinity /> Unlimited</> : item.max}
                  </span>
                </div>
                {!isUnlimited && (
                  <div className="usage-progress">
                    <div 
                      className="usage-progress-fill"
                      style={{ 
                        width: `${percent}%`,
                        background: getProgressColor(percent)
                      }}
                    />
                  </div>
                )}
                {!isUnlimited && (
                  <div className="usage-remaining">
                    {item.max - item.current} remaining
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Available Plans */}
      <div className="plans-section">
        <h3><FaRocket /> Available Plans</h3>
        <div className="plans-grid">
          {plans.map(plan => {
            const isCurrentPlan = plan.name === subscription.plan_name;
            const isUpgrade = plan.price_monthly > (subscription.price_monthly || 0);

            return (
              <div 
                key={plan.id} 
                className={`plan-option ${isCurrentPlan ? 'current' : ''} ${plan.name === 'professional' ? 'featured' : ''}`}
              >
                {plan.name === 'professional' && (
                  <div className="featured-badge">Most Popular</div>
                )}
                {isCurrentPlan && (
                  <div className="current-badge">Your Plan</div>
                )}
                <h4>{plan.display_name}</h4>
                <div className="plan-option-price">
                  {plan.price_monthly > 0 ? (
                    <>
                      <span className="amount">£{plan.price_monthly}</span>
                      <span className="period">/month</span>
                    </>
                  ) : (
                    <span className="free">Free</span>
                  )}
                </div>
                <p className="plan-description">{plan.description}</p>
                <div className="plan-limits">
                  <div className="limit-row">
                    <FaCalendarAlt />
                    <span>{plan.max_appointments === -1 ? 'Unlimited' : plan.max_appointments} appointments</span>
                  </div>
                  <div className="limit-row">
                    <FaMapMarkerAlt />
                    <span>{plan.max_locations === -1 ? 'Unlimited' : plan.max_locations} locations</span>
                  </div>
                  <div className="limit-row">
                    <FaCut />
                    <span>{plan.max_services === -1 ? 'Unlimited' : plan.max_services} services</span>
                  </div>
                </div>
                {plan.features && plan.features.length > 0 && (
                  <ul className="plan-features">
                    {plan.features.map((feature, i) => (
                      <li key={i}><FaCheck /> {feature}</li>
                    ))}
                  </ul>
                )}
                <button 
                  className={`plan-action-btn ${isCurrentPlan ? 'current' : isUpgrade ? 'upgrade' : 'downgrade'}`}
                  disabled={isCurrentPlan}
                >
                  {isCurrentPlan ? 'Current Plan' : isUpgrade ? (
                    <><FaArrowUp /> Upgrade</>
                  ) : 'Switch Plan'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default MyPlan;
