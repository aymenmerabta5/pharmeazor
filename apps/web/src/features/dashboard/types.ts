export interface DashboardUser {
  name?: string | null;
  email?: string | null;
  role?: unknown;
}

export interface DashboardIdentityState {
  user: DashboardUser | null | undefined;
  pending: boolean;
  error: unknown;
}
