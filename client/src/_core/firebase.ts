// client/src/_core/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FB_API_KEY ?? "").trim(),
  authDomain: (import.meta.env.VITE_FB_AUTH_DOMAIN ?? "").trim(),
  projectId: (import.meta.env.VITE_FB_PROJECT_ID ?? "").trim(),
  storageBucket:
    (
      import.meta.env.VITE_FB_STORAGE_BUCKET ??
      `${import.meta.env.VITE_FB_PROJECT_ID}.appspot.com`
    ).trim(),
  messagingSenderId: (import.meta.env.VITE_FB_MESSAGING_SENDER_ID ?? "").trim(),
  appId: (import.meta.env.VITE_FB_APP_ID ?? "").trim(),
};

// =========================
// ✅ تحقق من المتغيرات المهمة
// =========================
const required = [
  ["VITE_FB_API_KEY", firebaseConfig.apiKey],
  ["VITE_FB_AUTH_DOMAIN", firebaseConfig.authDomain],
  ["VITE_FB_PROJECT_ID", firebaseConfig.projectId],
  ["VITE_FB_APP_ID", firebaseConfig.appId],
] as const;

const missing = required.filter(([, v]) => !v).map(([k]) => k);

if (missing.length > 0) {
  console.warn(
    `[Firebase] Missing env vars: ${missing.join(", ")}. ` +
      `Check .env.local at repo root and restart Vite.`
  );
}

// =========================
// ✅ منع إعادة التهيئة مع HMR
// =========================
const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

// =========================
// Auth
// =========================
export const auth = getAuth(app);

// =========================
// Firestore (بسيط + مستقر)
// =========================
export const db = getFirestore(app);

// =========================
// ✅ تشخيص وقت التطوير فقط
// =========================
if (import.meta.env.DEV) {
  // @ts-ignore
  window.__fb = {
    app,
    auth,
    db,
    firebaseConfig,
  };
}
