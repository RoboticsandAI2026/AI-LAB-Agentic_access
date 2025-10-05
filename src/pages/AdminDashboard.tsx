import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { SystemGrid } from "@/components/SystemGrid";
import { agentAllocate } from "@/services/callables";
import { UserDetailsModal } from "@/components/UserDetailsModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Calendar,
  Clock,
  Users,
  Monitor,
  CheckCircle,
  XCircle,
  Eye,
  Settings,
  Wrench,
  BarChart3,
  CalendarDays,
  Database,
  Cpu,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// 🔥 Firebase
import { db } from "@/firebaseConfig";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  updateDoc,
  serverTimestamp,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";

type Role = "student" | "faculty" | "admin";

type AllocatedTo = {
  loginId: string;
  name: string;
  timeSlot: string; // "10:00-12:00"
};

type SystemStatus = "available" | "occupied" | "reserved" | "maintenance";

type SystemRow = {
  id: string; // doc id (e.g., "system_1")
  systemNumber: number;
  type: "i9" | "i7";
  status: SystemStatus;
  allocatedTo?: AllocatedTo | null;
  updatedAt?: any;
  createdAt?: any;
};

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

interface PendingRequest {
  id: string;
  requesterName: string;
  loginId: string;
  role: "student" | "faculty";
  purpose: string;
  date: string;      // yyyy-mm-dd
  inTime: string;    // HH:mm
  outTime: string;   // HH:mm
  numSystems?: number;
  numStudents?: number;
  submittedAt?: any; // Firestore Timestamp
  status: RequestStatus;
  uid: string;
  allocatedSystems?: number[];
}

