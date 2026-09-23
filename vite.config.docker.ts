import { mergeConfig } from "vite";

import base from "./vite.config";

// Docker development only, selected with `vite --config vite.config.docker.ts`
// by docker-compose.dev.yml. `npm run dev` on the host still reads
// vite.config.ts and is completely unaffected by anything here.
export default mergeConfig(base, {
  server: {
    // 0.0.0.0, or the server binds to the container's loopback and nginx
    // cannot reach it.
    host: true,
    port: 5173,
    // Fail loudly instead of hopping to 5174, which nginx does not proxy.
    strictPort: true,

    // THE reason this file exists: there is no CLI flag for clientPort. The
    // browser reaches Vite through nginx on 3000, but Vite injects its own
    // listening port into the HMR client, so without this the page dials
    // ws://localhost:5173 — a port nothing publishes — and every edit fails
    // silently with the page looking fine until you reload it.
    hmr: { clientPort: 3000 },

    // Windows bind mounts do not deliver inotify events into the Linux VM, so
    // an event-based watcher sees nothing at all and HMR never fires. Polling
    // is the only thing that works across that boundary; node_modules and .git
    // are already excluded by Vite's own defaults, which is what keeps it cheap.
    watch: { usePolling: true, interval: 300 },
  },
});
