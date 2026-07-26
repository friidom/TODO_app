import type { ReactNode } from "react";
import { useLogout } from "../../services/lib/auth/useLogout";
interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const logout = useLogout()
  return (
    <main className="flex h-screen flex-col overflow-hidden bg-red-300">
      <button
        onClick={() => logout.mutate()}
      >
        Logout
      </button>
      <div className="mx-auto flex  max-w-xl flex-col px-6 pt-16 min-h-0">
        {children}
      </div>
    </main>
  );
}
