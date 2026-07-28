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
      <main className="relative w-full z-20 -mt-44">
        <div className="mx-auto max-w-[1600px] px-6 pt-2">{children}</div>
      </main>
    </div>
  );
}
