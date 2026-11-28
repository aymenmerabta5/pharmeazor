/**
 * Who may open the assistant surface.
 *
 * A live subscription is the ordinary entitlement. Administrators are
 * sponsored by the platform: they need no plan to operate or support the
 * assistant, and the admission layer records their lease as `sponsored`.
 */
export function canOpenAgent(input: {
  readonly hasLiveSubscription: boolean;
  readonly isAdmin: boolean;
}): boolean {
  return input.isAdmin || input.hasLiveSubscription;
}
