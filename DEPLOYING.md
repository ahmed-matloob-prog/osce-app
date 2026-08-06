# Deploying

## Locking down Firestore

The database currently allows anyone to read and write it. The rules in
[`firestore.rules`](firestore.rules) fix that, but they require the app to sign
in first — so **the order below matters.** Deploying the rules before the app
that authenticates will lock out a working app and stop sync dead.

### 1. Enable anonymous sign-in

Firebase console → your project → **Authentication** → **Sign-in method** →
**Anonymous** → enable → Save.

The app has no user accounts, so there is nothing to log in with. An anonymous
session exists purely so the rules can require that a request carries *some*
identity rather than none at all.

Nothing breaks if you do this early. The app tolerates sign-in failure, so it
works either side of this switch.

### 2. Deploy the app

Push to `main`, or however you normally trigger the Vercel build. Confirm the
deployed app has the sign-in code before moving on — open it, and check the
browser console does **not** show:

> Anonymous sign-in failed. Enable Authentication → Sign-in method → Anonymous

If you see that after step 1, the deployed build predates the auth change.

Also confirm the `VITE_FIREBASE_*` variables are set in Vercel's environment
settings. Without them the deployed app has no cloud sync at all — it will run
fine and silently keep everything on-device.

### 3. Deploy the rules

```bash
firebase login          # one-off, opens a browser
firebase deploy --only firestore:rules
```

`firebase.json` and `.firebaserc` are committed, so no `firebase init` is
needed. To preview without applying, paste the file into
Firebase console → Firestore Database → Rules and use the playground.

### 4. Check it worked

From any machine, with no credentials:

```bash
curl -s "https://firestore.googleapis.com/v1/projects/skill-lab-web/databases/(default)/documents/candidates?key=YOUR_WEB_API_KEY" | head
```

Before: student records. After: `PERMISSION_DENIED`.

Then open the app and confirm sync still works — Settings → Sync Now should
report success, not an error.

### What this does and does not buy you

It stops casual access. Nobody can read your students' names and marks with a
plain HTTP request any more.

It does **not** stop a determined person, because anyone can create an
anonymous session of their own. Turn on **App Check** as well (Firebase console
→ App Check → register the web app with reCAPTCHA), which requires requests to
come from your app rather than from a script.

Real access control — where an examiner sees only their own institution's exams
— needs real accounts. That is Phase 1 of the commercial plan.

---

## Test builds

`npm run build` inlines the real Firebase credentials from `.env` into the
bundle. Anything that then drives that build — a browser test, a local demo, a
screenshot run — writes real documents into the live project.

For anything other than a production deploy:

```bash
npm run build:test
```

This builds against `.env.test`, whose placeholder project id is rejected by
`isFirebaseConfigured()`, so the app cannot reach the network at all.
