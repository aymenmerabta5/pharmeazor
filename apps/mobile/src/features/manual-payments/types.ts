export interface ManualSummary {
  readonly enabled: boolean;
  readonly balanceMinor: number;
  readonly receiverInstructions: string;
}
export interface ManualPayment {
  readonly id: string;
  readonly amountMinor: number;
  readonly status: "pending" | "approved" | "rejected";
  readonly method: string;
  readonly createdAt: string;
  readonly reason: string | null;
}
export interface ManualPaymentCopy {
  readonly title: string;
  readonly description: string;
  readonly readFailed: string;
  readonly loading: string;
  readonly balance: string;
  readonly balanceHelp: string;
  readonly webHelp: string;
  readonly openWeb: string;
  readonly unavailable: string;
  readonly webUnavailable: string;
  readonly history: string;
  readonly empty: string;
  readonly approved: string;
  readonly rejected: string;
  readonly pending: string;
  readonly refresh: string;
}
