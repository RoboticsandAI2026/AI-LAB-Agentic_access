import admin from "firebase-admin";
import fs from "fs";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});
const auth = admin.auth();
const db = admin.firestore();

const admins = [
  {
    loginId: "A0001",
    name: "Admin One",
    email: "admin1@sastra.ac.in",
    phone: "+911234567890",   // or leave "" if you don't want to set
    password: "Admin1@Strong", // <-- choose strong passwords
    role: "ADMIN",
  },
  {
    loginId: "A0002",
    name: "Admin Two",
    email: "admin2@sastra.ac.in",
    phone: "+919876543210",
    password: "Admin2@Strong",
    role: "ADMIN",
  },
];

for (const a of admins) {
  try {
    let u;
    try {
      u = await auth.getUserByEmail(a.email);
      console.log(`[seed] found auth user for ${a.email}`);
    } catch {
      u = await auth.createUser({
        email: a.email,
        password: a.password,
        displayName: a.name,
        phoneNumber: a.phone && /^\+/.test(a.phone) ? a.phone : undefined,
      });
      console.log(`[seed] created auth user ${a.email}`);
    }
    await auth.setCustomUserClaims(u.uid, { role: a.role });

    await db.doc(`users/${a.loginId}`).set({
      loginId: a.loginId,
      name: a.name,
      email: a.email,
      phone: a.phone || null,
      role: a.role,
      uid: u.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`[seed] upserted profile users/${a.loginId}`);
  } catch (e) {
    console.error(`[seed] failed for ${a.email}`, e);
  }
}
console.log("Done.");
