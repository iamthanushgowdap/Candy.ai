import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Volume2, VolumeX, User, Activity, Compass, MessageSquare, Trash2, Brain, Zap, Settings } from "lucide-react";

interface ChatSession {
  id: string;
  name: string;
  created_at: string;
}

interface SidebarProps {
  sessions: ChatSession[];
  selectedSession: ChatSession | null;
  onSelectSession: (session: ChatSession) => void;
  onNewSession: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenProfile: () => void;
  userName: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  selectedSession,
  onSelectSession,
  onNewSession,
  soundEnabled,
  onToggleSound,
  onOpenProfile,
  userName
}) => {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Chat Console", icon: MessageSquare, active: pathname === "/" },
    { href: "/memories", label: "Memory Matrix", icon: Brain, active: pathname === "/memories" },
    { href: "/training", label: "Auto Training", icon: Zap, active: pathname === "/training" },
    { href: "/analytics", label: "System Analytics", icon: Activity, active: pathname === "/analytics" },
    { href: "/settings", label: "Platform Settings", icon: Settings, active: pathname === "/settings" },
  ];

  return (
    <aside className="w-full flex flex-col border-r border-zinc-900 bg-zinc-950/60 backdrop-blur-xl shrink-0 h-full">
      {/* Header */}
      <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-xs tracking-wider text-indigo-400 shadow-sm">
            ✦
          </div>
          <h1 className="text-sm font-bold text-zinc-100 tracking-tight">
            Candy AI Console
          </h1>
        </div>
        
        {/* Settings Buttons */}
        <div className="flex items-center gap-1.5">
          <button 
            onClick={onToggleSound}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              soundEnabled ? 'text-indigo-400 bg-zinc-900 border border-zinc-800' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Toggle Audio Feedback"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          
          <button 
            onClick={onOpenProfile}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title="User Profile Matrix"
          >
            <User className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* User Identity Info Card */}
      <div className="mx-4 mt-4 p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-900 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm">👤</div>
          <div>
            <p className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider">Identity</p>
            <h4 className="text-xs font-bold text-zinc-200 truncate max-w-[120px]">{userName}</h4>
          </div>
        </div>
        <button 
          onClick={onOpenProfile}
          className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-750 transition-colors text-zinc-300 cursor-pointer"
        >
          Setup
        </button>
      </div>

      {/* Platform Navigation */}
      <div className="px-4 mt-4 space-y-1">
        <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest pl-1 mb-2">
          Platform Matrices
        </div>
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all border ${
                  item.active
                    ? "bg-zinc-900 border-zinc-800 text-indigo-400 shadow-sm"
                    : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${item.active ? "text-indigo-400" : "text-zinc-500"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Start New Conversation */}
      <div className="px-4 mt-4">
        <button
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 hover:bg-zinc-900/80 transition-all font-semibold text-xs tracking-tight text-zinc-300 hover:text-white cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New Conversation
        </button>
      </div>

      {/* Conversation Feed */}
      <div className="flex-1 overflow-y-auto mt-6 px-4 pb-6 space-y-2">
        <div className="flex items-center justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-widest pl-1">
          <span>Recent Chats ({sessions.length})</span>
          <Activity className="w-3 h-3 text-indigo-400" />
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900/10 border border-dashed border-zinc-900 rounded-2xl">
            <Compass className="w-5 h-5 mx-auto text-zinc-700 mb-2" />
            <p className="text-[11px] text-zinc-500 font-medium">No active threads.</p>
          </div>
        ) : (
          sessions.map((sess) => {
            const isSelected = selectedSession?.id === sess.id;
            
            return (
              <div
                key={sess.id}
                onClick={() => onSelectSession(sess)}
                className={`p-3 rounded-xl cursor-pointer transition-all flex items-center gap-3 border ${
                  isSelected
                    ? "bg-zinc-900 border-zinc-800 shadow-sm"
                    : "bg-transparent border-transparent hover:bg-zinc-900/40 hover:border-zinc-900/60"
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm shrink-0">
                  💬
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-xs text-zinc-200 truncate">
                    {sess.name}
                  </h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5 font-medium">
                    {new Date(sess.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
