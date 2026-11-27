import { ImageResponse } from "next/og";
import { brandDataUri } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icon iPhones use for "Add to Home Screen" (iOS rounds the corners itself). */
export default function AppleIcon() {
  // eslint-disable-next-line @next/next/no-img-element
  return new ImageResponse(<img src={brandDataUri("maskable")} width={180} height={180} alt="" />, size);
}
