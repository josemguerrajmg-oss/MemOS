import * as THREE from 'three';

// ─── Constants ────────────────────────────────────────────────────────────────

export const OLLAMA_BASE_DEFAULT = 'http://localhost:11434';

export const OLLAMA_PREFERRED = [
  'qwen2.5', 'qwen2', 'llama3.3', 'llama3.2', 'llama3.1', 'llama3',
  'mistral', 'phi4', 'phi3.5', 'phi3', 'gemma3', 'gemma2', 'gemma', 'mixtral', 'qwen',
];

export const OLLAMA_CHAT_SYSTEM =
  'You are ATLAS, a concise AI command center assistant. Keep responses short: 1–3 sentences. For technical commands narrate crisply; for creative prompts respond with the content directly — punchy, no preamble. No markdown, no em-dashes.';

export const SCENE_GEN_SYSTEM = `You are a Three.js 3D scene generator. Return ONLY a JSON object, no prose. Structure:
{"objects":[{"type":"sphere|box|torus|cylinder|cone|icosahedron|ring|plane","size":1.0,"color":"#6366f1","emissive":"#4f46e5","emissiveIntensity":0.5,"metalness":0.3,"roughness":0.3,"position":[0,0,0],"rotation":[0,0,0],"opacity":1.0,"wireframe":false}]}
Rules: 3 to 8 objects. "type" must be one of the listed values. emissiveIntensity 0.3–0.8 for glow. size 0.3–3.5. position between -3.5 and 3.5. rotation in degrees. Colors as #RRGGBB hex.`;

// ─── Model discovery ──────────────────────────────────────────────────────────

export interface OllamaTag {
  name: string;
  details?: { families?: string[] };
}

export function isChatModel(m: OllamaTag): boolean {
  if (/embed|minilm|bert/i.test(m.name)) return false;
  return !(m.details?.families ?? []).some((f) => /bert/i.test(f));
}

export async function resolveOllamaModel(base = OLLAMA_BASE_DEFAULT): Promise<string> {
  let res: Response;
  try { res = await fetch(`${base}/api/tags`); } catch { throw new Error('ollama_down'); }
  if (!res.ok) throw new Error('ollama_down');
  const data = await res.json();
  const chat = ((data.models ?? []) as OllamaTag[]).filter(isChatModel);
  if (!chat.length) throw new Error('ollama_no_models');
  const names = chat.map((m) => m.name);
  for (const pref of OLLAMA_PREFERRED) {
    const m = names.find((n) => n.startsWith(pref));
    if (m) return m;
  }
  return names[0];
}

// ─── Streaming response ───────────────────────────────────────────────────────

export async function* streamOllamaResponse(
  prompt: string,
  base: string,
  model: string,
  system = OLLAMA_CHAT_SYSTEM,
): AsyncGenerator<string> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        options: { temperature: 0.7 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        stream: true,
      }),
    });
  } catch { throw new Error('ollama_down'); }
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line);
        if (d.message?.content) yield d.message.content as string;
        if (d.done) return;
      } catch { /* skip */ }
    }
  }
}

// Fallback: Anthropic Haiku
export async function callAnthropicHaiku(apiKey: string, prompt: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: OLLAMA_CHAT_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  const text: string | undefined = d.content?.[0]?.text;
  if (!text) throw new Error('empty');
  return text;
}

// ─── Scene types ──────────────────────────────────────────────────────────────

export interface SceneObject {
  type: 'sphere' | 'box' | 'torus' | 'cylinder' | 'cone' | 'icosahedron' | 'ring' | 'plane';
  size?: number | [number, number, number];
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
  transparent?: boolean;
  opacity?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  wireframe?: boolean;
}

export interface SceneDescriptor {
  objects?: SceneObject[];
}

const VALID_TYPES = new Set(['sphere','box','torus','cylinder','cone','icosahedron','ring','plane']);
const TYPE_ALIASES: Record<string, SceneObject['type']> = {
  cube:'box', ball:'sphere', orb:'sphere', donut:'torus', tube:'cylinder',
  pyramid:'cone', circle:'ring', flat:'plane', disc:'ring',
};

function num(v: unknown, fb: number, mn: number, mx: number): number {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n)) return fb;
  return Math.min(mx, Math.max(mn, n));
}

function vec3(v: unknown, fb: [number,number,number], mn: number, mx: number): [number,number,number] {
  if (!Array.isArray(v)) return fb;
  return [num(v[0],fb[0],mn,mx), num(v[1],fb[1],mn,mx), num(v[2],fb[2],mn,mx)];
}

