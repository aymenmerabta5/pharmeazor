import { usePdf } from "@repo/pdf/client/usePdf";
export function usePdfGenerator(captureOwner: () => () => boolean) {
  return usePdf({ captureOwner });
}
