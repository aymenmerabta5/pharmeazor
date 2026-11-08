export interface UseCopyReturn {
  copy: (text: string) => Promise<boolean>;
  copied: boolean;
  error: string | null;
}
