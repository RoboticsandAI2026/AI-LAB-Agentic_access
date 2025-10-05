import {
  collection, doc, getDoc, setDoc, serverTimestamp,
  query, where, orderBy, onSnapshot, addDoc, updateDoc
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { UserProfile } from "@/types/db";

// Profiles live at: users/{loginId}
export async function getUserProfileByLoginId(loginId: string) {
  const ref = doc(db, "users", loginId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function upsertUserProfile(u: UserProfile) {
  const ref = doc(db, "users", u.loginId);
  await setDoc(ref, {
    ...u,
    updatedAt: serverTimestamp(),
    createdAt: u.createdAt ?? serverTimestamp(),
  }, { merge: true });
  return u;
}

/* -------- Optional request helpers if you persist student/faculty requests later --------
export function listenUsers(cb: (rows: UserProfile[]) => void) {
  const qy = query(collection(db, "users"), orderBy("createdAt", "desc"));
  return onSnapshot(qy, (snap) => cb(snap.docs.map(d => d.data() as UserProfile)));
}
*/
