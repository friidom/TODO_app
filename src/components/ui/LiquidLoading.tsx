// // --- Component ---
// import React, { useState, useEffect } from 'react';

// const LiquidLoading = () => {
//   const [heights, setHeights] = useState([0, 0, 0, 0, 0, 0, 0]);
//   const [droplets, setDroplets] = useState([false, false, false, false, false, false, false]);

//   const colors = [
//     'from-purple-500 to-pink-500',
//     'from-blue-500 to-purple-500',
//     'from-cyan-400 to-blue-500',
//     'from-green-400 to-cyan-400',
//     'from-yellow-400 to-green-400',
//     'from-orange-400 to-yellow-400',
//     'from-red-500 to-orange-400'
//   ];

//   useEffect(() => {
//     const interval = setInterval(() => {
//       setHeights(prev => prev.map((height, index) => {
//         const maxHeight = 80;
//         const delay = index * 0.8; // Increased delay for slower wave propagation
//         const time = Date.now() * 0.001; // Much slower base speed

//         // Primary wave with bounce effect
//         const primaryWave = Math.sin(time + delay);

//         // Secondary bounce wave (higher frequency, lower amplitude)
//         const bounceWave = Math.sin(time * 4 + delay) * 0.15;

//         // Tertiary ripple effect
//         const ripple = Math.sin(time * 8 + delay) * 0.05;

//         // Combine waves for liquid bounce effect
//         const combinedWave = primaryWave + bounceWave + ripple;

//         return maxHeight * combinedWave;
//       }));

//       // Animate droplets with liquid timing
//       setDroplets(prev => prev.map((_, index) => {
//         const delay = index * 0.8;
//         const time = Date.now() * 0.001;
//         const waveValue = Math.sin(time + delay);
//         return waveValue > 0.8; // Show droplet at peak with tighter threshold
//       }));
//     }, 32); // Slower frame rate for more liquid feel

//     return () => clearInterval(interval);
//   }, []);

//   //smoother
// // useEffect(() => {
// //   let frame: number;

// //   const animate = () => {
// //     const time = performance.now() * 0.001;

// //     setHeights(
// //       Array.from({ length: 7 }, (_, index) => {
// //         const delay = index * 0.8;

// //         const primary = Math.sin(time + delay);
// //         const bounce = Math.sin(time * 4 + delay) * 0.15;
// //         const ripple = Math.sin(time * 8 + delay) * 0.05;

// //         return 80 * (primary + bounce + ripple);
// //       })
// //     );

// //     frame = requestAnimationFrame(animate);
// //   };

// //   frame = requestAnimationFrame(animate);

// //   return () => cancelAnimationFrame(frame);
// // }, []);

//   return (
//     <div className="flex items-end space-x-4 p-8">
//       {heights.map((height, index) => (
//         <div key={index} className="relative flex flex-col items-center">
//           {/* Droplet with liquid physics */}
//           <div
//             className={`w-4 h-4 rounded-full bg-gradient-to-r ${colors[index]} mb-3 transition-all duration-500 ease-out ${
//               droplets[index] ? 'opacity-100' : 'opacity-0'
//             }`}
//             style={{
//               animationDelay: `${index * 0.2}s`,
//               filter: 'blur(0.5px)',
//               transform: droplets[index]
//                 ? `translateY(${Math.sin(Date.now() * 0.008 + index * 0.5) * 3}px) scale(${0.8 + Math.sin(Date.now() * 0.006 + index * 0.3) * 0.4})`
//                 : 'translateY(10px) scale(0.5)',
//               boxShadow: droplets[index] ? `0 0 15px ${colors[index].includes('purple') ? '#a855f7' : colors[index].includes('blue') ? '#3b82f6' : colors[index].includes('cyan') ? '#06b6d4' : colors[index].includes('green') ? '#10b981' : colors[index].includes('yellow') ? '#eab308' : colors[index].includes('orange') ? '#f97316' : '#ef4444'}40` : 'none'
//             }}
//           />