const AdminDashboard = () => {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  // Live data from Firestore
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [seeding, setSeeding] = useState(false);

  // Allocation dialog state
  const [allocOpen, setAllocOpen] = useState(false);
  const [allocTarget, setAllocTarget] = useState<PendingRequest | null>(null);
  const [allocSystemText, setAllocSystemText] = useState(""); // "1, 2, 15"
  const [allocTime, setAllocTime] = useState(""); // "10:00-12:00"
  const [allocBusy, setAllocBusy] = useState(false);

  // Admin identity
  const user = useMemo(
    () => ({
      name: localStorage.getItem("name") || "Admin",
      loginId: localStorage.getItem("loginId") || "A0001",
      role: "admin" as Role,
      email: localStorage.getItem("email") || "",
    }),
    []
  );

  // ====== Firestore listeners ======
  useEffect(() => {
    // Systems
    const sysQ = query(collection(db, "systems"), orderBy("systemNumber", "asc"));
    const unsubSys = onSnapshot(
      sysQ,
      (snap) => {
        const rows: SystemRow[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SystemRow, "id">),
        }));
        setSystems(rows);
      },
      (err) => {
        console.error("systems onSnapshot error:", err);
      }
    );

    // Pending requests — NO orderBy => no composite index required
    const reqQ = query(collection(db, "requests"), where("status", "==", "pending"));
    const unsubReq = onSnapshot(
      reqQ,
      (snap) => {
        const rows: PendingRequest[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PendingRequest, "id">),
        }));
        // client-side sort by submittedAt desc
        rows.sort((a: any, b: any) => {
          const ta = a?.submittedAt?.toDate?.() ? a.submittedAt.toDate().getTime() : 0;
          const tb = b?.submittedAt?.toDate?.() ? b.submittedAt.toDate().getTime() : 0;
          return tb - ta;
        });
        setPendingRequests(rows);
      },
      (err) => {
        console.error("requests onSnapshot error:", err);
      }
    );

    return () => {
      unsubSys();
      unsubReq();
    };
  }, []);

  // ====== Seed systems if empty ======
  const seedSystems = async () => {
    try {
      setSeeding(true);
      const existing = await getDocs(collection(db, "systems"));
      if (!existing.empty) {
        toast({ title: "Already Seeded", description: "Systems collection already has documents." });
        return;
      }
      const batch = writeBatch(db);
      for (let i = 1; i <= 33; i++) {
        const type = i <= 14 ? "i9" : "i7";
        const ref = doc(db, "systems", `system_${i}`);
        batch.set(ref, {
          systemNumber: i,
          type,
          status: "available" as SystemStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          allocatedTo: null,
        });
      }
      await batch.commit();
      toast({ title: "Seed Complete", description: "33 systems have been created." });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Seed Failed", description: e?.message || "Could not seed systems." });
    } finally {
      setSeeding(false);
    }
  };

  // ====== UI actions ======
  const handleLogout = () => (window.location.href = "/");
  const handleProfile = () => toast({ title: "Profile", description: "Profile management coming soon!" });

  const handleSystemClick = (system: SystemRow) => {
    if (system.allocatedTo?.loginId) {
      const mockUserDetails = {
        loginId: system.allocatedTo.loginId,
        name: system.allocatedTo.name,
        email: `${system.allocatedTo.loginId.toLowerCase()}@sastra.ac.in`,
        role: system.allocatedTo.loginId.startsWith("S") ? ("student" as const) : ("faculty" as const),
        phone: "9876543210",
        registerNumber: system.allocatedTo.loginId.startsWith("S")
          ? system.allocatedTo.loginId.substring(1)
          : undefined,
        year: system.allocatedTo.loginId.startsWith("S") ? "3rd Year" : undefined,
        branch: system.allocatedTo.loginId.startsWith("S") ? "Computer Science" : undefined,
        department: system.allocatedTo.loginId.startsWith("F") ? "Computer Science" : undefined,
        designation: system.allocatedTo.loginId.startsWith("F") ? "Associate Professor" : undefined,
        totalSessions: 12,
        accessHistory: [
          {
            id: "1",
            date: selectedDate,
            inTime: "10:00",
            outTime: "12:00",
            purpose: "Session",
            systemsUsed: [system.systemNumber],
            status: "allocated" as const,
          },
        ],
      };
      setSelectedUser(mockUserDetails);
      setIsUserModalOpen(true);
    } else {
      toast({
        title: `System ${system.systemNumber} (${system.type.toUpperCase()})`,
        description: system.status,
      });
    }
  };

  const handleMaintenanceToggle = async (systemNumber: number, inMaintenance: boolean) => {
    try {
      const sys = systems.find((s) => s.systemNumber === systemNumber);
      if (!sys) return;

      await updateDoc(doc(db, "systems", sys.id), {
        status: inMaintenance ? "maintenance" : "available",
        ...(inMaintenance ? { allocatedTo: null } : {}),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: inMaintenance ? "System Under Maintenance" : "System Available",
        description: `System ${systemNumber} is now ${inMaintenance ? "under maintenance" : "available"}.`,
      });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Update Failed", description: e?.message || "Could not toggle maintenance." });
    }
  };

  // ====== Allocation flow ======
  const openAllocate = (req: PendingRequest) => {
    setAllocTarget(req);
    setAllocSystemText(""); // clear previous
    setAllocTime(`${req.inTime}-${req.outTime}`); // default from request
    setAllocOpen(true);
  };

  const parseSystemNumbers = (text: string): number[] => {
    return text
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => Number(t))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 1000); // simple sanity cap
  };

  const handleAllocateConfirm = async () => {
    if (!allocTarget) return;
    const numbers = parseSystemNumbers(allocSystemText);
    if (numbers.length === 0) {
      toast({ variant: "destructive", title: "No systems", description: "Enter at least one valid system number." });
      return;
    }
    if (!allocTime || !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(allocTime)) {
      toast({ variant: "destructive", title: "Invalid time slot", description: "Use format HH:mm-HH:mm (e.g., 10:00-12:00)." });
      return;
    }

    // validate chosen systems exist & are not in maintenance
    const unavailable = numbers.filter((n) => {
      const s = systems.find((x) => x.systemNumber === n);
      return !s || s.status === "maintenance";
    });
    if (unavailable.length > 0) {
      toast({
        variant: "destructive",
        title: "Invalid systems",
        description: `These systems are unavailable or don't exist: ${unavailable.join(", ")}`,
      });
      return;
    }

    setAllocBusy(true);
    try {
      const batch = writeBatch(db);
      const newStatus: SystemStatus = "reserved"; // change to "occupied" if you want immediate occupation

      // Update each system doc
      numbers.forEach((n) => {
        const sys = systems.find((s) => s.systemNumber === n)!;
        const sysRef = doc(db, "systems", sys.id);
        batch.update(sysRef, {
          status: newStatus,
          allocatedTo: {
            loginId: allocTarget.loginId,
            name: allocTarget.requesterName,
            timeSlot: allocTime,
          },
          updatedAt: serverTimestamp(),
        });
      });

      // Update request doc
      const reqRef = doc(db, "requests", allocTarget.id);
      batch.update(reqRef, {
        status: "approved",
        allocatedSystems: numbers,
        reviewedAt: serverTimestamp(),
        reviewerLoginId: user.loginId,
      });

      await batch.commit();
      toast({
        title: "Allocation complete",
        description: `Allocated systems #${numbers.join(", #")} to ${allocTarget.requesterName}.`,
      });
      setAllocOpen(false);
      setAllocTarget(null);
      setAllocSystemText("");
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Allocation failed", description: e?.message || "Could not allocate systems." });
    } finally {
      setAllocBusy(false);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    try {
      await updateDoc(doc(db, "requests", requestId), {
        status: "approved",
        reviewedAt: serverTimestamp(),
        reviewerLoginId: user.loginId,
      });
      toast({ title: "Request Approved", description: "The request has been approved." });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Approve Failed", description: e?.message || "Could not approve the request." });
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await updateDoc(doc(db, "requests", requestId), {
        status: "rejected",
        reviewedAt: serverTimestamp(),
        reviewerLoginId: user.loginId,
      });
      toast({ title: "Request Rejected", description: "The request has been rejected." });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Reject Failed", description: e?.message || "Could not reject the request." });
    }
  };

  // ====== Stats ======
  const stats = useMemo(() => {
    const total = systems.length;
    const available = systems.filter((s) => s.status === "available").length;
    const occupied = systems.filter((s) => s.status === "occupied").length;
    const reserved = systems.filter((s) => s.status === "reserved").length;
    const maintenance = systems.filter((s) => s.status === "maintenance").length;
    return {
      totalSystems: total || 33,
      available,
      occupied,
      reserved,
      maintenance,
      pendingRequests: pendingRequests.length,
    };
  }, [systems, pendingRequests]);

  const formatSubmittedAt = (ts: any) => {
    try {
      return ts?.toDate ? ts.toDate().toLocaleString() : "-";
    } catch {
      return "-";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      <Header user={user} onLogout={handleLogout} onProfile={handleProfile} />

      <UserDetailsModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        userDetails={selectedUser}
      />

      {/* Allocation Dialog */}
      <Dialog open={allocOpen} onOpenChange={(o) => !allocBusy && setAllocOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Allocate Systems</DialogTitle>
            <DialogDescription>
              Choose system numbers and confirm the time slot to allocate to this request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">
              <div><b>Requester:</b> {allocTarget?.requesterName} ({allocTarget?.loginId})</div>
              <div><b>Date:</b> {allocTarget ? new Date(allocTarget.date).toLocaleDateString() : "-"}</div>
              <div><b>Requested:</b> {allocTarget?.inTime} - {allocTarget?.outTime}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sysNums">System Numbers</Label>
              <Input
                id="sysNums"
                placeholder="e.g., 1, 2, 15"
                value={allocSystemText}
                onChange={(e) => setAllocSystemText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Separate with commas or spaces. Only existing, non-maintenance systems will be updated.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="slot">Time Slot</Label>
              <Input
                id="slot"
                placeholder="HH:mm-HH:mm (e.g., 10:00-12:00)"
                value={allocTime}
                onChange={(e) => setAllocTime(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAllocOpen(false)} disabled={allocBusy}>
                Cancel
              </Button>
              <Button onClick={handleAllocateConfirm} disabled={allocBusy}>
                <Cpu className="h-4 w-4 mr-2" />
                {allocBusy ? "Allocating…" : "Allocate"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-muted-foreground">Manage lab access requests and system allocations</p>
          </div>
          <Button variant="outline" onClick={seedSystems} disabled={seeding}>
            <Database className="h-4 w-4 mr-2" />
            {seeding ? "Seeding…" : "Seed Systems (33)"}
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid md:grid-cols-6 gap-4 mb-8">
          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <Monitor className="h-8 w-8 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold">{stats.totalSystems}</div>
              <div className="text-sm text-muted-foreground">Total Systems</div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <CheckCircle className="h-8 w-8 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold">{stats.available}</div>
              <div className="text-sm text-muted-foreground">Available</div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <XCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <div className="text-2xl font-bold">{stats.occupied}</div>
              <div className="text-sm text-muted-foreground">Occupied</div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <Settings className="h-8 w-8 text-accent mx-auto mb-2" />
              <div className="text-2xl font-bold">{stats.reserved}</div>
              <div className="text-sm text-muted-foreground">Reserved</div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <Wrench className="h-8 w-8 text-gray-500 mx-auto mb-2" />
              <div className="text-2xl font-bold">{stats.maintenance}</div>
              <div className="text-sm text-muted-foreground">Maintenance</div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4 text-center">
              <Users className="h-8 w-8 text-warning mx-auto mb-2" />
              <div className="text-2xl font-bold">{stats.pendingRequests}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="requests" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="requests" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Pending Requests
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Daily Schedule
            </TabsTrigger>
            <TabsTrigger value="systems" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              System Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Pending Access Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pendingRequests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No pending requests at this time.</p>
                    </div>
                  ) : (
                    pendingRequests.map((request) => (
                      <div key={request.id} className="border rounded-lg p-6 space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <h4 className="font-semibold text-lg">{request.requesterName}</h4>
                              <Badge variant="outline">{request.loginId} • {request.role}</Badge>
                            </div>
                            <p className="text-muted-foreground">{request.purpose}</p>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-primary" />
                            <span>{new Date(request.date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-primary" />
                            <span>{request.inTime} - {request.outTime}</span>
                          </div>
                          {request.numSystems && (
                            <div className="flex items-center gap-2">
                              <Monitor className="h-4 w-4 text-primary" />
                              <span>{request.numSystems} systems</span>
                            </div>
                          )}
                          {request.numStudents && (
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              <span>{request.numStudents} students</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t">
                          <span className="text-xs text-muted-foreground">
                            Submitted: {formatSubmittedAt(request.submittedAt)}
                          </span>
                          <div className="flex gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Request Details</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <Label>Requester</Label>
                                      <p className="font-medium">{request.requesterName}</p>
                                    </div>
                                    <div>
                                      <Label>Login ID</Label>
                                      <p className="font-medium">{request.loginId}</p>
                                    </div>
                                  </div>
                                  <div>
                                    <Label>Purpose</Label>
                                    <p className="font-medium">{request.purpose}</p>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>

                            {/* Allocate Button */}
                            <Button variant="default" size="sm" onClick={() => openAllocate(request)}>
                              <Cpu className="h-4 w-4 mr-2" />
                              Allocate
                            </Button>

                            {/* Approve without allocation (optional) */}
                            <Button variant="success" size="sm" onClick={() => handleApproveRequest(request.id)}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Approve
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleRejectRequest(request.id)}>
                              <XCircle className="h-4 w-4 mr-2" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule">
            <Card className="shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    Daily Schedule & Allocations
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="scheduleDate">Date:</Label>
                    <Input
                      id="scheduleDate"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-auto"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-2">
                    📅 <strong>Daily Schedule View:</strong> Shows all system allocations for the selected date. Click on any occupied system to view user details and access history.
                  </p>
                </div>
                <SystemGrid
                  systems={systems}
                  selectedDate={selectedDate}
                  isAdmin={true}
                  onSystemClick={handleSystemClick}
                  onMaintenanceToggle={handleMaintenanceToggle}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="systems">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  System Analytics & Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6 mb-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Monitor className="h-5 w-5 text-primary" />
                        Intel i9 Systems
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="text-3xl font-bold text-primary">14</div>
                        <p className="text-sm text-muted-foreground">Systems 1-14 • High Performance</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>Available: {systems.filter((s) => s.type === "i9" && s.status === "available").length}</div>
                          <div>Occupied: {systems.filter((s) => s.type === "i9" && s.status === "occupied").length}</div>
                          <div>Reserved: {systems.filter((s) => s.type === "i9" && s.status === "reserved").length}</div>
                          <div>Maintenance: {systems.filter((s) => s.type === "i9" && s.status === "maintenance").length}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Monitor className="h-5 w-5 text-secondary" />
                        Intel i7 Systems
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="text-3xl font-bold text-secondary">19</div>
                        <p className="text-sm text-muted-foreground">Systems 15-33 • Standard Performance</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>Available: {systems.filter((s) => s.type === "i7" && s.status === "available").length}</div>
                          <div>Occupied: {systems.filter((s) => s.type === "i7" && s.status === "occupied").length}</div>
                          <div>Reserved: {systems.filter((s) => s.type === "i7" && s.status === "reserved").length}</div>
                          <div>Maintenance: {systems.filter((s) => s.type === "i7" && s.status === "maintenance").length}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <SystemGrid
                  systems={systems}
                  isAdmin={true}
                  onSystemClick={handleSystemClick}
                  onMaintenanceToggle={handleMaintenanceToggle}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
