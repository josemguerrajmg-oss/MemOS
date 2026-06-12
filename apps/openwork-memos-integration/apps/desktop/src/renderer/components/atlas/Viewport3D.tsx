import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  callLLMForScene, buildSceneFromDescriptor, loadModelObject,
  SUPPORTED_MODEL_FORMATS, type SceneDescriptor,
  OLLAMA_BASE_DEFAULT,
} from '@/lib/ollama';

interface ModelInfo { name: string; ext: string; tris: number; sizeKb: number }

interface Props {
  ollamaBase?: string;
  initialPrompt?: string;
  className?: string;
}

export default function Viewport3D({ ollamaBase = OLLAMA_BASE_DEFAULT, initialPrompt, className = '' }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const sceneGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);
  const fileUrlRef = useRef<string | null>(null);

  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [genError, setGenError] = useState('');
  const [promptInput, setPromptInput] = useState('');
  const [currentDescriptor, setCurrentDescriptor] = useState<SceneDescriptor | null>(null);

  // ── Three.js setup
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.01, 1000);
    camera.position.set(4, 3, 5);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.5;
    controls.maxDistance = 80;
    controlsRef.current = controls;

    // Lighting
    const hemi = new THREE.HemisphereLight(0x8ab0e8, 0x0a0e1a, 1.0);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(5, 8, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4a90d9, 0.6);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    // Grid
    const grid = new THREE.GridHelper(20, 40, 0x1d2d42, 0x111d2a);
    grid.name = 'grid';
    scene.add(grid);
    const axes = new THREE.AxesHelper(1.5);
    axes.name = 'axes';
    scene.add(axes);

    // Groups
    const sceneGroup = new THREE.Group();
    sceneGroupRef.current = sceneGroup;
    scene.add(sceneGroup);
    const modelGroup = new THREE.Group();
    modelGroupRef.current = modelGroup;
    scene.add(modelGroup);

    // Animate
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!el) return;
      const rw = el.clientWidth, rh = el.clientHeight;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  // Grid visibility
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const g = scene.getObjectByName('grid');
    const a = scene.getObjectByName('axes');
    if (g) g.visible = showGrid;
    if (a) a.visible = showGrid;
  }, [showGrid]);

  // Wireframe toggle
  useEffect(() => {
    const modelGroup = modelGroupRef.current;
    const sceneGroup = sceneGroupRef.current;
    if (!modelGroup || !sceneGroup) return;
    const toggle = (obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mat = (obj as THREE.Mesh).material;
        const mats = Array.isArray(mat) ? mat : [mat];
        mats.forEach((m) => { (m as THREE.MeshStandardMaterial).wireframe = wireframe; });
      }
    };
    modelGroup.traverse(toggle);
    sceneGroup.traverse(toggle);
  }, [wireframe]);

  const resetCamera = () => {
    const cam = cameraRef.current;
    const ctl = controlsRef.current;
    if (!cam || !ctl) return;
    cam.position.set(4, 3, 5);
    ctl.target.set(0, 0, 0);
    ctl.update();
  };

  const clearModelGroup = useCallback(() => {
    const g = modelGroupRef.current;
    if (!g) return;
    [...g.children].forEach((child) => {
      (child as THREE.Mesh).traverse?.((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mat = m.material;
          (Array.isArray(mat) ? mat : [mat]).forEach((x) => (x as THREE.Material).dispose());
        }
      });
      g.remove(child);
    });
    if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = null; }
  }, []);

  const countTris = (obj: THREE.Object3D): number => {
    let n = 0;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) {
        const idx = m.geometry.index;
        n += idx ? idx.count / 3 : (m.geometry.attributes.position?.count ?? 0) / 3;
      }
    });
    return Math.round(n);
  };

  const fitCamera = (obj: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const cam = cameraRef.current;
    const ctl = controlsRef.current;
    if (!cam || !ctl) return;
    const fov = cam.fov * (Math.PI / 180);
    const dist = (maxDim / 2) / Math.tan(fov / 2) * 2.2;
    cam.position.set(center.x + dist * 0.5, center.y + dist * 0.4, center.z + dist);
    cam.near = maxDim * 0.001;
    cam.far = maxDim * 100;
    cam.updateProjectionMatrix();
    ctl.target.copy(center);
    ctl.update();
  };

  const loadFile = useCallback(async (file: File) => {
    clearModelGroup();
    setModelInfo(null);
    setGenError('');
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_MODEL_FORMATS.includes(ext as typeof SUPPORTED_MODEL_FORMATS[number])) {
      setGenError(`Unsupported format: .${ext}`);
      return;
    }
    const url = URL.createObjectURL(file);
    fileUrlRef.current = url;
    try {
      const obj = await loadModelObject(url, ext);
      const group = modelGroupRef.current!;
      group.add(obj);
      fitCamera(obj);
      setModelInfo({ name: file.name, ext, tris: countTris(obj), sizeKb: Math.round(file.size / 1024) });
    } catch (err) {
      setGenError(`Failed to load: ${(err as Error).message}`);
      URL.revokeObjectURL(url);
      fileUrlRef.current = null;
    }
  }, [clearModelGroup]);

  const generateScene = async (prompt: string) => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setGenError('');
    clearModelGroup();
    try {
      const desc = await callLLMForScene(prompt, ollamaBase);
      setCurrentDescriptor(desc);
      if (sceneGroupRef.current) buildSceneFromDescriptor(desc, sceneGroupRef.current);
      resetCamera();
    } catch (err) {
      setGenError(`Scene gen failed: ${(err as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (initialPrompt) generateScene(initialPrompt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag and drop
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await loadFile(file);
  };

  return (
    <div className={`relative flex flex-col bg-[#060b14] ${className}`}>
      {/* Toolbar */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
        <ToolBtn active={wireframe} onClick={() => setWireframe(!wireframe)} title="Wireframe">⬡</ToolBtn>
        <ToolBtn active={showGrid} onClick={() => setShowGrid(!showGrid)} title="Grid">⊞</ToolBtn>
        <ToolBtn onClick={resetCamera} title="Reset camera">⊙</ToolBtn>
        <label className="cursor-pointer">
          <ToolBtn as="span" title="Open file">↑</ToolBtn>
          <input type="file" className="hidden" accept={SUPPORTED_MODEL_FORMATS.map((f) => `.${f}`).join(',')}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
        </label>
      </div>

      {/* Model info overlay */}
      {modelInfo && (
        <div className="absolute top-3 right-3 z-20 rounded bg-black/70 px-2 py-1 text-[10px] font-mono text-white/60 backdrop-blur">
          <div>{modelInfo.name}</div>
          <div>{modelInfo.tris.toLocaleString()} tris · {modelInfo.sizeKb} KB · .{modelInfo.ext}</div>
        </div>
      )}

      {/* 3D canvas mount */}
      <div
        ref={mountRef}
        className={`flex-1 transition-all duration-200 ${isDragging ? 'opacity-50' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      />

      {/* Drag overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded border-2 border-dashed border-blue-400/70 bg-blue-500/10">
          <span className="text-sm font-medium text-blue-300">Drop 3D file to load</span>
        </div>
      )}

      {/* Empty state */}
      {!modelInfo && !currentDescriptor && !isGenerating && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-white/20">
          <div className="text-3xl">◻</div>
          <div className="text-[11px] tracking-widest uppercase">Drop a 3D file or generate a scene</div>
          <div className="text-[10px] text-white/15">{SUPPORTED_MODEL_FORMATS.map((f) => `.${f}`).join('  ')}</div>
        </div>
      )}

      {/* Loading spinner */}
      {isGenerating && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-blue-400" />
          <span className="text-xs text-white/50">Generating scene via Ollama…</span>
        </div>
      )}

      {/* Error */}
      {genError && (
        <div className="absolute bottom-14 left-3 right-3 z-20 rounded bg-red-900/70 px-3 py-1.5 text-xs text-red-300">
          {genError}
        </div>
      )}

      {/* Scene prompt bar */}
      <form
        className="relative z-20 flex items-center gap-2 border-t border-white/5 bg-black/60 px-3 py-2"
        onSubmit={(e) => { e.preventDefault(); generateScene(promptInput); setPromptInput(''); }}
      >
        <input
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          placeholder="Describe a 3D scene to generate…"
          className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/20 outline-none"
        />
        <button
          type="submit"
          disabled={isGenerating || !promptInput.trim()}
          className="rounded px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/10 disabled:opacity-30 transition-colors"
        >
          {isGenerating ? '…' : 'Generate'}
        </button>
      </form>
    </div>
  );
}

function ToolBtn({
  children, active, onClick, title, as: Tag = 'button',
}: { children: React.ReactNode; active?: boolean; onClick?: () => void; title?: string; as?: 'button' | 'span' }) {
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded text-xs transition-colors
        ${active ? 'bg-blue-500/30 text-blue-300' : 'bg-black/60 text-white/40 hover:bg-white/10 hover:text-white/70'}
        backdrop-blur`}
    >
      {children}
    </Tag>
  );
}
