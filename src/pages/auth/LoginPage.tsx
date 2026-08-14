import { Link, useLocation } from "react-router";

import AuthShell from "@/components/authForm/AuthShell";
import LoginForm from "@/components/authForm/LoginForm";

export default function LoginPage() {
  const location = useLocation();

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to pick up where your board left off."
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
