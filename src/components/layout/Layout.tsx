import type { ReactNode } from "react";

import Header from "./Header";
interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-app  ">
      {/* HEADER */}
      <Header />

      {/* main */}
      <main className="relative z-20 -mt-44">
        <div className="mx-auto  w-full  px-6 pt-2">{children}</div>
      </main>
    </div>
  );
}
