# Crafty Central — Firebase setup (one-time, ~10 minutes)

Until you do this, the app runs in **local demo mode** (fake people, data stays
on one device). After it, everyone gets a real login and shares the same live
data — chat, jobs, schedules, everything.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. **Create a project** → name it `crafty-central` (Google Analytics: off is fine).

## 2. Turn on logins

1. In the left sidebar: **Build → Authentication → Get started**.
2. Pick **Email/Password** → toggle **Enable** → Save.

## 3. Create the database

1. **Build → Firestore Database → Create database**.
2. Choose **Start in production mode**.
3. Location: pick `northamerica-northeast2` (Toronto).
4. Once created, open the **Rules** tab, replace everything with this, then **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /inquiries/{doc} {
      allow create: if request.resource.data.company is string
        && request.resource.data.company.size() < 200;
      allow read, update, delete: if request.auth != null;
    }
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

The `inquiries` block is what makes the public outreach form
(`outreach.html`) work: anyone can *submit* an inquiry, but only
signed-in team members can read or act on them.

This means: nobody can touch the data without being logged in, and anyone who
IS logged in (i.e. your team) can read and write. Fine for a small trusted
crew; per-role rules can be tightened later.

## 4. Connect the app

1. Click the **gear icon → Project settings**, scroll to **Your apps**.
2. Click the **`</>` (Web)** icon → nickname `Crafty Central` → Register
   (no need for Firebase Hosting here).
3. Copy the `firebaseConfig = { ... }` object it shows you.
4. Open `firebase-config.js` in this folder and replace `null` with that
   object, so it reads `window.FIREBASE_CONFIG = { apiKey: ... };`
5. Reload the site. You should see the Crafty sign-in screen.

## 5. First accounts

- **The first account created becomes the admin** — so create yours first
  ("First time here? Create your account").
- Then add your team in **Directory** (name, role, and — important — the
  **email** they'll sign up with). When they create their account with that
  email, it links to their directory entry automatically and they get the
  role you set. Anyone who signs up with an email you *haven't* added comes
  in as crew.

## 6. When you host it (GitHub Pages etc.)

Firebase only allows logins from approved domains. Add yours:
**Authentication → Settings → Authorized domains → Add domain**
(e.g. `kristianwood.github.io`). `localhost` is already allowed.

## What still lives on each device

Read/unread state (chat dots, notification dot) is per device on purpose.
Push notifications (phone buzzes when the app is closed) are a separate step
— Firebase Cloud Messaging — not wired up yet.