function normalizeColor(v: unknown, fb: string): string {
  if (typeof v !== 'string') return fb;
  const s = v.trim();
  if (/^#[0-9a-fA-F]{3,6}$/.test(s) || /^[a-zA-Z]+$/.test(s)) return s;
  return fb;
}

export function normalizeDescriptor(raw: unknown): SceneDescriptor {
  const rawObjs = (raw as { objects?: unknown })?.objects;
  if (!Array.isArray(rawObjs)) return { objects: [] };
  const objects: SceneObject[] = [];
  for (const item of rawObjs.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    let type = String(o.type ?? '').toLowerCase().trim() as SceneObject['type'];
    if (!VALID_TYPES.has(type)) type = TYPE_ALIASES[type] ?? 'sphere';
    const rawSize = Array.isArray(o.size) ? vec3(o.size,[1,1,1],0.1,4) as SceneObject['size'] : num(o.size,1,0.1,4);
    const opacity = num(o.opacity, 1, 0.05, 1);
    objects.push({
      type, size: rawSize,
      color: normalizeColor(o.color, '#7dd3fc'),
      emissive: normalizeColor(o.emissive, '#000000'),
      emissiveIntensity: num(o.emissiveIntensity, 0.4, 0, 1),
      metalness: num(o.metalness, 0.2, 0, 1),
      roughness: num(o.roughness, 0.5, 0, 1),
      opacity, transparent: o.transparent === true || opacity < 1,
      wireframe: o.wireframe === true,
      position: vec3(o.position, [0,0,0], -6, 6),
      rotation: vec3(o.rotation, [0,0,0], -360, 360),
    });
  }
  return { objects };
}

export function buildSceneFromDescriptor(descriptor: SceneDescriptor, group: THREE.Group): void {
  [...group.children].forEach((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else (mat as THREE.Material).dispose();
    }
    group.remove(child);
  });

  (descriptor.objects ?? []).forEach((obj) => {
    try {
      const raw = Array.isArray(obj.size) ? obj.size : [obj.size??1,obj.size??1,obj.size??1];
      const [sw,sh,sd] = raw.map((v) => Math.max(v, 0.1));
      let geo: THREE.BufferGeometry;
      switch (obj.type) {
        case 'box':         geo = new THREE.BoxGeometry(sw,sh,sd); break;
        case 'sphere':      geo = new THREE.SphereGeometry(sw*0.5,32,32); break;
        case 'torus':       geo = new THREE.TorusGeometry(sw*0.65,Math.max(sw*0.08,0.04),14,80); break;
        case 'cylinder':    geo = new THREE.CylinderGeometry(sw*0.4,sw*0.4,sh,32); break;
        case 'cone':        geo = new THREE.ConeGeometry(sw*0.5,sh,32); break;
        case 'icosahedron': geo = new THREE.IcosahedronGeometry(sw*0.5,1); break;
        case 'ring':        geo = new THREE.TorusGeometry(sw*0.65,sw*0.03,8,80); break;
        case 'plane':       geo = new THREE.PlaneGeometry(sw,sh); break;
        default:            geo = new THREE.SphereGeometry(0.5,32,32);
      }
      const opacity = obj.opacity ?? 1;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(obj.color ?? '#7dd3fc'),
        emissive: new THREE.Color(obj.emissive ?? obj.color ?? '#000000'),
        emissiveIntensity: obj.emissiveIntensity ?? 0,
        metalness: obj.metalness ?? 0.2,
        roughness: obj.roughness ?? 0.5,
        transparent: obj.transparent ?? opacity < 1,
        opacity, wireframe: obj.wireframe ?? false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      if (obj.position) mesh.position.set(...obj.position as [number,number,number]);
      if (obj.rotation) {
        const [rx,ry,rz] = obj.rotation;
        mesh.rotation.set(THREE.MathUtils.degToRad(rx),THREE.MathUtils.degToRad(ry),THREE.MathUtils.degToRad(rz));
      }
      group.add(mesh);
    } catch (e) { console.warn('Scene build error:', e); }
  });
}

export async function callLLMForScene(prompt: string, base: string): Promise<SceneDescriptor> {
  const model = await resolveOllamaModel(base);
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model, format: 'json', options: { temperature: 0.5 },
        messages: [
          { role: 'system', content: SCENE_GEN_SYSTEM },
          { role: 'user', content: prompt },
        ],
        stream: false,
      }),
    });
  } catch { throw new Error('ollama_down'); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text: string = (data.message?.content ?? '').trim();
  const stripped = text.replace(/```json\n?|\n?```|```\n?/g, '');
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no_json');
  let parsed: unknown;
  try { parsed = JSON.parse(match[0]); }
  catch {
    const repaired = match[0].replace(/['']/g,"'").replace(/[""]/g,'"').replace(/'/g,'"').replace(/,\s*([}\]])/g,'$1');
    parsed = JSON.parse(repaired);
  }
  return normalizeDescriptor(parsed);
}

// ─── Multi-format model loader ────────────────────────────────────────────────

export const SUPPORTED_MODEL_FORMATS = ['glb','gltf','stl','obj','fbx','ply','dae','3mf'] as const;
export type SupportedFormat = typeof SUPPORTED_MODEL_FORMATS[number];

export function defaultModelMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x9fb4d8, metalness: 0.4, roughness: 0.45,
    emissive: 0x0a1c33, emissiveIntensity: 0.25,
  });
}

export async function loadModelObject(url: string, ext: string): Promise<THREE.Object3D> {
  switch (ext) {
    case 'glb': case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      return (await new GLTFLoader().loadAsync(url)).scene;
    }
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      const geo = await new STLLoader().loadAsync(url);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, defaultModelMaterial());
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      return await new OBJLoader().loadAsync(url);
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      return await new FBXLoader().loadAsync(url);
    }
    case 'ply': {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
      const geo = await new PLYLoader().loadAsync(url);
      geo.computeVertexNormals();
      const mat = defaultModelMaterial();
      if (geo.hasAttribute('color')) mat.vertexColors = true;
      return new THREE.Mesh(geo, mat);
    }
    case 'dae': {
      const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
      const r = await new ColladaLoader().loadAsync(url);
      if (!r?.scene) throw new Error('unsupported_format');
      return r.scene;
    }
    case '3mf': {
      const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
      return await new ThreeMFLoader().loadAsync(url);
    }
    default: throw new Error('unsupported_format');
  }
}
