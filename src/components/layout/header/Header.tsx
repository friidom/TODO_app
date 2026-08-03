import { useTranslation } from "react-i18next";
import HeaderActions from "./HeaderActions";
import { SidebarTrigger } from "@/components/ui/SideBarUI/sidebar";
import HeaderTodoForm from "./HeaderTodoForm";
export default function Header() {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center border-b bg-white px-4">
      <div className="flex w-full items-center gap-4">
        {/* LEFT */}
        <div className="flex shrink-0 items-center gap-2">
          <SidebarTrigger  />

          <h1 className="text-lg font-semibold text-gray-900">{t("title")}</h1>
        </div>

        {/* CENTER */}
        <div className="flex flex-1 justify-center">
          <HeaderTodoForm />
        </div>

        {/* RIGHT */}
        <div className="shrink-0">
          <HeaderActions />
        </div>
      </div>
    </header>
  );
}
