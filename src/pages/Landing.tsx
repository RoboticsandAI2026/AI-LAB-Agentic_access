import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Monitor, Shield, Users, ArrowRight, LogIn } from "lucide-react";
import sastraLogo from "@/assets/sastra_logo.png";

// 🔥 Firebase
import { db } from "@/firebaseConfig";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

type Role = "ADMIN" | "FACULTY" | "STUDENT";
type SystemStatus = "available" | "occupied" | "reserved" | "maintenance";

type SystemDoc = {
  systemNumber: number;
  type: "i9" | "i7";
  status: SystemStatus;
};

function routeForRole(role?: string | null) {
  if (!role) return null;
  const r = String(role).toUpperCase() as Role;
  if (r === "ADMIN") return "/dashboard/admin";
  if (r === "FACULTY") return "/dashboard/faculty";
  if (r === "STUDENT") return "/dashboard/student";
  return null;
}

const Landing = () => {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  // Session (populated by your signup/login flow)
  const session = useMemo(() => {
    const loginId = localStorage.getItem("loginId") || "";
    const name = localStorage.getItem("name") || "";
    const role = localStorage.getItem("role") || "";
    const route = routeForRole(role);
    return { loginId, name, role, route };
  }, []);

  // Live system stats from Firestore
  const [total, setTotal] = useState<number>(0);
  const [available, setAvailable] = useState<number>(0);
  const [reserved, setReserved] = useState<number>(0);

  useEffect(() => {
    setMounted(true);

    // 👇 This works because Firestore rules allow public read on /systems/*
    const qy = query(collection(db, "systems"), orderBy("systemNumber", "asc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as SystemDoc);
        setTotal(rows.length);
        setAvailable(rows.filter((s) => s.status === "available").length);
        setReserved(rows.filter((s) => s.status === "reserved").length);
      },
      (err) => {
        console.error("systems onSnapshot error:", err);
        // keep fallback values if read fails
      }
    );
    return () => unsub();
  }, []);

  const handleAccessPortal = () => navigate("/auth");
  const handleContinue = () => (session.route ? navigate(session.route) : navigate("/auth"));

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-primary">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={sastraLogo}
              alt="SASTRA Deemed to be University logo"
              className="h-10 w-auto"
            />
            <div className="flex flex-col">
              <h1 className="text-lg font-semibold">AI & Robotics Lab</h1>
              <p className="text-xs text-primary-foreground/70">Access Management</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mounted && session.loginId ? (
              <Button
                variant="secondary"
                onClick={handleContinue}
                className="font-medium"
              >
                Continue as {session.name || session.loginId}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button variant="secondary" onClick={handleAccessPortal} className="font-medium">
                <LogIn className="h-4 w-4 mr-2" />
                Access Portal
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs mb-4">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Live • SASTRA Lab Access Portal
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
            AI & Robotics Lab Access
          </h2>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            Streamlined system for managing lab access at SASTRA University.
            Request systems, track allocations, and ensure optimal resource utilization.
          </p>

          <div className="flex items-center justify-center gap-3">
            <Button size="lg" onClick={handleAccessPortal} className="px-8 py-3">
              <LogIn className="h-4 w-4 mr-2" />
              Log In / Sign Up
            </Button>
            <Button size="lg" variant="outline" onClick={handleContinue} className="px-8 py-3">
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>

          {mounted && session.loginId && (
            <div className="mt-3 text-sm text-muted-foreground">
              Signed in as <span className="font-medium">{session.name || session.loginId}</span>
              {session.role ? (
                <>
                  {" "}
                  • <Badge variant="outline">{String(session.role).toUpperCase()}</Badge>
                </>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-10">
            <h3 className="text-2xl font-bold mb-3">System Overview</h3>
            <p className="text-muted-foreground">Comprehensive lab management with role-based access</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="text-center">
              <CardContent className="p-6">
                <Monitor className="h-10 w-10 text-primary mx-auto mb-3" />
                <h4 className="font-semibold mb-2">33 Lab Systems</h4>
                <p className="text-sm text-muted-foreground">
                  14 Intel i9 and 19 Intel i7 systems
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="p-6">
                <Users className="h-10 w-10 text-primary mx-auto mb-3" />
                <h4 className="font-semibold mb-2">Role-Based Access</h4>
                <p className="text-sm text-muted-foreground">
                  Student, Faculty, and Admin dashboards
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardContent className="p-6">
                <Shield className="h-10 w-10 text-primary mx-auto mb-3" />
                <h4 className="font-semibold mb-2">Secure Access</h4>
                <p className="text-sm text-muted-foreground">
                  OAuth with @sastra.ac.in verification
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Live System Stats Section */}
      <section className="py-12 px-4 bg-muted/30">
        <div className="container mx-auto max-w-2xl">
          <div className="bg-card rounded-lg p-6 shadow-sm">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary mb-1">{total || 0}</div>
                <div className="text-sm text-muted-foreground">Total Systems</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary mb-1">{available || 0}</div>
                <div className="text-sm text-muted-foreground">Currently Available</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary mb-1">{reserved || 0}</div>
                <div className="text-sm text-muted-foreground">Reserved</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary text-primary-foreground py-8 px-4">
        <div className="container mx-auto text-center">
          <p className="text-primary-foreground/80">
            © {new Date().getFullYear()} SASTRA University — AI & Robotics Lab Access Management System
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
