import { useEffect, useRef, useState, useCallback } from 'react';
import { getAccomplish } from '@/lib/accomplish';
import { resolveOllamaModel, streamOllamaResponse, OLLAMA_BASE_DEFAULT } from '@/lib/ollama';
import type { TaskUpdateEvent } from '@accomplish/shared';

interface LogLine { id: number; type: 'user' | 'assistant' | 'tool' | 'system' | 'error'; text: string; ts: number }
interface AgentCard { id: string; icon: string; name: string; description: string; color: string }
interface PermissionReq { id: string; taskId: string; description: string; command?: string }

const AGENTS: AgentCard[] = [
  { id: 'research', icon: '🔍', name: 'Research', description: 'Deep research & analysis', color: '#60a5fa' },
  { id: 'marketing', icon: '📣', name: 'Marketing', description: 'Content & campaigns', color: '#34d399' },
  { id: 'coding', icon: '⌨', name: 'Coding', description: 'Write & review code', color: '#a78bfa' },
  { id: 'design', icon: '✦', name: 'Design', description: 'UI/UX & visuals', color: '#f472b6' },
  { id: 'sales', icon: '◈', name: 'Sales', description: 'Outreach & pipeline', color: '#fb923c' },
  { id: 'engineering', icon: '⚙', name: 'Engineering', description: 'Infra & automation', color: '#fbbf24' },
];

let _logId = 0;
const mkLog = (type: LogLine['type'], text: string): LogLine => ({ id: _logId++, type, text, ts: Date.now() });

