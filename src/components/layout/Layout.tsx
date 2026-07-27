import type { ReactNode } from "react";
import { useLogout } from "../../services/lib/auth/useLogout";
import { Link } from "react-router";
import { CircleUserRound } from "lucide-react";
import { useProfile } from "../../services/lib/profile/useProfile";
interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const logout = useLogout();
  const { data: profile, isLoading } = useProfile();

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-red-300">
      {/* //! Profile */}

      <div className="group relative">
        {/* <Link
          to="/profile"
          className="flex absolute top-6 right-6  h-12 w-12 items-center justify-center rounded-full bg-violet-600 text-white shadow-md transition-all duration-300 hover:scale-105 hover:bg-violet-700"
        >
          <CircleUserRound size={24} />
          
        </Link> */}
        <Link to="/profile" className="group absolute right-6 top-6">
          <img
            src={
              profile?.avatar_url ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                profile?.username || "User",
              )}`
            }
            alt="Profile"
            className="h-12 w-12 rounded-full border-2 border-white object-cover shadow-lg transition duration-300 group-hover:scale-105"
          />
        </Link>
        <div
          className="
      pointer-events-none
      absolute
      right-6
      top-22
      w-max
      rounded-xl
      bg-gray-900
      px-4
      py-2
      text-sm
      text-white
      shadow-xl

      opacity-0
      translate-y-2
      scale-95

      transition-all
      duration-300

      group-hover:opacity-100
      group-hover:translate-y-0
      group-hover:scale-100
    "
        >
          <div className="absolute -top-2 right-4 h-4 w-4 rotate-45 bg-gray-900" />

          <p className="relative">{profile?.email}</p>
        </div>
      </div>

      <div className="mx-auto flex  max-w-xl flex-col px-6 pt-16 min-h-0">
        {children}
      </div>
    </main>
  );
}
