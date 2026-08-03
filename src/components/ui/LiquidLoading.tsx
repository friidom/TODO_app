


//! 3

import { useEffect, useRef } from "react";

const COLORS = [
  "from-purple-500 to-pink-500",
  "from-blue-500 to-purple-500",
  "from-cyan-400 to-blue-500",
  "from-green-400 to-cyan-400",
  "from-yellow-400 to-green-400",
  "from-orange-400 to-yellow-400",
  "from-red-500 to-orange-400",
];

export default function LiquidLoading() {
  const bars = useRef<(HTMLDivElement | null)[]>([]);
  const droplets = useRef<(HTMLDivElement | null)[]>([]);
  const bottoms = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let frame = 0;

    const animate = (time: number) => {
      const t = time * 0.001;

      for (let i = 0; i < 7; i++) {
  const delay = i * 0.42;

  const wave =
    Math.sin(t * 1.15 + delay) +
    Math.sin(t * 2.9 + delay) * 0.18 +
    Math.sin(t * 5.8 + delay) * 0.05;

  const scale = Math.max(0.12, Math.abs(wave));

  const bar = bars.current[i];

  if (bar) {
    const wobble = Math.sin(t * 6 + i) * 1.8;

    bar.style.transform = `
      translateY(${wobble}px)
      scaleY(${scale})
    `;

    bar.style.filter = `drop-shadow(0 0 ${
      8 + scale * 12
    }px rgba(255,255,255,.18))`;
  }

  const drop = droplets.current[i];

  if (drop) {
    const visible = wave > 0.83;

    drop.style.opacity = visible ? "1" : "0";

    drop.style.transform = visible
      ? `translateY(${-8 + Math.sin(t * 10 + i) * 4}px)
         scale(${0.9 + Math.sin(t * 7 + i) * .15})`
      : "translateY(10px) scale(.4)";
  }

  const bottom = bottoms.current[i];

  if (bottom) {
    const pulse = 0.8 + Math.sin(t * 3 + i) * 0.18;

    bottom.style.transform = `scale(${pulse})`;

    bottom.style.opacity = `${0.65 + Math.sin(t * 4 + i) * 0.2}`;
  }
}

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [])
    return (
    <div className="flex select-none items-end gap-5 p-8">
      {COLORS.map((color, index) => (
        <div
          key={index}
          className="relative flex flex-col items-center justify-end"
        >
          {/* Top Droplet */}

          <div
            ref={(el) => {
              droplets.current[index] = el;
            }}
            className={`absolute -top-8 h-4 w-4 rounded-full bg-gradient-to-r ${color}`}
            style={{
              opacity: 0,
              transition:
                "opacity .35s ease, transform .35s cubic-bezier(.22,1,.36,1)",
              filter: "blur(.35px)",
            }}
          />

          {/* Main Liquid */}

          <div
            ref={(el) => {
              bars.current[index] = el;
            }}
            className={`relative h-[90px] w-10 overflow-hidden rounded-full bg-gradient-to-t ${color}`}
            style={{
              transformOrigin: "bottom",
              transform: "scaleY(.2)",
              willChange: "transform",
            }}
          >
            {/* Surface */}

            <div className="absolute inset-x-0 top-0 h-4 rounded-full bg-white/30" />

            {/* Shine */}

            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent)",
                width: "160%",
                left: "-30%",
                animation: "liquidShine 3.5s linear infinite",
              }}
            />

            {/* Soft Glow */}

            <div
              className="absolute inset-0 rounded-full"
              style={{
                boxShadow:
                  "0 0 18px rgba(255,255,255,.15), inset 0 0 12px rgba(255,255,255,.1)",
              }}
            />            {/* Bubble */}

            <div
              className="absolute h-2 w-2 rounded-full bg-white/40"
              style={{
                left: "50%",
                top: "55%",
                transform: "translateX(-50%)",
                animation: `bubble ${2 + index * 0.2}s ease-in-out infinite`,
              }}
            />

            {/* Glass Overlay */}

            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-white/10 via-transparent to-white/10" />
          </div>

          {/* Bottom Drop */}

          <div
            ref={(el) => {
              bottoms.current[index] = el;
            }}
            className={`mt-3 h-3 w-3 rounded-full bg-gradient-to-r ${color}`}
            style={{
              filter: "blur(.15px)",
              opacity: 0.85,
              transform: "scale(.9)",
              willChange: "transform",
            }}
          />
        </div>
      ))}
    </div>
  );
}