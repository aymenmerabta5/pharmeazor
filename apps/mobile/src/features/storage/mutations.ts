import { orpcClient } from "@/lib/orpc";
function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
export function uploadTextObject(input: { originalName: string; text: string }) {
  return orpcClient.storage.uploadBase64({
    base64: utf8ToBase64(input.text),
    mimeType: "text/plain",
    originalName: input.originalName,
  });
}
export function removeStoredObject(id: string) {
  return orpcClient.storage.remove({ id });
}
