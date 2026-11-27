import { INDYWALL_PATHS as P } from "./brand-paths";

/**
 * The IndypenDance logo, "Shield note": the Indywall shield pieces arranged into a
 * music note. The shield (wall, base, body) is the note head, an orange stem rises
 * from it, and Indywall's orange tab is the note's flag.
 *
 * Variants:
 * - symbol:   the mark alone on transparent (browser tab, in-app)
 * - tile:     on a navy rounded square (sidebar, previews)
 * - maskable: on full-bleed navy with room for Android's icon shapes (app icons)
 * - mono:     solid white on transparent (notification icons; Android uses only the shape)
 */
export type BrandVariant = "symbol" | "tile" | "maskable" | "mono";

export const BRAND_NAVY = "#071738";

const VIEWBOX: Record<BrandVariant, string> = {
  symbol: "40 215 470 470",
  tile: "-45 130 640 640",
  maskable: "-115 60 780 780",
  mono: "35 210 480 480",
};

const GRADIENTS = `<defs>
<linearGradient id="bWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0062E6"/><stop offset="0.45" stop-color="#0074FA"/><stop offset="1" stop-color="#004CC6"/></linearGradient>
<linearGradient id="bBase" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#12C4F9"/><stop offset="1" stop-color="#46D5FF"/></linearGradient>
<linearGradient id="bShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A72F5"/><stop offset="0.5" stop-color="#0040B6"/><stop offset="1" stop-color="#011579"/></linearGradient>
<linearGradient id="bBody" x1="0.15" y1="0" x2="0.55" y2="1"><stop offset="0" stop-color="#7CC4FF"/><stop offset="0.35" stop-color="#0A8BFD"/><stop offset="1" stop-color="#0052D9"/></linearGradient>
<linearGradient id="bTab" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FEA41E"/><stop offset="1" stop-color="#FE5F14"/></linearGradient>
<linearGradient id="bStem" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FEA41E"/><stop offset="1" stop-color="#FE5F14"/></linearGradient>
<clipPath id="bShadeClip"><rect x="0" y="0" width="358" height="800"/></clipPath>
</defs>`;

function mark(mono: boolean) {
  const f = (gradient: string) => (mono ? "#fff" : `url(#${gradient})`);
  return [
    // stem, behind the note head
    `<rect x="300" y="236" width="28" height="330" rx="12" fill="${f("bStem")}"/>`,
    // note head: the Indywall shield at 60%, anchored bottom-left
    `<g transform="translate(86 667) scale(0.6) translate(-86 -667)">`,
    `<path d="${P.wall}" fill="${f("bWall")}"/>`,
    `<path d="${P.base}" fill="${f("bBase")}"/>`,
    `<path d="${P.body}" fill="${f("bBody")}"/>`,
    mono ? "" : `<path d="${P.body}" fill="url(#bShade)" clip-path="url(#bShadeClip)"/>`,
    `</g>`,
    // flag: Indywall's orange tab
    `<path d="${P.tab}" transform="translate(-6 -26)" fill="${f("bTab")}"/>`,
  ].join("");
}

export function brandSvg(variant: BrandVariant) {
  const vb = VIEWBOX[variant];
  const [x, y, w] = vb.split(" ").map(Number);
  const bg =
    variant === "tile"
      ? `<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${w * 0.22}" fill="${BRAND_NAVY}"/>`
      : variant === "maskable"
        ? `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="${BRAND_NAVY}"/>`
        : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="IndypenDance">${
    variant === "mono" ? "" : GRADIENTS
  }${bg}${mark(variant === "mono")}</svg>`;
}

export const brandDataUri = (variant: BrandVariant) =>
  `data:image/svg+xml;base64,${Buffer.from(brandSvg(variant)).toString("base64")}`;
