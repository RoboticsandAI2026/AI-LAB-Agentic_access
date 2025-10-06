// src/pages/AdminDashboard.tsx
import { useCallback, useEffect, useMemo, useState } from "react";

// shadcn/ui (kept as separate imports to match your project)
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle as DlgTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Icons
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Calendar,
  CalendarDays,
  CheckCircle,
  Clock,
  Database,
  Eye,
  Hand,
  Monitor,
  Settings,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";

// Toast hook
import { useToast } from "@/hooks/use-toast";

// Firebase
import { db } from "@/firebaseConfig";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

// AI allocator (use yours as-is)
import { agentAllocate } from "@/services/callables";

// ------------------------------ Types ------------------------------
type Role = "student" | "faculty" | "admin";
type SystemStatus = "available" | "occupied" | "reserved" | "maintenance";

type AllocatedTo = {
  loginId: string;
  name: string;
  timeSlot: string; // "HH:mm-HH:mm"
};

type SystemRow = {
  id: string;
  systemNumber: number; // 1..33
  type: "i9" | "i7";
  status: SystemStatus;
  allocatedTo?: AllocatedTo | null;
  createdAt?: any;
  updatedAt?: any;
};

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

interface PendingRequest {
  id: string;
  requesterName: string;
  loginId: string;
  role: "student" | "faculty";
  purpose: string;
  date: string; // yyyy-mm-dd
  inTime: string; // HH:mm
  outTime: string; // HH:mm
  numSystems?: number;
  numStudents?: number;
  submittedAt?: any;
  status: RequestStatus;
  uid: string;
  allocatedSystems?: number[];
  unavailability?: boolean; // UI flag
}

type AllocationRec = {
  date: string; // yyyy-mm-dd
  slotIdx: number; // 0..13
  systemNumber: number; // 1..33
  requestId: string;
  loginId: string;
  requesterName: string;
  purpose: string;
  inTime: string; // HH:mm
  outTime: string; // HH:mm
  createdAt: any;
};

// ------------------------------ Constants & helpers ------------------------------
const OPEN_MINUTES = 8 * 60; // 08:00
const CLOSE_MINUTES = 22 * 60; // 22:00
const SLOT_COUNT = 14;
const SLOT_BLOCK_MIN = (CLOSE_MINUTES - OPEN_MINUTES) / SLOT_COUNT; // 60

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(aStart, bStart) < Math.min(aEnd, bEnd);

const slotLabel = (i: number) => {
  const s = OPEN_MINUTES + i * SLOT_BLOCK_MIN;
  const e = s + SLOT_BLOCK_MIN;
  const fmt = (t: number) =>
    `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(
      2,
      "0"
    )}`;
  return `${fmt(s)}–${fmt(e)}`;
};

const rangeKey = (date: string, sys: number, slotIdx: number) =>
  `${date}__sys${sys}__slot${slotIdx}`;

const slotsCovered = (inTime: string, outTime: string) => {
  const s = toMin(inTime);
  const e = toMin(outTime);
  const list: number[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const S = OPEN_MINUTES + i * SLOT_BLOCK_MIN;
    const E = S + SLOT_BLOCK_MIN;
    if (overlap(s, e, S, E)) list.push(i);
  }
  return list;
};

