import type { ReactNode } from "react";

// The frame every board view renders inside — identity + toolbar stay constant, children is the only part a view supplies.
// min-h-0/min-w-0 chain is load-bearing, not decorative — without it a flex child refuses to shrink below its content and the scroll escapes onto the page.
export default function ViewShell({
  identity,
  toolbar,
  drawer,
  children,
}: {
  identity: ReactNode;
  toolbar: ReactNode;
  drawer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {identity}
        {toolbar}

        <div className="min-h-0 min-w-0 flex-1 px-5 pt-4 md:px-6">
          {children}
        </div>
      </div>

      {drawer}
    </div>
  );
}
