import express from 'express';
import Stripe from 'stripe';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Initialise Stripe (lazy — only when keys are configured)
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key);
}

// ── Public: return publishable key to frontend ──
router.get('/config', (req, res) => {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) return res.status(503).json({ error: 'Stripe not configured' });
  res.json({ publishableKey: key });
});

// ── Public: Stripe webhook (raw body — registered with express.raw in server.js) ──
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature failed: ${err.message}` });
  }

  const db = req.app.locals.db;

  // Idempotency — skip if already processed
  const existing = await new Promise((resolve, reject) => {
    db.get('SELECT id FROM payment_events WHERE stripe_event_id = ?', [event.id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (existing) {
    return res.json({ received: true, skipped: true });
  }

  try {
    const stripe = getStripe();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = parseInt(session.client_reference_id);
        const stripeCustomerId = session.customer;
        const stripeSubscriptionId = session.subscription;

        if (!userId || !stripeSubscriptionId) break;

        // Retrieve the subscription to get the price ID
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const priceId = sub.items.data[0]?.price?.id;

        // Find matching plan by stripe_price_id
        const plan = await new Promise((resolve, reject) => {
          db.get('SELECT id FROM subscription_plans WHERE stripe_price_id = ?', [priceId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (!plan) {
          console.error(`[Stripe Webhook] No plan found for price ${priceId}`);
          break;
        }

        // UPSERT user_subscriptions
        await new Promise((resolve, reject) => {
          db.run(`
            INSERT INTO user_subscriptions (user_id, plan_id, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, updated_at)
            VALUES (?, ?, 'active', ?, ?, datetime(?, 'unixepoch'), datetime(?, 'unixepoch'), datetime('now'))
            ON CONFLICT(user_id) DO UPDATE SET
              plan_id = excluded.plan_id,
              status = 'active',
              stripe_customer_id = excluded.stripe_customer_id,
              stripe_subscription_id = excluded.stripe_subscription_id,
              current_period_start = excluded.current_period_start,
              current_period_end = excluded.current_period_end,
              cancel_at_period_end = 0,
              updated_at = datetime('now')
          `, [userId, plan.id, stripeCustomerId, stripeSubscriptionId, sub.current_period_start, sub.current_period_end], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        console.log(`[Stripe Webhook] Checkout completed: user ${userId} → plan ${plan.id}`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const priceId = sub.items.data[0]?.price?.id;

        // Find user by stripe_subscription_id
        const userSub = await new Promise((resolve, reject) => {
          db.get('SELECT user_id FROM user_subscriptions WHERE stripe_subscription_id = ?', [sub.id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (!userSub) break;

        // Find plan by price
        const plan = await new Promise((resolve, reject) => {
          db.get('SELECT id FROM subscription_plans WHERE stripe_price_id = ?', [priceId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        const status = sub.status === 'active' ? 'active'
          : sub.status === 'past_due' ? 'past_due'
          : sub.status === 'canceled' ? 'cancelled'
          : sub.status;

        await new Promise((resolve, reject) => {
          db.run(`
            UPDATE user_subscriptions SET
              status = ?,
              plan_id = COALESCE(?, plan_id),
              current_period_start = datetime(?, 'unixepoch'),
              current_period_end = datetime(?, 'unixepoch'),
              cancel_at_period_end = ?,
              updated_at = datetime('now')
            WHERE stripe_subscription_id = ?
          `, [status, plan?.id, sub.current_period_start, sub.current_period_end, sub.cancel_at_period_end ? 1 : 0, sub.id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        console.log(`[Stripe Webhook] Subscription updated: ${sub.id} → ${status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;

        // Find user
        const userSub = await new Promise((resolve, reject) => {
          db.get('SELECT user_id FROM user_subscriptions WHERE stripe_subscription_id = ?', [sub.id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (!userSub) break;

        // Find free plan
        const freePlan = await new Promise((resolve, reject) => {
          db.get("SELECT id FROM subscription_plans WHERE name = 'free'", [], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        // Downgrade to free
        await new Promise((resolve, reject) => {
          db.run(`
            UPDATE user_subscriptions SET
              status = 'cancelled',
              plan_id = ?,
              stripe_subscription_id = NULL,
              cancel_at_period_end = 0,
              updated_at = datetime('now')
            WHERE user_id = ?
          `, [freePlan?.id || 1, userSub.user_id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        console.log(`[Stripe Webhook] Subscription deleted: user ${userSub.user_id} downgraded to free`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;

        const periodEnd = invoice.lines?.data?.[0]?.period?.end;
        if (periodEnd) {
          await new Promise((resolve, reject) => {
            db.run(`
              UPDATE user_subscriptions SET
                current_period_end = datetime(?, 'unixepoch'),
                status = 'active',
                updated_at = datetime('now')
              WHERE stripe_subscription_id = ?
            `, [periodEnd, invoice.subscription], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (!invoice.subscription) break;

        await new Promise((resolve, reject) => {
          db.run(`
            UPDATE user_subscriptions SET
              status = 'past_due',
              updated_at = datetime('now')
            WHERE stripe_subscription_id = ?
          `, [invoice.subscription], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        console.log(`[Stripe Webhook] Payment failed for subscription ${invoice.subscription}`);
        break;
      }
    }

    // Log event for audit
    const userSub = await new Promise((resolve, reject) => {
      const subId = event.data.object.id || event.data.object.subscription;
      db.get('SELECT user_id FROM user_subscriptions WHERE stripe_subscription_id = ? OR stripe_customer_id = ?',
        [subId, event.data.object.customer], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
    });

    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO payment_events (user_id, stripe_event_id, event_type, stripe_subscription_id, stripe_customer_id, raw_event_data)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        userSub?.user_id || null,
        event.id,
        event.type,
        event.data.object.subscription || event.data.object.id,
        event.data.object.customer,
        JSON.stringify(event.data.object)
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

  } catch (err) {
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, err);
    // Return 200 anyway to prevent Stripe from retrying
  }

  res.json({ received: true });
});

// ── Authenticated: Create Stripe Checkout session ──
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const db = req.app.locals.db;
    const { planId } = req.body;

    // Get plan with stripe_price_id
    const plan = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1', [planId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!plan || !plan.stripe_price_id) {
      return res.status(400).json({ error: 'Invalid plan or plan not configured for payments' });
    }

    // Get user email
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT email FROM users WHERE id = ?', [req.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Check for existing Stripe customer
    const existingSub = await new Promise((resolve, reject) => {
      db.get('SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = ?', [req.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const sessionParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      client_reference_id: String(req.userId),
      success_url: `${req.headers.origin || req.protocol + '://' + req.headers.host}/my-plan?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || req.protocol + '://' + req.headers.host}/my-plan?cancelled=true`,
    };

    if (existingSub?.stripe_customer_id) {
      sessionParams.customer = existingSub.stripe_customer_id;
    } else if (user?.email) {
      sessionParams.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Error creating checkout session:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Authenticated: Create Stripe Customer Portal session ──
router.post('/create-portal-session', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const db = req.app.locals.db;

    const sub = await new Promise((resolve, reject) => {
      db.get('SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = ?', [req.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!sub?.stripe_customer_id) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${req.headers.origin || req.protocol + '://' + req.headers.host}/my-plan`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Error creating portal session:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Authenticated: Cancel subscription (at period end) ──
router.post('/cancel-subscription', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const db = req.app.locals.db;

    const sub = await new Promise((resolve, reject) => {
      db.get('SELECT stripe_subscription_id FROM user_subscriptions WHERE user_id = ?', [req.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!sub?.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription to cancel' });
    }

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    // Update local record
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE user_subscriptions SET cancel_at_period_end = 1, updated_at = datetime('now')
        WHERE user_id = ?
      `, [req.userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ message: 'Subscription will be cancelled at end of billing period' });
  } catch (err) {
    console.error('[Stripe] Error cancelling subscription:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Authenticated: Change plan (upgrade/downgrade between paid plans) ──
router.post('/change-plan', authenticateToken, async (req, res) => {
  try {
    const stripe = getStripe();
    const db = req.app.locals.db;
    const { planId } = req.body;

    // Get new plan
    const newPlan = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1', [planId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!newPlan || !newPlan.stripe_price_id) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Get current subscription
    const sub = await new Promise((resolve, reject) => {
      db.get('SELECT stripe_subscription_id FROM user_subscriptions WHERE user_id = ?', [req.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!sub?.stripe_subscription_id) {
      // No existing Stripe subscription — redirect to checkout instead
      return res.status(400).json({ error: 'No active subscription. Use checkout to subscribe.', needsCheckout: true });
    }

    // Get current subscription from Stripe to find the item ID
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const itemId = stripeSub.items.data[0]?.id;

    if (!itemId) {
      return res.status(500).json({ error: 'Could not find subscription item' });
    }

    // Update subscription with new price (Stripe handles proration)
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: itemId, price: newPlan.stripe_price_id }],
      cancel_at_period_end: false, // Clear any pending cancellation
    });

    // Update local record
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE user_subscriptions SET plan_id = ?, cancel_at_period_end = 0, updated_at = datetime('now')
        WHERE user_id = ?
      `, [newPlan.id, req.userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ message: `Plan changed to ${newPlan.display_name}` });
  } catch (err) {
    console.error('[Stripe] Error changing plan:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
