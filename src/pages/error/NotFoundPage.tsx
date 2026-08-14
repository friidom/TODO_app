import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-bold">404</p>

      <p className="text-muted-foreground">
        That page does not exist. It may have been renamed or deleted.
      </p>

      <Link
        to="/"
        className="bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand rounded-control mt-2 px-5 py-2.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2"
      >
        Back to the board
      </Link>
    </div>
  );
}
