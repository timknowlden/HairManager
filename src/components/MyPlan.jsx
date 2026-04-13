import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../config.js';
import {
  FaCalendarAlt, FaMapMarkerAlt, FaCut, FaCrown, FaCheck,
  FaArrowUp, FaInfinity, FaRocket, FaCreditCard, FaTimesCircle,
  FaExclamationTriangle
} from 'react-icons/fa';
import './MyPlan.css';

function MyPlan() {
  const { getAuthHeaders, user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // plan id or 'cancel'/'portal'
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'cancel' | 'change', plan }
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text }

  useEffect(() => {
    fetchData();
    checkStripeConfig();
    handleReturnFromStripe();
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

  const checkStripeConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/payments/config`);
      if (res.ok) setStripeConfigured(true);
    } catch {
      // Stripe not configured — buttons will remain disabled
    }
  };

  const handleReturnFromStripe = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('session_id')) {
      setMessage({ type: 'success', text: 'Payment successful! Your plan has been upgraded.' });
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('cancelled')) {
      setMessage({ type: 'error', text: 'Checkout was cancelled. No changes made.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleUpgrade = async (plan) => {
    if (!stripeConfigured) return;

    // If user has an active paid subscription, this is a plan change
    if (subscription?.stripe_subscription_id && subscription.price_monthly > 0) {
      setConfirmAction({ type: 'change', plan });
      return;
    }

    // Otherwise, redirect to Stripe Checkout
    setActionLoading(plan.id);
    try {
      const res = await fetch(`${API_BASE}/payments/create-checkout-session`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create checkout session' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error connecting to payment service' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangePlan = async (plan) => {
    setActionLoading(plan.id);
    setConfirmAction(null);
    try {
      const res = await fetch(`${API_BASE}/payments/change-plan`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message || 'Plan changed successfully' });
        fetchData(); // Refresh
      } else if (data.needsCheckout) {
        // No existing subscription — need checkout
        handleUpgrade(plan);
        return;
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to change plan' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error changing plan' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setActionLoading('portal');
    try {
      const res = await fetch(`${API_BASE}/payments/create-portal-session`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to open billing portal' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error connecting to billing portal' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    setActionLoading('cancel');
    setConfirmAction(null);
    try {
      const res = await fetch(`${API_BASE}/payments/cancel-subscription`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message || 'Subscription will be cancelled at the end of your billing period' });
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to cancel subscription' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error cancelling subscription' });
    } finally {
      setActionLoading(null);
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

  const isPaidPlan = subscription.price_monthly > 0;
  const isPastDue = subscription.status === 'past_due';
  const isCancelling = subscription.cancel_at_period_end === 1;

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

      {/* Status Messages */}
      {message && (
        <div className={`plan-message ${message.type}`}>
          {message.type === 'success' ? <FaCheck /> : <FaExclamationTriangle />}
          {message.text}
          <button className="message-dismiss" onClick={() => setMessage(null)}>&times;</button>
        </div>
      )}

      {/* Past Due Warning */}
      {isPastDue && (
        <div className="plan-message error">
          <FaExclamationTriangle /> Payment failed. Please update your payment method to keep your plan.
          {stripeConfigured && (
            <button className="message-action-btn" onClick={handleManageBilling} disabled={actionLoading === 'portal'}>
              Update Payment Method
            </button>
          )}
        </div>
      )}

      {/* Cancellation Notice */}
      {isCancelling && subscription.current_period_end && (
        <div className="plan-message warning">
          <FaExclamationTriangle /> Your plan will be downgraded to Free on {new Date(subscription.current_period_end).toLocaleDateString('en-GB')}.
        </div>
      )}

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
        {/* Billing actions for paid plans */}
        {isPaidPlan && stripeConfigured && (
          <div className="plan-billing-actions">
            <button
              className="billing-btn manage"
              onClick={handleManageBilling}
              disabled={actionLoading === 'portal'}
            >
              <FaCreditCard /> {actionLoading === 'portal' ? 'Loading...' : 'Manage Billing'}
            </button>
            {!isCancelling && (
              <button
                className="billing-btn cancel"
                onClick={() => setConfirmAction({ type: 'cancel' })}
                disabled={actionLoading === 'cancel'}
              >
                <FaTimesCircle /> {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Subscription'}
              </button>
            )}
          </div>
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
            const isFree = plan.price_monthly === 0;
            const canAct = stripeConfigured && !isCurrentPlan && !isFree;

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
                  disabled={isCurrentPlan || !canAct || actionLoading === plan.id}
                  onClick={() => canAct && handleUpgrade(plan)}
                >
                  {actionLoading === plan.id ? 'Processing...' : isCurrentPlan ? 'Current Plan' : isUpgrade ? (
                    <><FaArrowUp /> Upgrade</>
                  ) : 'Switch Plan'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="confirm-overlay" onClick={() => setConfirmAction(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            {confirmAction.type === 'cancel' ? (
              <>
                <h3>Cancel Subscription?</h3>
                <p>Your plan will remain active until the end of your current billing period. After that, you'll be downgraded to the Free plan.</p>
                <div className="confirm-actions">
                  <button className="confirm-btn danger" onClick={handleCancel}>Yes, Cancel</button>
                  <button className="confirm-btn secondary" onClick={() => setConfirmAction(null)}>Keep Plan</button>
                </div>
              </>
            ) : (
              <>
                <h3>Change to {confirmAction.plan.display_name}?</h3>
                <p>
                  {confirmAction.plan.price_monthly > (subscription.price_monthly || 0)
                    ? `You'll be upgraded to ${confirmAction.plan.display_name} at £${confirmAction.plan.price_monthly}/month. Your billing will be prorated.`
                    : `You'll be switched to ${confirmAction.plan.display_name} at £${confirmAction.plan.price_monthly}/month. You'll receive a prorated credit.`
                  }
                </p>
                <div className="confirm-actions">
                  <button className="confirm-btn primary" onClick={() => handleChangePlan(confirmAction.plan)}>Confirm Change</button>
                  <button className="confirm-btn secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MyPlan;
