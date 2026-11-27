import { ImageResponse } from "next/og";
import { brandDataUri, brandSvg, type BrandVariant } from "@/lib/brand";

/**
 * Every logo file, generated from one definition (src/lib/brand.ts):
 *   /brand/symbol.svg, /brand/tile.svg, /brand/mono.svg
 *   /brand/icon-512.png, /brand/icon-192.png  (rounded navy tile)
 *   /brand/maskable-512.png                   (full-bleed, for Android icon shapes)
 *   /brand/mono-192.png, /brand/badge-96.png  (white on transparent, notification icons)
 */
const SVGS: Record<string, BrandVariant> = { "symbol.svg": "symbol", "tile.svg": "tile", "mono.svg": "mono" };
const PNGS: Record<string, { variant: BrandVariant; size: number }> = {
  "icon-512.png": { variant: "tile", size: 512 },
  "icon-192.png": { variant: "tile", size: 192 },
  "maskable-512.png": { variant: "maskable", size: 512 },
  "mono-192.png": { variant: "mono", size: 192 },
  "badge-96.png": { variant: "mono", size: 96 },
};

export const dynamic = "force-static";
export const generateStaticParams = () => [...Object.keys(SVGS), ...Object.keys(PNGS)].map((file) => ({ file }));

const CACHE = { "cache-control": "public, max-age=86400" };

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (SVGS[file]) return new Response(brandSvg(SVGS[file]), { headers: { "content-type": "image/svg+xml", ...CACHE } });
  const png = PNGS[file];
  if (!png) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brandDataUri(png.variant)} width={png.size} height={png.size} alt="" />,
    { width: png.size, height: png.size, headers: CACHE },
  );
}
