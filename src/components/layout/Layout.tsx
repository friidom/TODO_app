import type { ReactNode } from "react";

import Header from "./header/Header";
interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="bg-app min-h-screen">
      {/* HEADER */}
      <Header />

      {/* main */}
      <main className="relative z-20 -mt-44">
        <div className="mx-auto w-full px-6 pt-2">{children}</div>
      </main>
    </div>
  );
}
