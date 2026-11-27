# IndypenDance for Android

The Android app is the live site wrapped as a **Trusted Web Activity** (TWA): it opens
full-screen without a browser bar, shows up as its own app, and gets the same push
notifications as the site. Every deploy of the site updates the app; you only rebuild
the app to change its name, icon, package id or version.

Built with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) from `twa-manifest.json`.

Runs on **Android 15 (API 35, 2024) and newer**; targets and compiles against Android 16 (API 36).
Toolchain: JDK 17, Android Gradle Plugin 8.9.1, Gradle 8.11.1, packages from Google and Maven Central.
`bubblewrap update` regenerates `build.gradle` files: afterwards switch any `jcenter()` back to
`mavenCentral()` and Java `VERSION_1_8` to `VERSION_17`.

## One-time setup

1. Tools: JDK 17 and the Android SDK command-line tools (Bubblewrap can download both).
2. Create the signing key (keep the file and both passwords safe; you need them for every update):

   ```
   keytool -genkeypair -v -keystore indypendance-upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   The keystore and passwords are never committed (`android/.gitignore`).
3. Print its SHA-256 fingerprint and add it to the site so Android trusts the app:

   ```
   keytool -list -v -keystore indypendance-upload.keystore -alias upload
   ```

   Set `ANDROID_CERT_SHA256` on the Cloud Run service to that fingerprint. Check
   `https://<site>/.well-known/assetlinks.json` lists it. Without this the app still
   works but shows a browser bar at the top.

## Build

```
cd android
npx @bubblewrap/cli build
```

This writes `app-release-signed.apk` (install directly on a phone) and
`app-release-bundle.aab` (upload to Google Play).

## Google Play

Upload the `.aab` in the Play Console. Play re-signs the app with its own key: copy
**App signing key certificate → SHA-256** from Play Console → Setup → App signing and
add it to `ANDROID_CERT_SHA256` (comma-separated after the upload key's).

## Updating the app

Bump `appVersionCode` (and `appVersionName`) in `twa-manifest.json`, run
`npx @bubblewrap/cli update`, then `build` again.
