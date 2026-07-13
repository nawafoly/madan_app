import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "index-599e8",
});

const db = getFirestore(app);

const collections = [
  "users",
  "admin_users",
  "admin_usernames",
  "employees",
];

for (const collectionName of collections) {
  try {
    const snapshot = await db.collection(collectionName).limit(1).get();
    console.log(`${collectionName}: OK (${snapshot.size})`);
  } catch (error) {
    console.error(
      `${collectionName}: FAILED`,
      error.code,
      error.message
    );
  }
}
