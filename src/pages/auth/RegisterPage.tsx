import { Link, useLocation } from "react-router";

import AuthShell from "@/components/authForm/AuthShell";
import RegisterForm from "@/components/authForm/RegisterForm";

export default function RegisterPage() {
  const location = useLocation();

  return (
    <AuthShell
      title="Create your account"
      subtitle="A board, four columns and somewhere to put the work."
      footer={
        <>
          Already have an account?{" "}
          {/* Carries `next` back the other way, so an invitee who turns out to
              have an account already still returns to the invite. */}
          <Link
            to={{ pathname: "/login", search: location.search }}
            className="text-ink hover:text-brand font-medium transition-colors"
          >
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
