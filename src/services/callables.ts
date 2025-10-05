import { app } from "@/firebaseConfig";
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions(app);

export async function adminCreateUser(payload: {
  loginId: string; name: string; email: string; phone?: string;
  role: "ADMIN"|"FACULTY"|"STUDENT"; password: string;
}) {
  const fn = httpsCallable(functions, "adminCreateUser");
  const res = await fn(payload);
  return res.data;
}

export async function adminUpdateUser(payload: {
  loginId: string; name?: string; email?: string; phone?: string;
  role?: "ADMIN"|"FACULTY"|"STUDENT"; password?: string;
}) {
  const fn = httpsCallable(functions, "adminUpdateUser");
  const res = await fn(payload);
  return res.data;
}

export async function adminDeleteUser(loginId: string) {
  const fn = httpsCallable(functions, "adminDeleteUser");
  const res = await fn({ loginId });
  return res.data;
}


export async function agentAllocate(requestId: string) {
  const fn = httpsCallable(functions, "agentAllocate");
  const res = await fn({ requestId });
  return res.data as any;
}
