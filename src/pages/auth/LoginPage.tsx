import { Link, useLocation, useSearchParams } from "react-router";

import AuthShell from "@/components/authForm/AuthShell";
import LoginForm from "@/components/authForm/LoginForm";

export default function LoginPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // set by ProtectedRoute when it turns away an unconfirmed session
  const unconfirmed = searchParams.get("unconfirmed") === "1";

  // set by useUpdatePassword after a reset, so the bounce back doesn't read as a failure
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
