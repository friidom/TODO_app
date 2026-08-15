/**
 * The wait, everywhere there is one.
 *
 * Every route renders this — the auth gate, the board, the list, the profile —
 * so it is the first thing anyone sees of the product and it is on screen more
 * often than any single view.
 *
 * **It used to be `LiquidLoading`**: seven rainbow gradient bars driven by a
 * `requestAnimationFrame` loop, with droplets, bubbles, a travelling shine and
 * two glow layers. Nothing about it belonged to a dark, restrained product, and
 * it announced itself on a screen whose entire job is to say "a moment" quietly.
 * A ring in the product's own purple says the same thing without asking to be
 * watched, and it costs one element and no JavaScript.
 *
 * `h-full flex-1` so it fills a flex parent — the list renders it inside the
 * view shell — with a floor for the routes that mount it on its own.
 */
export default function Loading() {
  return (
    <div className="bg-canvas flex h-full min-h-64 w-full flex-1 items-center justify-center">
      <span
        role="status"
        aria-label="Loading"
        className="border-ink/15 border-t-brand inline-block size-7 animate-spin rounded-full border-2"
      />
    </div>
  );
}
