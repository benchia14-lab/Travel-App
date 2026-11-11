import { useSyncExternalStore } from 'react';

/**
 * Subscription entitlement.
 *
 * This is a client-side placeholder. In production, replace `activate()` with a
 * redirect to a hosted checkout (e.g. Stripe Checkout / RevenueCat for the app
 * stores) and load the entitlement from your backend after sign-in.
 */
export type Tier = 'free' | 'pro';

export interface PlanState {
  tier: Tier;
  billing?: 'monthly' | 'yearly';
  since?: number;
}

export const PRICING = {
  monthly: 7.99,
  yearly: 59.99,
  currency: 'USD',
};

export const FREE_LIMITS = {
  trips: 2,
  mediaPerTrip: 60,
};

const KEY = 'wayfare.plan';
const listeners = new Set<() => void>();

function read(): PlanState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { tier: 'free' };
}

let state = read();

export function setPlan(next: PlanState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function usePlan() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export const isPro = () => state.tier === 'pro';
