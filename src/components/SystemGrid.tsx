import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Monitor, Cpu, Clock, User, Wrench, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface SystemAllocation {
  systemNumber: number;
  type: 'i9' | 'i7';
  status: 'available' | 'occupied' | 'reserved' | 'maintenance';
  allocatedTo?: {
    loginId: string;
    name: string;
    timeSlot: string;
  };
}

interface SystemGridProps {
  systems: SystemAllocation[];
  onSystemClick?: (system: SystemAllocation) => void;
  selectedDate?: string;
  isAdmin?: boolean;
  onMaintenanceToggle?: (systemNumber: number, inMaintenance: boolean) => void;
}

export const SystemGrid = ({ systems, onSystemClick, selectedDate, isAdmin = false, onMaintenanceToggle }: SystemGridProps) => {
  const getStatusColor = (status: SystemAllocation['status']) => {
    switch (status) {
      case 'available':
        return 'bg-success text-success-foreground';
      case 'occupied':
        return 'bg-destructive text-destructive-foreground';
      case 'reserved':
        return 'bg-accent text-accent-foreground';
      case 'maintenance':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getTypeColor = (type: 'i9' | 'i7') => {
    return type === 'i9' 
      ? 'bg-primary text-primary-foreground' 
      : 'bg-secondary text-secondary-foreground';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Lab Systems Overview</h3>
        {selectedDate && (
          <p className="text-sm text-muted-foreground">
            Date: {new Date(selectedDate).toLocaleDateString()}
          </p>
        )}
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 p-4 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-success"></div>
          <span className="text-sm">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-destructive"></div>
          <span className="text-sm">Occupied</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-accent"></div>
          <span className="text-sm">Reserved</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gray-500"></div>
          <span className="text-sm">Maintenance</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-primary"></div>
          <span className="text-sm">Intel i9</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-secondary"></div>
          <span className="text-sm">Intel i7</span>
        </div>
      </div>

      {/* Systems Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {systems.map((system) => (
          <Card
            key={system.systemNumber}
            className={cn(
              "transition-all duration-200 cursor-pointer hover:shadow-md relative group",
              isAdmin && "hover:scale-105"
            )}
            onClick={() => onSystemClick?.(system)}
          >
            {/* Admin Maintenance Toggle */}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onMaintenanceToggle?.(system.systemNumber, system.status !== 'maintenance');
                }}
                title={system.status === 'maintenance' ? 'Remove from maintenance' : 'Put in maintenance'}
              >
                <Wrench className={cn("h-3 w-3", system.status === 'maintenance' ? "text-orange-500" : "text-muted-foreground")} />
              </Button>
            )}
            
            <CardHeader className="p-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  #{system.systemNumber}
                </CardTitle>
                <Badge 
                  variant="outline" 
                  className={cn("text-xs", getTypeColor(system.type))}
                >
                  {system.type.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="space-y-2">
                <Badge 
                  className={cn("w-full justify-center text-xs", getStatusColor(system.status))}
                >
                  {system.status === 'maintenance' ? (
                    <div className="flex items-center gap-1">
                      <Wrench className="h-3 w-3" />
                      Maintenance
                    </div>
                  ) : (
                    system.status.charAt(0).toUpperCase() + system.status.slice(1)
                  )}
                </Badge>
                
                {system.allocatedTo && system.status !== 'maintenance' && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <button 
                        className="truncate hover:underline cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSystemClick?.(system);
                        }}
                      >
                        {system.allocatedTo.loginId}
                      </button>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="truncate">{system.allocatedTo.timeSlot}</span>
                    </div>
                  </div>
                )}
                
                {system.status === 'available' && (
                  <div className="flex items-center gap-1 text-xs text-success">
                    <Monitor className="h-3 w-3" />
                    <span>Ready</span>
                  </div>
                )}
                
                {system.status === 'maintenance' && (
                  <div className="flex items-center gap-1 text-xs text-orange-600">
                    <Settings className="h-3 w-3" />
                    <span>Service</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};