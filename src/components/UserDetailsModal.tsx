import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calendar, Clock, Monitor, User, Mail, Phone, GraduationCap, Building } from "lucide-react";

interface AccessHistory {
  id: string;
  date: string;
  inTime: string;
  outTime: string;
  purpose: string;
  systemsUsed: number[];
  status: 'completed' | 'ongoing' | 'cancelled';
}

interface UserDetails {
  loginId: string;
  name: string;
  email: string;
  role: 'student' | 'faculty';
  phone?: string;
  registerNumber?: string;
  year?: string;
  branch?: string;
  department?: string;
  designation?: string;
  totalSessions: number;
  accessHistory: AccessHistory[];
}

interface UserDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userDetails: UserDetails | null;
}

export const UserDetailsModal = ({ isOpen, onClose, userDetails }: UserDetailsModalProps) => {
  if (!userDetails) return null;

  const getStatusColor = (status: AccessHistory['status']) => {
    switch (status) {
      case 'completed': return 'bg-success text-success-foreground';
      case 'ongoing': return 'bg-warning text-warning-foreground';
      case 'cancelled': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Details - {userDetails.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Name:</span>
                    <span>{userDetails.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{userDetails.loginId}</Badge>
                    <Badge variant="secondary">{userDetails.role}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Email:</span>
                    <span className="text-sm">{userDetails.email}</span>
                  </div>
                  {userDetails.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Phone:</span>
                      <span>{userDetails.phone}</span>
                    </div>
                  )}
                </div>
                
                <div className="space-y-3">
                  {userDetails.role === 'student' && (
                    <>
                      {userDetails.registerNumber && (
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">Register Number:</span>
                          <span>{userDetails.registerNumber}</span>
                        </div>
                      )}
                      {userDetails.year && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Year:</span>
                          <span>{userDetails.year}</span>
                        </div>
                      )}
                      {userDetails.branch && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Branch:</span>
                          <span>{userDetails.branch}</span>
                        </div>
                      )}
                    </>
                  )}
                  
                  {userDetails.role === 'faculty' && (
                    <>
                      {userDetails.department && (
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">Department:</span>
                          <span>{userDetails.department}</span>
                        </div>
                      )}
                      {userDetails.designation && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Designation:</span>
                          <span>{userDetails.designation}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{userDetails.totalSessions}</div>
                  <div className="text-sm text-muted-foreground">Total Sessions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-success">
                    {userDetails.accessHistory.filter(h => h.status === 'completed').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-warning">
                    {userDetails.accessHistory.filter(h => h.status === 'ongoing').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Ongoing</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Access History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Access History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-64 overflow-y-auto">
                {userDetails.accessHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No access history found.</p>
                  </div>
                ) : (
                  userDetails.accessHistory.map((history) => (
                    <div key={history.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium mb-1">{history.purpose}</h4>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(history.date).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {history.inTime} - {history.outTime}
                            </span>
                            <span className="flex items-center gap-1">
                              <Monitor className="h-4 w-4" />
                              Systems: #{history.systemsUsed.join(', #')}
                            </span>
                          </div>
                        </div>
                        <Badge className={getStatusColor(history.status)}>
                          {history.status.charAt(0).toUpperCase() + history.status.slice(1)}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};