export default function Command() {
  const accomplish = getAccomplish();
  const [log, setLog] = useState<LogLine[]>([mkLog('system', 'ATLAS Command Center online.')]);
  const [prompt, setPrompt] = useState('');
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [permissions, setPermissions] = useState<PermissionReq[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const streamIdRef = useRef<number | null>(null);
  const ollamaBaseRef = useRef(OLLAMA_BASE_DEFAULT);

  const addLog = useCallback((type: LogLine['type'], text: string) => {
    setLog((prev) => [...prev, mkLog(type, text)]);
  }, []);

  const appendToLast = useCallback((text: string) => {
    setLog((prev) => {
      if (!prev.length) return prev;
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], text: updated[updated.length - 1].text + text };
      return updated;
    });
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  // Load Ollama config
  useEffect(() => {
    accomplish.getOllamaConfig().then((cfg: { baseUrl?: string; enabled?: boolean }) => {
      if (cfg?.baseUrl) ollamaBaseRef.current = cfg.baseUrl;
    }).catch(() => {});
  }, [accomplish]);

  // Task update subscription
  useEffect(() => {
    const unsub = accomplish.onTaskUpdate((ev: TaskUpdateEvent) => {
      if (ev.taskId !== activeTaskIdRef.current) return;
      if (ev.type === 'message' && ev.message) {
        const { type, content } = ev.message;
        if (type === 'assistant') {
          if (streamIdRef.current === null) {
            streamIdRef.current = _logId;
            addLog('assistant', content);
          } else {
            appendToLast(content);
          }
        } else if (type === 'tool') {
          addLog('tool', `[${ev.message.toolName ?? 'tool'}] ${content}`);
        }
      } else if (ev.type === 'complete') {
        setIsRunning(false);
        streamIdRef.current = null;
        activeTaskIdRef.current = null;
        addLog('system', '─── Task complete ───');
      } else if (ev.type === 'error') {
        setIsRunning(false);
        streamIdRef.current = null;
        addLog('error', ev.message?.content ?? 'Task error');
      }
    });
    return unsub;
  }, [accomplish, addLog, appendToLast]);

  // Permission subscription
  useEffect(() => {
    const unsub = accomplish.onPermissionRequest((req: { id: string; taskId: string; description: string; command?: string }) => {
      setPermissions((prev) => [...prev, req]);
      addLog('system', `Permission requested: ${req.description}`);
    });
    return unsub;
  }, [accomplish, addLog]);

  const approvePermission = (req: PermissionReq, allow: boolean) => {
    accomplish.respondToPermission({ id: req.id, taskId: req.taskId, approved: allow });
    setPermissions((prev) => prev.filter((p) => p.id !== req.id));
    addLog('system', `Permission ${allow ? 'granted' : 'denied'}: ${req.description}`);
  };

  const runOllamaConversation = async (input: string) => {
    addLog('user', input);
    const streamLog = mkLog('assistant', '');
    setLog((prev) => [...prev, streamLog]);
    streamIdRef.current = streamLog.id;
    try {
      const model = await resolveOllamaModel(ollamaBaseRef.current);
      for await (const token of streamOllamaResponse(input, ollamaBaseRef.current, model)) {
        appendToLast(token);
      }
    } catch {
      appendToLast('[Ollama unavailable — start a task via an agent card instead]');
    } finally {
      streamIdRef.current = null;
    }
  };

  const spawnAgentTask = async (agentId: string, customPrompt?: string) => {
    const agent = AGENTS.find((a) => a.id === agentId);
    if (!agent || isRunning) return;
    const taskPrompt = customPrompt || `Act as a ${agent.name} specialist. Assist with ${agent.description.toLowerCase()}. Await my follow-up instructions.`;
    setIsRunning(true);
    setActiveAgent(agentId);
    streamIdRef.current = null;
    addLog('system', `─── Spawning ${agent.name} agent ───`);
    try {
      const result = await accomplish.startTask({ prompt: taskPrompt });
      activeTaskIdRef.current = result?.id ?? result?.taskId ?? null;
    } catch (err) {
      addLog('error', `Failed to start task: ${(err as Error).message}`);
      setIsRunning(false);
      setActiveAgent(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = prompt.trim();
    if (!input) return;
    setPrompt('');

    if (isRunning && activeTaskIdRef.current) {
      // Send as follow-up via a new task start
      addLog('user', input);
      streamIdRef.current = null;
      try {
        const result = await accomplish.startTask({ prompt: input });
        activeTaskIdRef.current = result?.id ?? result?.taskId ?? null;
      } catch (err) { addLog('error', (err as Error).message); }
    } else {
      // Conversational — route to Ollama
      await runOllamaConversation(input);
    }
  };

  const logTypeStyle: Record<LogLine['type'], string> = {
    user: 'text-blue-300',
    assistant: 'text-white/85',
    tool: 'text-emerald-400/80',
    system: 'text-white/30',
    error: 'text-red-400',
  };

  const logPrefix: Record<LogLine['type'], string> = {
    user: '> ',
    assistant: '',
    tool: '⚙ ',
    system: '— ',
    error: '✗ ',
  };

  return (
    <div className="flex h-screen bg-black text-white">
      {/* Agent column */}
      <div className="flex w-[220px] flex-col border-r border-white/5 bg-white/[0.02]">
        <div className="border-b border-white/5 px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-white/30">Agents</div>
        </div>
        <div className="flex flex-col gap-1 p-2 overflow-y-auto flex-1">
          {AGENTS.map((agent) => {
            const active = activeAgent === agent.id && isRunning;
            return (
              <button
                key={agent.id}
                onClick={() => spawnAgentTask(agent.id)}
                disabled={isRunning && activeAgent !== agent.id}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150
                  ${active ? 'bg-white/8 ring-1 ring-white/10' : 'hover:bg-white/5'}
                  disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <span className="text-lg leading-none">{agent.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-white/80">{agent.name}</span>
                    {active && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    )}
                  </div>
                  <div className="truncate text-[10px] text-white/30">{agent.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {isRunning && (
          <div className="border-t border-white/5 px-4 py-3">
            <button
              onClick={() => { accomplish.cancelTask(activeTaskIdRef.current); setIsRunning(false); setActiveAgent(null); }}
              className="w-full rounded-lg bg-red-900/30 py-1.5 text-xs text-red-400 hover:bg-red-900/50 transition-colors"
            >
              Stop task
            </button>
          </div>
        )}
      </div>

      {/* Mission panel */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-3">
          <div>
            <div className="text-sm font-semibold tracking-wide text-white/80">Mission Control</div>
            <div className="text-[10px] text-white/30 font-mono">
              {isRunning ? `TASK · ${activeAgent?.toUpperCase() ?? 'RUNNING'}` : 'STANDBY'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
            <span className="text-[10px] font-mono text-white/25">{new Date().toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Permission widgets */}
        {permissions.length > 0 && (
          <div className="border-b border-white/5 bg-amber-900/10 px-4 py-2 flex flex-col gap-1.5">
            {permissions.map((req) => (
              <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-amber-900/20 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-amber-300">Permission request</div>
                  <div className="truncate text-[10px] text-amber-200/60">{req.description}</div>
                  {req.command && <div className="font-mono text-[9px] text-white/30 truncate">{req.command}</div>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => approvePermission(req, true)}
                    className="rounded px-2 py-1 text-[10px] bg-emerald-900/50 text-emerald-400 hover:bg-emerald-900/80">Allow</button>
                  <button onClick={() => approvePermission(req, false)}
                    className="rounded px-2 py-1 text-[10px] bg-red-900/40 text-red-400 hover:bg-red-900/60">Deny</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Log */}
        <div className="flex-1 overflow-y-auto px-6 py-4 font-mono text-xs leading-relaxed">
          {log.map((line) => (
            <div key={line.id} className={`flex gap-2 ${logTypeStyle[line.type]}`}>
              <span className="shrink-0 text-white/20">{new Date(line.ts).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span className="whitespace-pre-wrap break-words min-w-0">
                <span className="opacity-50">{logPrefix[line.type]}</span>
                {line.text}
                {streamIdRef.current === line.id && isRunning && (
                  <span className="animate-pulse text-blue-400">█</span>
                )}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        {/* Command bar */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-white/5 bg-white/[0.02] px-4 py-3 flex items-center gap-3"
        >
          <div className="text-white/20 text-sm font-mono shrink-0">{'>'}</div>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={isRunning ? 'Send follow-up to agent…' : 'Command ATLAS or spawn an agent…'}
            className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/20 outline-none font-mono"
          />
          <button
            type="submit"
            disabled={!prompt.trim()}
            className="rounded px-3 py-1 text-xs text-blue-400 hover:bg-blue-500/10 disabled:opacity-30 transition-colors font-medium"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
