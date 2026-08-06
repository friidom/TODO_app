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
        className="mt-2 rounded-lg bg-violet-600 px-5 py-2.5 font-semibold text-white transition hover:bg-violet-700"
      >
        Back to the board
      </Link>
    </div>
  );
}
