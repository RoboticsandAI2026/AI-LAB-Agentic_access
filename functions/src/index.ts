import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

setGlobalOptions({
  region: "asia-south1", // pick your region (optional)
  maxInstances: 10
});

initializeApp();
const auth = getAuth();
const db = getFirestore();

type Role = "ADMIN" | "FACULTY" | "STUDENT";

function ensureAdmin(context: Parameters<ReturnType<typeof onCall>>[0]["context"]) {
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }
  const claims = context.auth.token as any;
  if (claims.role !== "ADMIN") {
    throw new HttpsError("permission-denied", "Admins only");
  }
}

function normalizePhone(phone?: string | null) {
  if (!phone) return null;
  return /^\+[\d]{8,15}$/.test(phone) ? phone : null;
}

// ---------------- EXISTING ADMIN CALLABLES (leave as-is) ----------------

export const adminCreateUser = onCall(async (request) => {
  const { data, context } = request;
  ensureAdmin(context);

  const { loginId, name, email, phone, role, password } = (data || {}) as {
    loginId: string; name: string; email: string; phone?: string; role: Role; password: string;
  };

  if (!loginId || !name || !email || !role || !password) {
    throw new HttpsError("invalid-argument", "Missing required fields: loginId, name, email, role, password");
  }

  let u;
  try {
    u = await auth.getUserByEmail(email);
  } catch {
    u = await auth.createUser({
      email,
      password,
      displayName: name,
      phoneNumber: normalizePhone(phone) || undefined
    });
  }

  await auth.setCustomUserClaims(u.uid, { role });

  const ref = db.doc(`users/${loginId}`);
  await ref.set({
    loginId,
    name,
    email,
    phone: phone || null,
    role,
    uid: u.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true, uid: u.uid };
});

export const adminUpdateUser = onCall(async (request) => {
  const { data, context } = request;
  ensureAdmin(context);

  const { loginId, name, email, phone, role, password } = (data || {}) as {
    loginId: string; name?: string; email?: string; phone?: string; role?: Role; password?: string;
  };

  if (!loginId) throw new HttpsError("invalid-argument", "loginId required");

  const ref = db.doc(`users/${loginId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Profile not found");

  const prof = snap.data() as any;

  let uid: string | undefined = prof?.uid;
  if (!uid) {
    if (prof?.email) {
      try { uid = (await auth.getUserByEmail(prof.email)).uid; } catch {}
    }
    if (!uid && email) {
      uid = (await auth.getUserByEmail(email)).uid;
    }
  }

  if (uid) {
    await auth.updateUser(uid, {
      email: email || undefined,
      displayName: name || undefined,
      phoneNumber: normalizePhone(phone) || undefined,
      password: password || undefined
    });
    if (role) await auth.setCustomUserClaims(uid, { role });
  }

  await ref.set({
    name: name ?? prof.name,
    email: email ?? prof.email,
    phone: phone ?? prof.phone ?? null,
    role: role ?? prof.role,
    uid: uid ?? prof.uid ?? null,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { ok: true };
});

export const adminDeleteUser = onCall(async (request) => {
  const { data, context } = request;
  ensureAdmin(context);

  const { loginId } = (data || {}) as { loginId: string };
  if (!loginId) throw new HttpsError("invalid-argument", "loginId required");

  const ref = db.doc(`users/${loginId}`);
  const snap = await ref.get();
  if (snap.exists) {
    const prof = snap.data() as any;
    try {
      if (prof?.email) {
        const u = await auth.getUserByEmail(prof.email);
        await auth.deleteUser(u.uid);
      }
    } catch {}
    await ref.delete();
  }

  return { ok: true };
});

// ---------------- NEW: pre-login resolver (no auth required) ----------------

/**
 * Client calls this BEFORE sign-in to map a campus loginId (A0001 / F1234 / S...) to email.
 * Returns the minimum needed for login & redirect: { email, role, name, loginId }.
 */
export const resolveLoginEmail = onCall(async ({ data }) => {
  const loginId = (data as any)?.loginId as string | undefined;
  if (!loginId) throw new HttpsError("invalid-argument", "loginId required");

  const snap = await db.doc(`users/${loginId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Profile not found");

  const prof = snap.data() as any;
  if (!prof?.email) throw new HttpsError("failed-precondition", "Email not set for this loginId");

  return {
    loginId,
    email: prof.email,
    role: prof.role ?? null,
    name: prof.name ?? ""
  };
});


import { onCall as onCallV2 } from "firebase-functions/v2/https";
import { agentAllocateSingle } from "./agent";

export const agentAllocate = onCallV2(async (req) => {
  const data = (req.data || {}) as Record<string, unknown>;
  const requestId = String(data.requestId || "").trim();
  if (!requestId) {
    throw new Error("requestId required");
  }
  const result = await agentAllocateSingle(requestId);
  return result;
});
