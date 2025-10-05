import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, Clock, Monitor, Plus, History, Users2, XCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// 🔥 Firebase
import { auth, db } from "@/firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

interface Request {
  id: string;
  purpose: string;
  date: string;        // yyyy-mm-dd
  inTime: string;      // HH:mm
  outTime: string;     // HH:mm
  expectedCount?: number; // estimated students
  status: RequestStatus;
  allocatedSystems?: number[];
  submittedAt?: any;   // Firestore Timestamp
  requesterName: string;
  loginId: string;
  role: "faculty";
  uid: string;
}

const FacultyDashboard = () => {
  const { toast } = useToast();

  // Identity snapshot from localStorage
  const user = useMemo(() => {
    const name = localStorage.getItem("name") || "Faculty";
    const loginId = localStorage.getItem("loginId") || "";
    const email = localStorage.getItem("email") || "";
    const department = localStorage.getItem("department") || "";
    const designation = localStorage.getItem("designation") || "";
    return { name, loginId, role: "faculty" as const, email, department, designation };
  }, []);

  // Current auth uid (wait for auth to load)
  const [firebaseUid, setFirebaseUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  const [newRequest, setNewRequest] = useState({
    purpose: "",
    date: "",
    inTime: "",
    outTime: "",
    expectedCount: "",
  });

  // Keep auth state in sync (important for rule: resource.data.uid == request.auth.uid)
  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => setFirebaseUid(u?.uid ?? null));
    return () => off();
  }, []);

  // Subscribe to *my* requests using uid (NOT loginId)
  useEffect(() => {
    if (!firebaseUid) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const qy = query(
      collection(db, "requests"),
      where("uid", "==", firebaseUid),         // ✅ aligns with rules
      orderBy("submittedAt", "desc")           // may require a composite index (click link in console once)
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows: Request[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Request, "id">) }));
        setRequests(rows);
        setLoading(false);
      },
      (err) => {
        console.error("requests onSnapshot error:", err);
        setLoading(false);
        const msg = String(err?.message || err || "");
        if (msg.toLowerCase().includes("permission")) {
          toast({
            variant: "destructive",
            title: "Permission denied",
            description:
              "You can only read requests where uid == your account. Make sure each request stores uid: auth.currentUser.uid.",
          });
        } else if (msg.includes("requires an index")) {
          toast({
            title: "Firestore index required",
            description:
              "Open the browser console and click the Firestore link to auto-create the composite index for (where uid) + orderBy(submittedAt).",
          });
        } else {
          toast({ variant: "destructive", title: "Could not load requests", description: msg });
        }
      }
    );
    return () => unsub();
  }, [firebaseUid, toast]);

  // Helpers
  const getStatusColor = (status: RequestStatus) => {
    switch (status) {
      case "pending":
        return "bg-warning text-warning-foreground";
      case "approved":
        return "bg-success text-success-foreground";
      case "rejected":
        return "bg-destructive text-destructive-foreground";
      case "cancelled":
        return "bg-gray-500 text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const timeIsValid = (start: string, end: string) => {
    if (!start || !end) return false;
    return end > start; // simple HH:mm string compare
  };

  const formatSubmittedAt = (ts: any) => {
    try {
      return ts?.toDate ? ts.toDate().toLocaleString() : "-";
    } catch {
      return "-";
    }
  };

  // Submit new request (class / lab session)
  const handleSubmitRequest = async () => {
    const { purpose, date, inTime, outTime, expectedCount } = newRequest;

    if (!firebaseUid) {
      toast({ variant: "destructive", title: "Not signed in", description: "Please log in again." });
      return;
    }
    if (!purpose || !date || !inTime || !outTime) {
      toast({ variant: "destructive", title: "Missing Information", description: "Please fill all required fields." });
      return;
    }
    if (!timeIsValid(inTime, outTime)) {
      toast({ variant: "destructive", title: "Invalid Time Range", description: "End time must be later than start time." });
      return;
    }

    const parsedCount = expectedCount ? Number(expectedCount) : undefined;
    if (expectedCount && (isNaN(parsedCount!) || parsedCount! < 1)) {
      toast({ variant: "destructive", title: "Invalid Count", description: "Expected student count must be a positive number." });
      return;
    }

    try {
      await addDoc(collection(db, "requests"), {
        uid: firebaseUid,                     // ✅ required by rules
        type: "class",
        purpose: purpose.trim(),
        date,
        inTime,
        outTime,
        expectedCount: parsedCount,
        status: "pending" as RequestStatus,
        submittedAt: serverTimestamp(),
        requesterName: user.name,
        loginId: user.loginId,
        role: "faculty",
      });

      toast({ title: "Request Submitted", description: "Your class/lab session request has been submitted." });
      setNewRequest({ purpose: "", date: "", inTime: "", outTime: "", expectedCount: "" });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Submission Failed", description: e?.message || "Could not submit your request." });
    }
  };

  // Cancel a pending request (allowed by rules for owner)
  const handleCancel = async (req: Request) => {
    if (req.status !== "pending") return;
    try {
      await updateDoc(doc(db, "requests", req.id), { status: "cancelled" });
      toast({ title: "Request Cancelled", description: "Your request has been cancelled." });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Cancel Failed", description: e?.message || "Could not cancel the request." });
    }
  };

  const handleLogout = () => (window.location.href = "/");
  const handleProfile = () => toast({ title: "Profile", description: "Profile management coming soon!" });

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const totalCount = requests.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      <Header user={user} onLogout={handleLogout} onProfile={handleProfile} />

      <div className="container mx-auto px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome, {user.name}</h1>
          <p className="text-muted-foreground">
            {user.loginId}
            {user.department ? ` • ${user.department}` : ""}
            {user.designation ? ` • ${user.designation}` : ""}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Stats */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="shadow-card">
                <CardContent className="p-4 text-center">
                  <Users2 className="h-8 w-8 text-primary mx-auto mb-2" />
                  <div className="text-2xl font-bold">{loading ? "…" : approvedCount}</div>
                  <div className="text-sm text-muted-foreground">Approved Sessions</div>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-4 text-center">
                  <Clock className="h-8 w-8 text-warning mx-auto mb-2" />
                  <div className="text-2xl font-bold">{loading ? "…" : pendingCount}</div>
                  <div className="text-sm text-muted-foreground">Pending Requests</div>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-4 text-center">
                  <History className="h-8 w-8 text-accent mx-auto mb-2" />
                  <div className="text-2xl font-bold">{loading ? "…" : totalCount}</div>
                  <div className="text-sm text-muted-foreground">Total Requests</div>
                </CardContent>
              </Card>
            </div>

            {/* Your Requests */}
            <Card className="shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Your Requests
                  </CardTitle>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="hero" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        New Request
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Submit Class/Lab Session Request</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="purpose">Purpose / Course</Label>
                          <Textarea
                            id="purpose"
                            placeholder="Course/Lab name and brief description…"
                            value={newRequest.purpose}
                            onChange={(e) => setNewRequest({ ...newRequest, purpose: e.target.value })}
                            rows={3}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="date">Date</Label>
                            <Input
                              id="date"
                              type="date"
                              value={newRequest.date}
                              onChange={(e) => setNewRequest({ ...newRequest, date: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="inTime">Start Time</Label>
                            <Input
                              id="inTime"
                              type="time"
                              value={newRequest.inTime}
                              onChange={(e) => setNewRequest({ ...newRequest, inTime: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="outTime">End Time</Label>
                            <Input
                              id="outTime"
                              type="time"
                              value={newRequest.outTime}
                              onChange={(e) => setNewRequest({ ...newRequest, outTime: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="expectedCount">Expected Students (optional)</Label>
                            <Input
                              id="expectedCount"
                              inputMode="numeric"
                              placeholder="e.g., 30"
                              value={newRequest.expectedCount}
                              onChange={(e) => setNewRequest({ ...newRequest, expectedCount: e.target.value })}
                            />
                          </div>
                        </div>
                        <Button onClick={handleSubmitRequest} className="w-full" variant="hero">
                          Submit Request
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {loading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Loading your requests…</p>
                    </div>
                  ) : requests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No requests yet. Submit your first class/lab request!</p>
                    </div>
                  ) : (
                    requests.map((request) => (
                      <div key={request.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h4 className="font-medium mb-1">{request.purpose}</h4>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {new Date(request.date).toLocaleDateString()}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {request.inTime} - {request.outTime}
                              </span>
                              {typeof request.expectedCount === "number" && (
                                <span className="flex items-center gap-1">
                                  <Users2 className="h-4 w-4" />
                                  ~{request.expectedCount} students
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getStatusColor(request.status)}>
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </Badge>
                            {request.status === "pending" && (
                              <Button size="icon" variant="outline" title="Cancel request" onClick={() => handleCancel(request)}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {Array.isArray(request.allocatedSystems) && request.allocatedSystems.length > 0 && (
                          <div className="bg-success/10 border border-success/20 rounded p-3">
                            <div className="flex items-center gap-2 text-success">
                              <Monitor className="h-4 w-4" />
                              <span className="font-medium">Allocated Systems:</span>
                              <span>#{request.allocatedSystems.join(", #")}</span>
                            </div>
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground">
                          Submitted: {formatSubmittedAt(request.submittedAt)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-lg">Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <p className="font-medium">{user.name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Login ID</Label>
                  <p className="font-medium">{user.loginId || "-"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Department</Label>
                  <p className="font-medium">{user.department || "-"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Designation</Label>
                  <p className="font-medium">{user.designation || "-"}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-warning" />
                  Tips
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                • Request sessions early to improve allocation likelihood. <br />
                • Include an accurate expected student count.
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FacultyDashboard;
