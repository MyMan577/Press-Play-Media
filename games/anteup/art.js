/* Ante Up artwork: hand-drawn SVG pictures for every charm, item and voucher,
   plus the plastic sleeves and wax stamps drawn on cards.

   Every picture is drawn on a 64x64 canvas with the same ink outline, so the
   whole set reads as one illustrated family. AnteArt.icon(def) picks the
   drawing by the def's type ("charm", "item" or a voucher) and id; anything
   without its own drawing falls back to a gem tinted with the def's color. */
(function () {
  "use strict";

  const INK = "#22170d";
  const O = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
  const T = `stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"`;
  const N = `fill="none"`;

  // ---------- shared parts ----------
  const shine = (x, y, w, h, r = -30) => `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${h}" fill="#fff" opacity=".45" transform="rotate(${r} ${x} ${y})"/>`;
  const coin = (x, y, r, fill = "#E8C04A", mark = "$") =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${O}/><circle cx="${x}" cy="${y}" r="${r * 0.72}" ${N} stroke="#a77d16" stroke-width="1.3"/>` +
    (mark ? `<text x="${x}" y="${y + r * 0.36}" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${r * 1.05}" fill="#8a6410">${mark}</text>` : "");
  const sparkle = (x, y, s, fill = "#FFE28A") =>
    `<path d="M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z" fill="${fill}" ${T}/>`;
  const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  const die = (x, y, s, n, fill = "#F5EEDC", pip = INK, rot = 0) =>
    `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" rx="${s * 0.2}" fill="${fill}" ${O}/>` +
    PIPS[n].map(([a, b]) => `<circle cx="${x + a * s * 0.27}" cy="${y + b * s * 0.27}" r="${s * 0.09}" fill="${pip}"/>`).join("") + `</g>`;
  const heart = (x, y, s, fill = "#D2453B") => `<path d="M${x} ${y + s * 0.9} C${x - s * 1.3} ${y} ${x - s * 0.9} ${y - s * 1.1} ${x} ${y - s * 0.35} C${x + s * 0.9} ${y - s * 1.1} ${x + s * 1.3} ${y} ${x} ${y + s * 0.9}Z" fill="${fill}" ${O}/>`;
  const diamond = (x, y, s, fill = "#D2453B") => `<path d="M${x} ${y - s} L${x + s * 0.72} ${y} L${x} ${y + s} L${x - s * 0.72} ${y}Z" fill="${fill}" ${O}/>`;
  const club = (x, y, s, fill = "#2b3a33") => `<circle cx="${x}" cy="${y - s * 0.45}" r="${s * 0.42}" fill="${fill}" ${O}/><circle cx="${x - s * 0.48}" cy="${y + s * 0.1}" r="${s * 0.42}" fill="${fill}" ${O}/><circle cx="${x + s * 0.48}" cy="${y + s * 0.1}" r="${s * 0.42}" fill="${fill}" ${O}/><path d="M${x} ${y} L${x - s * 0.3} ${y + s} L${x + s * 0.3} ${y + s}Z" fill="${fill}" ${O}/>`;
  const spade = (x, y, s, fill = "#2b3a33") => `<path d="M${x} ${y - s} C${x + s * 1.3} ${y - s * 0.1} ${x + s * 0.8} ${y + s * 0.9} ${x} ${y + s * 0.3} C${x - s * 0.8} ${y + s * 0.9} ${x - s * 1.3} ${y - s * 0.1} ${x} ${y - s}Z" fill="${fill}" ${O}/><path d="M${x} ${y + s * 0.2} L${x - s * 0.3} ${y + s} L${x + s * 0.3} ${y + s}Z" fill="${fill}" ${O}/>`;
  const SUIT = { hearts: heart, diamonds: diamond, clubs: club, spades: spade };
  const playingCard = (x, y, w, h, rot, inner = "", fill = "#FBF6E9") =>
    `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" ${O}/>${inner}</g>`;
  const bag = (x, y, s, fill, mark = "$", tie = "#8a5a2b") =>
    `<path d="M${x - s * 0.55} ${y - s * 0.55} Q${x} ${y - s * 0.3} ${x + s * 0.55} ${y - s * 0.55} L${x + s * 0.3} ${y - s * 0.25} Q${x + s * 1.05} ${y + s * 0.3} ${x + s * 0.75} ${y + s * 0.8} Q${x} ${y + s * 1.05} ${x - s * 0.75} ${y + s * 0.8} Q${x - s * 1.05} ${y + s * 0.3} ${x - s * 0.3} ${y - s * 0.25}Z" fill="${fill}" ${O}/>` +
    `<path d="M${x - s * 0.34} ${y - s * 0.24} Q${x} ${y - s * 0.1} ${x + s * 0.34} ${y - s * 0.24}" ${N} stroke="${tie}" stroke-width="3" stroke-linecap="round"/>` +
    (mark ? `<text x="${x}" y="${y + s * 0.55}" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${s * 0.7}" fill="${INK}" opacity=".75">${mark}</text>` : "");
  const scroll = (fill = "#EAD9B0", lines = true) =>
    `<path d="M14 18 H46 Q52 18 52 24 V46 Q52 50 48 50 H18 Q12 50 12 44 V22" fill="${fill}" ${O}/><path d="M12 22 Q12 16 17 16 Q22 16 22 22 Q22 26 17 26 H12" fill="#d8c290" ${O}/><path d="M48 50 Q54 50 54 45 Q54 41 50 41 H47" fill="#d8c290" ${O}/>` +
    (lines ? `<path d="M27 26 H45 M27 32 H45 M27 38 H41" ${N} ${T} opacity=".55"/>` : "");
  const bottle = (x, y, fill, cork = "#a5793f") =>
    `<rect x="${x - 4}" y="${y - 22}" width="8" height="6" rx="1.5" fill="${cork}" ${O}/><path d="M${x - 4} ${y - 16} V${y - 10} Q${x - 14} ${y - 6} ${x - 14} ${y + 4} Q${x - 14} ${y + 16} ${x} ${y + 16} Q${x + 14} ${y + 16} ${x + 14} ${y + 4} Q${x + 14} ${y - 6} ${x + 4} ${y - 10} V${y - 16}Z" fill="#dfeef0" ${O}/>` +
    `<path d="M${x - 12} ${y + 2} Q${x} ${y - 2} ${x + 12} ${y + 2} Q${x + 12} ${y + 14} ${x} ${y + 14} Q${x - 12} ${y + 14} ${x - 12} ${y + 2}Z" fill="${fill}"/>` + shine(x - 7, y - 1, 2, 5, 20);
  const ticket = (fill, label, sub = "") =>
    `<path d="M8 20 H56 V28 Q51 32 56 36 V44 H8 V36 Q13 32 8 28Z" fill="${fill}" ${O}/><path d="M18 20 V44" ${N} stroke="${INK}" stroke-width="1.4" stroke-dasharray="2.5 2.5"/>` +
    `<text x="37" y="35" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${label.length > 5 ? 6.5 : label.length > 3 ? 9 : 12}" fill="${INK}">${label}</text>` +
    (sub ? `<text x="13" y="35" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="8" fill="${INK}">${sub}</text>` : "");
  const seal = (x, y, r, fill, glyph) =>
    `<path d="M${x + r} ${y} ${Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2, rr = r * (i % 2 ? 0.86 : 1.04); return `L${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`; }).join(" ")}Z" fill="${fill}" ${O}/>` +
    `<circle cx="${x}" cy="${y}" r="${r * 0.62}" ${N} stroke="rgba(0,0,0,.35)" stroke-width="1.6"/>` + glyph;
  const flame = (x, y, s) => `<path d="M${x} ${y - s} Q${x + s * 0.9} ${y - s * 0.1} ${x + s * 0.55} ${y + s * 0.45} Q${x} ${y + s * 0.85} ${x - s * 0.55} ${y + s * 0.45} Q${x - s * 0.9} ${y - s * 0.1} ${x} ${y - s}Z" fill="#F29A2E" ${O}/><path d="M${x} ${y - s * 0.3} Q${x + s * 0.4} ${y + s * 0.1} ${x + s * 0.25} ${y + s * 0.4} Q${x} ${y + s * 0.6} ${x - s * 0.25} ${y + s * 0.4} Q${x - s * 0.4} ${y + s * 0.1} ${x} ${y - s * 0.3}Z" fill="#FFE07A"/>`;
  const anchorShape = (x, y, s, fill = "#7d8fa0") =>
    `<circle cx="${x}" cy="${y - s * 0.78}" r="${s * 0.16}" ${N} ${O}/><path d="M${x} ${y - s * 0.62} V${y + s * 0.72}" ${N} stroke="${INK}" stroke-width="${s * 0.22 + 2.2}" stroke-linecap="round"/><path d="M${x} ${y - s * 0.62} V${y + s * 0.72}" ${N} stroke="${fill}" stroke-width="${s * 0.22}" stroke-linecap="round"/>` +
    `<path d="M${x - s * 0.36} ${y - s * 0.38} H${x + s * 0.36}" ${N} stroke="${INK}" stroke-width="${s * 0.14 + 2.2}" stroke-linecap="round"/><path d="M${x - s * 0.36} ${y - s * 0.38} H${x + s * 0.36}" ${N} stroke="${fill}" stroke-width="${s * 0.14}" stroke-linecap="round"/>` +
    `<path d="M${x - s * 0.7} ${y + s * 0.15} Q${x - s * 0.6} ${y + s * 0.8} ${x} ${y + s * 0.8} Q${x + s * 0.6} ${y + s * 0.8} ${x + s * 0.7} ${y + s * 0.15}" ${N} stroke="${INK}" stroke-width="${s * 0.16 + 2.2}" stroke-linecap="round"/><path d="M${x - s * 0.7} ${y + s * 0.15} Q${x - s * 0.6} ${y + s * 0.8} ${x} ${y + s * 0.8} Q${x + s * 0.6} ${y + s * 0.8} ${x + s * 0.7} ${y + s * 0.15}" ${N} stroke="${fill}" stroke-width="${s * 0.16}" stroke-linecap="round"/>` +
    `<path d="M${x - s * 0.86} ${y + s * 0.05} L${x - s * 0.62} ${y + s * 0.32} L${x - s * 0.5} ${y + s * 0.02}Z M${x + s * 0.86} ${y + s * 0.05} L${x + s * 0.62} ${y + s * 0.32} L${x + s * 0.5} ${y + s * 0.02}Z" fill="${fill}" ${T}/>`;
  const sun = (x, y, r, fill = "#F6C445") =>
    Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<path d="M${(x + Math.cos(a) * r * 1.15).toFixed(1)} ${(y + Math.sin(a) * r * 1.15).toFixed(1)} L${(x + Math.cos(a) * r * (i % 2 ? 1.5 : 1.75)).toFixed(1)} ${(y + Math.sin(a) * r * (i % 2 ? 1.5 : 1.75)).toFixed(1)}" ${N} stroke="${INK}" stroke-width="5.2" stroke-linecap="round"/><path d="M${(x + Math.cos(a) * r * 1.15).toFixed(1)} ${(y + Math.sin(a) * r * 1.15).toFixed(1)} L${(x + Math.cos(a) * r * (i % 2 ? 1.5 : 1.75)).toFixed(1)} ${(y + Math.sin(a) * r * (i % 2 ? 1.5 : 1.75)).toFixed(1)}" ${N} stroke="${fill}" stroke-width="3" stroke-linecap="round"/>`; }).join("") +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${O}/>`;
  const star5 = (x, y, r, fill = "#F6D35B", inner = 0.45) =>
    `<path d="${Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r; return `${i ? "L" : "M"}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`; }).join(" ")}Z" fill="${fill}" ${O}/>`;
  const gem = (x, y, s, fill) =>
    `<path d="M${x - s} ${y - s * 0.35} L${x - s * 0.55} ${y - s * 0.85} H${x + s * 0.55} L${x + s} ${y - s * 0.35} L${x} ${y + s}Z" fill="${fill}" ${O}/><path d="M${x - s} ${y - s * 0.35} H${x + s} M${x - s * 0.55} ${y - s * 0.85} L${x - s * 0.3} ${y - s * 0.35} L${x} ${y + s} L${x + s * 0.3} ${y - s * 0.35} L${x + s * 0.55} ${y - s * 0.85}" ${N} ${T} opacity=".6"/>` + shine(x - s * 0.45, y - s * 0.2, s * 0.12, s * 0.3, 30);
  const book = (fill, mark = "") =>
    `<path d="M14 14 H48 Q52 14 52 18 V50 H18 Q14 50 14 46Z" fill="${fill}" ${O}/><path d="M14 46 Q14 42 18 42 H52" ${N} ${O}/><path d="M18 42 H52 V50 H18 Q14 50 14 46 Q14 42 18 42Z" fill="#F1E6C8" ${O}/><path d="M20 45 H48 M20 47.5 H46" ${N} ${T} opacity=".4"/>` + mark;
  const banner = (fill) => `<path d="M14 10 V56" ${N} stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M14 10 V56" ${N} stroke="#a5793f" stroke-width="2" stroke-linecap="round"/><path d="M16 13 H52 L45 25 L52 37 H16Z" fill="${fill}" ${O}/><circle cx="14" cy="9" r="3" fill="#E8C04A" ${O}/>`;
  const hammer = (rot = -30) => `<g transform="rotate(${rot} 32 32)"><rect x="29" y="22" width="6" height="34" rx="2" fill="#b07c44" ${O}/><rect x="16" y="10" width="32" height="14" rx="3" fill="#8a96a3" ${O}/><path d="M18 13 H46" ${N} stroke="#fff" stroke-width="1.6" opacity=".5"/></g>`;
  const hourglassShape = (fillTop, fillBot) =>
    `<rect x="16" y="8" width="32" height="5" rx="2" fill="#a5793f" ${O}/><rect x="16" y="51" width="32" height="5" rx="2" fill="#a5793f" ${O}/><path d="M20 13 H44 Q44 26 34 32 Q44 38 44 51 H20 Q20 38 30 32 Q20 26 20 13Z" fill="#e6f1f2" ${O}/><path d="M23 18 H41 Q40 26 32 30 Q24 26 23 18Z" fill="${fillTop}"/><path d="M32 34 L32 44 M22 49 Q32 40 42 49Z" fill="${fillBot}" stroke="${fillBot}" stroke-width="2"/>`;
  const plus = (x, y, s, fill = "#7FD08A") => `<path d="M${x - s} ${y} H${x + s} M${x} ${y - s} V${y + s}" ${N} stroke="${INK}" stroke-width="${s * 0.75 + 2.2}" stroke-linecap="round"/><path d="M${x - s} ${y} H${x + s} M${x} ${y - s} V${y + s}" ${N} stroke="${fill}" stroke-width="${s * 0.75}" stroke-linecap="round"/>`;
  const arrowUp = (x, y, s, fill = "#7FD08A") => `<path d="M${x} ${y - s} L${x + s * 0.8} ${y} H${x + s * 0.35} V${y + s} H${x - s * 0.35} V${y} H${x - s * 0.8}Z" fill="${fill}" ${O}/>`;
  const txt = (x, y, s, t, fill = INK, w = 700) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Georgia,serif" font-weight="${w}" font-size="${s}" fill="${fill}">${t}</text>`;

  // ---------- charms (permanent "artifacts") ----------
  const CHARMS = {
    calculator: `<rect x="15" y="8" width="34" height="48" rx="5" fill="#5c6670" ${O}/><rect x="19" y="12" width="26" height="11" rx="2" fill="#bfe3b4" ${T}/>${txt(40, 21, 8, "30%", "#2f5b2f")}` +
      [0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${19 + c * 9}" y="${27 + r * 9}" width="7" height="7" rx="1.5" fill="${r === 2 && c === 2 ? "#E8A65F" : "#e9e4d6"}" ${T}/>`).join("")).join(""),
    camera: `<rect x="8" y="20" width="48" height="32" rx="5" fill="#3d3f45" ${O}/><path d="M20 20 L24 13 H38 L42 20" fill="#3d3f45" ${O}/><circle cx="32" cy="36" r="11" fill="#9fb6c9" ${O}/><circle cx="32" cy="36" r="6" fill="#283545" ${T}/>${shine(29, 33, 2, 3)}<rect x="44" y="24" width="7" height="4" rx="1" fill="#E8C04A" ${T}/>`,
    horseshoe: `<path d="M17 52 L14 30 Q14 10 32 10 Q50 10 50 30 L47 52 H38 L40 30 Q40 20 32 20 Q24 20 24 30 L26 52Z" fill="#a9b2bb" ${O}/>` + [[17, 44], [16, 34], [19, 24], [47, 44], [48, 34], [45, 24]].map(([x, y]) => `<circle cx="${x + (x < 32 ? 3 : -3)}" cy="${y}" r="1.6" fill="${INK}"/>`).join("") + sparkle(52, 12, 5),
    battery: `<rect x="14" y="16" width="34" height="34" rx="4" fill="#2f3a44" ${O}/><rect x="25" y="10" width="12" height="6" rx="1.5" fill="#c9ccd0" ${O}/><rect x="18" y="34" width="26" height="12" rx="2" fill="#7ED081"/><rect x="18" y="20" width="26" height="12" rx="2" fill="#7ED081" opacity=".55"/><path d="M33 22 L27 34 H32 L29 44 L37 30 H32Z" fill="#FFE07A" ${T}/>`,
    torch: `<path d="M28 30 L36 30 L34 58 H30Z" fill="#9a6a3a" ${O}/><path d="M24 28 H40 L38 34 H26Z" fill="#6b4a2a" ${O}/>` + flame(32, 18, 13),
    amplifier: `<rect x="10" y="14" width="44" height="40" rx="4" fill="#2c2a2e" ${O}/><circle cx="32" cy="38" r="12" fill="#45424a" ${O}/><circle cx="32" cy="38" r="5" fill="#1a191c" ${T}/>` + [18, 26, 34, 42].map((x) => `<circle cx="${x + 2}" cy="20" r="2.4" fill="#E8C04A" ${T}/>`).join("") + `<path d="M50 30 Q56 38 50 46" ${N} stroke="#E8C04A" stroke-width="2.2" stroke-linecap="round"/>`,
    locksmith: `<rect x="14" y="28" width="30" height="26" rx="4" fill="#C9A227" ${O}/><path d="M20 28 V20 Q20 10 29 10 Q38 10 38 20 V28" ${N} stroke="${INK}" stroke-width="6"/><path d="M20 28 V20 Q20 10 29 10 Q38 10 38 20 V28" ${N} stroke="#a9b2bb" stroke-width="3.2"/><circle cx="29" cy="38" r="3.5" fill="${INK}"/><path d="M29 40 V47" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><g transform="rotate(35 50 44)"><circle cx="50" cy="34" r="5" fill="#E8C04A" ${O}/><path d="M50 39 V56 M50 50 H54 M50 54 H53" ${N} ${O}/></g>`,
    conductor: `<path d="M12 54 L46 14" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M12 54 L46 14" ${N} stroke="#F3ECD9" stroke-width="2.6" stroke-linecap="round"/><path d="M10 50 L16 56 L20 52 L14 46Z" fill="#6b4a2a" ${O}/><path d="M38 40 V22 L54 18 V36" ${N} ${O}/><ellipse cx="35" cy="41" rx="4" ry="3" fill="${INK}"/><ellipse cx="51" cy="37" rx="4" ry="3" fill="${INK}"/>`,
    alchemist: `<path d="M26 8 H38 M28 8 V22 L14 48 Q12 56 20 56 H44 Q52 56 50 48 L36 22 V8" fill="#e6f1f2" ${O}/><path d="M19 42 H45 L49 50 Q50 54 45 54 H19 Q14 54 15 50Z" fill="#9b5fc0"/><circle cx="26" cy="36" r="2.4" fill="#c79be0" ${T}/><circle cx="34" cy="30" r="1.8" fill="#c79be0" ${T}/>${txt(32, 51, 9, "×2", "#fff")}`,
    tinkerer: `<circle cx="26" cy="36" r="13" fill="#b9a27a" ${O}/>` + Array.from({ length: 8 }, (_, i) => `<rect x="23" y="18" width="6" height="7" rx="1" fill="#b9a27a" ${T} transform="rotate(${i * 45} 26 36)"/>`).join("") + `<circle cx="26" cy="36" r="5" fill="#6b5a3a" ${T}/><g transform="rotate(40 44 22)"><rect x="41" y="8" width="6" height="30" rx="2" fill="#8a96a3" ${O}/><path d="M38 8 Q44 2 50 8 L47 12 H41Z" fill="#8a96a3" ${O}/></g>`,
    fool: `<path d="M12 44 Q14 22 32 20 Q50 22 52 44Z" fill="#7E57C2" ${O}/><path d="M18 26 Q10 18 8 8 Q20 12 26 22" fill="#E8C04A" ${O}/><path d="M46 26 Q54 18 56 8 Q44 12 38 22" fill="#D2453B" ${O}/><path d="M32 20 Q32 10 32 6" ${N} ${O}/><circle cx="8" cy="8" r="3.5" fill="#E8C04A" ${O}/><circle cx="56" cy="8" r="3.5" fill="#D2453B" ${O}/><circle cx="32" cy="6" r="3.5" fill="#3FA9A0" ${O}/><path d="M10 44 H54 L52 52 H12Z" fill="#E8C04A" ${O}/>`,
    world: `<circle cx="32" cy="32" r="22" fill="#4a90d9" ${O}/><path d="M16 22 Q22 18 26 24 Q30 30 24 34 Q20 40 22 48 Q14 42 13 32Z M34 12 Q44 14 46 22 Q40 26 38 22 Q34 20 34 12Z M36 34 Q44 30 50 38 Q46 48 38 50 Q40 42 36 34Z" fill="#6fbf73" ${T}/>${shine(23, 20, 3, 6)}`,
    compass: `<circle cx="32" cy="34" r="22" fill="#C9A227" ${O}/><circle cx="32" cy="34" r="17" fill="#F5EEDC" ${T}/><rect x="29" y="7" width="6" height="6" rx="2" fill="#C9A227" ${O}/><path d="M32 19 L36 34 L32 49 L28 34Z" fill="#D2453B" ${T}/><path d="M32 34 L36 34 L32 49 L28 34Z" fill="#3d4a55"/><circle cx="32" cy="34" r="2" fill="${INK}"/>${txt(32, 26, 6, "N")}`,
    hourglass: hourglassShape("#E8C04A", "#E8C04A"),
    telescope: `<g transform="rotate(-28 32 32)"><rect x="6" y="26" width="16" height="12" rx="2" fill="#a5793f" ${O}/><rect x="20" y="24" width="18" height="16" rx="2" fill="#C9A227" ${O}/><rect x="36" y="22" width="20" height="20" rx="2" fill="#a5793f" ${O}/><ellipse cx="56" cy="32" rx="3" ry="10" fill="#9fc6e0" ${O}/></g><path d="M30 40 L20 58 M34 40 L44 58" ${N} ${O}/>`,
    ledger: book("#2f6b4a", `<path d="M22 22 H44 M22 28 H44 M22 34 H38" ${N} stroke="#E8C04A" stroke-width="1.8" stroke-linecap="round"/>` + coin(46, 14, 7)),
    prism: `<path d="M32 10 L54 50 H10Z" fill="#dbeef2" ${O}/><path d="M32 10 L38 50" ${N} ${T} opacity=".5"/><path d="M2 30 L24 32" ${N} stroke="#fff" stroke-width="3" stroke-linecap="round"/>` + ["#E35D5B", "#F2B544", "#7ED081", "#4a90d9", "#9b5fc0"].map((c, i) => `<path d="M42 ${28 + i * 3} L62 ${22 + i * 6}" ${N} stroke="${c}" stroke-width="3" stroke-linecap="round"/>`).join(""),
    scale: `<path d="M32 10 V52 M20 54 H44" ${N} ${O}/><path d="M12 18 H52" ${N} ${O}/><circle cx="32" cy="10" r="3" fill="#C9A227" ${O}/><path d="M12 18 L6 36 H18Z M52 18 L46 36 H58Z" ${N} ${T}/><path d="M4 36 Q12 44 20 36Z M44 36 Q52 44 60 36Z" fill="#C9A227" ${O}/>`,
    anchor: anchorShape(32, 32, 24),
    tollbooth: `<rect x="10" y="20" width="22" height="34" rx="2" fill="#E8D6B0" ${O}/><path d="M8 20 L21 10 L34 20Z" fill="#D2453B" ${O}/><rect x="15" y="26" width="12" height="10" rx="1" fill="#9fc6e0" ${T}/><path d="M32 40 H58" ${N} stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M32 40 H58" ${N} stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="4 4"/>` + coin(46, 18, 7),
    miser: coin(22, 46, 9) + coin(40, 46, 9) + coin(31, 38, 9) + coin(31, 26, 9) + `<path d="M42 14 Q52 6 56 14 Q52 18 48 16" ${N} ${T}/>`,
    ratchet: `<g transform="rotate(-35 32 32)"><rect x="28" y="26" width="8" height="32" rx="3" fill="#8a96a3" ${O}/><circle cx="32" cy="20" r="13" fill="#a9b2bb" ${O}/><circle cx="32" cy="20" r="6" fill="#5c6670" ${T}/></g>` + arrowUp(50, 18, 8),
    almanac: book("#8b5a2b", `<circle cx="34" cy="26" r="7" fill="#F6C445" ${T}/><path d="M42 20 Q36 26 42 32 Q34 32 34 26 Q34 20 42 20Z" fill="#dfe6f0" ${T}/>`),
    vault: `<rect x="8" y="10" width="48" height="44" rx="4" fill="#6c757d" ${O}/><circle cx="32" cy="32" r="14" fill="#a9b2bb" ${O}/><circle cx="32" cy="32" r="4" fill="#5c6670" ${T}/>` + [0, 60, 120].map((r) => `<path d="M32 20 V44" stroke="${INK}" stroke-width="2.2" transform="rotate(${r} 32 32)"/>`).join("") + `<rect x="50" y="18" width="4" height="8" rx="1" fill="#C9A227" ${T}/><rect x="50" y="38" width="4" height="8" rx="1" fill="#C9A227" ${T}/>`,
    crown: `<path d="M10 46 L8 18 L20 30 L32 12 L44 30 L56 18 L54 46Z" fill="#E8C04A" ${O}/><rect x="10" y="44" width="44" height="8" rx="2" fill="#C9A227" ${O}/><circle cx="32" cy="34" r="4" fill="#D2453B" ${T}/><circle cx="20" cy="38" r="2.6" fill="#3FA9A0" ${T}/><circle cx="44" cy="38" r="2.6" fill="#3FA9A0" ${T}/>`,
    bell: `<path d="M32 8 Q16 10 16 30 Q16 42 10 46 H54 Q48 42 48 30 Q48 10 32 8Z" fill="#E8C04A" ${O}/><circle cx="32" cy="51" r="5" fill="#C9A227" ${O}/><circle cx="32" cy="7" r="3" fill="#C9A227" ${O}/>${shine(23, 22, 2.5, 7, 15)}`,
    grimoire: book("#4b2e5e", `<path d="M33 20 L36 28 L44 28 L38 33 L40 41 L33 36 L26 41 L28 33 L22 28 L30 28Z" fill="#c79be0" ${T}/>`),
    gambler: `<path d="M14 34 Q14 22 32 22 Q50 22 50 34Z" fill="#3a2e28" ${O}/><path d="M6 36 Q32 30 58 36 Q32 42 6 36Z" fill="#3a2e28" ${O}/><path d="M16 30 H48" ${N} stroke="#D2453B" stroke-width="3"/>` + die(22, 50, 13, 5, "#F5EEDC", INK, -12) + die(42, 50, 13, 3, "#F5EEDC", INK, 14),
    chains: [0, 1, 2, 3].map((i) => `<rect x="${8 + i * 11}" y="${i % 2 ? 26 : 22}" width="${i % 2 ? 18 : 16}" height="${i % 2 ? 12 : 20}" rx="${i % 2 ? 6 : 8}" ${N} stroke="${INK}" stroke-width="7"/><rect x="${8 + i * 11}" y="${i % 2 ? 26 : 22}" width="${i % 2 ? 18 : 16}" height="${i % 2 ? 12 : 20}" rx="${i % 2 ? 6 : 8}" ${N} stroke="#9aa3ab" stroke-width="4"/>`).join(""),
    thorns: `<path d="M8 50 Q24 36 32 40 Q42 44 56 14" ${N} stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M8 50 Q24 36 32 40 Q42 44 56 14" ${N} stroke="#5b7f3a" stroke-width="4" stroke-linecap="round"/>` + [[16, 44, -40], [26, 38, 20], [38, 42, -10], [46, 32, 40], [51, 22, -30]].map(([x, y, r]) => `<path d="M${x} ${y} l-3 -7 l6 1Z" fill="#8bb35a" ${T} transform="rotate(${r} ${x} ${y})"/>`).join("") + `<circle cx="20" cy="22" r="7" fill="#D2453B" ${O}/><path d="M20 22 Q16 18 20 15 Q24 18 20 22" ${N} ${T}/>`,
    roulette: `<circle cx="32" cy="32" r="24" fill="#5a2e1a" ${O}/>` + Array.from({ length: 12 }, (_, i) => `<path d="M32 32 L${(32 + Math.cos((i / 12) * 6.283) * 20).toFixed(1)} ${(32 + Math.sin((i / 12) * 6.283) * 20).toFixed(1)} A20 20 0 0 1 ${(32 + Math.cos(((i + 1) / 12) * 6.283) * 20).toFixed(1)} ${(32 + Math.sin(((i + 1) / 12) * 6.283) * 20).toFixed(1)}Z" fill="${i === 0 ? "#3FA9A0" : i % 2 ? "#D2453B" : "#2a2522"}"/>`).join("") + `<circle cx="32" cy="32" r="20" ${N} ${T}/><circle cx="32" cy="32" r="8" fill="#C9A227" ${O}/><circle cx="44" cy="20" r="3" fill="#fff" ${T}/>`,
    coin: coin(32, 32, 20, "#E8C04A", "") + `<path d="M24 32 L30 38 L41 24" ${N} stroke="#8a6410" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` + `<path d="M8 14 L14 18 M10 6 L16 12 M54 12 L48 18" ${N} ${T}/>`,
    streak: `<path d="M38 6 L18 34 H30 L24 58 L48 26 H35Z" fill="#F6C445" ${O}/>` + `<path d="M8 20 H16 M6 30 H14 M10 40 H16" ${N} stroke="#F6C445" stroke-width="2.4" stroke-linecap="round"/>`,
    duke: `<circle cx="32" cy="36" r="17" fill="#f2d6b3" ${O}/><path d="M16 26 L14 8 L22 16 L32 6 L42 16 L50 8 L48 26Z" fill="#E8C04A" ${O}/><path d="M20 46 Q32 58 44 46 Q40 54 32 54 Q24 54 20 46Z" fill="#8b5a2b" ${T}/><path d="M22 32 Q26 30 30 32 M34 32 Q38 30 42 32" ${N} ${T}/><path d="M24 44 Q28 41 32 44 Q36 41 40 44" ${N} ${T}/>`,
    monument: `<path d="M26 10 L32 4 L38 10 L42 52 H22Z" fill="#d8d0bd" ${O}/><rect x="14" y="52" width="36" height="6" rx="1" fill="#b8ae96" ${O}/><path d="M29 18 H35 M28 28 H36 M27 38 H37" ${N} ${T} opacity=".4"/>`,
    mirror: `<ellipse cx="32" cy="26" rx="17" ry="20" fill="#C9A227" ${O}/><ellipse cx="32" cy="26" rx="12" ry="15" fill="#cfe4ee" ${T}/><path d="M24 20 L30 14 M24 28 L36 16" ${N} stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M28 45 H36 L35 58 H29Z" fill="#a5793f" ${O}/>`,
    specter: `<path d="M14 56 V28 Q14 8 32 8 Q50 8 50 28 V56 L44 50 L38 56 L32 50 L26 56 L20 50Z" fill="#e9ecf4" ${O}/><path d="M22 28 Q25 25 28 28 M36 28 Q39 25 42 28" ${N} ${T}/><path d="M20 38 Q32 44 44 38 M20 46 Q32 52 44 46" ${N} ${T} opacity=".6"/>`,
    ringmaster: `<rect x="18" y="8" width="28" height="30" rx="2" fill="#2a2522" ${O}/><path d="M10 38 H54 L52 44 H12Z" fill="#2a2522" ${O}/><rect x="18" y="28" width="28" height="6" fill="#D2453B" ${T}/>` + star5(32, 52, 7),
    furnace: `<path d="M12 58 V22 Q12 14 20 14 H44 Q52 14 52 22 V58Z" fill="#7a3b2a" ${O}/><path d="M20 58 V36 Q20 28 32 28 Q44 28 44 36 V58" fill="#2a1410" ${O}/>` + flame(32, 46, 10) + `<rect x="24" y="4" width="16" height="10" fill="#5a2e1a" ${O}/>`,
    oracle: `<path d="M14 54 H50 L46 46 H18Z" fill="#8b5a2b" ${O}/><circle cx="32" cy="28" r="19" fill="#b9a6e8" ${O}/><circle cx="32" cy="28" r="12" fill="#d9cdf8" opacity=".6"/><path d="M26 24 Q32 18 38 24 Q32 30 26 24Z" fill="#fff" ${T}/><circle cx="32" cy="24" r="2.2" fill="${INK}"/>${shine(24, 19, 3, 6)}`,
    zenith: `<path d="M4 54 L24 22 L34 36 L42 26 L60 54Z" fill="#6c7a89" ${O}/><path d="M24 22 L30 31 L26 30 L21 27Z" fill="#fff"/>` + sun(46, 14, 6) ,
    cascade: `<path d="M8 10 H28 V20 H40 V32 H52 V56 H8Z" fill="#8a96a3" ${O}/><path d="M28 14 Q34 14 34 22 M40 24 Q46 24 46 34 M18 8 Q24 8 24 14" ${N} stroke="#4a90d9" stroke-width="5" stroke-linecap="round"/><path d="M8 50 Q20 44 30 50 Q42 56 52 50 V56 H8Z" fill="#4a90d9" ${T}/>`,
    abacus: `<rect x="8" y="10" width="48" height="44" rx="3" ${N} stroke="${INK}" stroke-width="6"/><rect x="8" y="10" width="48" height="44" rx="3" ${N} stroke="#8b5a2b" stroke-width="3.5"/>` + [20, 32, 44].map((y, r) => `<path d="M10 ${y} H54" stroke="${INK}" stroke-width="1.6"/>` + [0, 1, 2, 3].map((i) => `<ellipse cx="${(r % 2 ? 30 : 16) + i * 7}" cy="${y}" rx="3.4" ry="4.4" fill="${["#D2453B", "#E8C04A", "#3FA9A0"][r]}" ${T}/>`).join("")).join(""),
    blueprintCharm: `<rect x="8" y="12" width="48" height="40" rx="2" fill="#2f6aa8" ${O}/><path d="M8 22 H56 M8 32 H56 M8 42 H56 M18 12 V52 M30 12 V52 M42 12 V52" stroke="#6ea0d4" stroke-width=".8"/><rect x="20" y="20" width="16" height="22" rx="2" ${N} stroke="#fff" stroke-width="1.8"/><rect x="17" y="17" width="22" height="28" rx="2" ${N} stroke="#fff" stroke-width="1.4" stroke-dasharray="3 2"/>`,
    satchel: `<path d="M10 26 H54 V52 Q54 56 50 56 H14 Q10 56 10 52Z" fill="#9a6a3a" ${O}/><path d="M10 26 Q10 18 18 18 H46 Q54 18 54 26 V36 H10Z" fill="#b07c44" ${O}/><path d="M20 18 Q20 6 32 6 Q44 6 44 18" ${N} ${O}/><rect x="28" y="32" width="8" height="8" rx="1.5" fill="#E8C04A" ${T}/>`,
    croupier: `<path d="M8 50 L44 14" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M8 50 L44 14" ${N} stroke="#b07c44" stroke-width="2.6" stroke-linecap="round"/><path d="M40 6 L54 20 L48 22 L38 12Z" fill="#b07c44" ${O}/>` + `<rect x="34" y="42" width="20" height="6" rx="3" fill="#D2453B" ${O}/><rect x="34" y="36" width="20" height="6" rx="3" fill="#3FA9A0" ${O}/><rect x="34" y="30" width="20" height="6" rx="3" fill="#F5EEDC" ${O}/>`,
    midas: `<path d="M18 58 V34 Q16 20 22 18 Q26 18 26 28 V14 Q26 8 30 8 Q34 8 34 14 V26 V12 Q34 6 38 6 Q42 6 42 12 V28 V18 Q42 14 46 14 Q50 14 50 20 V40 Q50 52 40 58Z" fill="#E8C04A" ${O}/>${shine(30, 20, 2, 6, 0)}` + sparkle(10, 18, 5) + sparkle(54, 46, 4),
    redThread: `<path d="M6 44 Q14 20 24 34 Q34 48 40 30 Q46 12 58 22" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M6 44 Q14 20 24 34 Q34 48 40 30 Q46 12 58 22" ${N} stroke="#C0392B" stroke-width="2.8" stroke-linecap="round"/><path d="M48 46 L58 56" ${N} stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/><path d="M48 46 L58 56" ${N} stroke="#c9ccd0" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="47" cy="45" rx="2.2" ry="1.2" ${N} ${T} transform="rotate(45 47 45)"/>`,
    archivist: `<rect x="8" y="22" width="48" height="32" rx="2" fill="#b07c44" ${O}/><path d="M12 22 V14 H24 L28 18 H52 V22" fill="#d8b98a" ${O}/>` + [16, 26, 36].map((x) => `<rect x="${x}" y="10" width="12" height="16" rx="1.5" fill="#FBF6E9" ${T} transform="rotate(${(x - 26) / 2} ${x + 6} 18)"/>`).join("") + `<rect x="26" y="34" width="12" height="6" rx="1.5" fill="#E8C04A" ${T}/>`,
    curator: `<path d="M20 56 L24 32 H40 L44 56Z" fill="#d8d0bd" ${O}/><rect x="16" y="28" width="32" height="6" rx="1" fill="#b8ae96" ${O}/><path d="M18 28 Q18 10 32 10 Q46 10 46 28" fill="#dbeef2" fill-opacity=".6" ${O}/>` + seal(32, 21, 6, "#C0392B", ""),
    reliquary: `<path d="M12 56 V28 L32 10 L52 28 V56Z" fill="#C9A227" ${O}/><path d="M22 56 V36 Q22 28 32 28 Q42 28 42 36 V56" fill="#5a2e1a" ${O}/>` + gem(32, 42, 7, "#9b5fc0") + `<path d="M32 4 V14 M27 8 H37" ${N} ${O}/>`,
    pocketwatch: `<circle cx="32" cy="36" r="20" fill="#C9A227" ${O}/><circle cx="32" cy="36" r="15" fill="#F5EEDC" ${T}/><rect x="28" y="8" width="8" height="7" rx="2" fill="#C9A227" ${O}/><circle cx="32" cy="6" r="3.5" ${N} ${O}/><path d="M32 36 V26 M32 36 L40 40" ${N} ${O}/>` + [0, 3, 6, 9].map((i) => `<circle cx="${32 + Math.cos(i * 0.5236) * 12}" cy="${36 + Math.sin(i * 0.5236) * 12}" r="1.2" fill="${INK}"/>`).join(""),
    vulture: `<path d="M8 30 Q20 20 32 28 Q44 20 56 30 Q46 30 40 38 Q36 50 32 50 Q28 50 24 38 Q18 30 8 30Z" fill="#4a3a30" ${O}/><circle cx="32" cy="22" r="7" fill="#d9a3a0" ${O}/><path d="M32 22 L40 26 L34 28Z" fill="#E8C04A" ${T}/><circle cx="31" cy="20" r="1.4" fill="${INK}"/><path d="M26 28 Q32 32 38 28" ${N} stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
    parchment: scroll(),
    investor: `<path d="M8 54 H56" ${N} ${O}/><rect x="12" y="38" width="9" height="16" fill="#3FA9A0" ${O}/><rect x="27" y="28" width="9" height="26" fill="#3FA9A0" ${O}/><rect x="42" y="16" width="9" height="38" fill="#3FA9A0" ${O}/><path d="M10 34 L24 22 L34 26 L52 8" ${N} stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M10 34 L24 22 L34 26 L52 8" ${N} stroke="#E8C04A" stroke-width="2" stroke-linecap="round"/><path d="M44 8 H52 V16" ${N} ${O}/>`,
    keepsake: `<path d="M32 56 C8 40 8 22 20 16 Q28 12 32 22 Q36 12 44 16 C56 22 56 40 32 56Z" fill="#E8C04A" ${O}/><path d="M32 50 C14 38 14 26 22 22 Q28 20 32 28 Q36 20 42 22 C50 26 50 38 32 50Z" fill="#f2d6b3" ${T}/>` + heart(32, 35, 6, "#D2453B") + `<path d="M32 8 V16" ${N} ${O}/><circle cx="32" cy="6" r="3" ${N} ${O}/>`,
    workshop: `<path d="M6 30 L32 10 L58 30" ${N} ${O}/><rect x="12" y="28" width="40" height="28" fill="#b07c44" ${O}/><rect x="24" y="38" width="16" height="18" fill="#5a3a22" ${O}/>` + `<g transform="scale(.5) translate(40 4)">${hammer(-40)}</g>`,
    paladin: `<path d="M32 6 L54 14 V30 Q54 48 32 58 Q10 48 10 30 V14Z" fill="#dfe6f0" ${O}/><path d="M32 12 L48 18 V30 Q48 44 32 52 Q16 44 16 30 V18Z" fill="#4a90d9" ${T}/><path d="M32 18 V46 M22 28 H42" ${N} stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M32 18 V46 M22 28 H42" ${N} stroke="#E8C04A" stroke-width="3.4" stroke-linecap="round"/>`,
    smuggler: `<path d="M8 28 Q32 18 56 28 L52 54 Q32 60 12 54Z" fill="#3a2e28" ${O}/><path d="M8 28 Q32 38 56 28" ${N} ${O}/><path d="M20 16 Q32 6 44 16 L40 26 Q32 22 24 26Z" fill="#2a2522" ${O}/>` + coin(24, 44, 5, "#E8C04A", "") + coin(36, 46, 5, "#E8C04A", ""),
    solitaire: playingCard(20, 10, 26, 38, 0, spade(33, 29, 8)) + `<path d="M12 56 H52" ${N} ${O}/><circle cx="33" cy="54" r="3" fill="#C9A227" ${T}/>`,
    duet: playingCard(10, 12, 24, 36, -12, heart(22, 30, 6)) + playingCard(30, 12, 24, 36, 12, heart(42, 30, 6)),
    triptych: [0, 1, 2].map((i) => `<path d="M${6 + i * 18} 54 V20 Q${15 + i * 18} ${8 + (i === 1 ? -4 : 0)} ${24 + i * 18} 20 V54Z" fill="${["#C9A227", "#E8C04A", "#C9A227"][i]}" ${O}/><path d="M${10 + i * 18} 50 V24 Q${15 + i * 18} 16 ${20 + i * 18} 24 V50Z" fill="#7a3b2a" ${T}/>`).join(""),
    checkmate: `<path d="M20 56 H44 L42 48 H22Z" fill="#2a2522" ${O}/><path d="M24 48 Q22 32 26 26 H38 Q42 32 40 48Z" fill="#2a2522" ${O}/><path d="M24 26 L22 14 L28 18 L32 10 L36 18 L42 14 L40 26Z" fill="#2a2522" ${O}/><path d="M32 2 V10 M28 5 H36" ${N} ${O}/>` + `<path d="M46 20 L56 30 M56 20 L46 30" ${N} stroke="#D2453B" stroke-width="3" stroke-linecap="round"/>`,
    rainbow: ["#E35D5B", "#F2B544", "#7ED081", "#4a90d9", "#9b5fc0"].map((c, i) => `<path d="M${6 + i * 4} 48 A${26 - i * 4} ${26 - i * 4} 0 0 1 ${58 - i * 4} 48" ${N} stroke="${c}" stroke-width="4"/>`).join("") + `<path d="M6 48 A26 26 0 0 1 58 48 M26 48 A6 6 0 0 1 38 48" ${N} ${T}/><ellipse cx="12" cy="50" rx="9" ry="5" fill="#fff" ${T}/><ellipse cx="52" cy="50" rx="9" ry="5" fill="#fff" ${T}/>`,
    crescendo: `<path d="M8 32 L56 14 M8 32 L56 50" ${N} ${O}/>` + [[20, 26, 4], [32, 22, 5], [46, 18, 6]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y + 20}" rx="${r}" ry="${r * 0.75}" fill="${INK}" transform="rotate(-20 ${x} ${y + 20})"/><path d="M${x + r * 0.9} ${y + 19} V${y + 4}" ${N} ${O}/>`).join(""),
    deadline: `<circle cx="32" cy="36" r="20" fill="#F5EEDC" ${O}/><path d="M16 14 L22 20 M48 14 L42 20" ${N} ${O}/><circle cx="14" cy="12" r="6" fill="#D2453B" ${O}/><circle cx="50" cy="12" r="6" fill="#D2453B" ${O}/><path d="M32 36 V22 M32 36 L42 36" ${N} stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M32 36 L46 30" ${N} stroke="#D2453B" stroke-width="2" stroke-linecap="round"/><path d="M24 56 L20 60 M40 56 L44 60" ${N} ${O}/>`,
    keymaster: `<circle cx="32" cy="32" r="10" ${N} stroke="${INK}" stroke-width="5"/><circle cx="32" cy="32" r="10" ${N} stroke="#C9A227" stroke-width="2.6"/>` + [[-40, "#E8C04A"], [10, "#a9b2bb"], [60, "#b07c44"]].map(([r, c]) => `<g transform="rotate(${r} 32 32)"><circle cx="32" cy="14" r="5" fill="${c}" ${O}/><path d="M32 19 V24" ${N} ${O}/></g><g transform="rotate(${r + 180} 32 32)"><path d="M32 42 V58 M32 52 H37 M32 56 H36" ${N} stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M32 42 V58 M32 52 H37 M32 56 H36" ${N} stroke="${c}" stroke-width="2.2" stroke-linecap="round"/></g>`).join(""),
  };

  // ---------- items (consumables) ----------
  const ITEMS = {
    devil: `<path d="M32 22 V60" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M32 22 V60" ${N} stroke="#7a2a22" stroke-width="2.6" stroke-linecap="round"/><path d="M18 8 V20 Q18 28 32 28 Q46 28 46 20 V8 M32 4 V28" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M18 8 V20 Q18 28 32 28 Q46 28 46 20 V8 M32 4 V28" ${N} stroke="#C0392B" stroke-width="2.6" stroke-linecap="round"/><path d="M15 9 L18 3 L21 9Z M29 5 L32 -1 L35 5Z M43 9 L46 3 L49 9Z" fill="#C0392B" ${T}/><path d="M8 40 Q2 26 12 22 Q10 32 18 38Z M56 40 Q62 26 52 22 Q54 32 46 38Z" fill="#8b1e1e" ${O}/>`,
    joker: `<path d="M12 48 Q10 30 4 22 Q18 20 24 34 Q28 12 32 8 Q36 12 40 34 Q46 20 60 22 Q54 30 52 48Z" fill="#7E57C2" ${O}/><path d="M24 34 Q28 12 32 8 Q36 12 40 34 Q32 38 24 34Z" fill="#3FA9A0" ${T}/><path d="M10 46 H54 V54 Q32 58 10 54Z" fill="#E8C04A" ${O}/><path d="M16 50 L20 47 L24 50 L28 47 L32 50 L36 47 L40 50 L44 47 L48 50" ${N} ${T}/><circle cx="4" cy="22" r="3.4" fill="#E8C04A" ${O}/><circle cx="60" cy="22" r="3.4" fill="#E8C04A" ${O}/><circle cx="32" cy="7" r="3" fill="#E8C04A" ${O}/>`,
    fortune: `<path d="M14 54 H50 L46 46 H18Z" fill="#8b5a2b" ${O}/><circle cx="32" cy="28" r="19" fill="#7fb6e0" ${O}/>${sparkle(26, 24, 5, "#fff")}${sparkle(38, 32, 3.5, "#fff")}${shine(24, 18, 3, 6)}`,
    sun: sun(32, 32, 13) + `<circle cx="32" cy="32" r="8" ${N} ${T} opacity=".6"/>`,
    empress: `<path d="M10 40 L8 14 L20 26 L32 8 L44 26 L56 14 L54 40Z" fill="#E8C04A" ${O}/><path d="M10 40 H54 V48 H10Z" fill="#C9A227" ${O}/>` + [20, 32, 44].map((x, i) => `<circle cx="${x}" cy="${i === 1 ? 26 : 30}" r="3.2" fill="${["#3FA9A0", "#D2453B", "#3FA9A0"][i]}" ${T}/>`).join("") + `<path d="M22 54 Q32 48 42 54" ${N} stroke="#E8C04A" stroke-width="2.6" stroke-linecap="round"/><path d="M50 46 Q58 50 54 58 Q50 52 44 52" ${N} ${T}/>`,
    hermit: `<path d="M30 12 V58" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M30 12 V58" ${N} stroke="#9a6a3a" stroke-width="2.6" stroke-linecap="round"/><path d="M30 14 H44 V18" ${N} ${O}/><path d="M38 20 H50 L48 38 H40Z" fill="#E8C04A" fill-opacity=".85" ${O}/>` + flame(44, 30, 5) + `<path d="M38 18 L44 14 L50 18Z" fill="#5c6670" ${O}/>`,
    star: star5(32, 32, 22) + shine(26, 22, 2.5, 5, 30),
    hangedman: `<path d="M8 8 H56" ${N} stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M8 8 H56" ${N} stroke="#9a6a3a" stroke-width="3.4" stroke-linecap="round"/><path d="M32 8 V16" ${N} ${O}/><path d="M26 16 H38 L36 36 H28Z" fill="#4a90d9" ${O}/><path d="M28 18 L22 26 M36 18 L42 26" ${N} ${O}/><path d="M28 36 L26 44 M36 36 L38 44" ${N} ${O}/><circle cx="32" cy="48" r="7" fill="#f2d6b3" ${O}/><circle cx="32" cy="48" r="10" ${N} stroke="#F6C445" stroke-width="2" stroke-dasharray="3 3"/>`,
    lovers: heart(24, 32, 14, "#E35D5B") + heart(40, 34, 12, "#F28C9B") + `<path d="M6 50 L56 14" ${N} stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M6 50 L56 14" ${N} stroke="#E8C04A" stroke-width="2" stroke-linecap="round"/><path d="M56 14 L48 14 L52 20Z" fill="#E8C04A" ${T}/>`,
    theMerchant: `<rect x="10" y="38" width="44" height="16" rx="2" fill="#9a6a3a" ${O}/><path d="M6 24 L12 14 H52 L58 24Z" fill="#D2453B" ${O}/><path d="M6 24 Q12 30 18 24 Q24 30 30 24 Q36 30 42 24 Q48 30 52 24 Q55 30 58 24" fill="#F5EEDC" ${T}/><path d="M12 24 V38 M52 24 V38" ${N} ${O}/>` + diamond(32, 32, 9),
    theGardener: `<path d="M14 36 H50 L46 56 H18Z" fill="#b5653a" ${O}/><rect x="12" y="32" width="40" height="6" rx="2" fill="#9a4f2a" ${O}/><path d="M32 32 V18" ${N} stroke="#3a7a3a" stroke-width="3"/><path d="M32 22 Q20 20 18 10 Q30 10 32 22 Q34 12 46 12 Q44 22 32 22" fill="#6fbf73" ${O}/>` + club(32, 47, 5),
    theGravedigger: `<g transform="rotate(25 32 32)"><rect x="29" y="4" width="6" height="34" rx="2" fill="#9a6a3a" ${O}/><path d="M24 4 H40" ${N} ${O}/><path d="M22 36 H42 L40 52 Q32 60 24 52Z" fill="#8a96a3" ${O}/></g><path d="M4 58 Q16 48 30 56 Q44 50 60 58Z" fill="#6b4a2a" ${O}/>` + spade(14, 40, 6),
    justice: `<path d="M32 8 V54 M20 56 H44" ${N} ${O}/><path d="M10 18 H54" ${N} ${O}/><path d="M10 18 L4 34 H16Z M54 18 L48 34 H60Z" ${N} ${T}/><path d="M2 34 Q10 42 18 34Z M46 34 Q54 42 62 34Z" fill="#E8C04A" ${O}/><circle cx="32" cy="8" r="3" fill="#E8C04A" ${O}/><path d="M24 26 L40 26" ${N} stroke="#3FA9A0" stroke-width="2"/>`,
    judgement: `<path d="M8 34 L40 22 V46Z" fill="#E8C04A" ${O}/><rect x="40" y="26" width="10" height="16" rx="2" fill="#C9A227" ${O}/><path d="M50 30 Q60 34 50 38" ${N} ${O}/><path d="M4 30 L8 34 L4 38" ${N} ${O}/>` + sparkle(52, 14, 5) + sparkle(56, 52, 4),
    emperor: `<path d="M12 56 V24 H52 V56Z" fill="#8b1e1e" ${O}/><path d="M8 24 H56 V30 H8Z" fill="#C9A227" ${O}/><path d="M16 24 V14 L22 18 L32 8 L42 18 L48 14 V24" fill="#E8C04A" ${O}/><path d="M24 34 H40 V56 H24Z" fill="#5a1414" ${T}/>`,
    coinItem: coin(26, 34, 16, "#E8C04A", "") + coin(40, 28, 16, "#f2d26a", "") + txt(40, 33, 13, "×2", "#8a6410"),
    death: `<path d="M14 30 Q14 10 32 10 Q50 10 50 30 Q50 38 44 42 V50 H20 V42 Q14 38 14 30Z" fill="#ece8de" ${O}/><path d="M20 50 V56 H44 V50" fill="#ece8de" ${O}/><path d="M26 50 V56 M32 50 V56 M38 50 V56" ${N} ${T}/><ellipse cx="25" cy="30" rx="5" ry="6" fill="${INK}"/><ellipse cx="39" cy="30" rx="5" ry="6" fill="${INK}"/><path d="M32 36 L29 42 H35Z" fill="${INK}"/>`,
    magician: `<path d="M14 26 H50 L46 50 Q32 56 18 50Z" fill="#2a2522" ${O}/><path d="M8 26 Q32 20 56 26 Q32 32 8 26Z" fill="#2a2522" ${O}/><path d="M16 46 Q32 50 48 46" ${N} stroke="#D2453B" stroke-width="3"/><path d="M38 8 L54 24" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M38 8 L54 24" ${N} stroke="#F5EEDC" stroke-width="2.6" stroke-linecap="round"/>` + sparkle(36, 6, 5, "#FFB84D") + sparkle(24, 12, 3.5, "#FFB84D"),
    priest: `<path d="M18 56 L22 22 H42 L46 56Z" fill="#A89968" ${O}/><path d="M22 22 Q32 6 42 22" fill="#E8D6B0" ${O}/><path d="M32 28 V46 M26 34 H38" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M32 28 V46 M26 34 H38" ${N} stroke="#E8C04A" stroke-width="2.6" stroke-linecap="round"/>` + coin(50, 46, 7),
    wanderer: `<path d="M10 46 Q14 30 24 34 Q34 38 38 26 Q42 14 54 16" ${N} stroke="${INK}" stroke-width="12" stroke-linecap="round"/><path d="M10 46 Q14 30 24 34 Q34 38 38 26 Q42 14 54 16" ${N} stroke="#7BC89A" stroke-width="8.4" stroke-linecap="round"/><path d="M14 42 Q18 34 24 36 M30 34 Q36 32 38 26 M42 20 Q46 16 50 16" ${N} stroke="#4f9a6f" stroke-width="1.6" stroke-dasharray="2 3"/><circle cx="54" cy="16" r="2" fill="${INK}"/><path d="M6 52 Q14 56 22 52 Q16 60 6 52Z" fill="#cfe9d8" fill-opacity=".8" ${T}/>`,
    keeper: `<path d="M32 8 Q48 12 46 32 Q44 52 32 56 Q20 52 18 32 Q16 12 32 8Z" fill="#d9c9a8" ${O}/>` + [16, 24, 32, 40, 48].map((y) => `<path d="M${y < 30 ? 22 - (y - 16) / 3 : 20} ${y} Q32 ${y + 4} ${y < 30 ? 42 + (y - 16) / 3 : 44} ${y}" ${N} ${T} opacity=".6"/>`).join("") + `<path d="M32 2 V8" ${N} ${O}/>`,
    anchor: anchorShape(32, 32, 24, "#8A9BAA") + `<path d="M14 18 Q20 10 28 16" ${N} stroke="#c49a6c" stroke-width="2.4"/>`,
    mirror: `<rect x="14" y="6" width="36" height="50" rx="16" fill="#C9A227" ${O}/><rect x="19" y="11" width="26" height="40" rx="12" fill="#dfe8ef" ${T}/><path d="M24 22 L34 12 M24 32 L42 14" ${N} stroke="#fff" stroke-width="3" stroke-linecap="round"/><rect x="26" y="54" width="12" height="6" rx="2" fill="#a5793f" ${O}/>`,
    gilder: `<rect x="10" y="40" width="44" height="12" rx="3" fill="#8b5a2b" ${O}/><path d="M22 40 V22 Q22 14 32 14 Q42 14 42 22 V40" fill="#b07c44" ${O}/>` + seal(46, 18, 10, "#F2C94C", txt(46, 22, 10, "$", "#7a5a10")),
    herald: `<path d="M6 30 Q8 24 14 26 L44 14 V50 L14 38 Q8 40 6 34Z" fill="#E8C04A" ${O}/><path d="M44 12 Q56 32 44 52 Q50 32 44 12Z" fill="#C9A227" ${O}/><path d="M16 38 L20 52 H28 L26 42" fill="#C0392B" ${O}/><path d="M52 22 L58 18 M54 32 H60 M52 42 L58 46" ${N} ${O}/>`,
    warden: `<path d="M32 6 L54 14 V30 Q54 48 32 58 Q10 48 10 30 V14Z" fill="#4A90D9" ${O}/><path d="M32 14 L46 19 V30 Q46 42 32 50 Q18 42 18 30 V19Z" fill="#9fc6e0" ${T}/>` + seal(32, 32, 9, "#4A90D9", `<path d="M28 32 L31 35 L37 28" ${N} stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`),
    strength: `<path d="M8 40 Q8 26 20 24 Q22 14 32 14 Q40 14 40 24 L52 26 Q58 30 54 40 Q48 50 34 50 H18 Q8 50 8 40Z" fill="#e3a87a" ${O}/><path d="M22 24 Q28 30 36 26" ${N} ${T}/><path d="M24 40 Q30 34 38 40" ${N} ${T}/>` + arrowUp(54, 12, 7),
    temperance: `<path d="M8 22 L20 22 L18 44 H10Z" fill="#dfeef0" ${O}/><path d="M44 30 H56 L54 52 H46Z" fill="#dfeef0" ${O}/><path d="M10 36 H18 L18 44 H10Z M46 44 H54 L54 52 H46Z" fill="#4a90d9"/><path d="M20 24 Q32 14 46 34" ${N} stroke="#4a90d9" stroke-width="3.4" stroke-linecap="round"/>` + txt(32, 58, 12, "J", "#E8C04A"),
    tower: `<path d="M20 58 L22 18 H42 L44 58Z" fill="#a9a08c" ${O}/><path d="M18 18 H46 V10 H40 V14 H35 V10 H29 V14 H24 V10 H18Z" fill="#a9a08c" ${O}/><rect x="28" y="28" width="8" height="10" rx="4" fill="#2a2522" ${T}/><path d="M52 2 L42 18 L48 18 L40 32" ${N} stroke="#FFE07A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` + flame(24, 14, 6),
    moon: `<path d="M38 8 Q18 12 18 32 Q18 52 40 56 Q24 46 24 32 Q24 18 38 8Z" fill="#e8e1c4" ${O}/>` + club(46, 34, 7) + sparkle(46, 12, 3.5),
    highpriestess: `<path d="M16 58 Q14 30 32 22 Q50 30 48 58Z" fill="#2f4a7a" ${O}/><circle cx="32" cy="18" r="8" fill="#f2d6b3" ${O}/><path d="M22 14 Q26 4 32 10 Q38 4 42 14" ${N} ${O}/><circle cx="32" cy="6" r="3" fill="#dfe6f0" ${T}/>` + spade(32, 42, 6, "#dfe6f0"),
    hierophant: `<path d="M24 8 L32 2 L40 8 V24 H24Z" fill="#E8C04A" ${O}/><path d="M24 14 H40 M24 20 H40" ${N} ${T}/><path d="M32 24 V58" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M32 24 V58" ${N} stroke="#C9A227" stroke-width="2.6" stroke-linecap="round"/>` + diamond(32, 40, 10),
    chariot: `<path d="M8 22 H46 L50 42 H8Z" fill="#C9A227" ${O}/><circle cx="18" cy="46" r="10" fill="#9a6a3a" ${O}/><circle cx="18" cy="46" r="3" fill="${INK}"/><path d="M8 46 H28 M18 36 V56" ${N} ${T}/><path d="M48 30 L60 24" ${N} ${O}/>` + heart(30, 31, 6),
    eraser: `<g transform="rotate(-30 32 32)"><rect x="10" y="22" width="44" height="20" rx="4" fill="#F28C9B" ${O}/><rect x="10" y="22" width="16" height="20" rx="4" fill="#4a90d9" ${O}/></g><path d="M8 56 Q20 52 30 56 Q40 60 54 54" ${N} stroke="#bfb6a3" stroke-width="2" stroke-dasharray="1 4" stroke-linecap="round"/>`,
    duplicator: `<rect x="8" y="34" width="48" height="20" rx="3" fill="#5c6670" ${O}/><rect x="14" y="28" width="36" height="8" rx="2" fill="#8a96a3" ${O}/>` + playingCard(20, 8, 16, 22, -6) + playingCard(28, 10, 16, 22, 6) + `<circle cx="48" cy="44" r="3" fill="#7ED081" ${T}/>`,
    batteryPack: `<rect x="10" y="14" width="18" height="40" rx="4" fill="#2f3a44" ${O}/><rect x="36" y="14" width="18" height="40" rx="4" fill="#2f3a44" ${O}/><rect x="15" y="10" width="8" height="5" rx="1" fill="#c9ccd0" ${T}/><rect x="41" y="10" width="8" height="5" rx="1" fill="#c9ccd0" ${T}/><rect x="13" y="30" width="12" height="20" rx="2" fill="#7ED081"/><rect x="39" y="30" width="12" height="20" rx="2" fill="#7ED081"/>` + txt(32, 62, 9, "+100", "#7ED081"),
    dice: die(22, 26, 22, 4, "#F5EEDC", INK, -12) + die(42, 42, 22, 6, "#D2453B", "#fff", 14),
    freshDeal: playingCard(8, 16, 22, 32, -18) + playingCard(34, 16, 22, 32, 18) + `<path d="M24 12 Q32 4 40 12 M36 8 L40 12 L35 14 M40 54 Q32 62 24 54 M28 58 L24 54 L29 52" ${N} ${O}/>`,
    piggyBank: `<ellipse cx="32" cy="36" rx="22" ry="16" fill="#F28C9B" ${O}/><path d="M18 26 L16 16 L26 22" fill="#F28C9B" ${O}/><ellipse cx="54" cy="36" rx="5" ry="6" fill="#e57989" ${O}/><circle cx="53" cy="34" r="1" fill="${INK}"/><circle cx="55" cy="38" r="1" fill="${INK}"/><circle cx="44" cy="30" r="2" fill="${INK}"/><rect x="26" y="18" width="12" height="3" rx="1.5" fill="${INK}"/><path d="M18 50 V56 M28 52 V58 M38 52 V58 M46 50 V56" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` + coin(32, 10, 6),
    pouch: bag(32, 34, 24, "#b07c44"),
    coinPurse: `<path d="M10 30 Q10 52 32 54 Q54 52 54 30Z" fill="#7E57C2" ${O}/><path d="M10 30 Q20 24 32 30 Q44 24 54 30" fill="#9b7ad6" ${O}/><circle cx="26" cy="22" r="4" fill="#E8C04A" ${O}/><circle cx="38" cy="22" r="4" fill="#E8C04A" ${O}/>` + coin(32, 42, 7),
    luckyBreak: `<path d="M32 32 Q14 30 14 18 Q14 8 24 10 Q30 12 32 32 Q34 12 40 10 Q50 8 50 18 Q50 30 32 32 Q50 34 50 46 Q50 56 40 54 Q34 52 32 32 Q30 52 24 54 Q14 56 14 46 Q14 34 32 32Z" fill="#6fbf73" ${O}/><path d="M32 32 Q38 48 46 60" ${N} stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M32 32 Q38 48 46 60" ${N} stroke="#3a7a3a" stroke-width="2.2" stroke-linecap="round"/>`,
    doubleDownToken: `<circle cx="32" cy="32" r="22" fill="#D2453B" ${O}/>` + Array.from({ length: 8 }, (_, i) => `<rect x="29" y="10" width="6" height="7" fill="#F5EEDC" transform="rotate(${i * 45} 32 32)"/>`).join("") + `<circle cx="32" cy="32" r="14" fill="#F5EEDC" ${T}/>` + txt(32, 37, 13, "×2", "#C0392B"),
    encoreTicket: ticket("#f2d26a", "ENCORE", "★"),
    meteorShard: `<path d="M8 8 Q26 18 34 30" ${N} stroke="#F29A2E" stroke-width="8" stroke-linecap="round" opacity=".6"/><path d="M14 6 Q30 20 36 30" ${N} stroke="#FFE07A" stroke-width="3" stroke-linecap="round"/><path d="M30 34 L42 24 L56 32 L52 50 L36 54 L28 44Z" fill="#6b5a8a" ${O}/><path d="M42 24 L44 40 L56 32 M44 40 L36 54 M44 40 L28 44" ${N} ${T} opacity=".6"/>`,
    deepPockets: `<path d="M14 8 H50 V36 Q50 56 32 56 Q14 56 14 36Z" fill="#3d4f6b" ${O}/><path d="M14 8 H50 V16 H14Z" fill="#2f3d55" ${O}/>` + coin(32, 38, 9) + `<path d="M22 22 Q32 28 42 22" ${N} ${T}/>`,
    secondWind: `<path d="M8 24 H38 Q48 24 46 14 Q44 8 38 10" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M8 24 H38 Q48 24 46 14 Q44 8 38 10" ${N} stroke="#9fd8e8" stroke-width="2.8" stroke-linecap="round"/><path d="M6 36 H48 Q58 36 56 46 Q54 54 46 50" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M6 36 H48 Q58 36 56 46 Q54 54 46 50" ${N} stroke="#9fd8e8" stroke-width="2.8" stroke-linecap="round"/><path d="M14 48 H30" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M14 48 H30" ${N} stroke="#9fd8e8" stroke-width="2.8" stroke-linecap="round"/>`,
    loadedDice: die(26, 32, 26, 6, "#2a2522", "#E8C04A", -10) + `<path d="M42 44 L54 56" ${N} stroke="${INK}" stroke-width="4" stroke-linecap="round"/><circle cx="54" cy="56" r="4" fill="#8a96a3" ${O}/>`,
    pocketChange: coin(20, 42, 10) + coin(42, 46, 8, "#c9ccd0", "¢") + coin(32, 26, 11),
    savingsBond: `<rect x="6" y="14" width="52" height="36" rx="3" fill="#e6ecd6" ${O}/><rect x="10" y="18" width="44" height="28" rx="2" ${N} stroke="#3a7a3a" stroke-width="1.4" stroke-dasharray="3 2"/>` + seal(18, 32, 7, "#3a7a3a", "") + txt(40, 36, 11, "$4", "#3a7a3a"),
    shufflePass: ticket("#9fc6e0", "SHUFFLE", "⇄"),
    blueprintScroll: `<rect x="10" y="16" width="44" height="32" fill="#2f6aa8" ${O}/><path d="M18 24 H40 M18 30 H34" ${N} stroke="#fff" stroke-width="1.4"/><rect x="38" y="28" width="10" height="14" rx="1" ${N} stroke="#fff" stroke-width="1.4"/><ellipse cx="10" cy="32" rx="5" ry="17" fill="#3d7cc0" ${O}/><ellipse cx="54" cy="32" rx="5" ry="17" fill="#3d7cc0" ${O}/>`,
    supplyCrate: `<rect x="8" y="18" width="48" height="38" rx="2" fill="#b07c44" ${O}/><path d="M8 18 L56 56 M56 18 L8 56" ${N} stroke="${INK}" stroke-width="5"/><path d="M8 18 L56 56 M56 18 L8 56" ${N} stroke="#c99560" stroke-width="2.6"/><rect x="6" y="14" width="52" height="8" rx="2" fill="#9a6a3a" ${O}/>`,
    goldenSeal: seal(32, 32, 22, "#F2C94C", txt(32, 40, 22, "$", "#7a5a10")),
    echoSeal: seal(32, 32, 22, "#C0392B", txt(32, 39, 18, "×2", "#fbe3dc")),
    nurserySeal: seal(32, 32, 22, "#4A90D9", `<path d="M32 24 Q24 18 20 26 Q18 34 32 42 Q46 34 44 26 Q40 18 32 24Z" fill="#fbe3dc" ${T}/>`),
    sparklerKit: `<rect x="10" y="30" width="44" height="26" rx="3" fill="#ECAC4B" ${O}/><path d="M10 38 H54" ${N} ${T}/><path d="M22 30 L18 8 M32 30 V6 M42 30 L46 8" ${N} stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/><path d="M22 30 L18 8 M32 30 V6 M42 30 L46 8" ${N} stroke="#8a96a3" stroke-width="1.6" stroke-linecap="round"/>` + sparkle(18, 8, 6, "#FFB84D") + sparkle(32, 6, 6, "#FFE07A") + sparkle(46, 8, 6, "#FFB84D"),
    moltCapsule: `<g transform="rotate(-35 32 32)"><rect x="12" y="22" width="40" height="20" rx="10" fill="#dfeef0" ${O}/><path d="M32 22 H42 Q52 22 52 32 Q52 42 42 42 H32Z" fill="#6BA89A" ${O}/><path d="M16 28 Q22 36 28 28" ${N} stroke="#7BC89A" stroke-width="2.4" stroke-linecap="round"/></g>`,
    larvaJar: `<rect x="14" y="16" width="36" height="42" rx="6" fill="#e6f1f2" fill-opacity=".85" ${O}/><rect x="12" y="8" width="40" height="10" rx="3" fill="#8C7A56" ${O}/><path d="M22 44 Q26 36 32 42 Q38 48 42 40" ${N} stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M22 44 Q26 36 32 42 Q38 48 42 40" ${N} stroke="#e8dcb8" stroke-width="5.4" stroke-linecap="round"/><circle cx="42" cy="40" r="1.2" fill="${INK}"/>`,
    copycat: `<path d="M14 54 Q12 30 20 22 L16 8 L28 16 H36 L48 8 L44 22 Q52 30 50 54Z" fill="#5CA17D" ${O}/><ellipse cx="25" cy="32" rx="3.5" ry="4.5" fill="#FFE07A" ${T}/><ellipse cx="39" cy="32" rx="3.5" ry="4.5" fill="#FFE07A" ${T}/><path d="M28 42 L32 45 L36 42 M32 45 V48" ${N} ${T}/><path d="M18 42 H8 M18 46 H10 M46 42 H56 M46 46 H54" ${N} ${T}/>`,
    pruningShears: `<g transform="rotate(-20 32 32)"><path d="M30 30 L14 6 Q26 10 34 28Z" fill="#a9b2bb" ${O}/><path d="M34 30 L50 6 Q38 10 30 28Z" fill="#c9ccd0" ${O}/><path d="M30 32 L18 56" ${N} stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M30 32 L18 56" ${N} stroke="#D2453B" stroke-width="5" stroke-linecap="round"/><path d="M34 32 L46 56" ${N} stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M34 32 L46 56" ${N} stroke="#D2453B" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="30" r="3" fill="#E8C04A" ${T}/></g>`,
    forgeHammer: `<path d="M6 54 H58 L54 46 H10Z" fill="#3d4148" ${O}/>` + hammer(-35) + sparkle(50, 40, 4, "#FFB84D") + sparkle(42, 44, 3, "#FFE07A"),
    jackpot: `<rect x="8" y="12" width="48" height="40" rx="6" fill="#C0392B" ${O}/>` + [16, 32, 48].map((x) => `<rect x="${x - 6}" y="20" width="12" height="18" rx="2" fill="#F5EEDC" ${T}/>` + txt(x, 34, 12, "J", "#C0392B")).join("") + `<rect x="18" y="42" width="28" height="6" rx="2" fill="${INK}"/><path d="M56 22 H60 V36" ${N} ${O}/><circle cx="60" cy="18" r="3.4" fill="#E8C04A" ${O}/>`,
    heartsBanner: banner("#E35D5B") + heart(32, 25, 6, "#fbe3dc"),
    twinMolds: `<rect x="6" y="18" width="24" height="34" rx="3" fill="#8a96a3" ${O}/><rect x="34" y="18" width="24" height="34" rx="3" fill="#8a96a3" ${O}/><rect x="11" y="23" width="14" height="24" rx="2" fill="#5c6670" ${T}/><rect x="39" y="23" width="14" height="24" rx="2" fill="#E8C04A" ${T}/>` + heart(18, 35, 4, "#E8C04A") + heart(46, 35, 4, "#C9A227"),
    bountyContract: scroll("#EAD9B0", false) + txt(34, 32, 8, "WANTED", INK) + `<path d="M24 38 L42 38" ${N} ${T}/>` + seal(44, 44, 6, "#C0392B", ""),
  };

  // ---------- vouchers (permanent upgrades, drawn as stamped tickets) ----------
  const voucherTicket = (fill, art) => `<path d="M6 14 H58 V24 Q52 32 58 40 V50 H6 V40 Q12 32 6 24Z" fill="${fill}" ${O}/><path d="M6 14 H58 V50 H6Z" ${N} stroke="rgba(255,255,255,.35)" stroke-width="1" transform="translate(0 0)"/>` + art;
  const VOUCHERS = {
    largerAbdomen: voucherTicket("#e9d9b8", playingCard(16, 20, 12, 18, -10) + playingCard(26, 19, 12, 18, 0) + playingCard(36, 20, 12, 18, 10) + plus(50, 24, 4)),
    liquidAssets: voucherTicket("#cfe6d6", `<path d="M32 20 Q40 30 40 36 Q40 44 32 44 Q24 44 24 36 Q24 30 32 20Z" fill="#4a90d9" ${O}/>` + txt(32, 40, 8, "$", "#fff")),
    moreOre: voucherTicket("#e3dbcd", `<path d="M20 44 L24 28 L34 22 L44 30 L44 44Z" fill="#6c757d" ${O}/>` + gem(30, 34, 5, "#E8C04A") + gem(40, 38, 4, "#3FA9A0")),
    overstock: voucherTicket("#f0e0c0", `<rect x="18" y="32" width="12" height="12" fill="#b07c44" ${T}/><rect x="32" y="32" width="12" height="12" fill="#b07c44" ${T}/><rect x="25" y="20" width="12" height="12" fill="#c99560" ${T}/>` + plus(50, 24, 4)),
    doubleDown: voucherTicket("#f5d6cf", `<path d="M24 22 V42 L16 34 M24 42 L32 34" ${N} ${O}/>` + txt(42, 38, 13, "+1", "#C0392B")),
    bankruptcy: voucherTicket("#e6dad6", `<path d="M16 44 H44 L40 24 H20Z" fill="#8a96a3" ${O}/><path d="M22 18 L26 24 M30 16 V24 M38 18 L34 24" ${N} ${T}/>` + plus(50, 24, 4)),
    compoundInterest: voucherTicket("#e5efd5", coin(24, 36, 7) + coin(36, 30, 7) + arrowUp(48, 32, 7)),
    cardSharp: voucherTicket("#e8e0f2", playingCard(18, 18, 16, 24, -12, spade(26, 30, 4)) + `<path d="M36 44 L52 20" ${N} stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M36 44 L52 20" ${N} stroke="#c9ccd0" stroke-width="1.6" stroke-linecap="round"/>`),
    clearanceSale: voucherTicket("#f6e1b6", `<path d="M18 24 H34 L46 36 L36 46 L18 28Z" fill="#E35D5B" ${O}/><circle cx="23" cy="28" r="2" fill="#f6e1b6" ${T}/>` + txt(34, 38, 8, "25%", "#fff")),
    clairvoyance: voucherTicket("#ddd6f2", `<path d="M14 32 Q32 14 50 32 Q32 50 14 32Z" fill="#fff" ${O}/><circle cx="32" cy="32" r="7" fill="#7E57C2" ${O}/><circle cx="32" cy="32" r="3" fill="${INK}"/>${shine(30, 30, 1, 1.6, 0)}`),
  };

  /* Charms are the run's permanent artifacts, so they get a more serious
     treatment than the consumables: the same drawing re-inked as an engraving
     (thin antique-gold line work over dark enamel, no highlights) and set in
     a framed medallion. */
  const GOLD = "#D9BC6A";
  function hexToRgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function enamel(hex, keep = 0.22) {
    // Keep a hint of the original hue, deepen it and pull it toward bronze.
    const [r, g, b] = hexToRgb(hex);
    const l = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
    const base = [42, 32, 20];
    const mix = (c, i) => Math.round(base[i] * 0.55 + c * keep + 70 * l * 0.6);
    return "#" + [r, g, b].map(mix).map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
  }
  function engrave(svg, keep = 0.22) {
    const en = (c) => enamel(c, keep);
    return svg
      .replace(/<ellipse[^>]*fill="#fff" opacity="\.45"[^>]*\/>/g, "")
      .replace(new RegExp(`stroke="${INK}"`, "g"), `stroke="${GOLD}"`)
      .replace(/stroke-width="2\.2"/g, 'stroke-width="1.3"')
      .replace(/stroke-width="1\.5"/g, 'stroke-width=".9"')
      .replace(/fill="(#[0-9a-fA-F]{3,6})"/g, (m, c) => `fill="${en(c)}"`)
      .replace(/fill="#fff"/g, `fill="${en("#cccccc")}"`)
      .replace(/(<text[^>]*?)fill="[^"]*"/g, `$1fill="${GOLD}"`)
      .replace(new RegExp(`fill="${INK}"`, "g"), `fill="${GOLD}"`)
      .replace(/stroke="(#[0-9a-fA-F]{6})" stroke-width="([\d.]+)"/g, (m, c, w) => c === GOLD ? m : `stroke="${en(c)}" stroke-width="${w}"`);
  }
  function relic(inner, cls = "") {
    return `<svg class="aart relic ${cls}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
      `<defs><radialGradient id="relicbg" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#2a3a2c"/><stop offset="1" stop-color="#0e1510"/></radialGradient></defs>` +
      `<rect x="1.5" y="1.5" width="61" height="61" rx="9" fill="url(#relicbg)" stroke="${GOLD}" stroke-width="1.4"/>` +
      `<rect x="4.5" y="4.5" width="55" height="55" rx="6.5" fill="none" stroke="${GOLD}" stroke-width=".6" opacity=".55"/>` +
      [[4.5, 4.5], [59.5, 4.5], [4.5, 59.5], [59.5, 59.5]].map(([x, y]) => `<path d="M${x} ${y - 2.6} L${x + 2.6} ${y} L${x} ${y + 2.6} L${x - 2.6} ${y}Z" fill="${GOLD}"/>`).join("") +
      `<g transform="translate(32 32) scale(.74) translate(-32 -32)">${engrave(inner)}</g></svg>`;
  }

  function wrap(inner, cls = "") {
    return `<svg class="aart ${cls}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="32" cy="60" rx="20" ry="3" fill="#000" opacity=".22"/>${inner}</svg>`;
  }

  // def: a charm, item or voucher definition (anything with id + type/color).
  function icon(def, cls) {
    if (!def) return "";
    if (def.type === "charm") return relic(CHARMS[def.id] || gem(32, 34, 20, def.color || "#9b5fc0"), cls);
    if (def.type === "item") return wrap(engrave(ITEMS[def.id] || gem(32, 34, 20, def.color || "#9b5fc0"), 0.34), "engraved " + (cls || ""));
    const bank = VOUCHERS;
    const inner = bank[def.id] || gem(32, 34, 20, def.color || "#9b5fc0");
    return wrap(engrave(inner, 0.45), "engraved " + (cls || ""));
  }

  /* ---------- sleeves: drawn plastic sleeves that sit over the card ----------
     Each is an SVG overlay on the card's own 62x87 canvas: a tinted, glossy
     sleeve slightly proud of the card, with its own printed pattern and a
     labelled top lip. */
  const SLEEVE_STYLE = {
    sparkler: { tint: "#FFB84D", label: "SPARKLER" },
    tithe: { tint: "#B8956A", label: "TITHE" },
    molt: { tint: "#5fbf86", label: "MOLT" },
    larva: { tint: "#cdb98e", label: "LARVA" },
    anchor: { tint: "#7d93a8", label: "ANCHOR" },
    mirror: { tint: "#d9e3ea", label: "MIRROR" },
  };
  let sleeveSeq = 0;
  function sleevePattern(type, id) {
    switch (type) {
      case "sparkler":
        return [[10, 20, 3], [50, 30, 2.4], [14, 62, 2.2], [48, 72, 3], [32, 46, 1.8], [42, 14, 1.8]].map(([x, y, s]) => sparkle(x, y, s * 1.4, "#FFD36B").replace(/stroke-width="1.5"/g, 'stroke-width=".5"')).join("");
      case "tithe":
        return `<path d="M5 14 V82 M57 14 V82" stroke="#6b4a2a" stroke-width=".9" stroke-dasharray="2.2 2" opacity=".7"/>` +
          `<g opacity=".9"><circle cx="31" cy="76" r="5" fill="#E8C04A" stroke="#6b4a2a" stroke-width=".9"/><text x="31" y="78.6" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="6.5" fill="#6b4a2a">$</text></g>`;
      case "molt":
        return `<pattern id="${id}" width="8" height="7" patternUnits="userSpaceOnUse"><path d="M0 3.5 Q4 -1 8 3.5 M-4 7 Q0 2.5 4 7 Q8 2.5 12 7" fill="none" stroke="#2f7a50" stroke-width=".7"/></pattern><rect x="2" y="12" width="58" height="72" rx="5" fill="url(#${id})" opacity=".3"/>`;
      case "larva":
        return [18, 30, 42, 54, 66].map((y, i) => `<path d="M1 ${y} Q20 ${y + (i % 2 ? 6 : -6)} 31 ${y} Q44 ${y + (i % 2 ? -6 : 6)} 61 ${y + 2}" fill="none" stroke="#a89060" stroke-width="1.1" opacity=".55"/>`).join("");
      case "anchor":
        return `<rect x="2.5" y="2.5" width="57" height="82" rx="6" fill="none" stroke="#c49a6c" stroke-width="1.6" stroke-dasharray="3 1.6" opacity=".9"/>` +
          `<g transform="translate(31 74) scale(.3) translate(-32 -32)" opacity=".9">${anchorShape(32, 32, 24, "#9fb3c6")}</g>`;
      case "mirror":
        return `<path d="M-4 40 L30 -4 H42 L0 52Z" fill="#fff" opacity=".55"/><path d="M14 92 L64 30 V44 L26 92Z" fill="#fff" opacity=".4"/>`;
      default:
        return "";
    }
  }
  function sleeve(type) {
    const st = SLEEVE_STYLE[type];
    if (!st) return "";
    const id = "slv" + ++sleeveSeq;
    return `<svg class="card-sleeve-art" viewBox="0 0 62 87" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
      `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${st.tint}" stop-opacity=".42"/><stop offset=".5" stop-color="${st.tint}" stop-opacity=".16"/><stop offset="1" stop-color="${st.tint}" stop-opacity=".38"/></linearGradient></defs>` +
      `<rect x="0.8" y="0.8" width="60.4" height="85.4" rx="7" fill="url(#${id}g)" stroke="${st.tint}" stroke-width="1.6"/>` +
      sleevePattern(type, id + "p") +
      `<path d="M15 0.8 H47 V6.5 Q47 9.5 44 9.5 H18 Q15 9.5 15 6.5Z" fill="${st.tint}" opacity=".95"/>` +
      `<text x="31" y="7" text-anchor="middle" font-family="Manrope,system-ui,sans-serif" font-weight="800" font-size="4.6" letter-spacing=".6" fill="${type === "mirror" ? "#3d4a55" : "#1a120a"}" opacity=".85">${st.label}</text>` +
      `<path d="M4 16 Q6 50 4 80" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".35"/>` +
      `</svg>`;
  }

  /* ---------- stamps: little wax seals pressed onto the card ---------- */
  const STAMP_GLYPH = {
    gold: { fill: "#F2C94C", glyph: txt(32, 41, 24, "$", "#7a5a10") },
    crimson: { fill: "#C0392B", glyph: txt(32, 40, 19, "×2", "#fbe3dc") },
    azure: { fill: "#4A90D9", glyph: `<path d="M32 24 Q24 18 20 26 Q18 34 32 43 Q46 34 44 26 Q40 18 32 24Z" fill="#fbe3dc" ${T}/>` },
  };
  function stamp(type) {
    const st = STAMP_GLYPH[type];
    if (!st) return "";
    return `<svg class="card-stamp-art" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${seal(32, 32, 26, st.fill, st.glyph)}${shine(24, 22, 3, 7, -40)}</svg>`;
  }

  window.AnteArt = { icon, sleeve, stamp, sleeveLabel: (t) => (SLEEVE_STYLE[t] ? SLEEVE_STYLE[t].label : "") };
})();
