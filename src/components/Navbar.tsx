import { Home, Calendar, BookOpen, Heart, LogOut } from "lucide-react";
import { Button } from "./ui/button";

interface NavbarProps {
  currentScreen: string;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
  username: string;
}

export function Navbar({ currentScreen, onNavigate, onLogout, username }: NavbarProps) {
  return (
    <nav className="border-b" style={{ backgroundColor: '#FFFFFF', borderColor: '#E7E7E7' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <Heart className="w-6 h-6" style={{ color: '#A67C52' }} fill="#A67C52" />
            <span className="hidden sm:inline">להתחיל מחדש</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={currentScreen === "dashboard" ? "default" : "ghost"}
              size="sm"
              onClick={() => onNavigate("dashboard")}
              className="gap-2"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">דף הבית</span>
            </Button>
            <Button
              variant={currentScreen === "schedule" ? "default" : "ghost"}
              size="sm"
              onClick={() => onNavigate("schedule")}
              className="gap-2"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">לוח זמנים</span>
            </Button>
            <Button
              variant={currentScreen === "medicalRecords" ? "default" : "ghost"}
              size="sm"
              onClick={() => onNavigate("medicalRecords")}
              className="gap-2"
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline"> תיקים רפואיים</span>
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline">{username}</span>
            <Button variant="ghost" size="sm" onClick={onLogout} className="gap-2">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}