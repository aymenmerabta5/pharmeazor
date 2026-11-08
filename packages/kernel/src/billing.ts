export interface BillingSubscription {
  id: string;
  provider: string;
  status: string;
  currentPeriodEnd?: string | null;
  priceId?: string | null;
  customerId?: string | null;
}
export interface UseBillingReturn {
  subscriptions: BillingSubscription[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasActiveSubscription: boolean;
  isLoading: boolean;
}
