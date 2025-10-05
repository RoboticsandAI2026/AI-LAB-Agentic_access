
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

type Role = "ADMIN" | "FACULTY" | "STUDENT";
type SystemType = "i7" | "i9";

export interface RequestDoc {
  id: string;
  loginId: string;
  requesterName: string;
  role: Role;
  purpose: string;
  date: string;
  inTime: string;
  outTime: string;
  numSystems: number;
  status: "pending" | "accepted" | "rejected";
}

export interface AllocationDoc {
  id: string;
  requestId: string;
  loginId: string;
  requesterName: string;
  systems: number[];
  date: string;
  inTime: string;
  outTime: string;
  createdAt?: Timestamp;
  createdBy: string;
}

export interface SystemDoc {
  id: string;
  systemNumber: number;
  type: SystemType;
  status: "available" | "occupied" | "maintenance" | "reserved";
}

const RESERVED_I7 = 2;
const RESERVED_I9 = 3;

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function overlaps(aS: number, aE: number, bS: number, bE: number) {
  return Math.max(aS, bS) < Math.min(aE, bE);
}

export async function agentAllocateSingle(requestId: string) {
  const db = getFirestore();

  const rqRef = db.doc(`requests/${requestId}`);
  const rqSnap = await rqRef.get();
  if (!rqSnap.exists) return { ok: false, reason: "request_not_found" };
  const req = rqSnap.data() as RequestDoc;
  if (req.status !== "pending") return { ok: false, reason: "not_pending" };

  const sysSnap = await db.collection("systems").orderBy("systemNumber").get();
  const systems: SystemDoc[] = sysSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const i7Nums = systems.filter(s => s.type === "i7").map(s => s.systemNumber).sort((a,b)=>a-b);
  const i9Nums = systems.filter(s => s.type === "i9").map(s => s.systemNumber).sort((a,b)=>a-b);
  const reservedI7 = new Set(i7Nums.slice(-RESERVED_I7));
  const reservedI9 = new Set(i9Nums.slice(-RESERVED_I9));

  const allSnap = await db.collection("allocations").where("date","==", req.date).get();
  const allocations: AllocationDoc[] = allSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const s = toMinutes(req.inTime);
  const e = toMinutes(req.outTime);

  const busy = new Set<number>();
  allocations.forEach(a => {
    const s2 = toMinutes(a.inTime), e2 = toMinutes(a.outTime);
    if (overlaps(s, e, s2, e2)) {
      a.systems.forEach(n => busy.add(n));
    }
  });

  const nonReservedFree: number[] = [];
  systems.forEach(sys => {
    const isRes = sys.type === "i7" ? reservedI7.has(sys.systemNumber) : reservedI9.has(sys.systemNumber);
    if (isRes) return;
    if (busy.has(sys.systemNumber)) return;
    if (sys.status === "maintenance") return;
    nonReservedFree.push(sys.systemNumber);
  });

  const need = Math.max(1, req.numSystems || 1);
  if (nonReservedFree.length >= need) {
    const chosen = nonReservedFree.slice(0, need);
    const planId = `alloc_${req.id}_${Date.now()}`;
    await db.runTransaction(async (tx) => {
      tx.set(db.doc(`allocations/${planId}`), {
        id: planId,
        requestId: req.id,
        loginId: req.loginId,
        requesterName: req.requesterName,
        systems: chosen,
        date: req.date,
        inTime: req.inTime,
        outTime: req.outTime,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "agent",
      } as AllocationDoc);
      tx.update(db.doc(`requests/${req.id}`), { status: "accepted", updatedAt: FieldValue.serverTimestamp() });
    });
    return { ok: true, mode: "direct", chosen, reshuffles: [] as Array<{moveAllocationId:string;from:number;to:number}> };
  }

  const sysToOverlaps = new Map<number, AllocationDoc[]>();
  allocations.forEach(a => {
    const s2 = toMinutes(a.inTime), e2 = toMinutes(a.outTime);
    if (!overlaps(s, e, s2, e2)) return;
    a.systems.forEach(n => {
      const arr = sysToOverlaps.get(n) || [];
      arr.push(a);
      sysToOverlaps.set(n, arr);
    });
  });

  const reshuffles: Array<{ moveAllocationId: string; from: number; to: number; }> = [];
  const chosen: number[] = [];

  const nonReservedAll = systems
    .filter(sys => !(sys.type === "i7" ? reservedI7.has(sys.systemNumber) : reservedI9.has(sys.systemNumber)))
    .map(s => s.systemNumber);

  for (const sysNum of nonReservedAll) {
    if (!busy.has(sysNum)) {
      chosen.push(sysNum);
      if (chosen.length >= need) break;
      continue;
    }
    const overlapsForSys = sysToOverlaps.get(sysNum) || [];
    let freed = false;
    for (const alloc of overlapsForSys) {
      const s2 = toMinutes(alloc.inTime), e2 = toMinutes(alloc.outTime);
      const busyForAlloc = new Set<number>();
      allocations.forEach(a => {
        if (a.id === alloc.id) return;
        const s3 = toMinutes(a.inTime), e3 = toMinutes(a.outTime);
        if (overlaps(s2, e2, s3, e3)) a.systems.forEach(n => busyForAlloc.add(n));
      });
      const candidateTargets = nonReservedAll.filter(n => !busyForAlloc.has(n) && n !== sysNum);
      if (candidateTargets.length > 0) {
        const target = candidateTargets[0];
        reshuffles.push({ moveAllocationId: alloc.id, from: sysNum, to: target });
        busy.delete(sysNum);
        alloc.systems = alloc.systems.map(n => (n === sysNum ? target : n));
        freed = true;
        break;
      }
    }
    if (freed) {
      chosen.push(sysNum);
      if (chosen.length >= need) break;
    }
  }

  if (chosen.length >= need) {
    await db.runTransaction(async (tx) => {
      for (const r of reshuffles) {
        const ref = db.doc(`allocations/${r.moveAllocationId}`);
        const snap = await tx.get(ref);
        if (!snap.exists) continue;
        const data = snap.data() as AllocationDoc;
        data.systems = data.systems.map(n => (n === r.from ? r.to : n));
        tx.update(ref, { systems: data.systems, updatedAt: FieldValue.serverTimestamp() });
      }
      const planId = `alloc_${req.id}_${Date.now()}`;
      tx.set(db.doc(`allocations/${planId}`), {
        id: planId,
        requestId: req.id,
        loginId: req.loginId,
        requesterName: req.requesterName,
        systems: chosen.slice(0, need),
        date: req.date,
        inTime: req.inTime,
        outTime: req.outTime,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "agent",
      } as AllocationDoc);
      tx.update(db.doc(`requests/${req.id}`), { status: "accepted", updatedAt: FieldValue.serverTimestamp() });
    });
    return { ok: true, mode: "minimal_reshuffle", chosen: chosen.slice(0, need), reshuffles };
  }

  await rqRef.update({
    status: "rejected",
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: false, reason: "no_feasible_plan" };
}
