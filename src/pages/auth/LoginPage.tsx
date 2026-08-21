import { Link, useLocation, useSearchParams } from "react-router";

import AuthShell from "@/components/authForm/AuthShell";
import LoginForm from "@/components/authForm/LoginForm";

export default function LoginPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Set by ProtectedRoute when it turns away a session whose address has not
  // been confirmed. Without it the bounce back to this page is silent and
  // looks like the sign-in simply failed.
  const unconfirmed = searchParams.get("unconfirmed") === "1";

  // Set by `useUpdatePassword` after a reset (M22). The sign-out that follows
  // the update is deliberate, so landing back on a bare sign-in form would read
  // as the reset having failed — this is the acknowledgement.
  const justReset = searchParams.get("reset") === "1";

  return (
    <AuthShell
      title="Welcome back"
      subtitle={
        unconfirmed
          ? "Confirm your email address first — check your inbox for the link we sent."
          : justReset
            ? "Your password has been updated. Sign in with the new one."
            : "Sign in to pick up where your board left off."
      }
      footer={
        <>
          Don't have an account?{" "}
          {/* `next` is carried across, because someone arriving from an invite
              link almost certainly does not have an account yet — losing it on
              the hop to Register is losing it in the common case. */}
          <Link
            to={{ pathname: "/register", search: location.search }}
            className="text-ink hover:text-brand font-medium transition-colors"
          >
            Create one
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
