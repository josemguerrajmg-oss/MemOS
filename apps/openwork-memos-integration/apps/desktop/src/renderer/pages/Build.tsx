import { useNavigate } from 'react-router-dom';

interface BuildType { id: string; icon: string; name: string; description: string; prompt: string; color: string }

const BUILD_TYPES: BuildType[] = [
  { id: 'website', icon: '◻', name: 'Website', description: 'Build a full landing page, blog, or web app', color: '#60a5fa', prompt: 'Build a modern website for me. Ask me what type of site, audience, and key features I need.' },
  { id: 'app', icon: '⌨', name: 'App', description: 'Scaffold a desktop, mobile, or web application', color: '#a78bfa', prompt: 'Help me build an application. Ask about the platform, tech stack, and core features.' },
  { id: 'image', icon: '✦', name: 'Image', description: 'Generate or manipulate images with AI', color: '#f472b6', prompt: 'Help me create or process images. Ask what kind of image I need and the style.' },
  { id: 'video', icon: '◎', name: 'Video', description: 'Script, edit, or generate video content', color: '#fb923c', prompt: 'Help me create video content. Ask about the format, length, style, and goal.' },
  { id: 'automation', icon: '⚙', name: 'Automation', description: 'Build workflows, scripts, and integrations', color: '#34d399', prompt: 'Build an automation for me. Ask what process to automate and what tools are involved.' },
  { id: 'cad', icon: '□', name: 'CAD Model', description: 'Generate or describe 3D models for printing/design', color: '#fbbf24', prompt: 'Help me create a 3D/CAD model. Ask for the object description, dimensions, and intended use.' },
  { id: 'marketing', icon: '◈', name: 'Marketing Campaign', description: 'Design end-to-end marketing campaigns', color: '#f87171', prompt: 'Build a marketing campaign for me. Ask about the product, target audience, channels, and goals.' },
];

export default function Build() {
  const navigate = useNavigate();

  const handleBuild = (type: BuildType) => {
    // Navigate to Command Center with the pre-primed prompt stored in sessionStorage
    sessionStorage.setItem('atlas_prime_prompt', type.prompt);
    navigate('/command');
  };

  return (
    <div className="flex h-screen flex-col bg-black text-white">
      {/* Header */}
      <div className="border-b border-white/5 px-8 py-5">
        <div className="text-[10px] uppercase tracking-widest text-white/30">Build Mode</div>
        <div className="text-xl font-semibold text-white/85">What do you want to build?</div>
        <div className="mt-1 text-sm text-white/35">Select a build type to start an agent session.</div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {BUILD_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => handleBuild(type)}
              className="group flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 text-left backdrop-blur-xl transition-all duration-200 hover:border-white/[0.18] hover:bg-white/[0.07] hover:scale-[1.01]"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
                style={{ backgroundColor: `${type.color}12`, border: `1px solid ${type.color}22` }}
              >
                {type.icon}
              </div>

              <div>
                <div className="font-semibold text-white/85 group-hover:text-white transition-colors" style={{ color: type.color }}>
                  {type.name}
                </div>
                <div className="mt-0.5 text-sm text-white/40 leading-snug">{type.description}</div>
              </div>

              <div
                className="mt-auto flex items-center gap-1 text-[11px] font-medium transition-colors"
                style={{ color: `${type.color}80` }}
              >
                <span>Start building</span>
                <span className="translate-x-0 transition-transform group-hover:translate-x-1">→</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
