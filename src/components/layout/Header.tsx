import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../services/lib/themes/ThemeProvider";
import { Link } from "react-router";
import { useProfile } from "../../services/lib/profile/useProfile";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../i18n/LanguageSwitcher";

export default function Header() {
  const { data: profile, isLoading } = useProfile();
    const { t } = useTranslation();
  
  const { theme, toggleTheme } = useTheme();
  return (
    <header
      className="
        pt-2
        relative
        h-72
        overflow-hidden
        bg-cover
        bg-center
        "
    >
            
      <div
        className={`
            absolute inset-0 
            bg-[url('/themes/bg-desktop-light.jpg')]            
            bg-cover bg-center
            transition-opacity duration-500
            ${theme === "light" ? "opacity-100" : "opacity-0"}
            `}
      />

      {/* Dark */}
      <div
        className={`
            absolute inset-0 
            bg-[url('/themes/bg-desktop-dark.jpg')]
            bg-cover bg-center
            transition-opacity duration-500
            ${theme === "dark" ? "opacity-100" : "opacity-0"}
            `}
      />
      <div className="absolute inset-0 bg-black/20" />

      <div className="relative z-10">
        <div
          // className="mx-auto flex h-full w-full max-w-xl items-start justify-between px-6 pt-14"
          className="mx-auto
flex
max-w-6xl
items-start
justify-between
px-6
pt-12"
        >
          <h1
            className="
text-4xl
font-bold
tracking-[0.5em]
text-white
drop-shadow-lg
"
          >
            {t("title")}
          </h1>
          {/* themes toggle icon  */}
          <div className="flex items-center gap-4">
          <LanguageSwitcher />
            <button
              onClick={toggleTheme}
              className="cursor-pointer text-white transition-all duration-300 hover:scale-110 active:scale-90"
            >
              <div className="relative h-7 w-7">
                <Sun
                  size={28}
                  className={`
                        absolute
                        transition-all
                        duration-500
                        ${
                          theme === "dark"
                            ? "rotate-0 scale-100 opacity-100"
                            : "rotate-180 scale-0 opacity-0"
                        }
                        `}
                />

                <Moon
                  size={28}
                  className={`
                        absolute
                        transition-all
                        duration-500
                        ${
                          theme === "light"
                            ? "rotate-0 scale-100 opacity-100"
                            : "-rotate-180 scale-0 opacity-0"
                        }
                        `}
                />
              </div>{" "}
            </button>

            <div className="group relative">
              <Link to="/profile">
                <img
                  src={
                    profile?.avatar_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      profile?.username || "User",
                    )}`
                  }
                  className="
h-12
w-12
rounded-full
border-2
border-white/70
object-cover
shadow-lg
transition
duration-300
hover:scale-110
"
                />
              </Link>
              {/* //! profile img small box */}

              <div
                className="
                    pointer-events-none
                    absolute
                    -right-40
                    top-2
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
                    transition-all
                    duration-300
                    group-hover:opacity-100
                    group-hover:translate-y-0
                    "
              >
                {profile?.email}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