//           {/* Main liquid bar with enhanced physics */}
//           <div
//             className={`w-10 bg-gradient-to-t ${colors[index]} rounded-full transition-all duration-200 ease-out relative overflow-hidden shadow-lg`}
//             style={{
//               height: `${Math.abs(height)}px`,
//               transform: height < 0 ? 'scaleY(-1)' : 'scaleY(1)',
//               transformOrigin: 'bottom',
//               filter: 'blur(0.3px)',
//               boxShadow: `0 0 20px ${colors[index].includes('purple') ? '#a855f7' : colors[index].includes('blue') ? '#3b82f6' : colors[index].includes('cyan') ? '#06b6d4' : colors[index].includes('green') ? '#10b981' : colors[index].includes('yellow') ? '#eab308' : colors[index].includes('orange') ? '#f97316' : '#ef4444'}50, inset 0 0 20px rgba(255,255,255,0.1)`
//             }}
//           >
//             {/* Liquid surface tension effect */}
//             <div
//               className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-white/40 to-transparent rounded-full"
//               style={{
//                 transform: `translateY(${Math.sin(Date.now() * 0.003 + index * 0.5) * 1}px) scaleY(${0.8 + Math.sin(Date.now() * 0.004 + index * 0.3) * 0.3})`
//               }}
//             />

//             {/* Liquid wave effect */}
//             <div
//               className="absolute inset-0 bg-gradient-to-t from-white/20 via-white/10 to-transparent rounded-full"
//               style={{
//                 transform: `translateY(${Math.sin(Date.now() * 0.002 + index * 0.5) * 2}px)`,
//                 background: `linear-gradient(0deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 50%, transparent 100%)`
//               }}
//             />

//             {/* Shimmer effect */}
//             <div
//               className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent rounded-full"
//               style={{
//                 transform: `translateX(${Math.sin(Date.now() * 0.0015 + index * 0.7) * 8}px)`,
//                 width: '140%',
//                 left: '-20%'
//               }}
//             />

//             {/* Bubble effect */}
//             <div
//               className="absolute w-2 h-2 bg-white/30 rounded-full"
//               style={{
//                 top: `${20 + Math.sin(Date.now() * 0.003 + index * 0.8) * 10}%`,
//                 left: `${30 + Math.sin(Date.now() * 0.002 + index * 0.6) * 20}%`,
//                 transform: `scale(${0.5 + Math.sin(Date.now() * 0.004 + index * 0.4) * 0.5})`,
//                 opacity: Math.sin(Date.now() * 0.005 + index * 0.9) * 0.3 + 0.3
//               }}
//             />
//           </div>

//           {/* Enhanced base droplet with liquid physics */}
//           <div
//             className={`w-3 h-3 rounded-full bg-gradient-to-r ${colors[index]} mt-2 transition-all duration-300`}
//             style={{
//               opacity: Math.sin(Date.now() * 0.003 + index * 0.9) * 0.4 + 0.6,
//               transform: `scale(${0.6 + Math.sin(Date.now() * 0.002 + index * 0.6) * 0.4}) translateY(${Math.sin(Date.now() * 0.004 + index * 0.8) * 1}px)`,
//               filter: 'blur(0.2px)',
//               boxShadow: `0 2px 8px ${colors[index].includes('purple') ? '#a855f7' : colors[index].includes('blue') ? '#3b82f6' : colors[index].includes('cyan') ? '#06b6d4' : colors[index].includes('green') ? '#10b981' : colors[index].includes('yellow') ? '#eab308' : colors[index].includes('orange') ? '#f97316' : '#ef4444'}40`
//             }}
//           />
//         </div>
//       ))}
//     </div>
//   );
// };

// export default LiquidLoading;

// // // --- Demo ---
// // import LiquidLoading from "@/components/ui/liquid-loader";

// // export default function DotLoaderDemo() {
// //   return (
// //     <div className="flex min-h-screen w-full items-center justify-center rounded-lg border bg-background p-4">
// //       <LiquidLoading />
// //     </div>
// //   );
// // }
//!2

// import { useEffect, useRef, useState } from "react";

