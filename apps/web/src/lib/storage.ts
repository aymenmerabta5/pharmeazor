export function resolvePublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  )
    return path;
  return path;
}

export function getPublicUrl(path: string | null | undefined): string | null {
  return resolvePublicUrl(path);
}
