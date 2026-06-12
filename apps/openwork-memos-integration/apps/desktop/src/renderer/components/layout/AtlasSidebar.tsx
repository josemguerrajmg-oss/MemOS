import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SettingsDialog from './SettingsDialog';

interface NavItem { icon: string; label: string; path: string; title: string }

const NAV: NavItem[] = [
  { icon: '⌘', label: 'Command', path: '/command', title: 'Command Center' },
  { icon: '□', label: 'Workspace', path: '/workspace', title: 'Workspace' },
  { icon: '◎', label: 'Agents', path: '/agents', title: 'Agent Hub' },
  { icon: '◈', label: 'Memory', path: '/memory', title: 'Memory' },
  { icon: '+', label: 'Build', path: '/build', title: 'Build Mode' },
];

export default function AtlasSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <>
      <div className="flex h-screen w-16 flex-col items-center border-r border-white/5 bg-black/90 py-4 pt-10 backdrop-blur-2xl">
        {/* Nav items */}
        <nav className="flex flex-1 flex-col items-center gap-1">
          {NAV.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                title={item.title}
                className={`group flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-center transition-all duration-150
                  ${active
                    ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                    : 'text-white/30 hover:bg-white/5 hover:text-white/60'
                  }`}
              >
                <span className={`text-base leading-none ${active ? 'text-blue-400' : ''}`}>{item.icon}</span>
                <span className={`text-[8px] uppercase tracking-[0.12em] ${active ? 'text-blue-400/80' : 'text-white/20 group-hover:text-white/40'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          title="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white/25 transition-colors hover:bg-white/5 hover:text-white/50"
        >
          <span className="text-sm">⚙</span>
        </button>
      </div>

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}
