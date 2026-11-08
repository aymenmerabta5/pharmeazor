import { implement, os } from "@orpc/server";
import { appContract } from "./contract";
import { health } from "./procedures/health";
import type { ApiContext } from "./context";
import { me } from "./procedures/me";
import { adminListUsers } from "./procedures/admin/list-users";
import { adminCreateUser } from "./procedures/admin/create-user";
import { adminChangeRole } from "./procedures/admin/change-role";
import { adminSetBanned } from "./procedures/admin/set-banned";
import { billingSubscriptions } from "./procedures/billing/subscriptions";
import { billingCreateCheckout } from "./procedures/billing/create-checkout";
import { billingCreatePortalSession } from "./procedures/billing/create-portal-session";
import { billingCreatePaymentLink } from "./procedures/billing/create-payment-link";
import { manualBillingProcedures } from "./procedures/billing/manual";
import { createIdentityProcedures } from "./identity/procedures";
import { createStorageProcedures } from "./storage/procedures";
import { createOwnedStorageServiceForRequest } from "./composition/storage";

const implementer = implement<typeof appContract, ApiContext>(appContract);

export const appRouter = os
  .$context<ApiContext>()
  .prefix("/api")
  .router(
    implementer.router({
      health,
      me,
      adminUsers: {
        list: adminListUsers,
        create: adminCreateUser,
        changeRole: adminChangeRole,
        setBanned: adminSetBanned,
      },
      billing: {
        subscriptions: billingSubscriptions,
        createCheckout: billingCreateCheckout,
        createPortalSession: billingCreatePortalSession,
        createPaymentLink: billingCreatePaymentLink,
        manual: manualBillingProcedures,
      },
      identity: createIdentityProcedures<ApiContext>(),
      storage: createStorageProcedures<ApiContext>((context) =>
        createOwnedStorageServiceForRequest(context),
      ),
    }),
  );
