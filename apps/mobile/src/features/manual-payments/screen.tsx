import * as React from "react";
import { ManualPaymentCard } from "./components/manual-payment-card";
import { useManualPayments } from "./use-manual-payments";
import { useManualWebHandoff } from "./use-manual-web-handoff";
import type { ManualPaymentCopy } from "./types";
import { usePlatformI18n, useTranslations } from "@/lib/i18n";
export function ManualMobilePayments(): React.JSX.Element {
  const t = useTranslations("billing");
  const locale = usePlatformI18n().locale;
  const payments = useManualPayments();
  const handoff = useManualWebHandoff();
  const copy: ManualPaymentCopy = {
    title: t("manualTitle"),
    description: t("manualDescription"),
    readFailed: t("manualReadFailed"),
    loading: t("manualLoading"),
    balance: t("manualBalance"),
    balanceHelp: t("manualBalanceHelp"),
    webHelp: t("manualWebHelp"),
    openWeb: t("manualOpenWeb"),
    unavailable: t("manualUnavailable"),
    webUnavailable: t("manualWebUnavailable"),
    history: t("manualHistory"),
    empty: t("manualHistoryEmpty"),
    approved: t("manualApproved"),
    rejected: t("manualRejected"),
    pending: t("manualPending"),
    refresh: t("refresh"),
  };
  return (
    <ManualPaymentCard
      copy={copy}
      locale={locale}
      summary={payments.summary.data}
      items={payments.history.data?.items}
      summaryPending={payments.summary.isPending}
      historyPending={payments.history.isPending}
      readError={Boolean(payments.summary.error || payments.history.error)}
      historyError={Boolean(payments.history.error)}
      refreshDisabled={
        !payments.isAuthenticated || payments.summary.isFetching || payments.history.isFetching
      }
      onRefresh={payments.refresh}
      opening={handoff.pending}
      openError={handoff.error}
      onOpen={handoff.open}
    />
  );
}
