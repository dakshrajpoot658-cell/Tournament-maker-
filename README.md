# Tournament Maker — Android build

This is your Football Tournament Maker packaged as a normal Vite + React
web app, ready to be wrapped into an Android APK/AAB with Capacitor.
`src/App.jsx` is the exact app from before — only the storage layer was
swapped from Claude's in-chat storage to real browser `localStorage`
(see `src/main.jsx`), so nothing about the app's behavior changed.

## 1. Prerequisites (install once)

- [Node.js](https://nodejs.org) 18 or newer
- [Android Studio](https://developer.android.com/studio) (installs the Android SDK — required to actually produce an APK/AAB)
- A Java JDK (Android Studio installs one automatically)

## 2. First-time setup

Unzip this project, open a terminal in its folder, then:

```bash
npm install
```

## 3. Try it in a browser first (optional but recommended)

```bash
npm run dev
```

Open the printed localhost URL. Confirm tournaments save, reload, and
everything works before moving to Android.

## 4. Build the web app and add Android

```bash
npm run build
npx cap add android
npx cap sync
```

`npx cap add android` creates an `android/` folder — this is now a real
Android Studio project.

## 5. Open it in Android Studio

```bash
npx cap open android
```

This launches Android Studio with the project loaded.

## 6. Produce an APK or AAB

In Android Studio:

- **Build → Build Bundle(s) / APK(s) → Build APK(s)** — gives you a
  `.apk` you can install directly on a phone for testing (enable
  "Install unknown apps" on the phone, or use `adb install`).
- **Build → Generate Signed Bundle / APK → Android App Bundle** — walks
  you through creating a signing key and produces the `.aab` file
  required for uploading to the Google Play Store.

Keep the signing key (`.jks` file) and its passwords somewhere safe —
you'll need the exact same key for every future update to this app.

## 7. Making changes later

Edit `src/App.jsx` as needed, then repeat:

```bash
npm run build
npx cap sync
npx cap open android
```

## Notes

- App name and package ID (`com.yourname.tournamentmaker`) are set in
  `capacitor.config.json` — change `appId` before your first build if
  you want a different package name (it can't be changed later without
  publishing as a new app).
- Data is stored locally on the device via `localStorage`. Uninstalling
  the app clears saved tournaments, same as any local-only app.
- To also target iOS later: `npx cap add ios` (requires a Mac + Xcode).
