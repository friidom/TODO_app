import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <main className="flex flex-col bg-red-300">
      <div className="mx-auto flex  w-full max-w-xl flex-1 flex-col px-6 pb-6 pt-16">
        {children}
      </div>
    </main>

  );
}
