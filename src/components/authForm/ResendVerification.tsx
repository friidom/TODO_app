import { useTranslation } from "react-i18next";
import { CheckIcon, Loader2 } from "lucide-react";

import { useResendVerification } from "@/services/auth/useEmailVerification";
import { cn } from "@/utils/cn";

// The API answers the same for any address, so "sent" is all this can honestly say.
export default function ResendVerification({
  email,
  className,
}: {
  email: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const resend = useResendVerification();

  if (resend.isSuccess) {
    return (
      <p
        role="status"
        className={cn(
          "text-status-green flex items-center justify-center gap-1.5 text-xs font-medium",
          className,
        )}
      >
        <CheckIcon className="size-3.5" />
        {t("auth.verificationResent")}
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <button
        type="button"
        disabled={resend.isPending || email.trim() === ""}
        onClick={() => resend.mutate(email)}
        className="text-brand hover:text-brand/80 focus-visible:ring-brand rounded-control inline-flex items-center gap-1.5 text-xs font-medium underline-offset-2 transition-colors outline-none hover:underline focus-visible:ring-2 disabled:opacity-50"
      >
        {resend.isPending && <Loader2 className="size-3.5 animate-spin" />}
        {t("auth.resendVerification")}
      </button>

      {resend.isError && (
        <p role="alert" className="text-status-red text-xs">
          {resend.error.message}
        </p>
      )}
    </div>
  );
}