// ------------------------------ Component ------------------------------
export default function AdminDashboard() {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [allocations, setAllocations] = useState<Record<string, AllocationRec>>(
    {}
  );
  const [seeding, setSeeding] = useState(false);

  // Manual allocation dialog
  const [allocOpen, setAllocOpen] = useState(false);
  const [allocBusy, setAllocBusy] = useState(false);
  const [allocTarget, setAllocTarget] = useState<PendingRequest | null>(null);
  const [allocSystemText, setAllocSystemText] = useState("");
  const [allocTime, setAllocTime] = useState("");

  // Admin identity (basic)
  const user = useMemo(
    () => ({
      name: localStorage.getItem("name") || "Admin",
      loginId: localStorage.getItem("loginId") || "A0001",
      role: "admin" as Role,
      email: localStorage.getItem("email") || "",
    }),
    []
  );

  // -------------------- Firestore listeners --------------------
  useEffect(() => {
    const qSys = query(
      collection(db, "systems"),
      orderBy("systemNumber", "asc")
    );
    const unsubSys = onSnapshot(qSys, (snap) => {
      setSystems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    const qReq = query(
      collection(db, "requests"),
      where("status", "==", "pending")
    );
    const unsubReq = onSnapshot(qReq, (snap) => {
      const rows: PendingRequest[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      rows.sort((a: any, b: any) => {
        const ta = a?.submittedAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = b?.submittedAt?.toDate?.()?.getTime?.() ?? 0;
        return tb - ta;
      });
      setPendingRequests(rows);
    });

    return () => {
      unsubSys();
      unsubReq();
    };
  }, []);

  // allocations for selected date
  useEffect(() => {
    const qAlloc = query(
      collection(db, "allocations"),
      where("date", "==", selectedDate)
    );
    const unsub = onSnapshot(qAlloc, (snap) => {
      const map: Record<string, AllocationRec> = {};
      snap.forEach((d) => {
        map[d.id] = d.data() as AllocationRec;
      });
      setAllocations(map);
    });
    return () => unsub();
  }, [selectedDate]);

  // -------------------- Seed systems (first run) --------------------
  const seedSystems = async () => {
    try {
      setSeeding(true);
      const existing = await getDocs(collection(db, "systems"));
      if (!existing.empty) {
        toast({
          title: "Systems exist",
          description: "No seeding needed.",
        });
        return;
      }
      const batch = writeBatch(db);
      for (let i = 1; i <= 33; i++) {
        const type = i <= 14 ? "i9" : "i7";
        batch.set(doc(db, "systems", `system_${i}`), {
          systemNumber: i,
          type,
          status: "available" as SystemStatus,
          allocatedTo: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      toast({ title: "Seeded", description: "33 systems created." });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Seed failed",
        description: e?.message || "Unable to seed.",
      });
    } finally {
      setSeeding(false);
    }
  };

  // -------------------- Toggles --------------------
  const handleMaintenanceToggle = async (
    systemNumber: number,
    toMaintenance: boolean
  ) => {
    const sys = systems.find((s) => s.systemNumber === systemNumber);
    if (!sys) return;
    await updateDoc(doc(db, "systems", sys.id), {
      status: toMaintenance ? "maintenance" : "available",
      ...(toMaintenance ? { allocatedTo: null } : {}),
      updatedAt: serverTimestamp(),
    });
  };

  const handleReserveToggle = async (
    systemNumber: number,
    toReserved: boolean
  ) => {
    const sys = systems.find((s) => s.systemNumber === systemNumber);
    if (!sys) return;
    await updateDoc(doc(db, "systems", sys.id), {
      status: toReserved ? "reserved" : "available",
      ...(toReserved ? { allocatedTo: null } : {}),
      updatedAt: serverTimestamp(),
    });
  };

  // -------------------- Availability helpers --------------------
  const systemsUnavailableForRange = useCallback(
    (date: string, inTime: string, outTime: string) => {
      const span = slotsCovered(inTime, outTime);
      const busy = new Set<number>();
      systems.forEach((s) => {
        if (s.status === "maintenance") busy.add(s.systemNumber);
      });
      Object.values(allocations).forEach((rec) => {
        if (rec.date !== date) return;
        if (span.includes(rec.slotIdx)) busy.add(rec.systemNumber);
      });
      return busy;
    },
    [allocations, systems]
  );

  const freeSystemsForRange = useCallback(
    (
      date: string,
      inTime: string,
      outTime: string,
      opts?: { excludeReservedForAI?: boolean }
    ) => {
      const busy = systemsUnavailableForRange(date, inTime, outTime);
      return systems
        .filter((s) => {
          if (busy.has(s.systemNumber)) return false;
          if (opts?.excludeReservedForAI && s.status === "reserved") return false;
          return s.status !== "maintenance";
        })
        .map((s) => s.systemNumber);
    },
    [systems, systemsUnavailableForRange]
  );

  // -------------------- Allocation core --------------------
  const writeAllocations = async (
    req: PendingRequest,
    systemNumbers: number[],
    slotText: string
  ) => {
    const [inTime, outTime] = slotText.split("-");
    const span = slotsCovered(inTime, outTime);
    const batch = writeBatch(db);

    // 1) mark systems reserved + label
    systemNumbers.forEach((n) => {
      const sys = systems.find((s) => s.systemNumber === n)!;
      batch.update(doc(db, "systems", sys.id), {
        status: "reserved" as SystemStatus,
        allocatedTo: {
          loginId: req.loginId,
          name: req.requesterName,
          timeSlot: `${inTime}-${outTime}`,
        },
        updatedAt: serverTimestamp(),
      });
    });

    // 2) per-slot docs
    span.forEach((slotIdx) => {
      systemNumbers.forEach((n) => {
        const id = rangeKey(req.date, n, slotIdx);
        batch.set(doc(db, "allocations", id), {
          date: req.date,
          slotIdx,
          systemNumber: n,
          requestId: req.id,
          loginId: req.loginId,
          requesterName: req.requesterName,
          purpose: req.purpose,
          inTime,
          outTime,
          createdAt: serverTimestamp(),
        } as AllocationRec);
      });
    });

    // 3) update request
    batch.update(doc(db, "requests", req.id), {
      status: "approved",
      allocatedSystems: systemNumbers,
      reviewedAt: serverTimestamp(),
      reviewerLoginId: user.loginId,
    });

    await batch.commit();
  };

  // Manual allocate dialog open
  const openAllocate = (req: PendingRequest) => {
    setAllocTarget(req);
    setAllocSystemText("");
    setAllocTime(`${req.inTime}-${req.outTime}`);
    const free = freeSystemsForRange(req.date, req.inTime, req.outTime, {
      excludeReservedForAI: false,
    });
    const unavailability = free.length === 0;
    setPendingRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, unavailability } : r))
    );
    setAllocOpen(true);
  };

  const parseSystems = (text: string): number[] =>
    text
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 1000);

  const handleAllocateConfirm = async () => {
    if (!allocTarget) return;
    const nums = parseSystems(allocSystemText);
    if (nums.length === 0) {
      toast({
        variant: "destructive",
        title: "Enter system numbers",
        description: "e.g., 1, 2, 15",
      });
      return;
    }
    if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(allocTime)) {
      toast({
        variant: "destructive",
        title: "Invalid slot",
        description: "Use HH:mm-HH:mm (e.g., 10:00-12:00)",
      });
      return;
    }
    // validate
    const missing = nums.filter((n) => !systems.some((s) => s.systemNumber === n));
    if (missing.length) {
      toast({
        variant: "destructive",
        title: "Invalid systems",
        description: `Not found: ${missing.join(", ")}`,
      });
      return;
    }
    const [inTime, outTime] = allocTime.split("-");
    const span = slotsCovered(inTime, outTime);
    const conflicts = nums.filter((n) =>
      span.some((i) => allocations[rangeKey(allocTarget.date, n, i)])
    );
    const maint = nums.filter(
      (n) => systems.find((s) => s.systemNumber === n)?.status === "maintenance"
    );
    if (maint.length) {
      toast({
        variant: "destructive",
        title: "Maintenance systems selected",
        description: maint.join(", "),
      });
      return;
    }
    if (conflicts.length) {
      toast({
        variant: "destructive",
        title: "Slot conflict",
        description: `Booked: ${conflicts.join(", ")}`,
      });
      return;
    }

    setAllocBusy(true);
    try {
      await writeAllocations(allocTarget, nums, allocTime);
      toast({
        title: "Allocated (Manual)",
        description: `Systems #${nums.join(", #")} → ${allocTarget.requesterName}`,
      });
      setAllocOpen(false);
      setAllocTarget(null);
      setAllocSystemText("");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Allocate failed",
        description: e?.message || "Error",
      });
    } finally {
      setAllocBusy(false);
    }
  };

  // AI allocate
  const handleAiAllocate = async (req: PendingRequest) => {
    const need = Math.max(1, req.numSystems || 1);
    const free = freeSystemsForRange(req.date, req.inTime, req.outTime, {
      excludeReservedForAI: true,
    });
    if (free.length < need) {
      setPendingRequests((prev) =>
        prev.map((r) => (r.id === req.id ? { ...r, unavailability: true } : r))
      );
      toast({
        variant: "destructive",
        title: "Insufficient availability",
        description: `Need ${need}, free ${free.length}`,
      });
      return;
    }
    let chosen: number[] = [];
    try {
      const sysMeta = systems
        .filter((s) => free.includes(s.systemNumber))
        .map((s) => ({ systemNumber: s.systemNumber, type: s.type }));
      const reqMeta = {
        role: req.role,
        need,
        date: req.date,
        inTime: req.inTime,
        outTime: req.outTime,
      };
      const ai = await agentAllocate(sysMeta, reqMeta);
      if (Array.isArray(ai) && ai.length >= need) chosen = ai.slice(0, need);
    } catch {
      /* fallback heuristic */
    }

    if (chosen.length < need) {
      const prefer = req.role === "faculty" ? "i9" : "i7";
      chosen = systems
        .filter((s) => free.includes(s.systemNumber))
        .sort((a, b) => (a.type === prefer ? -1 : 1))
        .slice(0, need)
        .map((s) => s.systemNumber);
    }

    // race guard
    const span = slotsCovered(req.inTime, req.outTime);
    const ok = chosen.filter(
      (n) => !span.some((i) => allocations[rangeKey(req.date, n, i)])
    );
    if (ok.length < need) {
      toast({
        variant: "destructive",
        title: "Race condition",
        description: "Some systems just got booked. Retry.",
      });
      return;
    }

    try {
      await writeAllocations(req, ok.slice(0, need), `${req.inTime}-${req.outTime}`);
      toast({
        title: "Allocated (AI)",
        description: `Systems #${ok.slice(0, need).join(", #")} → ${
          req.requesterName
        }`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "AI allocation failed",
        description: e?.message || "Error",
      });
    }
  };

  // auto reject if all 33 in maintenance
  useEffect(() => {
    if (systems.length === 33 && systems.every((s) => s.status === "maintenance")) {
      pendingRequests.forEach(async (r) => {
        await updateDoc(doc(db, "requests", r.id), {
          status: "rejected",
          reviewerLoginId: user.loginId,
          reviewedAt: serverTimestamp(),
          rejectionReason:
            "All systems are under maintenance for the selected day.",
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systems]);

  // -------------------- UI helpers --------------------
  const stats = useMemo(
    () => ({
      total: systems.length || 33,
      avail: systems.filter((s) => s.status === "available").length,
      occ: systems.filter((s) => s.status === "occupied").length,
      res: systems.filter((s) => s.status === "reserved").length,
      mnt: systems.filter((s) => s.status === "maintenance").length,
      pend: pendingRequests.length,
    }),
    [systems, pendingRequests]
  );

  const formatSubmittedAt = (ts: any) => {
    try {
      return ts?.toDate ? ts.toDate().toLocaleString() : "-";
    } catch {
      return "-";
    }
  };

  const statusPill = (st: SystemStatus) => {
    const color =
      st === "available"
        ? "bg-emerald-500"
        : st === "occupied"
        ? "bg-rose-500"
        : st === "reserved"
        ? "bg-amber-500"
        : "bg-slate-500";
    return (
      <span
        className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold text-white ${color}`}
      >
        {st}
      </span>
    );
  };

  // -------------------- Schedule cell status --------------------
  const cellInfo = (sysNum: number, slotIdx: number) => {
    const id = rangeKey(selectedDate, sysNum, slotIdx);
    const rec = allocations[id];
    const sys = systems.find((s) => s.systemNumber === sysNum);
    if (!sys) return { kind: "empty" as const, label: "—", cls: "bg-muted/30" };

    if (sys.status === "maintenance")
      return {
        kind: "maintenance" as const,
        label: "Maint.",
        cls: "bg-slate-500 text-white",
      };
    if (rec)
      return {
        kind: "reserved" as const,
        label: rec.loginId,
        cls: "bg-amber-500 text-white",
      };
    return { kind: "available" as const, label: "Free", cls: "bg-emerald-500/15" };
  };

  // -------------------- Render --------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      <div className="container mx-auto px-4 pt-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Manage requests, schedule and systems
            </p>
          </div>
        <Button variant="outline" onClick={seedSystems} disabled={seeding}>
            <Database className="h-4 w-4 mr-2" />
            {seeding ? "Seeding…" : "Seed 33 Systems"}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-6 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 text-center">
              <Monitor className="h-7 w-7 mx-auto mb-1" />
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-7 w-7 mx-auto mb-1" />
              <div className="text-2xl font-bold">{stats.avail}</div>
              <div className="text-xs text-muted-foreground">Available</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <XCircle className="h-7 w-7 mx-auto mb-1" />
              <div className="text-2xl font-bold">{stats.occ}</div>
              <div className="text-xs text-muted-foreground">Occupied</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Settings className="h-7 w-7 mx-auto mb-1" />
              <div className="text-2xl font-bold">{stats.res}</div>
              <div className="text-xs text-muted-foreground">Reserved</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Wrench className="h-7 w-7 mx-auto mb-1" />
              <div className="text-2xl font-bold">{stats.mnt}</div>
              <div className="text-xs text-muted-foreground">Maintenance</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="h-7 w-7 mx-auto mb-1" />
              <div className="text-2xl font-bold">{stats.pend}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="requests" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="requests" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Requests
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Daily Schedule
            </TabsTrigger>
            <TabsTrigger value="systems" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Systems
            </TabsTrigger>
          </TabsList>

          {/* ---------------- Requests ---------------- */}
          <TabsContent value="requests">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Pending Access Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingRequests.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-10 w-10 mx-auto mb-2 opacity-60" />
                    No pending requests right now.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingRequests.map((req) => {
                      const free = freeSystemsForRange(
                        req.date,
                        req.inTime,
                        req.outTime,
                        { excludeReservedForAI: true }
                      );
                      const none = free.length === 0;
                      return (
                        <div key={req.id} className="border rounded-lg p-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-3">
                                <h4 className="font-semibold text-lg">
                                  {req.requesterName}
                                </h4>
                                <Badge variant="outline">
                                  {req.loginId} • {req.role}
                                </Badge>
                                {none && (
                                  <Badge
                                    variant="destructive"
                                    className="gap-1"
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    No availability
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {req.purpose}
                              </p>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Submitted: {formatSubmittedAt(req.submittedAt)}
                            </div>
                          </div>

                          <div className="grid md:grid-cols-4 gap-3 text-sm mt-4">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {new Date(req.date).toLocaleDateString()}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {req.inTime} - {req.outTime}
                            </div>
                            {req.numSystems && (
                              <div className="flex items-center gap-2">
                                <Monitor className="h-4 w-4" />
                                {req.numSystems} systems
                              </div>
                            )}
                            {req.numStudents && (
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                {req.numStudents} students
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2 mt-4">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Eye className="h-4 w-4 mr-2" />
                                  View
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DlgTitle>Request Details</DlgTitle>
                                </DialogHeader>
                                <div className="text-sm space-y-2">
                                  <div>
                                    <b>Requester:</b> {req.requesterName} (
                                    {req.loginId})
                                  </div>
                                  <div>
                                    <b>Date:</b> {req.date}
                                  </div>
                                  <div>
                                    <b>Time:</b> {req.inTime}–{req.outTime}
                                  </div>
                                  <div>
                                    <b>Purpose:</b> {req.purpose}
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button
                              size="sm"
                              onClick={() => handleAiAllocate(req)}
                              disabled={free.length === 0}
                            >
                              <Bot className="h-4 w-4 mr-2" />
                              Allot by AI
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openAllocate(req)}
                            >
                              <Hand className="h-4 w-4 mr-2" />
                              Allot by Manual
                            </Button>
                            <Button
                              size="sm"
                              variant="success"
                              onClick={async () => {
                                await updateDoc(doc(db, "requests", req.id), {
                                  status: "approved",
                                  reviewerLoginId: user.loginId,
                                  reviewedAt: serverTimestamp(),
                                });
                                toast({ title: "Approved" });
                              }}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={async () => {
                                await updateDoc(doc(db, "requests", req.id), {
                                  status: "rejected",
                                  reviewerLoginId: user.loginId,
                                  reviewedAt: serverTimestamp(),
                                });
                                toast({ title: "Rejected" });
                              }}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Daily Schedule (hour-wise) ---------------- */}
          <TabsContent value="schedule">
            <Card className="shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    Daily Schedule — Hour-wise (08:00–22:00)
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="date" className="text-sm">
                      Date
                    </Label>
                    <Input
                      id="date"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-auto"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 text-xs text-muted-foreground">
                  Legend:{" "}
                  <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/15 mr-2">
                    Free
                  </span>
                  <span className="inline-block px-2 py-0.5 rounded bg-amber-500 text-white mr-2">
                    Reserved
                  </span>
                  <span className="inline-block px-2 py-0.5 rounded bg-slate-500 text-white">
                    Maintenance
                  </span>
                </div>

                <div className="overflow-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr>
                        <th className="p-2 text-left min-w-[110px]">System</th>
                        {Array.from({ length: SLOT_COUNT }).map((_, i) => (
                          <th
                            key={i}
                            className="px-2 py-1 text-center whitespace-nowrap min-w-[86px]"
                          >
                            {slotLabel(i)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {systems.map((s) => (
                        <tr key={s.id} className="border-t">
                          <td className="px-2 py-2 whitespace-nowrap font-medium">
                            #{s.systemNumber} • {s.type.toUpperCase()}
                          </td>
                          {Array.from({ length: SLOT_COUNT }).map((_, i) => {
                            const info = cellInfo(s.systemNumber, i);
                            return (
                              <td key={i} className="p-1">
                                <div
                                  className={`w-full text-center rounded px-2 py-1 ${info.cls}`}
                                  title={info.label}
                                >
                                  {info.kind === "reserved"
                                    ? "Reserved"
                                    : info.label}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- Systems (FIXED LAYOUT) ---------------- */}
          <TabsContent value="systems">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Lab Systems — Manage & Monitor
                </CardTitle>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-500" />
                    Available
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-rose-500" />
                    Occupied
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-amber-500" />
                    Reserved
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-slate-500" />
                    Maintenance
                  </div>
                  <div className="ml-auto flex items-center gap-2 opacity-80">
                    <span className="px-2 py-1 text-[10px] rounded bg-slate-900/10 dark:bg-white/10">
                      Intel i9
                    </span>
                    <span className="px-2 py-1 text-[10px] rounded bg-slate-900/5 dark:bg-white/5">
                      Intel i7
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {systems.map((s) => {
                    const isI9 = s.type === "i9";
                    return (
                      <div
                        key={s.id}
                        className="rounded-xl border p-5 hover:shadow-md transition-shadow bg-card"
                      >
                        {/* Header Section */}
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <div className="text-lg font-bold">
                              System #{s.systemNumber}
                            </div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wide">
                              {s.type.toUpperCase()}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {statusPill(s.status)}
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold bg-slate-900/5 dark:bg-white/10">
                              {isI9 ? "I9" : "I7"}
                            </span>
                          </div>
                        </div>

                        {/* Allocation Info */}
                        <div className="mb-4">
                          {s.allocatedTo?.loginId ? (
                            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">Allocated</span>
                                <span className="text-muted-foreground">
                                  {s.allocatedTo.timeSlot}
                                </span>
                              </div>
                              <div className="text-muted-foreground">
                                {s.allocatedTo.name}
                              </div>
                              <div className="text-muted-foreground">
                                {s.allocatedTo.loginId}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-lg border bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 p-3 text-xs text-center font-medium">
                              Ready for Use
                            </div>
                          )}
                        </div>

                        {/* Action Buttons - Stacked for better layout */}
                        <div className="space-y-2">
                          <Button
                            size="sm"
                            variant={
                              s.status === "reserved" ? "secondary" : "outline"
                            }
                            onClick={() =>
                              handleReserveToggle(
                                s.systemNumber,
                                s.status !== "reserved"
                              )
                            }
                            disabled={s.status === "maintenance"}
                            className="w-full"
                          >
                            {s.status === "reserved" ? "Unreserve" : "Reserve"}
                          </Button>

                          <Button
                            size="sm"
                            variant={
                              s.status === "maintenance"
                                ? "secondary"
                                : "outline"
                            }
                            onClick={() =>
                              handleMaintenanceToggle(
                                s.systemNumber,
                                s.status !== "maintenance"
                              )
                            }
                            className="w-full"
                          >
                            {s.status === "maintenance"
                              ? "End Maintenance"
                              : "Set Maintenance"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* -------- Manual Allocation Dialog -------- */}
      <Dialog open={allocOpen} onOpenChange={(o) => !allocBusy && setAllocOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DlgTitle>Allocate Systems</DlgTitle>
            <DialogDescription>
              Enter system numbers and confirm the slot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">
              <div>
                <b>Requester:</b> {allocTarget?.requesterName} (
                {allocTarget?.loginId})
              </div>
              <div>
                <b>Date:</b> {allocTarget?.date}
              </div>
              <div>
                <b>Requested:</b> {allocTarget?.inTime}–{allocTarget?.outTime}
              </div>
            </div>
            <div className="space-y-2">
              <Label>System Numbers (comma/space)</Label>
              <Input
                placeholder="e.g., 1, 2, 15"
                value={allocSystemText}
                onChange={(e) => setAllocSystemText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Manual can override <b>reserved</b>, but not <b>maintenance</b>.
                Conflicting slots are blocked.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Time Slot</Label>
              <Input
                placeholder="HH:mm-HH:mm (e.g., 10:00-12:00)"
                value={allocTime}
                onChange={(e) => setAllocTime(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setAllocOpen(false)}
                disabled={allocBusy}
              >
                Cancel
              </Button>
              <Button onClick={handleAllocateConfirm} disabled={allocBusy}>
                <Hand className="h-4 w-4 mr-2" />
                {allocBusy ? "Allocating…" : "Allocate (Manual)"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
