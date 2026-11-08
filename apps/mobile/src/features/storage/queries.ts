import { orpcClient } from "@/lib/orpc";
// Binary downloads are explicit actions and are never route-dehydrated query data.
export function downloadObjectBase64(id: string) {
  return orpcClient.storage.downloadBase64({ id });
}
