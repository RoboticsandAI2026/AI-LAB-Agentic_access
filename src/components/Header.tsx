import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { LogOut, User, Settings } from "lucide-react";
import sastraLogo from "@/assets/sastra_logo.png";

interface HeaderProps {
  user?: {
    name: string;
    loginId: string;
    role: 'student' | 'faculty' | 'admin';
    avatar?: string;
  };
  onLogout?: () => void;
  onProfile?: () => void;
}

export const Header = ({ user, onLogout, onProfile }: HeaderProps) => {
  return (
    <header className="bg-primary text-primary-foreground shadow-primary border-b">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <img 
            src={sastraLogo} 
            alt="Sastra University" 
            className="h-10 w-auto"
          />
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold">AI & Robotics Lab</h1>
            <p className="text-xs text-primary-foreground/70">Access Management</p>
          </div>
        </div>

        {/* User Menu */}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 hover:bg-primary-hover">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback className="bg-accent text-accent-foreground">
                    {user.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:flex flex-col items-start">
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs text-primary-foreground/70">
                    {user.loginId} • {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onProfile} className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={onLogout} 
                className="flex items-center gap-2 text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="secondary" onClick={() => {}}>
            Login
          </Button>
        )}
      </div>
    </header>
  );
};