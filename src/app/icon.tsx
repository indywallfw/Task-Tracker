import { ImageResponse } from "next/og";
import { IdMark } from "./_components/id-mark";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** App icon for installed home-screen shortcuts: a bold "ID" on the dark theme colour. */
export default function Icon() {
  return new ImageResponse(<IdMark size={512} />, size);
}
