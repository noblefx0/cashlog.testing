CASHLOG V5 — TEST BUILD

This project is organised as a multi-file web app. Open this folder in VS Code.

FILES
- index.html: app entry point and shared shell.
- css/style.css: monochrome styling, splash animation and transitions.
- js/firebase.js: existing Firebase project configuration and SDK setup.
- js/app.js: authentication, navigation, data loading, records and reports.
- js/screens/*.html: individual screen markup loaded into the app shell.
- assets/wallet-logo.svg: Cashlog wallet monogram.

IMPORTANT TESTING
1. Keep V4 and your current public repository unchanged.
2. Test this V5 in a separate GitHub Pages repository first.
3. Firebase authorised domains use hostnames only. If your existing GitHub Pages hostname is already authorised, the test repository under that same username.github.io hostname normally uses the same authorised domain.
4. Email/password sign-up now sends a Firebase verification link. Unverified email/password accounts are blocked from loading records until verified. Google sign-in is not blocked by this email/password verification gate.
5. Existing Google users can still link a password to the same Firebase account.
6. Before public release, verify Firestore security rules enforce request.auth.uid == uid for every users/{uid}/... collection. This code does not change Firestore rules.

DEPLOY
Upload the contents of this folder to the root of your GitHub Pages test repository. index.html must remain at the repository root.

NOTES
- Firebase configuration and existing collection paths are preserved from V4.
- No live Firebase test was performed during build. Test sign-up, verification, Google login, password linking, and records using a separate test account before public deployment.


V5 STARTUP FIX
--------------
The main page now loads the five screen HTML fragments first, then starts js/app.js.
Keep index.html, assets/, css/, and js/ together in the same publishing folder.
Run with Live Server or GitHub Pages; do not open index.html as a file:// URL.
If a screen file fails to load, the splash screen now closes and displays a startup error.
