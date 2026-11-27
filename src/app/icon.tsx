import { ImageResponse } from "next/og";
import { brandDataUri } from "@/lib/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Browser tab icon: the Shield note on transparent. */
export default function Icon() {
  // eslint-disable-next-line @next/next/no-img-element
  return new ImageResponse(<img src={brandDataUri("symbol")} width={64} height={64} alt="" />, size);
}
