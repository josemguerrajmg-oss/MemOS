import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccomplish } from '@/lib/accomplish';
import type { Task } from '@accomplish/shared';

interface AgentDef {
  id: string; icon: string; name: string; description: string; color: string; prompt: string;
}

const AGENT_DEFS: AgentDef[] = [
  { id: 'research', icon: '🔍', name: 'Research', description: 'Deep research & synthesis', color: '#60a5fa', prompt: 'Act as a Research specialist. Conduct thorough research and provide comprehensive analysis.' },
  { id: 'marketing', icon: '📣', name: 'Marketing', description: 'Content & campaign creation', color: '#34d399', prompt: 'Act as a Marketing specialist. Create compelling content and campaigns.' },
  { id: 'coding', icon: '⌨', name: 'Coding', description: 'Code generation & review', color: '#a78bfa', prompt: 'Act as a Coding specialist. Write clean, production-ready code.' },
  { id: 'design', icon: '✦', name: 'Design', description: 'UI/UX & visual design', color: '#f472b6', prompt: 'Act as a Design specialist. Create intuitive and beautiful user experiences.' },
  { id: 'sales', icon: '◈', name: 'Sales', description: 'Outreach & deal flow', color: '#fb923c', prompt: 'Act as a Sales specialist. Help with outreach, pitches, and closing deals.' },
  { id: 'engineering', icon: '⚙', name: 'Engineering', description: 'Infra & automation', color: '#fbbf24', prompt: 'Act as an Engineering specialist. Build reliable infrastructure and automations.' },
];

const NeuralBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nodes: { x: number; y: number; vx: number; vy: number }[] = [];
    const N = 40;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < N; i++) nodes.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3 });

    let frame: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nodes.forEach((n) => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
      });
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            ctx.strokeStyle = `rgba(59,130,246,${0.05 * (1 - d / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
          }
        }
        ctx.fillStyle = 'rgba(59,130,246,0.08)';
        ctx.beginPath(); ctx.arc(nodes[i].x, nodes[i].y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />;
};

export default function Agents() {
  const navigate = useNavigate();
  const accomplish = getAccomplish();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    accomplish.listTasks().then((t: Task[]) => setTasks(Array.isArray(t) ? t : [])).catch(() => {});
  }, [accomplish]);

  const getAgentTaskCount = (agentId: string) => {
    return tasks.filter((t) => (t.prompt ?? '').toLowerCase().includes(agentId)).length;
  };

  const getAgentStatus = (_agentId: string): 'idle' | 'running' => 'idle';

  const launchAgent = async (def: AgentDef) => {
    if (launching) return;
    setLaunching(def.id);
    try {
      await accomplish.startTask({ prompt: def.prompt });
      navigate('/command');
    } catch (err) {
      console.error('Failed to launch agent:', err);
    } finally {
      setLaunching(null);
    }
  };

  return (
    <div className="relative flex h-screen flex-col bg-black text-white overflow-hidden">
      <NeuralBackground />

      <div className="relative z-10 flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-white/5 px-8 py-4">
          <div className="text-xs uppercase tracking-widest text-white/30">Agent Hub</div>
          <div className="text-lg font-semibold text-white/80">Active Agents</div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
            {AGENT_DEFS.map((def) => {
              const status = getAgentStatus(def.id);
              const count = getAgentTaskCount(def.id);
              const isLaunching = launching === def.id;

              return (
                <button
                  key={def.id}
                  onClick={() => launchAgent(def)}
                  disabled={!!launching}
                  className="group relative flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 text-left backdrop-blur-xl transition-all duration-200
                    hover:border-white/[0.15] hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {/* Status dot */}
                  <div className="absolute right-4 top-4">
                    <span className={`h-2 w-2 rounded-full inline-block ${status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-xl"
                      style={{ backgroundColor: `${def.color}15`, border: `1px solid ${def.color}25` }}
                    >
                      {def.icon}
                    </div>
                    <div>
                      <div className="font-semibold text-white/85" style={{ color: def.color }}>{def.name}</div>
                      <div className="text-xs text-white/40">{def.description}</div>
                    </div>
                  </div>

                  {/* Task count sparkline — stable heights seeded by agent id */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-end gap-px h-5">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const seed = (def.id.charCodeAt(i % def.id.length) * 13 + i * 7) % 100;
                        const h = Math.max(2, (seed / 100) * 18);
                        return (
                          <div
                            key={i}
                            className="w-1.5 rounded-sm"
                            style={{ height: `${h}px`, backgroundColor: `${def.color}40` }}
                          />
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-white/25 font-mono">{count} task{count !== 1 ? 's' : ''}</span>
                  </div>

                  {isLaunching && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/60" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
