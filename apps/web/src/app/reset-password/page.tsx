import { Suspense } from "react";
import { ResetPasswordScreen, ResetPasswordLoading } from "@/features/auth/reset-password-screen";
type SearchProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
async function ResetPasswordContent({ searchParams }: SearchProps) {
  const query = await searchParams;
  return (
    <ResetPasswordScreen token={first(query.token) ?? ""} queryError={first(query.error) ?? null} />
  );
}
export default function ResetPasswordPage(props: SearchProps) {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordContent {...props} />
    </Suspense>
  );
}
