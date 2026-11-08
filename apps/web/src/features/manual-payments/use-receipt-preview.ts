"use client";
import * as React from "react";
import { useManualReceipt } from "./queries";
import { manualReceiptBlob } from "./receipt-utils";

export function useReceiptPreview(id: string) {
  const instanceId = React.useId();
  const [requested, setRequested] = React.useState(false);
  const query = useManualReceipt(id, instanceId, requested);
  const [resource, setResource] = React.useState<{ url: string | null; failed: boolean }>({
    url: null,
    failed: false,
  });
  React.useEffect(() => {
    if (!requested || !query.data) {
      setResource({ url: null, failed: false });
      return;
    }
    try {
      const url = URL.createObjectURL(manualReceiptBlob(query.data));
      setResource({ url, failed: false });
      return () => URL.revokeObjectURL(url);
    } catch {
      setResource({ url: null, failed: true });
    }
  }, [requested, query.data]);
  const preview =
    requested && resource.url && query.data
      ? {
          url: resource.url,
          name: query.data.originalName,
          image: query.data.mimeType === "image/png" || query.data.mimeType === "image/jpeg",
        }
      : null;
  return {
    preview,
    pending: requested && query.isFetching,
    failed: requested && (Boolean(query.error) || resource.failed),
    open: () => {
      if (query.error) void query.refetch();
      setRequested(true);
    },
    close: () => setRequested(false),
  };
}
