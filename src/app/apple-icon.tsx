import { ImageResponse } from "next/og";
import { IdMark } from "@/components/id-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icon iPhones use for "Add to Home Screen". */
export default function AppleIcon() {
  return new ImageResponse(<IdMark size={180} />, size);
}
