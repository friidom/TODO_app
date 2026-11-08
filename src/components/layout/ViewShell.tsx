import type { ReactNode } from "react";

// The frame every board view renders inside — identity, tabs and toolbar stay constant, children is the only part a view supplies.
// min-h-0/min-w-0 chain is load-bearing, not decorative — without it a flex child refuses to shrink below its content and the scroll escapes onto the page.
// `framed` is Jira's List page: toolbar and table share one panel, so the controls read as the table's own.
export default function ViewShell({
  identity,
  tabs,
  toolbar,
  framed = false,
  drawer,
  children,
}: {
  identity: ReactNode;
  tabs: ReactNode;
  toolbar: ReactNode;
  framed?: boolean;
  drawer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {identity}

        <div className="border-hairline shrink-0 border-b px-5 md:px-6">
          {tabs}
        </div>

        {framed ? (
          <div className="bg-elevated dark:bg-surface mx-5 my-4 flex min-h-0 min-w-0 flex-1 flex-col rounded-xl px-5 pt-4 pb-5 md:mx-6">
            <div className="shrink-0 pb-4">{toolbar}</div>
            <div className="min-h-0 min-w-0 flex-1">{children}</div>
          </div>
        ) : (
          <>
            <div className="shrink-0 px-5 pt-4 pb-1 md:px-6">{toolbar}</div>
            <div className="min-h-0 min-w-0 flex-1 px-5 pt-3 md:px-6">
              {children}
            </div>
          </>
        )}
      </div>

      {drawer}
    </div>
  );
}
