import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  LogIn,
  Monitor,
  Users,
  Shield,
} from "lucide-react";

type Role = "ADMIN" | "FACULTY" | "STUDENT";

function routeForRole(role?: string | null) {
  if (!role) return null;
  const r = String(role).toUpperCase() as Role;
  if (r === "ADMIN") return "/dashboard/admin";
  if (r === "FACULTY") return "/dashboard/faculty";
  if (r === "STUDENT") return "/dashboard/student";
  return null;
}

const Index = () => {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  const session = useMemo(() => {
    const loginId = localStorage.getItem("loginId") || "";
    const name = localStorage.getItem("name") || "";
    const role = localStorage.getItem("role") || "";
    return { loginId, name, role, route: routeForRole(role) };
  }, []);

  useEffect(() => {
    // Avoid SSR / hydration warnings, and ensure localStorage is ready
    setMounted(true);
  }, []);

  const handleContinue = () => {
    if (session.route) {
      navigate(session.route);
    } else {
      navigate("/auth");
    }
  };

  const handleLogin = () => navigate("/auth");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      {/* Hero */}
      <section className="container mx-auto px-4 pt-20 pb-12">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs mb-4">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Live • SASTRA Lab Access Portal
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Reserve High-Performance Lab Systems with Ease
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-6">
            Submit requests, manage allocations, and monitor availability in real time.
            Secure access for students, faculty, and admins — all in one place.
          </p>

          <div className="flex items-center justify-center gap-3">
            <Button size="lg" onClick={handleLogin}>
              <LogIn className="h-4 w-4 mr-2" />
              Log In / Sign Up
            </Button>

            {mounted && session.loginId ? (
              <Button size="lg" variant="outline" onClick={handleContinue}>
                Continue as {session.name || session.loginId}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button size="lg" variant="ghost" onClick={handleContinue}>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
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

      {/* Role Cards */}
      <section className="container mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Admin
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Approve/Reject requests, toggle maintenance, and manage system allocations.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate("/dashboard/admin")}>
                  Open Admin Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-accent" />
                Faculty
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Book sessions for personal work or student classes and track approval status.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate("/dashboard/faculty")}>
                  Open Faculty Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-secondary" />
                Student
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>View lab availability and session schedules (student view).</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate("/dashboard/student")}
                >
                  Open Student Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer note */}
        <div className="max-w-4xl mx-auto text-center text-xs text-muted-foreground mt-10">
          By continuing, you agree to abide by lab usage policies and safety protocols.
          Report issues to the lab admin team.
        </div>
      </section>
    </div>
  );
};

export default Index;
