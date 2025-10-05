/**
 * seedAdmins.js
 * Run with: node seedAdmins.js
 */

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

const admins = [
  {
    loginId: "A0001",
    email: "venkatesh@eee.sastra.edu",
    password: "admin1",
    name: "T. Venkatesh",
  },
  {
    loginId: "A0002",
    email: "126179012@sastra.ac.in",
    password: "admin2",
    name: "Karthikeya",
  },
  {
    loginId: "A0003",
    email: "126179030@sastra.ac.in",
    password: "admin3",
    name: "Vaishnavi",
  },
];

async function seedAdmins() {
  for (const a of admins) {
    try {
      // 1) Create or get Auth user
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(a.email);
        console.log(`[INFO] User already exists: ${a.email}`);
      } catch {
        userRecord = await auth.createUser({
          email: a.email,
          password: a.password,
          displayName: a.name,
        });
        console.log(`[CREATE] Auth user created: ${a.email}`);
      }

      const uid = userRecord.uid;

      // 2) Set custom claim
      await auth.setCustomUserClaims(uid, { role: "ADMIN" });

      // 3) Firestore profile
      await db.doc(`users/${uid}`).set(
        {
          uid,
          loginId: a.loginId,
          email: a.email,
          name: a.name,
          role: "ADMIN",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // 4) Login lookup
      await db.doc(`loginLookup/${a.loginId}`).set({
        email: a.email,
        uid,
      });

      console.log(`[DONE] Admin ${a.loginId} seeded.`);
    } catch (err) {
      console.error(`[ERROR] Seeding ${a.loginId}:`, err.message);
    }
  }

  console.log("✅ All admins processed");
  process.exit(0);
}

seedAdmins();
