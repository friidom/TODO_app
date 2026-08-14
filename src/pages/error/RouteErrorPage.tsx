import { Link, isRouteErrorResponse, useRouteError } from "react-router";

/**
 * The router's last line of defence: a throw that escaped every ErrorBoundary,
 * or a routing failure. Reached only when a whole page has already failed, so
 * it links out rather than offering a retry that would re-run the same render.
 */
export default function RouteErrorPage() {
  const error = useRouteError();

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Unknown error";

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-2xl font-bold">This page stopped working.</p>

      <p className="text-muted-foreground max-w-md wrap-break-word">{detail}</p>

      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="border-border hover:bg-muted cursor-pointer rounded-lg border px-5 py-2.5 font-semibold transition"
        >
          Reload
        </button>

        <Link
          to="/"
          className="bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand rounded-control px-5 py-2.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2"
        >
          Back to the board
        </Link>
      </div>
    </div>
  );
}
