import { healthContract } from "./procedures/health";
import { meContract } from "./procedures/me";
import { adminListUsersContract } from "./procedures/admin/list-users";
import { adminCreateUserContract } from "./procedures/admin/create-user";
import { adminChangeRoleContract } from "./procedures/admin/change-role";
import { adminSetBannedContract } from "./procedures/admin/set-banned";
import { billingSubscriptionsContract } from "./procedures/billing/subscriptions";
import { billingCreateCheckoutContract } from "./procedures/billing/create-checkout";
import { billingCreatePortalSessionContract } from "./procedures/billing/create-portal-session";
import { billingCreatePaymentLinkContract } from "./procedures/billing/create-payment-link";
import { manualBillingContract } from "./procedures/billing/manual";
import { identityContract } from "./identity/contract";
import { storageContract } from "./storage/contract";

export const appContract = {
  health: healthContract,
  me: meContract,
  adminUsers: {
    list: adminListUsersContract,
    create: adminCreateUserContract,
    changeRole: adminChangeRoleContract,
    setBanned: adminSetBannedContract,
  },
  billing: {
    subscriptions: billingSubscriptionsContract,
    createCheckout: billingCreateCheckoutContract,
    createPortalSession: billingCreatePortalSessionContract,
    createPaymentLink: billingCreatePaymentLinkContract,
    manual: manualBillingContract,
  },
  identity: identityContract,
  storage: storageContract,
};
