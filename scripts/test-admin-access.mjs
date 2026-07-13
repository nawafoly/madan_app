import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const app = initializeApp({
  credential: applicationDefault(),
  projectId: "index-599e8",
});

console.log("PROJECT:", app.options.projectId);

try {
  const result = await getAuth(app).listUsers(1);
  console.log("AUTH OK:", result.users.length);
} catch (error) {
  console.error("AUTH FAILED:", error.code, error.message);
}

try {
  const result = await getFirestore(app)
    .collection("users")
    .limit(1)
    .get();

  console.log("FIRESTORE OK:", result.size);
} catch (error) {
  console.error("FIRESTORE FAILED:", error.code, error.message);
}
