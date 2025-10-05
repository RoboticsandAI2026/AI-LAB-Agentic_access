import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Home, Route, Shield, Users, MonitorX } from "lucide-react";

type Role = "ADMIN" | "FACULTY" | "STUDENT";

function routeForRole(role?: string | null) {
  if (!role) return null;
  const r = String(role).toUpperCase() as Role;
  if (r === "ADMIN") return "/dashboard/admin";
  if (r === "FACULTY") return "/dashboard/faculty";
  if (r === "STUDENT") return "/dashboard/student";
  return null;
}

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Read last-known session (set during your login flow)
  const session = useMemo(() => {
    const loginId = localStorage.getItem("loginId") || "";
    const name = localStorage.getItem("name") || "";
    const role = localStorage.getItem("role") || "";
    return { loginId, name, role, route: routeForRole(role) };
  }, []);

  useEffect(() => {
    // Log & set a helpful title
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    document.title = "404 — Page Not Found";
  }, [location.pathname]);

  const goBack = () => navigate(-1);
  const goHome = () => navigate("/");
  const goRoleRoute = () => (session.route ? navigate(session.route) : navigate("/auth"));

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted/30 px-4">
      <Card className="w-full max-w-xl shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <MonitorX className="h-7 w-7 text-destructive" />
          </div>
          <CardTitle className="text-3xl">Page not found</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn’t find <span className="font-mono">{location.pathname}</span>. It may have been moved or deleted.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {session.loginId ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-primary" />
                <span>
                  Signed in as <span className="font-medium">{session.name || session.loginId}</span>
                </span>
                {session.role ? (
                  <Badge variant="outline" className="ml-1">
                    {String(session.role).toUpperCase()}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={goRoleRoute}>
                  Continue to your dashboard
                </Button>
                <Button size="sm" variant="ghost" onClick={goHome}>
                  <Home className="mr-2 h-4 w-4" />
                  Go to Home
                </Button>
                <Button size="sm" variant="ghost" onClick={goBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Go Back
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border p-3 text-sm">
              <p className="text-muted-foreground">
                You’re not signed in. You can head home or log in to continue.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => navigate("/auth")}>
                  Log In / Sign Up
                </Button>
                <Button size="sm" variant="ghost" onClick={goHome}>
                  <Home className="mr-2 h-4 w-4" />
                  Go to Home
                </Button>
                <Button size="sm" variant="ghost" onClick={goBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Go Back
                </Button>
              </div>
            </div>
          )}

          {/* Quick role shortcuts (helpful during testing) */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Button variant="outline" onClick={() => navigate("/dashboard/admin")}>
              <Shield className="mr-2 h-4 w-4" />
              Admin
            </Button>
            <Button variant="outline" onClick={() => navigate("/dashboard/faculty")}>
              <Users className="mr-2 h-4 w-4" />
              Faculty
            </Button>
            <Button variant="outline" onClick={() => navigate("/dashboard/student")}>
              <Users className="mr-2 h-4 w-4" />
              Student
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotFound;
