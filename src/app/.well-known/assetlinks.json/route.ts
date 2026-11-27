/**
 * Digital Asset Links: tells Android that the IndypenDance app may open this site
 * full-screen (as a Trusted Web Activity, without the browser bar).
 *
 * ANDROID_PACKAGE is the app id (default com.indypendance.app). ANDROID_CERT_SHA256 lists
 * the SHA-256 fingerprints of the keys that sign the app, comma-separated: your own
 * upload key, plus Google Play's app-signing key once the app is on Play.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const pkg = process.env.ANDROID_PACKAGE || "com.indypendance.app";
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];
  return Response.json(body, { headers: { "cache-control": "public, max-age=300" } });
}
