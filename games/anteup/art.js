/* Ante Up artwork: hand-drawn SVG pictures for every charm, item and voucher,
   plus the plastic sleeves and wax stamps drawn on cards.

   Every picture is drawn on a 64x64 canvas with the same ink outline, so the
   whole set reads as one illustrated family. AnteArt.icon(def) picks the
   drawing by the def's type ("charm", "item", "pack" or "voucher") and id; anything
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
    spiralShell: `<path d="M32 56 Q8 54 8 32 Q8 10 32 10 Q52 10 52 30 Q52 46 36 46 Q22 46 22 32 Q22 22 32 22 Q40 22 40 30 Q40 36 34 36" fill="#E3B27A" ${O}/><path d="M32 56 Q8 54 8 32 Q8 10 32 10 Q52 10 52 30 Q52 46 36 46 Q22 46 22 32 Q22 22 32 22 Q40 22 40 30 Q40 36 34 36" ${N} ${T}/><path d="M32 56 Q44 56 52 46 L58 52 Q48 62 32 60Z" fill="#d49a5e" ${O}/>`,
    metronome: `<path d="M22 56 L28 8 H36 L42 56Z" fill="#8b5a2b" ${O}/><rect x="16" y="52" width="32" height="6" rx="1.5" fill="#6b4a2a" ${O}/><path d="M32 48 L44 14" ${N} stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M32 48 L44 14" ${N} stroke="#c9ccd0" stroke-width="1.6" stroke-linecap="round"/><rect x="38" y="24" width="8" height="5" rx="1" fill="#E8C04A" ${T} transform="rotate(20 42 26)"/>` + [36, 30, 24].map((y) => `<path d="M29 ${y} H35" ${N} ${T}/>`).join(""),
    oddity: die(26, 36, 26, 5, "#F5EEDC", INK, -12) + `<circle cx="48" cy="16" r="9" fill="#3FA9A0" ${O}/>` + txt(48, 20, 10, "?", "#fff"),
    lowTide: `<circle cx="44" cy="16" r="9" fill="#e8e1c4" ${O}/><circle cx="40" cy="14" r="8" fill="#2a3a2c"/>` + [36, 44, 52].map((y, i) => `<path d="M4 ${y} Q12 ${y - 5} 20 ${y} Q28 ${y + 5} 36 ${y} Q44 ${y - 5} 52 ${y} Q58 ${y + 3} 62 ${y}" ${N} stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><path d="M4 ${y} Q12 ${y - 5} 20 ${y} Q28 ${y + 5} 36 ${y} Q44 ${y - 5} 52 ${y} Q58 ${y + 3} 62 ${y}" ${N} stroke="${["#9fd8e8", "#6fb2d9", "#4a90d9"][i]}" stroke-width="2.4" stroke-linecap="round"/>`).join(""),
    encoreMask: `<path d="M8 14 Q24 8 36 14 Q38 36 22 46 Q8 38 8 14Z" fill="#F5EEDC" ${O}/><path d="M28 22 Q40 16 56 22 Q56 46 42 54 Q28 46 28 22Z" fill="#B05FA0" ${O}/><path d="M14 22 Q17 20 20 22 M25 22 Q28 20 31 22 M15 34 Q22 40 29 34" ${N} ${T}/><path d="M34 32 Q37 30 40 32 M45 32 Q48 30 51 32 M36 46 Q42 40 49 46" ${N} ${T}/>`,
    portrait: `<rect x="10" y="8" width="44" height="50" rx="2" fill="#C9A227" ${O}/><rect x="16" y="14" width="32" height="38" fill="#3d2b1c" ${T}/><circle cx="32" cy="28" r="7" fill="#f2d6b3" ${T}/><path d="M20 52 Q20 38 32 38 Q44 38 44 52Z" fill="#8b1e1e" ${T}/><path d="M25 22 L24 16 L28 19 L32 14 L36 19 L40 16 L39 22Z" fill="#E8C04A" ${T}/>`,
    smudgedInk: `<path d="M18 30 H46 L44 54 Q32 58 20 54Z" fill="#2f4a7a" ${O}/><rect x="22" y="22" width="20" height="9" rx="2" fill="#5c6670" ${O}/><path d="M40 22 L54 4" ${N} stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/><path d="M40 22 L54 4" ${N} stroke="#E8D6B0" stroke-width="1.8" stroke-linecap="round"/>` + `<path d="M6 46 Q4 40 10 40 Q14 36 16 42 Q20 44 16 48 Q12 54 8 50Z" fill="#2f4a7a" ${T}/>` + heart(27, 42, 4, "#D2453B") + spade(38, 42, 4, "#dfe6f0"),
    shortHand: `<path d="M20 58 V36 Q14 30 14 24 Q14 20 18 22 L22 28 V10 Q22 6 25 6 Q28 6 28 10 V24 V8 Q28 4 31.5 4 Q35 4 35 8 V24 V10 Q35 6 38.5 6 Q42 6 42 10 V26 V16 Q42 12 45.5 12 Q49 12 49 16 V40 Q49 50 42 58Z" fill="#c9a27a" ${O}/><path d="M22 28 Q24 32 28 32" ${N} ${T}/>` + txt(36, 48, 12, "4", "#6b4a2a"),
    tidepool: `<ellipse cx="32" cy="38" rx="27" ry="18" fill="#6c757d" ${O}/><ellipse cx="32" cy="38" rx="21" ry="13" fill="#3FA97A" ${T}/><path d="M16 36 Q24 32 32 36 Q40 40 48 36" ${N} stroke="#bfe8d5" stroke-width="1.6"/>` + star5(26, 40, 7, "#E8743B", 0.4) + `<circle cx="40" cy="44" r="3" fill="#F5EEDC" ${T}/><circle cx="44" cy="32" r="2" fill="#F5EEDC" ${T}/>`,
    heartstone: `<path d="M32 56 L8 28 L16 14 H48 L56 28Z" fill="#D2453B" ${O}/><path d="M8 28 H56 M16 14 L24 28 L32 56 L40 28 L48 14 M24 28 L32 14 L40 28" ${N} ${T} opacity=".55"/>` + shine(22, 22, 2, 5, 30),
    hallOfMirrors: [0, 1, 2].map((i) => `<rect x="${10 + i * 7}" y="${8 + i * 7}" width="${44 - i * 14}" height="${48 - i * 14}" rx="${20 - i * 6}" fill="${["#C9A227", "#a5793f", "#8b5a2b"][i]}" ${O}/><rect x="${13 + i * 7}" y="${11 + i * 7}" width="${38 - i * 14}" height="${42 - i * 14}" rx="${17 - i * 6}" fill="#cfe4ee" ${T}/>`).join("") + `<path d="M28 26 L34 20 M28 32 L38 22" ${N} stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
    gildedHand: `<path d="M10 44 Q8 30 16 28 L22 30 V14 Q22 10 26 10 Q30 10 30 14 V28 V10 Q30 6 34 6 Q38 6 38 10 V28 V14 Q38 10 42 10 Q46 10 46 14 V36 Q46 52 32 56 Q16 56 10 44Z" fill="#f2d6b3" ${O}/>` + coin(34, 40, 9),
    collector: `<path d="M6 14 Q19 10 32 15 V54 Q19 49 6 53Z" fill="#8b5a2b" ${O}/><path d="M58 14 Q45 10 32 15 V54 Q45 49 58 53Z" fill="#9a6a3a" ${O}/>` +
      [[11, 18], [20, 18], [11, 32], [20, 32]].map(([x, y]) => `<rect x="${x}" y="${y}" width="8" height="11" rx="1" fill="#F1E6C8" ${T}/>`).join("") +
      [[36, 18], [45, 18], [36, 32]].map(([x, y]) => `<rect x="${x}" y="${y}" width="8" height="11" rx="1" fill="#F1E6C8" ${T}/>`).join("") +
      `<rect x="45" y="32" width="8" height="11" rx="1" ${N} stroke="${INK}" stroke-width="1.2" stroke-dasharray="2 1.5"/>` + spade(40, 23, 2.4) + heart(15, 23, 2.2),
    keymaster: `<circle cx="32" cy="32" r="10" ${N} stroke="${INK}" stroke-width="5"/><circle cx="32" cy="32" r="10" ${N} stroke="#C9A227" stroke-width="2.6"/>` + [[-40, "#E8C04A"], [10, "#a9b2bb"], [60, "#b07c44"]].map(([r, c]) => `<g transform="rotate(${r} 32 32)"><circle cx="32" cy="14" r="5" fill="${c}" ${O}/><path d="M32 19 V24" ${N} ${O}/></g><g transform="rotate(${r + 180} 32 32)"><path d="M32 42 V58 M32 52 H37 M32 56 H36" ${N} stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M32 42 V58 M32 52 H37 M32 56 H36" ${N} stroke="${c}" stroke-width="2.2" stroke-linecap="round"/></g>`).join(""),
    // ----- newer artifacts -----
    carbonCopy: `<rect x="18" y="10" width="30" height="40" rx="3" fill="#bcd3f0" ${O}/><rect x="12" y="16" width="30" height="40" rx="3" fill="#4A90D9" ${O}/><path d="M18 26 H36 M18 32 H36 M18 38 H30" ${N} stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/><path d="M44 30 L54 30 M50 26 L54 30 L50 34" ${N} ${O}/>`,
    echoChamber: `<circle cx="32" cy="32" r="8" fill="#E35D5B" ${O}/>` + [14, 20, 26].map((r, i) => `<circle cx="32" cy="32" r="${r}" ${N} stroke="#E35D5B" stroke-width="${3 - i * 0.7}" opacity="${0.8 - i * 0.22}"/>`).join("") + `<path d="M10 32 H2 M6 28 L2 32 L6 36" ${N} ${T}/>`,
    understudy: `<path d="M8 18 Q20 10 30 18 V34 Q30 46 19 48 Q8 46 8 34Z" fill="#f5eedc" ${O}/><path d="M34 18 Q44 10 56 18 V34 Q56 46 45 48 Q34 46 34 34Z" fill="#2b3a33" ${O}/><circle cx="15" cy="27" r="2" fill="${INK}"/><circle cx="23" cy="27" r="2" fill="${INK}"/><path d="M14 37 Q19 41 24 37" ${N} ${T}/><circle cx="41" cy="27" r="2" fill="#f5eedc"/><circle cx="49" cy="27" r="2" fill="#f5eedc"/><path d="M40 40 Q45 36 50 40" ${N} stroke="#f5eedc" stroke-width="1.5"/>`,
    wildPlum: `<path d="M32 16 Q36 8 44 8" ${N} ${O}/><path d="M36 12 Q46 4 52 12 Q44 16 36 12Z" fill="#7FD08A" ${O}/><circle cx="32" cy="36" r="18" fill="#7A55B0" ${O}/><path d="M32 20 Q28 36 32 54" ${N} stroke="#4a2f78" stroke-width="1.6"/>` + shine(24, 30, 3, 6, 20),
    ripePlum: `<path d="M32 14 Q36 6 44 6" ${N} ${O}/><path d="M36 10 Q46 2 52 10 Q44 14 36 10Z" fill="#7FD08A" ${O}/><circle cx="32" cy="35" r="20" fill="#9b5fc0" ${O}/><path d="M32 16 Q28 35 32 55" ${N} stroke="#5d3590" stroke-width="1.6"/>` + shine(23, 28, 3.4, 7, 20) + sparkle(52, 48, 5),
    chalkboard: `<rect x="6" y="12" width="52" height="36" rx="2" fill="#2b3a33" stroke="#8a5a2b" stroke-width="4"/><rect x="6" y="12" width="52" height="36" rx="2" ${N} ${O}/><text x="32" y="36" text-anchor="middle" font-family="Georgia,serif" font-size="16" fill="#e8eee8">♠♣</text><rect x="20" y="48" width="10" height="3" fill="#f5eedc" ${T}/>`,
    leech: `<path d="M12 40 Q10 24 24 22 Q34 20 40 28 Q46 34 54 30 Q56 40 46 44 Q36 48 28 44 Q16 50 12 40Z" fill="#A8352D" ${O}/><path d="M20 30 Q28 34 36 32 M18 38 Q28 40 40 38" ${N} stroke="#6e1d18" stroke-width="1.4"/><circle cx="50" cy="35" r="2.5" fill="${INK}"/>`,
    bonfire: `<path d="M10 54 L54 44 M10 44 L54 54" ${N} stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M10 54 L54 44 M10 44 L54 54" ${N} stroke="#8a5a2b" stroke-width="4.5" stroke-linecap="round"/>` + flame(32, 30, 18) + sparkle(48, 14, 3, "#FFE07A") + sparkle(16, 18, 2.5, "#FFE07A"),
    commuter: `<rect x="8" y="16" width="48" height="30" rx="6" fill="#E8C04A" ${O}/><rect x="13" y="21" width="10" height="9" rx="1.5" fill="#cfe9f5" ${T}/><rect x="27" y="21" width="10" height="9" rx="1.5" fill="#cfe9f5" ${T}/><rect x="41" y="21" width="10" height="9" rx="1.5" fill="#cfe9f5" ${T}/><path d="M8 36 H56" ${N} ${T}/><circle cx="18" cy="47" r="5" fill="#2b3a33" ${O}/><circle cx="46" cy="47" r="5" fill="#2b3a33" ${O}/>`,
    stargazer: `<path d="M12 54 L22 30 L32 54" ${N} ${O}/><g transform="rotate(-30 30 26)"><rect x="18" y="20" width="30" height="10" rx="2" fill="#4a6fb3" ${O}/><rect x="46" y="18" width="5" height="14" rx="1.5" fill="#C9A227" ${O}/></g>` + star5(50, 10, 4) + sparkle(40, 6, 2.5, "#fff") + sparkle(58, 22, 2.5, "#fff"),
    downpour: `<path d="M14 26 Q8 26 8 20 Q8 13 16 14 Q18 6 28 8 Q34 2 42 8 Q52 6 54 14 Q60 16 58 22 Q57 26 52 26Z" fill="#9fb3c6" ${O}/>` + [[16, 34], [26, 40], [36, 34], [46, 40], [22, 50], [42, 52]].map(([x, y]) => `<path d="M${x} ${y - 4} Q${x + 3} ${y} ${x} ${y + 3} Q${x - 3} ${y} ${x} ${y - 4}Z" fill="#4FA3C7" ${T}/>`).join(""),
    maskMaker: `<path d="M8 22 Q32 10 56 22 Q56 44 32 52 Q8 44 8 22Z" fill="#C9A227" ${O}/><path d="M16 28 Q22 24 28 29 Q22 33 16 28Z M36 29 Q42 24 48 28 Q42 33 36 29Z" fill="${INK}"/><path d="M24 42 Q32 46 40 42" ${N} ${O}/><path d="M8 22 L2 16 M56 22 L62 16" ${N} ${T}/>`,
    gapJump: `<rect x="4" y="40" width="16" height="14" fill="#8a96a3" ${O}/><rect x="44" y="40" width="16" height="14" fill="#8a96a3" ${O}/><path d="M12 38 Q32 4 52 36" ${N} stroke="${INK}" stroke-width="5" stroke-dasharray="4 4" stroke-linecap="round"/><path d="M12 38 Q32 4 52 36" ${N} stroke="#7FD08A" stroke-width="2.6" stroke-dasharray="4 4" stroke-linecap="round"/><path d="M46 30 L53 38 L56 28Z" fill="#7FD08A" ${O}/>`,
    fizz: `<path d="M22 14 H42 L40 56 H24Z" fill="#dff6fa" ${O}/><path d="M23 26 H41 L40 54 H24Z" fill="#7fd0e0"/><path d="M28 10 L36 4" ${N} stroke="#D2453B" stroke-width="3" stroke-linecap="round"/>` + [[28, 46, 2], [35, 38, 1.6], [30, 32, 1.3], [36, 48, 1.4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".9"/>`).join(""),
    sundae: `<path d="M14 34 H50 L44 46 H20Z" fill="#dfeef0" ${O}/><path d="M26 46 H38 L36 56 H28Z" fill="#dfeef0" ${O}/><circle cx="24" cy="28" r="9" fill="#F2A7BD" ${O}/><circle cx="40" cy="28" r="9" fill="#f5eedc" ${O}/><circle cx="32" cy="20" r="9" fill="#8a5a2b" ${O}/><circle cx="32" cy="9" r="3.5" fill="#D2453B" ${O}/>`,
    popcornBucket: [[20, 16], [30, 12], [40, 15], [25, 22], [36, 21], [46, 22], [16, 24]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#fff6dc" ${T}/>`).join("") + `<path d="M12 26 H52 L46 58 H18Z" fill="#fff" ${O}/>` + [18, 28, 38].map((x) => `<path d="M${x} 26 H${x + 6} L${x + 4.5} 58 H${x + 1.5}Z" fill="#E35D5B"/>`).join("") + `<path d="M12 26 H52 L46 58 H18Z" ${N} ${O}/>`,
    bullion: `<path d="M8 46 L14 34 H34 L40 46Z" fill="#E8C04A" ${O}/><path d="M24 34 L30 22 H50 L56 34Z" fill="#F2C94C" ${O}/><path d="M14 34 L18 26 M34 34 L30 22" ${N} ${T} opacity=".4"/>` + shine(30, 40, 2, 6, 70) + `<path d="M4 46 H60 V52 H4Z" fill="#8a5a2b" ${O}/>`,
    trailMark: `<path d="M10 56 Q20 40 30 44 Q42 48 50 30" ${N} stroke="#b07c44" stroke-width="3" stroke-dasharray="4 3" stroke-linecap="round"/><path d="M40 8 V30" ${N} ${O}/><path d="M40 8 H56 L52 13 L56 18 H40Z" fill="#D2453B" ${O}/>` + playingCard(8, 22, 14, 20, -12, txt(15, 36, 8, "+5", "#3866B8")),
    dejaVu: playingCard(10, 14, 22, 32, -10, txt(21, 34, 12, "?")) + playingCard(28, 18, 22, 32, 10, txt(39, 38, 12, "?")) + `<path d="M8 54 A26 26 0 0 0 56 50" ${N} stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M8 54 A26 26 0 0 0 56 50" ${N} stroke="#8e7cc3" stroke-width="2.2" stroke-linecap="round"/>`,
    emptyFrame: `<rect x="10" y="8" width="44" height="48" rx="2" fill="#d8c290" ${O}/><rect x="18" y="16" width="28" height="32" fill="#2b3a33" opacity=".85" ${T}/><path d="M18 16 L46 48 M46 16 L18 48" ${N} stroke="#d8c290" stroke-width="1" stroke-dasharray="2 3" opacity=".6"/>` + [[10, 8], [54, 8], [10, 56], [54, 56]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#C9A227" ${T}/>`).join(""),
    punchCard: `<rect x="8" y="14" width="48" height="36" rx="4" fill="#f5eedc" ${O}/><path d="M8 22 H56" ${N} stroke="#D2453B" stroke-width="3"/>` + [0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${16 + (i % 3) * 16}" cy="${32 + Math.floor(i / 3) * 10}" r="4" fill="${i < 5 ? INK : "#fff"}" ${T}/>`).join(""),
    clenchedFist: `<path d="M18 52 V30 Q18 22 26 22 H44 Q50 22 50 28 V44 Q50 52 42 52Z" fill="#E8A65F" ${O}/><path d="M26 22 V32 M34 22 V32 M42 22 V32 M18 34 Q26 30 30 38" ${N} ${T}/><path d="M18 52 H42 V58 H18Z" fill="#b07c44" ${O}/>`,
    cosmonaut: `<circle cx="32" cy="28" r="16" fill="#e6eef2" ${O}/><path d="M20 26 Q32 18 44 26 V32 Q32 38 20 32Z" fill="#3866B8" ${O}/>` + shine(26, 26, 2, 3, 20) + `<path d="M18 42 Q32 50 46 42 L50 58 H14Z" fill="#e6eef2" ${O}/><path d="M28 50 H36" ${N} stroke="#D2453B" stroke-width="3"/>` + star5(52, 10, 4),
    nestEgg: `<path d="M8 40 Q32 60 56 40 Q52 52 32 54 Q12 52 8 40Z" fill="#8a5a2b" ${O}/><path d="M10 42 L20 38 M54 42 L44 37 M16 48 L26 44 M48 48 L38 45" ${N} ${T}/><ellipse cx="32" cy="32" rx="12" ry="15" fill="#F5EEDC" ${O}/>` + shine(27, 26, 2.4, 5, 20) + coin(46, 18, 7),
    jackknife: `<g transform="rotate(-35 32 32)"><rect x="10" y="30" width="30" height="10" rx="5" fill="#8a5a2b" ${O}/><path d="M38 31 H60 L54 39 H38Z" fill="#c9ccd0" ${O}/></g>` + playingCard(34, 34, 16, 22, 12, txt(42, 50, 11, "J")),
    twilight: `<rect x="4" y="38" width="56" height="18" fill="#3949AB" ${O}/><path d="M12 38 A20 20 0 0 1 52 38Z" fill="#F29A2E" ${O}/><path d="M4 44 H60 M10 50 H54" ${N} stroke="#7a86d9" stroke-width="1.4"/>` + star5(14, 12, 3.4, "#e8eeff") + star5(48, 8, 2.6, "#e8eeff"),
    catBurglar: `<path d="M14 54 Q12 30 32 28 Q52 30 50 54Z" fill="#2b3a33" ${O}/><path d="M18 30 L14 14 L26 24Z M46 30 L50 14 L38 24Z" fill="#2b3a33" ${O}/><rect x="16" y="32" width="32" height="8" rx="4" fill="${INK}"/><circle cx="24" cy="36" r="2.2" fill="#FFE07A"/><circle cx="40" cy="36" r="2.2" fill="#FFE07A"/>` + bag(50, 48, 9, "#b07c44", "$"),
    littleDeuce: playingCard(18, 12, 28, 40, -6, txt(32, 40, 22, "2", "#D2453B")) + plus(50, 14, 6),
  };

  // ---------- legendary artifacts ----------
  const LEGENDS = {
    phoenix: flame(32, 40, 18) + `<path d="M20 52 Q24 26 44 8 Q40 30 26 54Z" fill="#E8743B" ${O}/><path d="M24 50 Q30 32 42 14 M28 40 L22 36 M31 33 L25 28 M34 26 L29 21 M30 40 L37 38 M33 33 L40 30" ${N} ${T}/>`,
    hydra: heart(32, 38, 12, "#3FA97A") + [[-1, 14, 16], [0, 32, 8], [1, 50, 16]].map(([d, x, y]) => `<path d="M32 30 Q${32 + d * 10} ${y + 8} ${x} ${y}" ${N} stroke="${INK}" stroke-width="6.2" stroke-linecap="round"/><path d="M32 30 Q${32 + d * 10} ${y + 8} ${x} ${y}" ${N} stroke="#3FA97A" stroke-width="4" stroke-linecap="round"/><ellipse cx="${x}" cy="${y}" rx="4.4" ry="3.4" fill="#3FA97A" ${O}/>`).join(""),
    midnightSun: sun(32, 32, 14, "#F6C445") + `<circle cx="38" cy="28" r="12" fill="#26304f" ${O}/>` + sparkle(14, 50, 4, "#fff") + sparkle(52, 50, 3, "#fff"),
    eternalEngine: [[24, 36, 13, 0], [42, 24, 9, 20]].map(([x, y, r, rot]) => Array.from({ length: 8 }, (_, i) => `<rect x="${x - 3}" y="${y - r - 5}" width="6" height="7" rx="1" fill="#a9b2bb" ${T} transform="rotate(${i * 45 + rot} ${x} ${y})"/>`).join("") + `<circle cx="${x}" cy="${y}" r="${r}" fill="#a9b2bb" ${O}/><circle cx="${x}" cy="${y}" r="${r * 0.4}" fill="#5c6670" ${T}/>`).join("") + `<path d="M40 44 A10 10 0 1 0 50 34" ${N} stroke="${INK}" stroke-width="3"/><path d="M50 30 L50 37 L44 34Z" fill="${INK}"/>`,
    ossuarySaint: `<ellipse cx="32" cy="12" rx="16" ry="5" ${N} stroke="${INK}" stroke-width="5"/><ellipse cx="32" cy="12" rx="16" ry="5" ${N} stroke="#F6D35B" stroke-width="2.6"/><path d="M16 34 Q16 18 32 18 Q48 18 48 34 Q48 40 43 44 V52 H21 V44 Q16 40 16 34Z" fill="#ece8de" ${O}/><path d="M26 52 V58 M32 52 V58 M38 52 V58 M21 52 H43" ${N} ${T}/><ellipse cx="25" cy="34" rx="4.4" ry="5" fill="${INK}"/><ellipse cx="39" cy="34" rx="4.4" ry="5" fill="${INK}"/><path d="M32 39 L29.5 44 H34.5Z" fill="${INK}"/>`,
    twinThrones: [14, 40].map((x, i) => `<path d="M${x - 8} 58 V30 H${x + 8} V58" fill="${i ? "#8b1e1e" : "#5a1414"}" ${O}/><path d="M${x - 9} 30 V10 L${x - 5} 14 L${x} 6 L${x + 5} 14 L${x + 9} 10 V30Z" fill="#E8C04A" ${O}/><rect x="${x - 10}" y="38" width="20" height="5" rx="1.5" fill="#C9A227" ${T}/>`).join("") + txt(14, 26, 9, "K", "#5a1414") + txt(40, 26, 9, "Q", "#5a1414"),
    tallyLantern: `<path d="M24 6 Q32 0 40 6" ${N} ${O}/><rect x="22" y="8" width="20" height="6" rx="2" fill="#6b4a2a" ${O}/><path d="M20 14 H44 L46 50 H18Z" fill="#E8C04A" fill-opacity=".85" ${O}/><rect x="18" y="50" width="28" height="7" rx="2" fill="#6b4a2a" ${O}/>` + flame(32, 32, 7) + `<path d="M8 22 V38 M12 22 V38 M16 22 V38 M4 34 L20 26" ${N} ${O}/><path d="M50 22 V38 M54 22 V38 M58 22 V38" ${N} ${O}/>`,
    ironCrown: `<path d="M10 48 L8 18 L20 30 L32 10 L44 30 L56 18 L54 48Z" fill="#6c757d" ${O}/><rect x="8" y="46" width="48" height="10" rx="2" fill="#4a5058" ${O}/>` + [16, 26, 38, 48].map((x) => `<circle cx="${x}" cy="51" r="2" fill="#2a2e33"/>`).join("") + `<path d="M22 36 L42 22 M22 22 L42 36" ${N} stroke="#D2453B" stroke-width="3" stroke-linecap="round" opacity=".9"/>`,
    echoVault: `<rect x="12" y="12" width="40" height="40" rx="4" fill="#6c757d" ${O}/><circle cx="32" cy="32" r="12" fill="#a9b2bb" ${O}/><circle cx="32" cy="32" r="4" fill="#7E57C2" ${T}/>` + [16, 21, 26].map((r, i) => `<circle cx="32" cy="32" r="${r + 10}" ${N} stroke="#c79be0" stroke-width="1.6" opacity="${0.75 - i * 0.22}"/>`).join(""),
    grandLedger: book("#5a1f1f", `<path d="M24 20 H44 M24 25 H44 M24 30 H40" ${N} stroke="#E8C04A" stroke-width="1.6"/>`) + coin(44, 50, 7) + coin(52, 44, 6),
  };

  // ---------- booster packs: a crimped foil packet with its emblem ----------
  const packet = (fill, emblem) =>
    `<path d="M14 10 L16 6 L18 10 L20 6 L22 10 L24 6 L26 10 L28 6 L30 10 L32 6 L34 10 L36 6 L38 10 L40 6 L42 10 L44 6 L46 10 L48 6 L50 10 V54 L48 58 L46 54 L44 58 L42 54 L40 58 L38 54 L36 58 L34 54 L32 58 L30 54 L28 58 L26 54 L24 58 L22 54 L20 58 L18 54 L16 58 L14 54Z" fill="${fill}" ${O}/>` +
    `<path d="M14 15 H50 M14 49 H50" ${N} ${T} opacity=".6"/><path d="M18 16 L24 48" ${N} stroke="#fff" stroke-width="2" opacity=".35" stroke-linecap="round"/>` +
    `<circle cx="32" cy="32" r="12" fill="#F5EEDC" ${T}/>` + emblem;
  const PACKS = {
    artifactPack: packet("#C9A227", gem(32, 32, 8, "#9b5fc0")),
    itemPack: packet("#5f9a7a", `<path d="M29 24 H35 V27 Q40 30 40 35 Q40 41 32 41 Q24 41 24 35 Q24 30 29 27Z" fill="#7fb6e0" ${T}/>`),
    cardPack: packet("#8a3a32", spade(32, 31, 7)),
    ornatePack: packet("#6e3a68", seal(32, 32, 8, "#C0392B", "")),
    celestialPack: packet("#2f4a8a", `<circle cx="32" cy="32" r="8" fill="#22305a" ${T}/>` + sparkle(32, 32, 5, "#fff")),
    legendPack: packet("#E8743B", star5(32, 32, 9, "#F6D35B")),
    spectralPack: packet("#3b3f8f", `<path d="M25 40 V31 Q25 23 32 23 Q39 23 39 31 V40 L36.5 37.5 L34 40 L32 37.5 L30 40 L27.5 37.5Z" fill="#e8eeff" ${T}/><circle cx="29.5" cy="30.5" r="1.4" fill="${INK}"/><circle cx="34.5" cy="30.5" r="1.4" fill="${INK}"/>`),
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
    heartsBanner: banner("#8a3a32") + star5(32, 25, 7, "#F6D35B"),
    twinMolds: `<rect x="6" y="18" width="24" height="34" rx="3" fill="#8a96a3" ${O}/><rect x="34" y="18" width="24" height="34" rx="3" fill="#8a96a3" ${O}/><rect x="11" y="23" width="14" height="24" rx="2" fill="#5c6670" ${T}/><rect x="39" y="23" width="14" height="24" rx="2" fill="#E8C04A" ${T}/>` + heart(18, 35, 4, "#E8C04A") + heart(46, 35, 4, "#C9A227"),
    // Star Charts: a round sky chart with that hand's constellation.
    ...Object.fromEntries(Array.from({ length: 13 }, (_, n) => {
      let seed = 7 + n * 31;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      const pts = Array.from({ length: 4 + (n % 4) }, () => [16 + rnd() * 32, 16 + rnd() * 32]);
      return [`chart${n}`, `<circle cx="32" cy="32" r="25" fill="#22305a" ${O}/><circle cx="32" cy="32" r="21" ${N} stroke="#E8C04A" stroke-width="1" opacity=".7"/>` +
        [0, 45, 90, 135].map((r) => `<path d="M32 7 V11 M32 53 V57" stroke="#E8C04A" stroke-width="1.2" transform="rotate(${r} 32 32)"/>`).join("") +
        `<path d="${pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")}" ${N} stroke="#cfe0ff" stroke-width="1" opacity=".8"/>` +
        pts.map(([x, y], k) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${k === 0 ? 2.4 : 1.6}" fill="#fff"/>`).join("")];
    })),
    bountyContract: scroll("#EAD9B0", false) + txt(34, 32, 8, "WANTED", INK) + `<path d="M24 38 L42 38" ${N} ${T}/>` + seal(44, 44, 6, "#C0392B", ""),
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
  // Legendary artifacts get an ember frame and keep more of their colour.
  function relic(inner, cls = "", legendary = false, sleeve = null) {
    const edge = legendary ? "#F2A65A" : GOLD;
    const bg = legendary ? ["#3a2418", "#140b07", "legbg"] : ["#2a3a2c", "#0e1510", "relicbg"];
    const rid = "rl" + ++cardSeq;
    const body = `<defs><radialGradient id="${bg[2]}" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient></defs>` +
      (legendary ? `<rect x="0.5" y="0.5" width="63" height="63" rx="10" fill="none" stroke="#F2A65A" stroke-width="1" opacity=".5"/>` : "") +
      `<rect x="1.5" y="1.5" width="61" height="61" rx="9" fill="url(#${bg[2]})" stroke="${edge}" stroke-width="${legendary ? 1.8 : 1.4}"/>` +
      `<rect x="4.5" y="4.5" width="55" height="55" rx="6.5" fill="none" stroke="${edge}" stroke-width=".6" opacity=".55"/>` +
      [[4.5, 4.5], [59.5, 4.5], [4.5, 59.5], [59.5, 59.5]].map(([x, y]) => `<path d="M${x} ${y - 2.6} L${x + 2.6} ${y} L${x} ${y + 2.6} L${x - 2.6} ${y}Z" fill="${edge}"/>`).join("") +
      (legendary ? `<path d="M32 1.5 L35 5 L32 8.5 L29 5Z M32 62.5 L35 59 L32 55.5 L29 59Z" fill="${edge}"/>` : "") +
      `<g transform="translate(32 32) scale(.74) translate(-32 -32)">${engrave(inner, legendary ? 0.45 : 0.22)}</g>`;
    return `<svg class="aart relic ${legendary ? "legendary " : ""}${cls}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
      (sleeve === "negative" ? negativeOf(body, rid) : body) +
      (sleeve ? charmSleeveWrap(sleeve, rid + "s", 64, 64) : "") + `</svg>`;
  }

  // ---------- vouchers: every one is the same coupon card ----------
  // A paper coupon with a coloured sunburst window, the voucher's own emblem
  // in it, and a perforated stub. Upgrades (tier 2) are printed on gold foil.
  // Emblems are drawn on the usual 64x64 canvas.
  const awning = (y, a, b) => [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${10 + i * 7.33}" y="${y}" width="7.4" height="10" fill="${i % 2 ? b : a}"/>`).join("") +
    `<rect x="10" y="${y}" width="44" height="10" ${N} ${O}/>` + [0, 1, 2, 3, 4, 5].map((i) => `<path d="M${10 + i * 7.33} ${y + 10} a3.66 3.66 0 0 0 7.33 0Z" fill="${i % 2 ? b : a}" ${T}/>`).join("");
  const tag = (fill, label) => `<path d="M10 22 H34 L52 36 L34 50 H10Z" transform="rotate(-18 32 36)" fill="${fill}" ${O}/><circle cx="16" cy="30" r="2.6" fill="#f6e1b6" ${T} transform="rotate(-18 32 36)"/>` + `<g transform="rotate(-18 32 36)">${txt(30, 40, 11, label, "#fff")}</g>`;
  const chip = (x, y, fill) => `<ellipse cx="${x}" cy="${y + 3}" rx="11" ry="4.5" fill="${fill}" ${O}/><rect x="${x - 11}" y="${y - 1}" width="22" height="4" fill="${fill}"/><ellipse cx="${x}" cy="${y}" rx="11" ry="4.5" fill="${fill}" ${O}/><ellipse cx="${x}" cy="${y}" rx="6" ry="2.3" ${N} stroke="#fff" stroke-width="1.4" stroke-dasharray="2 2"/>`;
  const VOUCHER_ART = {
    overstock: awning(12, "#E35D5B", "#F5EEDC") + `<path d="M14 26 V50 M50 26 V50" ${N} ${O}/><rect x="10" y="40" width="44" height="12" rx="2" fill="#b07c44" ${O}/>` + gem(22, 34, 5, "#3FA9A0") + coin(32, 34, 5) + gem(42, 34, 5, "#9b5fc0") + plus(52, 12, 5),
    warehouse: `<path d="M8 28 L32 12 L56 28 V54 H8Z" fill="#C0623A" ${O}/><path d="M8 28 L32 12 L56 28" ${N} stroke="#8a3f22" stroke-width="3"/><rect x="20" y="32" width="24" height="22" fill="#e9c58a" ${O}/><path d="M20 32 L44 54 M44 32 L20 54" ${N} ${O}/><circle cx="32" cy="23" r="3.5" fill="#fff6dc" ${T}/>` + plus(54, 12, 5),
    clearanceSale: tag("#E35D5B", "25%"),
    fireSale: flame(46, 16, 10) + tag("#E8743B", "50%") + flame(14, 52, 7),
    haggler: die(24, 38, 22, 5, "#F5EEDC", INK, -12) + coin(44, 22, 11, "#E8C04A", "−2"),
    silverTongue: `<path d="M10 14 H54 Q58 14 58 18 V38 Q58 42 54 42 H30 L18 52 L21 42 H10 Q6 42 6 38 V18 Q6 14 10 14Z" fill="#e6eef2" ${O}/>` + coin(32, 28, 9, "#cfd8dc", "−2") + sparkle(52, 10, 5, "#fff"),
    doubleDown: playingCard(14, 18, 20, 28, -12, heart(24, 32, 4)) + playingCard(30, 16, 20, 28, 8, spade(40, 30, 4)) + plus(50, 46, 6),
    allIn: chip(22, 46, "#3866B8") + chip(22, 39, "#D2453B") + chip(22, 32, "#E8C04A") + chip(42, 46, "#3FA9A0") + chip(42, 39, "#3866B8") + `<path d="M8 22 Q32 6 56 22" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M8 22 Q32 6 56 22" ${N} stroke="#F5EEDC" stroke-width="2.6" stroke-linecap="round"/><path d="M50 15 L57 23 L47 25" fill="#F5EEDC" ${O}/>`,
    bankruptcy: playingCard(18, 10, 16, 22, -18) + playingCard(30, 8, 16, 22, 14) + `<path d="M14 26 H50 L46 56 H18Z" fill="#8a96a3" ${O}/><path d="M11 22 H53 V27 H11Z" fill="#a9b4be" ${O}/><path d="M24 32 L25 50 M32 32 V50 M40 32 L39 50" ${N} ${T} opacity=".6"/>`,
    scrapHeap: playingCard(10, 30, 16, 22, -32) + playingCard(36, 30, 16, 22, 28) + playingCard(24, 32, 16, 22, -4) + `<path d="M18 18 A16 16 0 0 1 46 18" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M18 18 A16 16 0 0 1 46 18" ${N} stroke="#7FD08A" stroke-width="2.6" stroke-linecap="round"/><path d="M42 10 L50 19 L39 21Z" fill="#7FD08A" ${O}/>`,
    largerAbdomen: playingCard(10, 20, 16, 24, -16) + playingCard(24, 16, 16, 24, 0) + playingCard(38, 20, 16, 24, 16) + plus(32, 50, 6),
    deepPockets: playingCard(18, 6, 16, 24, -10, diamond(26, 18, 4)) + playingCard(30, 6, 16, 24, 10, club(38, 18, 4)) + `<path d="M10 22 H54 V40 Q54 56 32 58 Q10 56 10 40Z" fill="#4a6fb3" ${O}/><path d="M10 22 H54" ${N} stroke="#E8C04A" stroke-width="2.4"/><path d="M14 27 V40 Q14 52 32 54 Q50 52 50 40 V27" ${N} stroke="#E8C04A" stroke-width="1.4" stroke-dasharray="3 2.4"/>`,
    moreOre: `<path d="M12 54 L18 34 L32 26 L48 32 L54 54Z" fill="#6c757d" ${O}/>` + gem(26, 42, 5, "#E8C04A") + gem(40, 46, 4, "#3FA9A0") + `<g transform="rotate(-35 40 20)"><rect x="38" y="8" width="4" height="26" rx="1.5" fill="#b07c44" ${O}/><path d="M26 12 Q40 2 54 12 L50 13 Q40 7 30 13Z" fill="#a9b4be" ${O}/></g>`,
    motherLode: gem(20, 38, 10, "#3FA9A0") + gem(44, 38, 10, "#9b5fc0") + gem(32, 26, 13, "#E8C04A") + sparkle(52, 14, 5) + sparkle(12, 18, 4),
    displayCase: `<rect x="16" y="46" width="32" height="10" rx="2" fill="#7a5836" ${O}/><rect x="18" y="12" width="28" height="34" fill="#dfeef0" opacity=".55" ${O}/>` + gem(32, 30, 8, "#9b5fc0") + `<path d="M22 16 L28 22 M38 14 L44 20" ${N} stroke="#fff" stroke-width="2" stroke-linecap="round"/>` + plus(50, 14, 5),
    grandGallery: `<path d="M8 22 L32 8 L56 22Z" fill="#e9dcc0" ${O}/><rect x="8" y="22" width="48" height="5" fill="#d8c290" ${O}/>` + [14, 26, 38, 50].map((x) => `<rect x="${x - 3}" y="27" width="6" height="22" fill="#f1e6c8" ${T}/>`).join("") + `<rect x="6" y="49" width="52" height="6" fill="#d8c290" ${O}/>` + gem(32, 16, 3.5, "#9b5fc0"),
    liquidAssets: `<path d="M32 8 Q46 26 46 38 Q46 52 32 52 Q18 52 18 38 Q18 26 32 8Z" fill="#4A90D9" ${O}/>` + txt(32, 45, 17, "$", "#fff") + shine(25, 32, 2.4, 6, 20),
    trustFund: `<path d="M8 22 L32 8 L56 22Z" fill="#E8C04A" ${O}/><rect x="8" y="22" width="48" height="5" fill="#d9b03c" ${O}/>` + [15, 25, 39, 49].map((x) => `<rect x="${x - 3}" y="27" width="6" height="20" fill="#f1e6c8" ${T}/>`).join("") + `<rect x="6" y="47" width="52" height="7" fill="#d8c290" ${O}/>` + coin(32, 37, 7),
    piggyBank: `<ellipse cx="32" cy="36" rx="20" ry="15" fill="#F2A7BD" ${O}/><path d="M16 26 L14 16 L24 22Z" fill="#F2A7BD" ${O}/><ellipse cx="51" cy="37" rx="5" ry="6" fill="#e88ba6" ${O}/><circle cx="50" cy="36" r="1" fill="${INK}"/><circle cx="52" cy="38" r="1" fill="${INK}"/><circle cx="42" cy="30" r="1.8" fill="${INK}"/><path d="M20 49 V55 M42 49 V55" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><rect x="26" y="20" width="12" height="3" rx="1.5" fill="${INK}"/>` + coin(32, 11, 6),
    goldenGoose: `<ellipse cx="32" cy="36" rx="15" ry="19" fill="#F2C94C" ${O}/>` + shine(26, 28, 3, 8, 20) + `<path d="M22 50 Q32 56 42 50" ${N} stroke="#c99a1e" stroke-width="2"/>` + sparkle(52, 16, 6) + sparkle(12, 24, 4) + sparkle(50, 50, 4),
    compoundInterest: coin(20, 44, 8) + coin(32, 36, 8) + coin(44, 28, 8) + arrowUp(48, 14, 7),
    windfall: `<path d="M14 24 Q8 24 8 18 Q8 11 16 12 Q18 4 28 6 Q34 0 42 6 Q52 4 54 12 Q60 14 58 20 Q57 24 52 24Z" fill="#e6eef2" ${O}/>` + coin(18, 36, 6) + coin(34, 44, 7) + coin(48, 34, 6) + coin(24, 54, 5),
    cardSharp: playingCard(12, 14, 20, 30, -12, spade(22, 29, 5)) + `<path d="M30 50 L52 16" ${N} stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M30 50 L52 16" ${N} stroke="#c9ccd0" stroke-width="2.6" stroke-linecap="round"/><path d="M27 54 L34 44" ${N} stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M27 54 L34 44" ${N} stroke="#8a5a2b" stroke-width="3.4" stroke-linecap="round"/>`,
    pawnKing: `<path d="M14 30 L18 12 L26 22 L32 8 L38 22 L46 12 L50 30Z" fill="#E8C04A" ${O}/><circle cx="32" cy="8" r="2.6" fill="#D2453B" ${T}/>` + coin(32, 44, 12),
    clairvoyance: `<path d="M8 32 Q32 8 56 32 Q32 56 8 32Z" fill="#fff" ${O}/><circle cx="32" cy="32" r="10" fill="#7E57C2" ${O}/><circle cx="32" cy="32" r="4" fill="${INK}"/>` + shine(29, 29, 1.6, 2.4, 0) + sparkle(52, 12, 4) + sparkle(12, 52, 3.5),
    starMap: `<circle cx="32" cy="32" r="24" fill="#24325c" ${O}/><path d="M18 40 L26 24 L38 30 L46 18 M38 30 L42 44" ${N} stroke="#cfe0ff" stroke-width="1.4" stroke-dasharray="2 2"/>` + star5(18, 40, 4) + star5(26, 24, 4.5) + star5(38, 30, 4) + star5(46, 18, 5) + star5(42, 44, 3.5),
    timeWarp: hourglassShape("#5C6BC0", "#5C6BC0") + `<path d="M50 44 A20 20 0 0 1 12 40" ${N} stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><path d="M50 44 A20 20 0 0 1 12 40" ${N} stroke="#E8C04A" stroke-width="2.2" stroke-linecap="round"/><path d="M8 34 L12 44 L18 36Z" fill="#E8C04A" ${O}/>`,
    rewind: `<circle cx="32" cy="34" r="20" fill="#F5EEDC" ${O}/><circle cx="32" cy="34" r="16" ${N} ${T} opacity=".4"/><path d="M32 34 V22 M32 34 L24 39" ${N} stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="32" cy="34" r="2" fill="${INK}"/>` +
      `<path d="M20 10 A26 26 0 0 0 7 26" ${N} stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><path d="M20 10 A26 26 0 0 0 7 26" ${N} stroke="#E8C04A" stroke-width="2.2" stroke-linecap="round"/><path d="M2 22 L7 31 L13 23Z" fill="#E8C04A" ${O}/>`,
  };
  Object.assign(VOUCHER_ART, {
    polish: `<path d="M14 50 L40 18 L48 26 L22 56Z" fill="#c9a06a" ${O}/><rect x="38" y="8" width="18" height="16" rx="3" fill="#f5eedc" transform="rotate(40 47 16)" ${O}/>` + sparkle(18, 20, 6, "#fff") + sparkle(50, 46, 4, "#fff"),
    lacquer: `<rect x="20" y="22" width="24" height="32" rx="4" fill="#C0392B" ${O}/><rect x="24" y="12" width="16" height="12" rx="2" fill="#2b3a33" ${O}/>` + shine(28, 34, 3, 9, 10) + sparkle(50, 16, 6, "#fff") + sparkle(12, 44, 4, "#fff"),
    peddler: bag(32, 30, 20, "#b07c44", "", "#7a5836") + `<rect x="22" y="34" width="20" height="14" rx="2" fill="#f5eedc" ${T}/>` + txt(32, 45, 9, "✦", "#7E57C2"),
    bazaar: awning(10, "#7E57C2", "#F5EEDC") + `<path d="M14 24 V52 M50 24 V52" ${N} ${O}/><rect x="10" y="40" width="44" height="12" rx="2" fill="#b07c44" ${O}/>` + [18, 28, 38].map((x) => `<rect x="${x}" y="30" width="8" height="11" rx="1" fill="#f5eedc" ${T}/>`).join(""),
    starVendor: `<rect x="12" y="30" width="40" height="22" rx="3" fill="#b07c44" ${O}/>` + star5(22, 22, 7) + star5(40, 18, 9) + `<path d="M12 38 H52" ${N} ${T}/>`,
    planetarium: `<path d="M8 50 Q8 16 32 16 Q56 16 56 50Z" fill="#24325c" ${O}/><rect x="4" y="50" width="56" height="6" fill="#d8c290" ${O}/>` + star5(22, 32, 3.5) + star5(36, 26, 4) + star5(46, 38, 3) + `<circle cx="28" cy="42" r="4" fill="#E8743B" ${T}/>`,
    sleightOfHand: `<path d="M8 50 Q10 34 22 32 H40 Q48 32 48 40 Q48 46 40 46 H30" fill="#E8A65F" ${O}/>` + playingCard(28, 8, 18, 26, 14, txt(37, 25, 10, "A", "#D2453B")) + sparkle(14, 16, 5),
    grandIllusion: `<path d="M18 30 H46 L42 54 H22Z" fill="#2b3a33" ${O}/><rect x="14" y="26" width="36" height="6" rx="2" fill="#2b3a33" ${O}/><path d="M18 30 H46 V34 H18Z" fill="#D2453B"/>` + playingCard(20, 6, 14, 20, -16) + playingCard(32, 4, 14, 20, 12) + sparkle(54, 14, 5) + sparkle(8, 18, 4),
    teaLeaves: `<path d="M12 28 H48 Q48 50 30 52 Q12 50 12 28Z" fill="#f5eedc" ${O}/><path d="M48 32 Q58 32 56 40 Q54 46 46 44" ${N} ${O}/><path d="M18 34 Q24 30 28 36 M32 38 Q36 32 40 38 M24 44 Q28 40 34 44" ${N} stroke="#4E9A6E" stroke-width="2.4" stroke-linecap="round"/><path d="M24 22 Q22 16 26 12 M34 22 Q32 14 36 10" ${N} stroke="#cfd8dc" stroke-width="2" stroke-linecap="round"/>`,
    omenGlobe: `<circle cx="32" cy="28" r="20" fill="#5a6fd8" opacity=".85" ${O}/><path d="M25 37 V26 Q25 19 32 19 Q39 19 39 26 V37 L36.5 34.5 L34 37 L32 34.5 L30 37 L27.5 34.5Z" fill="#e8eeff" ${O}/><circle cx="29.5" cy="27" r="1.4" fill="${INK}"/><circle cx="34.5" cy="27" r="1.4" fill="${INK}"/>` + shine(24, 20, 3, 6, 20) + `<path d="M16 46 H48 L52 56 H12Z" fill="#7a5836" ${O}/>`,
    packRat: `<path d="M12 46 Q12 32 28 30 Q40 30 46 38 L56 40 L46 44 Q42 52 28 52 Q14 52 12 46Z" fill="#8a96a3" ${O}/><circle cx="26" cy="30" r="5" fill="#cfd8dc" ${O}/><circle cx="48" cy="40" r="1.4" fill="${INK}"/><path d="M12 46 Q4 44 6 36" ${N} ${O}/><g transform="translate(30 2) scale(.34)">${packet("#C9A227", gem(32, 32, 8, "#9b5fc0"))}</g>`,
    hoarder: [[6, 22, -14], [22, 14, 0], [38, 22, 14]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) scale(.36) rotate(${r} 32 32)">${packet(["#C9A227", "#2f4a8a", "#3b3f8f"][(x / 16) | 0], "")}</g>`).join("") + `<rect x="8" y="46" width="48" height="8" rx="2" fill="#7a5836" ${O}/>`,
  });
  let voucherSeq = 0;
  // A voucher coupon on a 64x86 canvas.
  function voucher(def, cls = "") {
    const id = "vch" + ++voucherSeq;
    const gold = def.tier === 2;
    const col = def.color || "#9b5fc0";
    const paper = gold ? ["#FBE7A1", "#D9A93A"] : ["#F7EBCD", "#E0C994"];
    const rays = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2, b = a + Math.PI / 16;
      return `<path d="M32 31 L${(32 + Math.cos(a) * 60).toFixed(1)} ${(31 + Math.sin(a) * 60).toFixed(1)} L${(32 + Math.cos(b) * 60).toFixed(1)} ${(31 + Math.sin(b) * 60).toFixed(1)}Z" fill="#fff" opacity=".13"/>`;
    }).join("");
    const art = VOUCHER_ART[def.id] || gem(32, 34, 18, col);
    return `<svg class="aart voucher-art${gold ? " tier2" : ""} ${cls}" viewBox="0 0 64 86" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
      `<defs><linearGradient id="${id}p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${paper[0]}"/><stop offset="1" stop-color="${paper[1]}"/></linearGradient>` +
      `<radialGradient id="${id}w" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="${enamel(col, 0.55)}"/></radialGradient>` +
      `<clipPath id="${id}c"><rect x="7" y="7" width="50" height="49" rx="4"/></clipPath><clipPath id="${id}k"><rect x="1.2" y="1.2" width="61.6" height="83.6" rx="6"/></clipPath>` +
      `<mask id="${id}m"><rect width="64" height="86" fill="#fff"/><circle cx="1" cy="61" r="4.2" fill="#000"/><circle cx="63" cy="61" r="4.2" fill="#000"/></mask></defs>` +
      `<g mask="url(#${id}m)"><rect x="1.2" y="1.2" width="61.6" height="83.6" rx="6" fill="url(#${id}p)" stroke="${INK}" stroke-width="2.2"/>` +
      `<rect x="4" y="4" width="56" height="78" rx="4" fill="none" stroke="${gold ? "#8a6410" : "#a88a52"}" stroke-width=".8" stroke-dasharray="${gold ? "none" : "1.6 1.6"}"/></g>` +
      `<g clip-path="url(#${id}c)"><rect x="7" y="7" width="50" height="49" fill="url(#${id}w)"/>${rays}<circle cx="32" cy="31" r="17" fill="#fff" opacity=".18"/>` +
      `<g transform="translate(32 31.5) scale(.74) translate(-32 -32)">${art}</g></g>` +
      `<rect x="7" y="7" width="50" height="49" rx="4" fill="none" stroke="${INK}" stroke-width="1.6"/>` +
      [[7, 7], [57, 7], [7, 56], [57, 56]].map(([x, y]) => `<path d="M${x} ${y - 2.4} L${x + 2.4} ${y} L${x} ${y + 2.4} L${x - 2.4} ${y}Z" fill="${gold ? "#fff3c4" : "#E8C04A"}" stroke="${INK}" stroke-width=".8"/>`).join("") +
      `<path d="M6 61 H58" stroke="${INK}" stroke-width="1" stroke-dasharray="2 2" opacity=".55"/>` +
      `<text x="32" y="71.5" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="7.2" letter-spacing="1.6" fill="${gold ? "#5a3e08" : "#5a4526"}">VOUCHER</text>` +
      (gold
        ? star5(26, 77.5, 3, "#fff3c4", 0.45).replace(/stroke-width="2.2"/, 'stroke-width="1"') + star5(38, 77.5, 3, "#fff3c4", 0.45).replace(/stroke-width="2.2"/, 'stroke-width="1"')
        : star5(32, 77.5, 3, col, 0.45).replace(/stroke-width="2.2"/, 'stroke-width="1"')) +
      (gold ? `<g clip-path="url(#${id}k)"><path d="M-4 30 L30 -4 H40 L-4 40Z" fill="#fff" opacity=".28"/><path d="M30 90 L68 52 V62 L40 90Z" fill="#fff" opacity=".22"/></g>` : `<path d="M10 9 Q12 30 10 52" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".3"/>`) +
      `</svg>`;
  }

  // ---------- spectral cards: every one is the same ghostly card ----------
  // A dark indigo card with a misty glow, a ring of faint runes, the card's
  // own emblem in pale light, and its name band. Rare ones have a gold edge.
  const ghost = (x, y, s, fill = "#e8eeff") =>
    `<path d="M${x - s} ${y + s * 1.1} V${y} Q${x - s} ${y - s * 1.2} ${x} ${y - s * 1.2} Q${x + s} ${y - s * 1.2} ${x + s} ${y} V${y + s * 1.1} L${x + s * 0.6} ${y + s * 0.8} L${x + s * 0.2} ${y + s * 1.1} L${x - s * 0.2} ${y + s * 0.8} L${x - s * 0.6} ${y + s * 1.1}Z" fill="${fill}" ${O}/>` +
    `<circle cx="${x - s * 0.35}" cy="${y - s * 0.1}" r="${s * 0.16}" fill="${INK}"/><circle cx="${x + s * 0.35}" cy="${y - s * 0.1}" r="${s * 0.16}" fill="${INK}"/>`;
  const skull = (x, y, s) => `<path d="M${x - s} ${y} Q${x - s} ${y - s * 1.1} ${x} ${y - s * 1.1} Q${x + s} ${y - s * 1.1} ${x + s} ${y} Q${x + s} ${y + s * 0.5} ${x + s * 0.55} ${y + s * 0.6} V${y + s * 0.95} H${x - s * 0.55} V${y + s * 0.6} Q${x - s} ${y + s * 0.5} ${x - s} ${y}Z" fill="#efe9da" ${O}/><circle cx="${x - s * 0.4}" cy="${y - s * 0.05}" r="${s * 0.25}" fill="${INK}"/><circle cx="${x + s * 0.4}" cy="${y - s * 0.05}" r="${s * 0.25}" fill="${INK}"/>`;
  const SPECTRALS = {
    kinfolk: playingCard(12, 18, 16, 24, -14, txt(20, 34, 10, "J")) + playingCard(24, 14, 16, 24, 0, txt(32, 30, 10, "Q")) + playingCard(36, 18, 16, 24, 14, txt(44, 34, 10, "K")) + ghost(32, 48, 7),
    bonePact: skull(32, 30, 13) + playingCard(8, 34, 14, 20, -18, txt(15, 48, 10, "A")) + playingCard(42, 34, 14, 20, 18, txt(49, 48, 10, "A")),
    chorus: [10, 22, 34, 46].map((x, i) => playingCard(x, 20 + (i % 2) * 4, 12, 18, (i - 1.5) * 8, txt(x + 6, 33 + (i % 2) * 4, 8, String(i * 2 + 3)))).join("") + `<path d="M14 14 Q32 4 50 14" ${N} stroke="#cfe0ff" stroke-width="1.6" stroke-dasharray="2 2"/>` + sparkle(32, 50, 5, "#cfe0ff"),
    paupersPact: bag(32, 30, 18, "#8a7a62", "", "#5a4a32") + `<path d="M20 46 L44 30 M44 46 L20 30" ${N} stroke="#D2453B" stroke-width="4" stroke-linecap="round"/>` + gem(32, 12, 5, "#9b5fc0"),
    seance: `<circle cx="32" cy="34" r="20" fill="#24325c" ${O}/>` + ["A", "7", "K", "3", "Q", "9"].map((t, i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return txt(32 + Math.cos(a) * 14, 37 + Math.sin(a) * 14, 7, t, "#cfe0ff"); }).join("") + `<path d="M26 28 L38 28 L32 40Z" fill="#E8C04A" ${O}/>`,
    phantomLimb: `<path d="M16 50 Q14 30 22 22 L26 14 Q28 10 31 13 L30 24 L36 12 Q39 9 41 13 L37 26 L44 16 Q47 13 49 17 L42 32 Q48 38 44 48Z" fill="#cfe9e4" opacity=".85" ${O}/>` + plus(50, 46, 6),
    pyre: [14, 24, 34, 44].map((x, i) => playingCard(x - 4, 30, 12, 18, (i - 1.5) * 10)).join("") + flame(32, 26, 16) + `<rect x="10" y="48" width="44" height="6" rx="2" fill="#7a5836" ${O}/>`,
    effigy: `<circle cx="32" cy="16" r="7" fill="#d8b98a" ${O}/><path d="M22 26 H42 L46 40 H38 L40 56 H24 L26 40 H18Z" fill="#c09a68" ${O}/><path d="M26 30 L38 38 M38 30 L26 38" ${N} ${T}/>` + gem(50, 18, 5, "#9b5fc0") + gem(14, 18, 5, "#9b5fc0"),
    shroud: `<path d="M12 54 Q10 26 32 12 Q54 26 52 54 Q46 48 42 54 Q37 48 32 54 Q27 48 22 54 Q17 48 12 54Z" fill="#dfe7f2" opacity=".9" ${O}/>` + sparkle(24, 30, 4, "#9fb8ff") + sparkle(40, 36, 5, "#FFD45E") + sparkle(30, 44, 3, "#ff9fc0"),
    exorcism: `<rect x="29" y="8" width="6" height="46" rx="1.5" fill="#E8C04A" ${O}/><rect x="18" y="20" width="28" height="6" rx="1.5" fill="#E8C04A" ${O}/>` + ghost(50, 46, 7, "#e8eeff") + `<path d="M40 52 L44 48" ${N} ${T}/>`,
    revenant: ghost(32, 34, 16) + `<path d="M10 20 A24 24 0 0 1 30 8" ${N} stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><path d="M10 20 A24 24 0 0 1 30 8" ${N} stroke="#7FD08A" stroke-width="2.2" stroke-linecap="round"/><path d="M26 3 L33 8 L26 13Z" fill="#7FD08A" ${O}/>`,
    hollowCrown: `<path d="M12 44 L16 18 L25 30 L32 14 L39 30 L48 18 L52 44Z" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/><path d="M12 44 L16 18 L25 30 L32 14 L39 30 L48 18 L52 44Z" fill="none" stroke="#E8C04A" stroke-width="3" stroke-linejoin="round"/><rect x="12" y="44" width="40" height="7" rx="2" fill="#E8C04A" ${O}/>`,
    wispLantern: `<path d="M26 10 H38 L36 16 H28Z" fill="#7a5836" ${O}/><path d="M22 18 H42 L40 48 H24Z" fill="#dff6fa" opacity=".75" ${O}/><rect x="20" y="48" width="24" height="6" rx="2" fill="#7a5836" ${O}/>` + flame(32, 34, 8).replace(/#F29A2E/g, "#7fd0e0").replace(/#FFE07A/g, "#e8fbff"),
    soulShard: `<path d="M32 6 L46 30 L32 58 L18 30Z" fill="#F2A65A" ${O}/><path d="M32 6 L32 58 M18 30 H46" ${N} ${T} opacity=".5"/>` + shine(27, 24, 2.4, 7, 20) + sparkle(50, 12, 5) + sparkle(12, 48, 4),
    halo: `<ellipse cx="32" cy="16" rx="16" ry="5" fill="none" stroke="${INK}" stroke-width="5"/><ellipse cx="32" cy="16" rx="16" ry="5" fill="none" stroke="#FFE28A" stroke-width="2.6"/>` + playingCard(20, 26, 24, 32, 0, star5(32, 42, 7, "#F6D35B")) + sparkle(52, 34, 4) + sparkle(12, 44, 3),
    prismHex: `<path d="M32 8 L54 48 H10Z" fill="#dfeef0" opacity=".85" ${O}/><path d="M32 8 L34 48 M32 8 L20 48" ${N} ${T} opacity=".4"/><path d="M38 30 L62 22 M40 34 L62 32 M40 38 L62 42" ${N} stroke-width="3" stroke="#ff6b6b"/><path d="M40 34 L62 32" ${N} stroke-width="3" stroke="#7FD08A"/><path d="M40 38 L62 42" ${N} stroke-width="3" stroke="#6bb8ff"/><path d="M2 30 L24 30" ${N} stroke="#fff" stroke-width="3"/>`,
    eventHorizon: `<circle cx="32" cy="32" r="22" fill="#f6c445" opacity=".35"/><ellipse cx="32" cy="32" rx="26" ry="8" fill="none" stroke="#F6C445" stroke-width="3" transform="rotate(-18 32 32)"/><circle cx="32" cy="32" r="13" fill="#05060c" ${O}/><ellipse cx="32" cy="32" rx="26" ry="8" fill="none" stroke="#FFE28A" stroke-width="1.2" stroke-dasharray="20 60" transform="rotate(-18 32 32)"/>`,
  };
  let spectralSeq = 0;
  function spectral(def, cls = "") {
    const id = "spc" + ++spectralSeq;
    const rare = !!def.rare;
    const col = def.color || "#8f9bff";
    const art = SPECTRALS[def.id] || ghost(32, 34, 16);
    const runes = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<path d="M${(32 + Math.cos(a) * 22).toFixed(1)} ${(37 + Math.sin(a) * 22).toFixed(1)} l2 -3 l2 3" fill="none" stroke="#b9c6ff" stroke-width=".9" opacity=".55"/>`; }).join("");
    return `<svg class="aart spectral-art ${cls}" viewBox="0 0 64 86" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
      `<defs><linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f66"/><stop offset="1" stop-color="#0f1130"/></linearGradient>` +
      `<radialGradient id="${id}g" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="${col}" stop-opacity=".9"/><stop offset=".6" stop-color="${col}" stop-opacity=".18"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>` +
      `<clipPath id="${id}c"><rect x="1.2" y="1.2" width="61.6" height="83.6" rx="6"/></clipPath></defs>` +
      `<rect x="1.2" y="1.2" width="61.6" height="83.6" rx="6" fill="url(#${id}b)" stroke="${rare ? "#F2C94C" : INK}" stroke-width="${rare ? 2.6 : 2.2}"/>` +
      `<g clip-path="url(#${id}c)"><circle cx="32" cy="34" r="34" fill="url(#${id}g)"/>` +
      `<path d="M-4 70 Q14 58 30 66 T66 60 V90 H-4Z" fill="#b9c6ff" opacity=".12"/><path d="M-4 78 Q20 66 36 74 T66 70 V90 H-4Z" fill="#b9c6ff" opacity=".1"/></g>` +
      `<rect x="4.5" y="4.5" width="55" height="77" rx="4" fill="none" stroke="${rare ? "#F2C94C" : "#8f9bff"}" stroke-width=".8" opacity=".7"/>` +
      `<circle cx="32" cy="37" r="24" fill="none" stroke="#b9c6ff" stroke-width=".7" opacity=".5"/>` + runes +
      `<g transform="translate(32 37) scale(.64) translate(-32 -32)" style="filter:drop-shadow(0 0 3px ${col})">${art}</g>` +
      `<path d="M5 70 H59 L57 81 H7Z" fill="#0a0c22" stroke="${rare ? "#F2C94C" : "#8f9bff"}" stroke-width=".9"/>` +
      nameText(def.name || "", 77.6, rare ? "#F6E3A8" : "#e3e9ff") +
      `<path d="M11 3.5 H53 L50 10.5 H14Z" fill="#0a0c22" stroke="${rare ? "#F2C94C" : "#8f9bff"}" stroke-width=".8"/>` +
      `<text x="32" y="8.9" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="4.3" letter-spacing=".8" textLength="34" lengthAdjust="spacingAndGlyphs" fill="${rare ? "#F2C94C" : "#cfd8ff"}">SPECTRAL</text>` +
      `</svg>`;
  }

  // Major / Mega packs wear a ribbon across the bottom.
  function packRibbon(size) {
    if (!size) return "";
    const mega = size === "mega";
    const fill = mega ? "#E8C04A" : "#cfd8dc";
    return `<path d="M6 44 H58 L54 50 L58 56 H6 L10 50Z" fill="${fill}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>` +
      `<text x="32" y="53.2" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="7.4" letter-spacing="1.4" fill="${INK}">${mega ? "MEGA" : "MAJOR"}</text>` +
      (mega ? sparkle(54, 40, 4.5, "#FFE28A") + sparkle(10, 40, 3.5, "#FFE28A") : "");
  }

  /* ---------- full cards: artifacts, items (arcana) and star charts ----------
     The same 64x86 card as vouchers and spectrals: a type plate at the top,
     the picture in a framed window, and the name on a band at the bottom.
     Each kind has its own look:
       artifact  — green baize, double gold border, filigree corners
       legendary — ember black with a burning orange border and sparks
       arcana    — tarot: cream card, sunburst window in the item's colour,
                   a Roman numeral
       star chart— night sky with scattered stars and a gold ring */
  const hashStr = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
  const rng = (seed) => () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822519) ^ Math.imul(seed ^ (seed >>> 13), 3266489917)) >>> 0) / 4294967296;
  const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII"];
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let cardSeq = 0;
  // Name band text, squeezed to fit when it's long.
  const nameText = (name, y, fill, maxW = 50) => {
    const n = esc(name);
    const fit = name.length > 12 ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : "";
    return `<text x="32" y="${y}" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${name.length > 16 ? 5.6 : 6.4}" fill="${fill}"${fit}>${n}</text>`;
  };
  const cornerFiligree = (stroke) => [[8, 15, 1, 1], [56, 15, -1, 1], [8, 63, 1, -1], [56, 63, -1, -1]].map(([x, y, sx, sy]) =>
    `<path d="M${x} ${y + sy * 7} Q${x} ${y} ${x + sx * 7} ${y} M${x + sx * 2.5} ${y + sy * 2.5} m-1.4 0 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0" fill="none" stroke="${stroke}" stroke-width=".9"/>`).join("");

  // Artifact sleeves: a clear plastic sleeve drawn over the whole piece: a
  // tinted, glossy cover with an opening and thumb notch at the top, and its
  // own printed pattern. Used on the full cards and on the shelf icons.
  const CHARM_SLEEVE_ART = {
    sparkler: { tint: "#FFB84D" },
    tithe: { tint: "#C9A56E" },
    gilded: { tint: "#F2C94C" },
    prismatic: { tint: "rainbow" },
    negative: { tint: "#b9a0ff" },
  };
  // Negative: the piece itself is drawn as a true colour negative; the
  // sleeve over it is not.
  function negativeOf(body, id) {
    return `<defs><filter id="${id}neg" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0"/></filter></defs><g filter="url(#${id}neg)">${body}</g>`;
  }
  function charmSleeveWrap(sleeve, id, w, h) {
    const st = CHARM_SLEEVE_ART[sleeve];
    if (!st) return "";
    const rb = st.tint === "rainbow";
    const tint = rb ? `url(#${id}rb)` : st.tint;
    const r = w > 64 || h > 64 ? 7 : 10;
    const lip = Math.round(h * 0.13 * 10) / 10, cx = w / 2;
    const defs = `<defs>` +
      `<linearGradient id="${id}rb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset=".25" stop-color="#ffd36b"/><stop offset=".5" stop-color="#7FD08A"/><stop offset=".75" stop-color="#6bb8ff"/><stop offset="1" stop-color="#c38bff"/></linearGradient>` +
      `<linearGradient id="${id}t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${rb ? "#fff" : st.tint}" stop-opacity=".45"/><stop offset=".45" stop-color="${rb ? "#fff" : st.tint}" stop-opacity=".12"/><stop offset="1" stop-color="${rb ? "#fff" : st.tint}" stop-opacity=".38"/></linearGradient>` +
      `<clipPath id="${id}c"><rect x=".6" y=".6" width="${w - 1.2}" height="${h - 1.2}" rx="${r}"/></clipPath></defs>`;
    let pat = "";
    if (sleeve === "sparkler") pat = [[.18, .3, 2.8], [.8, .22, 2.2], [.2, .78, 2.2], [.78, .7, 3], [.55, .9, 1.8]].map(([x, y, z]) => sparkle(x * w, y * h, z * 1.4, "#FFE28A").replace(/stroke-width="1.5"/g, 'stroke-width=".5"')).join("");
    if (sleeve === "tithe") pat = `<path d="M3.5 ${lip + 3} V${h - 4} M${w - 3.5} ${lip + 3} V${h - 4}" stroke="#6b4a2a" stroke-width=".9" stroke-dasharray="2.2 2" opacity=".75"/>` +
      `<circle cx="${w - 10}" cy="${h - 10}" r="5.2" fill="#E8C04A" stroke="#6b4a2a" stroke-width=".9"/><text x="${w - 10}" y="${h - 7.5}" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="6.6" fill="#6b4a2a">$</text>`;
    if (sleeve === "gilded") pat = `<rect x="0" y="0" width="${w}" height="${h}" fill="#F2C94C" opacity=".14"/>` +
      [[.15, .5], [.85, .45], [.3, .88], [.7, .85], [.5, .2]].map(([x, y]) => `<path d="M${x * w} ${y * h - 2.2} L${x * w + 1.2} ${y * h} L${x * w} ${y * h + 2.2} L${x * w - 1.2} ${y * h}Z" fill="#fff3b0" opacity=".9"/>`).join("");
    if (sleeve === "prismatic") pat = `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#${id}rb)" opacity=".3"/>`;
    if (sleeve === "negative") pat = `<rect x="0" y="0" width="${w}" height="${h}" fill="#5a3d8a" opacity=".2"/>`;
    return defs + `<g clip-path="url(#${id}c)">` +
      `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#${id}t)"/>` + pat +
      // the opening: a darker band above the seam, with a thumb notch
      `<path d="M0 0 H${w} V${lip} H${cx + 7} A7 7 0 0 1 ${cx - 7} ${lip} H0Z" fill="#000" opacity=".16"/>` +
      `<path d="M0 ${lip} H${cx - 7} A7 7 0 0 0 ${cx + 7} ${lip} H${w}" fill="none" stroke="${tint}" stroke-width="1.4"/>` +
      `<path d="M0 ${lip + 1.2} H${cx - 7.6} M${cx + 7.6} ${lip + 1.2} H${w}" stroke="#fff" stroke-width=".6" opacity=".45"/>` +
      // gloss
      `<path d="M${-w * .1} ${h * .62} L${w * .62} ${-h * .1} H${w * .78} L${-w * .1} ${h * .8}Z" fill="#fff" opacity=".2"/>` +
      `<path d="M4 ${lip + 5} Q5.5 ${h / 2} 4 ${h - 6}" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".45"/>` +
      `</g>` +
      `<rect x=".9" y=".9" width="${w - 1.8}" height="${h - 1.8}" rx="${r}" fill="none" stroke="${tint}" stroke-width="2"/>`;
  }

  function card(def, cls = "") {
    const id = "crd" + ++cardSeq;
    const isChart = def.type === "item" && /^chart\d+$/.test(def.id);
    const legendary = def.type === "charm" && def.rarity === "legendary";
    const kind = def.type === "charm" ? (legendary ? "legend" : "artifact") : isChart ? "chart" : "arcana";
    const col = def.color || "#9b5fc0";
    const inner = def.type === "charm" ? (legendary ? LEGENDS[def.id] : CHARMS[def.id]) || gem(32, 34, 18, col) : ITEMS[def.id] || gem(32, 34, 18, col);
    const S = {
      artifact: { bg: ["#2f4a37", "#14211a"], edge: "#D9BC6A", plate: "#0e1711", plateText: "#E9C568", band: "#0e1711", bandText: "#F3ECD9", label: "ARTIFACT", win: null },
      legend: { bg: ["#4a2616", "#140805"], edge: "#F2A65A", plate: "#1b0c06", plateText: "#F6C445", band: "#1b0c06", bandText: "#FFE3B8", label: "LEGENDARY", win: null },
      arcana: { bg: ["#FAF1D8", "#E3CC98"], edge: INK, plate: "#5a4526", plateText: "#FFF3D2", band: "#FFF7E2", bandText: "#3a2a14", label: def.arcana ? "ARCANA" : "ITEM", win: col },
      chart: { bg: ["#22305a", "#0b1024"], edge: "#E8C04A", plate: "#0b1024", plateText: "#cfe0ff", band: "#0b1024", bandText: "#F6E3A8", label: "STAR CHART", win: null },
    }[kind];
    let back = "";
    if (kind === "artifact") {
      back = `<pattern id="${id}h" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 4 H8" stroke="#ffffff" stroke-width=".5" opacity=".07"/></pattern>` +
        `<rect x="2" y="2" width="60" height="82" rx="5" fill="url(#${id}h)"/>`;
    } else if (kind === "legend") {
      const r = rng(hashStr(def.id));
      back = Array.from({ length: 14 }, () => `<circle cx="${(4 + r() * 56).toFixed(1)}" cy="${(14 + r() * 56).toFixed(1)}" r="${(0.5 + r() * 1.1).toFixed(1)}" fill="#F6C445" opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`).join("") +
        `<path d="M2 84 Q10 70 16 78 Q22 64 30 76 Q36 62 44 76 Q50 66 56 78 Q60 72 62 84Z" fill="#E8743B" opacity=".35"/>`;
    } else if (kind === "chart") {
      const r = rng(hashStr(def.id));
      back = Array.from({ length: 26 }, () => `<circle cx="${(3 + r() * 58).toFixed(1)}" cy="${(3 + r() * 80).toFixed(1)}" r="${(0.3 + r() * 0.8).toFixed(1)}" fill="#fff" opacity="${(0.25 + r() * 0.7).toFixed(2)}"/>`).join("") +
        `<path d="M-4 30 Q30 18 68 40" fill="none" stroke="#9fb8ff" stroke-width="7" opacity=".08"/>`;
    }
    // the picture window
    let win, winDefs = "";
    if (kind === "arcana") {
      const rays = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2, b = a + Math.PI / 14; return `<path d="M32 38 L${(32 + Math.cos(a) * 50).toFixed(1)} ${(38 + Math.sin(a) * 50).toFixed(1)} L${(32 + Math.cos(b) * 50).toFixed(1)} ${(38 + Math.sin(b) * 50).toFixed(1)}Z" fill="#fff" opacity=".16"/>`; }).join("");
      winDefs = `<radialGradient id="${id}w" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="${enamel(col, 0.6)}"/></radialGradient>` +
        `<clipPath id="${id}c"><path d="M8 20 Q8 13 15 13 H49 Q56 13 56 20 V64 H8Z"/></clipPath>`;
      win = `<g clip-path="url(#${id}c)"><rect x="8" y="13" width="48" height="51" fill="url(#${id}w)"/>${rays}<circle cx="32" cy="38" r="16" fill="#fff" opacity=".2"/></g>` +
        `<path d="M8 20 Q8 13 15 13 H49 Q56 13 56 20 V64 H8Z" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
    } else if (kind === "chart") {
      win = `<circle cx="32" cy="38" r="24" fill="none" stroke="#E8C04A" stroke-width="1.1" opacity=".8"/><circle cx="32" cy="38" r="26.5" fill="none" stroke="#E8C04A" stroke-width=".5" stroke-dasharray="1.5 2.5" opacity=".7"/>`;
    } else {
      win = `<rect x="7.5" y="13" width="49" height="51" rx="4" fill="#000" opacity=".28"/><rect x="7.5" y="13" width="49" height="51" rx="4" fill="none" stroke="${S.edge}" stroke-width=".9" opacity=".8"/>`;
    }
    const numeral = kind === "arcana" ? (hashStr(def.id) % 22) + 1 : 0;
    const body =
      `<defs><linearGradient id="${id}b" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${S.bg[0]}"/><stop offset="1" stop-color="${S.bg[1]}"/></linearGradient>` +
      `<clipPath id="${id}k"><rect x="1.2" y="1.2" width="61.6" height="83.6" rx="6"/></clipPath></defs>` +
      `<rect x="1.2" y="1.2" width="61.6" height="83.6" rx="6" fill="url(#${id}b)"/>` +
      `<g clip-path="url(#${id}k)">${back}</g>` +
      `<rect x="1.2" y="1.2" width="61.6" height="83.6" rx="6" fill="none" stroke="${legendary ? "#E8743B" : INK}" stroke-width="${legendary ? 2.6 : 2.2}"/>` +
      `<rect x="4" y="4" width="56" height="78" rx="4" fill="none" stroke="${S.edge}" stroke-width="${kind === "arcana" ? 0.7 : 1}" opacity="${kind === "arcana" ? 0.5 : 0.9}"/>` +
      (kind === "artifact" || kind === "legend" ? `<rect x="5.6" y="5.6" width="52.8" height="74.8" rx="3" fill="none" stroke="${S.edge}" stroke-width=".5" opacity=".6"/>` + cornerFiligree(S.edge) : "") +
      (winDefs ? `<defs>${winDefs}</defs>` : "") + win +
      `<g transform="translate(32 38.5) scale(${kind === "chart" ? 0.84 : 0.72}) translate(-32 -32)">${inner}</g>` +
      // type plate
      `<path d="M11 3.5 H53 L50 10.5 H14Z" fill="${S.plate}" stroke="${kind === "arcana" ? INK : S.edge}" stroke-width=".8"/>` +
      `<text x="32" y="8.9" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="4.3" letter-spacing=".8" textLength="34" lengthAdjust="spacingAndGlyphs" fill="${S.plateText}">${S.label}</text>` +
      (numeral ? `<circle cx="32" cy="64" r="5" fill="#FFF7E2" stroke="${INK}" stroke-width="1"/><text x="32" y="66" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${ROMAN[numeral].length > 3 ? 3.6 : 4.6}" fill="#5a4526">${ROMAN[numeral]}</text>` : "") +
      // name band
      `<path d="M5 70 H59 L57 81 H7Z" fill="${S.band}" stroke="${kind === "arcana" ? INK : S.edge}" stroke-width=".9"/>` +
      nameText(def.name || "", 77.6, S.bandText) +
      (legendary ? sparkle(54, 18, 3.4, "#F6C445") + sparkle(10, 60, 2.6, "#F6C445") : "") +
      `<path d="M9 16 Q11 40 9 62" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity="${kind === "arcana" ? 0.35 : 0.12}"/>`;
    return `<svg class="aart full-card card-${kind}${def.sleeve === "negative" ? " is-negative" : ""} ${cls}" viewBox="0 0 64 86" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
      (def.sleeve === "negative" ? negativeOf(body, id) : body) +
      (def.sleeve ? charmSleeveWrap(def.sleeve, id + "s", 64, 86) : "") +
      `</svg>`;
  }

  function wrap(inner, cls = "") {
    return `<svg class="aart ${cls}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="32" cy="60" rx="20" ry="3" fill="#000" opacity=".22"/>${inner}</svg>`;
  }

  // def: a charm, item or voucher definition (anything with id + type/color).
  function icon(def, cls) {
    if (!def) return "";
    if (def.type === "charm" && def.rarity === "legendary") return relic(LEGENDS[def.id] || gem(32, 34, 20, def.color || "#E8743B"), cls, true, def.sleeve);
    if (def.type === "charm") return relic(CHARMS[def.id] || gem(32, 34, 20, def.color || "#9b5fc0"), cls, false, def.sleeve);
    if (def.type === "pack") return wrap(engrave(PACKS[def.base || def.id] || packet(def.color || "#C9A227", ""), 0.5) + packRibbon(def.size), "engraved " + (cls || ""));
    if (def.spectral) return spectral(def, cls);
    if (def.type === "item") return wrap(engrave(ITEMS[def.id] || gem(32, 34, 20, def.color || "#9b5fc0"), 0.34), "engraved " + (cls || ""));
    return voucher(def, cls);
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
    negative: { tint: "#7a55b0", label: "NEGATIVE" },
    glass: { tint: "#9fd8f0", label: "GLASS" },
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
      case "glass":
        return `<path d="M-4 46 L34 -4 H46 L-4 58Z" fill="#fff" opacity=".5"/><path d="M20 92 L64 40 V50 L30 92Z" fill="#fff" opacity=".35"/>` +
          `<path d="M44 58 L50 52 L49 46 M50 52 L57 54 M50 52 L52 61 L58 64 M52 61 L48 67" fill="none" stroke="#e8f8ff" stroke-width=".7" stroke-linejoin="round" opacity=".95"/>` +
          `<path d="M44 58 L50 52 L49 46 M50 52 L57 54 M50 52 L52 61 L58 64 M52 61 L48 67" fill="none" stroke="#4d8fae" stroke-width=".3" transform="translate(.5 .5)" opacity=".6"/>`;
      case "negative":
        return `<text x="54" y="80" text-anchor="end" font-family="Georgia,serif" font-weight="700" font-size="7" fill="#d9c8ff" opacity=".9">+1</text>`;
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

  window.AnteArt = { icon, card, voucher, spectral, sleeve, stamp, sleeveLabel: (t) => (SLEEVE_STYLE[t] ? SLEEVE_STYLE[t].label : "") };
})();
