import { useEffect, useRef, useState } from 'react';

type Category = 'contacts' | 'projects' | 'documents' | 'websites' | 'conversations' | 'decisions';

interface MemoryItem { id: string; title: string; subtitle: string; ts: string; tags: string[] }

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'contacts', label: 'Contacts', icon: '◉' },
  { id: 'projects', label: 'Projects', icon: '◈' },
  { id: 'documents', label: 'Documents', icon: '◻' },
  { id: 'websites', label: 'Websites', icon: '◯' },
  { id: 'conversations', label: 'Conversations', icon: '◎' },
  { id: 'decisions', label: 'Decisions', icon: '◇' },
];

const MOCK_DATA: Record<Category, MemoryItem[]> = {
  contacts: [
    { id: '1', title: 'Alex Chen', subtitle: 'Lead engineer at Meridian Labs', ts: '2h ago', tags: ['engineering', 'ML'] },
    { id: '2', title: 'Priya Sharma', subtitle: 'Head of Product at NovaTech', ts: '1d ago', tags: ['product', 'B2B'] },
    { id: '3', title: 'Jordan Lee', subtitle: 'Founder @ Vecto AI', ts: '3d ago', tags: ['founder', 'AI'] },
  ],
  projects: [
    { id: '1', title: 'ATLAS Command Center', subtitle: 'Desktop automation hub — active', ts: 'now', tags: ['electron', 'AI'] },
    { id: '2', title: 'MemOS Integration', subtitle: 'Memory graph for agent context', ts: '1d ago', tags: ['memory', 'graph'] },
    { id: '3', title: 'Jarvis HUD', subtitle: 'Three.js 3D agent interface — shipped', ts: '4d ago', tags: ['three.js', 'shipped'] },
  ],
  documents: [
    { id: '1', title: 'ATLAS Design Brief', subtitle: '5-screen command center redesign', ts: '1d ago', tags: ['design', 'spec'] },
    { id: '2', title: 'Openwork Architecture', subtitle: 'Electron + Vite + IPC architecture', ts: '2d ago', tags: ['architecture'] },
  ],
  websites: [
    { id: '1', title: 'Anthropic Docs', subtitle: 'Claude API reference', ts: '2h ago', tags: ['AI', 'API'] },
    { id: '2', title: 'Three.js Docs', subtitle: '3D rendering library docs', ts: '1d ago', tags: ['3D', 'WebGL'] },
  ],
  conversations: [
    { id: '1', title: 'ATLAS pivot discussion', subtitle: 'Moved from Jarvis HUD to command center', ts: '1h ago', tags: ['design'] },
    { id: '2', title: 'Ollama LLM setup', subtitle: 'Primary LLM for all agent calls', ts: '3h ago', tags: ['Ollama', 'LLM'] },
  ],
  decisions: [
    { id: '1', title: 'Ollama as primary LLM', subtitle: 'Haiku only as fallback — user preference', ts: '3h ago', tags: ['AI', 'architecture'] },
    { id: '2', title: 'CSS-based HUD corners', subtitle: 'SVG calc() not supported — use divs', ts: '1d ago', tags: ['CSS', 'bug'] },
    { id: '3', title: 'pnpm workaround', subtitle: 'Use node_modules/.bin/ directly — pnpm not in PATH', ts: '2d ago', tags: ['tooling'] },
  ],
};

const NeuralBg = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const nodes: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    const N = 60;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < N; i++) nodes.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, r: Math.random() * 1.5 + 0.5 });
    let frame: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nodes.forEach((n) => { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > canvas.width) n.vx *= -1; if (n.y < 0 || n.y > canvas.height) n.vy *= -1; });
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 140) { ctx.strokeStyle = `rgba(99,102,241,${0.06 * (1 - d / 140)})`; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke(); }
        ctx.fillStyle = `rgba(99,102,241,${0.12})`;
        ctx.beginPath(); ctx.arc(nodes[i].x, nodes[i].y, nodes[i].r, 0, Math.PI * 2); ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />;
};

export default function Memory() {
  const [active, setActive] = useState<Category>('projects');
  const items = MOCK_DATA[active];

  return (
    <div className="relative flex h-screen bg-black text-white overflow-hidden">
      <NeuralBg />

      <div className="relative z-10 flex h-full w-full">
        {/* Category sidebar */}
        <div className="flex w-[200px] flex-col border-r border-white/5 bg-black/70 backdrop-blur-xl">
          <div className="border-b border-white/5 px-4 py-4">
            <div className="text-[10px] uppercase tracking-widest text-white/30">Memory</div>
            <div className="text-base font-semibold text-white/80">Recall</div>
          </div>
          <nav className="flex flex-col gap-0.5 p-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActive(cat.id)}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors
                  ${active === cat.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/40 hover:bg-white/5 hover:text-white/70'}`}
              >
                <span className="text-sm">{cat.icon}</span>
                <span className="text-sm">{cat.label}</span>
                <span className="ml-auto text-[10px] font-mono text-white/25">{MOCK_DATA[cat.id].length}</span>
              </button>
            ))}
          </nav>

          <div className="mt-auto border-t border-white/5 px-4 py-3">
            <div className="text-[10px] text-white/20 font-mono">v1 · mock data</div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col min-w-0">
          <div className="border-b border-white/5 px-6 py-4 bg-black/30 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-white/30">
                  {CATEGORIES.find((c) => c.id === active)?.icon} {active}
                </div>
                <div className="text-lg font-semibold text-white/85">{items.length} items</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/30 hover:text-white/60 cursor-pointer transition-colors">
                + Add
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-xl transition-all hover:border-white/[0.15] hover:bg-white/[0.06] cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-white/85 group-hover:text-white transition-colors">{item.title}</div>
                      <div className="mt-0.5 text-sm text-white/40">{item.subtitle}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/40">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-[10px] font-mono text-white/20">{item.ts}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
