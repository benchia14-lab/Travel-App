import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FREE_LIMITS, PRICING, setPlan, usePlan } from '../lib/plan';
import { money } from '../lib/format';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const REASONS: Record<string, string> = {
  trips: `The free plan includes ${FREE_LIMITS.trips} trips.`,
  print: 'Printable journals are part of Wayfare Pro.',
  watermark: 'Pro posters export without the watermark.',
};

const FEATURES: [string, boolean, boolean][] = [
  ['Map, journal, food log & spend tracking', true, true],
  ['Photo GPS import & auto-grouped stops', true, true],
  ['Trips', false, true],
  ['Photos & videos per trip', false, true],
  ['Social posters (post, story, square)', true, true],
  ['Watermark-free exports', false, true],
  ['Carousel export of every location', false, true],
  ['Printable journal & PDF report', false, true],
  ['Full backup & restore', true, true],
];

export function ProPage() {
  const plan = usePlan();
  const [params] = useSearchParams();
  const [billing, setBilling] = useState<'yearly' | 'monthly'>('yearly');
  const toast = useToast();
  const reason = REASONS[params.get('reason') ?? ''];
  const price = billing === 'yearly' ? PRICING.yearly : PRICING.monthly;
  const save = Math.round((1 - PRICING.yearly / (PRICING.monthly * 12)) * 100);

  const activate = () => {
    // Placeholder: wire this to Stripe Checkout / App Store / Play Billing.
    setPlan({ tier: 'pro', billing, since: Date.now() });
    toast('Welcome to Wayfare Pro');
  };

  return (
    <div className="page page--narrow">
      <header className="pro-head">
        <span className="badge badge--pro"><Icon name="crown" size={14} /> Wayfare Pro</span>
        <h1 className="display">Your travels, told beautifully.</h1>
        {reason && <p className="notice">{reason}</p>}
        <p className="muted">Unlimited trips and memories, a printable journal for every journey, and studio-quality posters without a watermark.</p>
      </header>

      {plan.tier === 'pro' ? (
        <div className="panel pro-active">
          <h2 className="h2">You're a Pro member</h2>
          <p className="muted">
            {plan.billing === 'yearly' ? 'Annual' : 'Monthly'} plan · since {new Date(plan.since ?? Date.now()).toLocaleDateString()}
          </p>
          <button className="btn btn--ghost" onClick={() => setPlan({ tier: 'free' })}>Manage / cancel subscription</button>
        </div>
      ) : (
        <div className="pricing">
          <div className="seg seg--center">
            <button className={billing === 'monthly' ? 'on' : ''} onClick={() => setBilling('monthly')}>Monthly</button>
            <button className={billing === 'yearly' ? 'on' : ''} onClick={() => setBilling('yearly')}>Yearly <span className="tag tag--accent">−{save}%</span></button>
          </div>
          <div className="price-card">
            <p className="price">
              {money(price, PRICING.currency)}
              <span>/{billing === 'yearly' ? 'year' : 'month'}</span>
            </p>
            {billing === 'yearly' && <p className="muted small">{money(PRICING.yearly / 12, PRICING.currency)} per month, billed annually · 7-day free trial</p>}
            <button className="btn btn--primary btn--lg btn--block" onClick={activate}>Start Pro</button>
            <p className="muted small">Cancel anytime.</p>
          </div>
        </div>
      )}

      <table className="table compare">
        <thead>
          <tr><th /><th>Free</th><th>Pro</th></tr>
        </thead>
        <tbody>
          {FEATURES.map(([f, free, pro]) => (
            <tr key={f}>
              <td>{f}</td>
              <td>{f === 'Trips' ? FREE_LIMITS.trips : f.startsWith('Photos') ? FREE_LIMITS.mediaPerTrip : free ? <Icon name="check" size={18} /> : <span className="muted">—</span>}</td>
              <td>{f === 'Trips' || f.startsWith('Photos') ? 'Unlimited' : pro ? <Icon name="check" size={18} /> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
