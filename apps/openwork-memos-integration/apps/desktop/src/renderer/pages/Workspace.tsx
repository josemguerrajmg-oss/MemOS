import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Viewport3D from '@/components/atlas/Viewport3D';
import { getAccomplish } from '@/lib/accomplish';
import { OLLAMA_BASE_DEFAULT } from '@/lib/ollama';
import type { TaskUpdateEvent } from '@accomplish/shared';

interface LogLine { id: number; type: 'assistant' | 'tool' | 'system' | 'error'; text: string }

let _lid = 0;
const mk = (type: LogLine['type'], text: string): LogLine => ({ id: _lid++, type, text });

type ContentTab = '3d' | 'code' | 'output';

export default function Workspace() {
  const { taskId } = useParams<{ taskId?: string }>();
  const accomplish = getAccomplish();
  const [log, setLog] = useState<LogLine[]>([mk('system', 'Workspace ready.')]);
  const [activeTab, setActiveTab] = useState<ContentTab>('3d');
  const [code, setCode] = useState('');
  const [ollamaBase, setOllamaBase] = useState(OLLAMA_BASE_DEFAULT);
  const [scenePrompt, setScenePrompt] = useState('');
  const [sceneInput, setSceneInput] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    accomplish.getOllamaConfig().then((cfg: { baseUrl?: string }) => {
      if (cfg?.baseUrl) setOllamaBase(cfg.baseUrl);
    }).catch(() => {});
  }, [accomplish]);

  useEffect(() => {
    const unsub = accomplish.onTaskUpdate((ev: TaskUpdateEvent) => {
      if (taskId && ev.taskId !== taskId) return;
      if (ev.type === 'message' && ev.message) {
        const { type, content } = ev.message;
        if (type === 'assistant') {
          // Extract code blocks
          const codeMatch = content.match(/```(?:\w+)?\n?([\s\S]*?)```/);
          if (codeMatch) setCode((prev) => prev + '\n' + codeMatch[1]);
          setLog((prev) => [...prev, mk('assistant', content)]);
        } else if (type === 'tool') {
          setLog((prev) => [...prev, mk('tool', `[${ev.message!.toolName ?? 'tool'}] ${content}`)]);
        }
      } else if (ev.type === 'complete') {
        setLog((prev) => [...prev, mk('system', '─── complete ───')]);
      } else if (ev.type === 'error') {
        setLog((prev) => [...prev, mk('error', ev.message?.content ?? 'error')]);
      }
    });
    return unsub;
  }, [accomplish, taskId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const TABS: { id: ContentTab; label: string }[] = [
    { id: '3d', label: '3D View' },
    { id: 'code', label: 'Code' },
    { id: 'output', label: 'Output Log' },
  ];

  const logStyle: Record<LogLine['type'], string> = {
    assistant: 'text-white/80',
    tool: 'text-emerald-400/70',
    system: 'text-white/25',
    error: 'text-red-400',
  };

  return (
    <div className="flex h-screen bg-black text-white">
      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Tab bar */}
        <div className="flex items-center gap-0 border-b border-white/5 bg-white/[0.02] px-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-medium transition-colors border-b-2 -mb-px
                ${activeTab === tab.id
                  ? 'border-blue-400 text-blue-400'
                  : 'border-transparent text-white/30 hover:text-white/60'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 relative">
          {activeTab === '3d' && (
            <Viewport3D
              ollamaBase={ollamaBase}
              initialPrompt={scenePrompt || undefined}
              className="absolute inset-0"
            />
          )}

          {activeTab === 'code' && (
            <div className="absolute inset-0 overflow-auto p-4">
              {code ? (
                <pre className="text-xs font-mono text-emerald-300/80 whitespace-pre-wrap break-words">{code}</pre>
              ) : (
                <div className="flex h-full items-center justify-center text-white/20 text-sm">
                  Code output from tasks will appear here.
                </div>
              )}
            </div>
          )}

          {activeTab === 'output' && (
            <div className="absolute inset-0 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
              {log.map((line) => (
                <div key={line.id} className={`${logStyle[line.type]} whitespace-pre-wrap break-words mb-0.5`}>
                  {line.text}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        {/* 3D scene prompt bar (only on 3D tab) */}
        {activeTab === '3d' && (
          <form
            className="border-t border-white/5 bg-black/80 px-4 py-2 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); setScenePrompt(sceneInput); setSceneInput(''); }}
          >
            <input
              value={sceneInput}
              onChange={(e) => setSceneInput(e.target.value)}
              placeholder="Describe a 3D scene…"
              className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/20 outline-none"
            />
            <button type="submit" className="text-xs text-blue-400 hover:text-blue-300">Generate</button>
          </form>
        )}
      </div>

      {/* Task log sidebar */}
      <div className="flex w-[300px] flex-col border-l border-white/5 bg-white/[0.02]">
        <div className="border-b border-white/5 px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-white/30">Task Log</div>
          {taskId && <div className="font-mono text-[9px] text-white/20 truncate">{taskId}</div>}
        </div>
        <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
          {log.map((line) => (
            <div key={line.id} className={`${logStyle[line.type]} whitespace-pre-wrap break-words mb-1`}>
              {line.text}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