// const colors = [
//   "from-purple-500 to-pink-500",
//   "from-blue-500 to-purple-500",
//   "from-cyan-400 to-blue-500",
//   "from-green-400 to-cyan-400",
//   "from-yellow-400 to-green-400",
//   "from-orange-400 to-yellow-400",
//   "from-red-500 to-orange-400",
// ];

// type BarState = {
//   height: number;
//   droplet: boolean;
// };

// export default function LiquidLoading() {
//   const [bars, setBars] = useState<BarState[]>(
//     Array.from({ length: 7 }, () => ({
//       height: 0,
//       droplet: false,
//     })),
//   );

//   const animationRef = useRef<number>();

//   useEffect(() => {
//     let start = performance.now();

//     const animate = (time: number) => {
//       const t = (time - start) / 1000;

//       const nextBars = Array.from({ length: 7 }, (_, index) => {
//         const delay = index * 0.45;

//         const wave =
//           Math.sin(t * 1.2 + delay) +
//           Math.sin(t * 3.5 + delay) * 0.12 +
//           Math.sin(t * 6 + delay) * 0.04;

//         return {
//           height: Math.max(8, Math.abs(wave) * 90),
//           droplet: wave > 0.83,
//         };
//       });

//       setBars(nextBars);

//       animationRef.current = requestAnimationFrame(animate);
//     };

//     animationRef.current = requestAnimationFrame(animate);

//     return () => {
//       if (animationRef.current) {
//         cancelAnimationFrame(animationRef.current);
//       }
//     };
//   }, []);
//   return (
//     <div className="flex items-end gap-5 p-8 select-none">
//       {bars.map((bar, index) => (
//         <div
//           key={index}
//           className="relative flex flex-col items-center justify-end"
//         >
//           {/* TOP DROP */}

//           <div
//             className={`absolute -top-8 h-4 w-4 rounded-full bg-gradient-to-r ${colors[index]}
//             transition-all duration-500 ease-out`}
//             style={{
//               opacity: bar.droplet ? 1 : 0,
//               transform: `translateY(${bar.droplet ? -6 : 8}px)
//                           scale(${bar.droplet ? 1 : 0.4})`,
//               filter: "blur(.3px)",
//             }}
//           />

//           {/* BAR */}

//           <div
//             className={`relative w-10 overflow-hidden rounded-full bg-gradient-to-t ${colors[index]}`}
//             style={{
//               height: 90,

//               transform: `scaleY(${bar.height / 90})`,

//               transformOrigin: "bottom",

//               transition: "transform 180ms cubic-bezier(.22,1,.36,1)",

//               willChange: "transform",
//             }}
//           >
//             {/* Highlight */}

//             <div
//               className="absolute inset-x-0 top-0 h-4 rounded-full bg-white/30"
//               style={{
//                 transform: `translateY(${Math.sin(index) * 2}px)`,
//               }}
//             />

//             {/* Shine */}

//             <div
//               className="absolute inset-0"
//               style={{
//                 background:
//                   "linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent)",

//                 transform: `translateX(${Math.sin(index * 2) * 15}px)`,
//               }}
//             />

//             {/* Bubble */}

//             <div
//               className="absolute h-2 w-2 rounded-full bg-white/35"
//               style={{
//                 left: "50%",
//                 top: `${55 + Math.sin(index * 0.8) * 10}%`,
//                 transform: "translateX(-50%)",
//               }}
//             />

//             {/* Glass overlay */}

//             <div className="absolute inset-0 rounded-full bg-gradient-to-r from-white/10 via-transparent to-white/10" />

//             {/* Glow */}

//             <div
//               className="absolute inset-0 rounded-full"
//               style={{
//                 boxShadow:
//                   "0 0 18px rgba(255,255,255,.18), inset 0 0 12px rgba(255,255,255,.12)",
//               }}
//             />
//           </div>

//           {/* Bottom Drop */}

//           <div
//             className={`mt-3 h-3 w-3 rounded-full bg-gradient-to-r ${colors[index]}`}
//             style={{
//               opacity: 0.8,
//               filter: "blur(.15px)",
//               transform: "scale(.9)",
//             }}
//           />
//         </div>
//       ))}
//     </div>
//   );
// }


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