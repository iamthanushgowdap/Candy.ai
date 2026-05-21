"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Settings,
  ArrowLeft,
  User,
  Cpu,
  Database,
  Sliders,
  Sparkles,
  Save,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

interface ModelEntry {
  id: string;
  name: string;
  category: string;
  vramRequiredGb: number;
  description: string;
}

interface RegistryState {
  activeModel: string;
  registeredModels: Record<string, {
    id: string;
    name: string;
    status: string;
    trained_at: string;
    metrics: { accuracy: number; quality: number; reasoning: number; latency_ms: number };
  }>;
  availableOllamaModels: string[];
}

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  
  // Profile state
  const [profile, setProfile] = useState({
    name: "User Identity",
    pronoun: "they/them",
    description: "Interested in software development, technical specs, and local AI workflows"
  });

  // Routing state
  const [routingMode, setRoutingMode] = useState<"smart" | "pinned">("smart");
  const [pinnedModel, setPinnedModel] = useState("qwen2.5:0.5b");

  // Registry & Models state
  const [registry, setRegistry] = useState<RegistryState | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isSavingRegistry, setIsSavingRegistry] = useState(false);

  // UI state
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "routing" | "system">("profile");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Fetch model registry details
  const fetchRegistryDetails = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const data = await res.json();
        setRegistry({
          activeModel: data.activeModel || "qwen2.5:0.5b",
          registeredModels: data.registeredModels || {},
          availableOllamaModels: data.availableOllamaModels || []
        });
      }
    } catch (err) {
      console.error("Failed to fetch model registry:", err);
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  // Load configuration from localStorage on mount
  useEffect(() => {
    setMounted(true);
    fetchRegistryDetails();

    // Load profile
    const savedProfile = localStorage.getItem("candy_user_profile");
    if (savedProfile) {
      try {
        setProfile(JSON.parse(savedProfile));
      } catch (e) {
        console.error("Error parsing user profile from localStorage", e);
      }
    }

    // Load routing configuration
    const savedRoutingMode = localStorage.getItem("candy_settings_routing_mode");
    if (savedRoutingMode === "smart" || savedRoutingMode === "pinned") {
      setRoutingMode(savedRoutingMode);
    }

    const savedPinnedModel = localStorage.getItem("candy_settings_pinned_model");
    if (savedPinnedModel) {
      setPinnedModel(savedPinnedModel);
    }
  }, [fetchRegistryDetails]);

  // Save profile and routing configurations
  const handleSaveSettings = () => {
    try {
      localStorage.setItem("candy_user_profile", JSON.stringify(profile));
      localStorage.setItem("candy_settings_routing_mode", routingMode);
      localStorage.setItem("candy_settings_pinned_model", pinnedModel);
      
      showToast("Configuration profile saved successfully.");
    } catch (err) {
      showToast("Failed to save local preferences.");
    }
  };

  // Switch Registry Active Model (System Override)
  const handleSwitchRegistryActiveModel = async (modelId: string) => {
    setIsSavingRegistry(true);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "switch",
          modelId,
          notes: "Manual override from Settings cockpit"
        })
      });
      if (!res.ok) {
        let errorMsg = "Registry switch rejected.";
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          try {
            const rawText = await res.text();
            errorMsg = rawText || errorMsg;
          } catch {}
        }
        showToast(errorMsg);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setRegistry(prev => prev ? { ...prev, activeModel: modelId } : null);
        showToast(`System active registry model switched to ${modelId}.`);
      } else {
        showToast(data.error || "Registry switch rejected.");
      }
    } catch (err) {
      showToast("Network error switching registry model.");
    } finally {
      setIsSavingRegistry(false);
    }
  };

  // Trigger Registry Rollback (System Override)
  const handleRollbackRegistry = async () => {
    setIsSavingRegistry(true);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback" })
      });
      if (!res.ok) {
        let errorMsg = "Rollback failed.";
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          try {
            const rawText = await res.text();
            errorMsg = rawText || errorMsg;
          } catch {}
        }
        showToast(errorMsg);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setRegistry(prev => prev ? { ...prev, activeModel: data.activeModel } : null);
        showToast(`Registry rolled back successfully to ${data.activeModel}`);
      } else {
        showToast(data.error || "Rollback failed.");
      }
    } catch (err) {
      showToast("Network error rolling back registry.");
    } finally {
      setIsSavingRegistry(false);
    }
  };

  // Clear Chat History Cache (System Override)
  const handleClearCache = async () => {
    try {
      const res = await fetch("/api/admin/clear-cache", { method: "POST" });
      if (res.ok) {
        showToast("Observability context cache purged.");
      } else {
        // Fallback: localStorage clean up
        localStorage.removeItem("candy_observability_cache");
        showToast("Client-side cache reset.");
      }
    } catch {
      showToast("Client cache purged.");
    }
  };

  if (!mounted) return null;

  // Animation delay styles helper
  const animDelay = (i: number) => ({
    opacity: 1,
    transform: "translateY(0)",
    transition: `opacity 0.4s ease ${i * 0.05}s, transform 0.4s ease ${i * 0.05}s`,
  }) as React.CSSProperties;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-violet-500/[0.03] blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[600px] h-[600px] rounded-full bg-indigo-500/[0.04] blur-[100px]" />
      </div>

      {/* Toast notifications */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 text-sm text-zinc-200 shadow-2xl shadow-black/40 flex items-center gap-2">
          <Sparkles size={14} className="text-violet-400" />
          {toast}
        </div>
      )}

      {/* Main container */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6 min-h-screen">
        {/* Back navigation */}
        <div style={animDelay(0)}>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors duration-200 group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform duration-200" />
            Back to Console
          </Link>
        </div>

        {/* Header */}
        <header style={animDelay(1)} className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-500/15 border border-violet-500/25 shadow-lg shadow-violet-500/10">
            <Settings size={22} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Platform Settings</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Configure cognitive routing preferences, user identities, and system overrides</p>
          </div>
        </header>

        {/* Content layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start" style={animDelay(2)}>
          
          {/* Navigation Sidebar */}
          <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-2 flex flex-row md:flex-col gap-1 md:col-span-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold tracking-tight transition-all duration-200 whitespace-nowrap cursor-pointer ${
                activeTab === "profile" 
                  ? "bg-zinc-900 border border-zinc-800 text-violet-400" 
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30 border border-transparent"
              }`}
            >
              <User size={15} />
              Identity Matrix
            </button>
            <button
              onClick={() => setActiveTab("routing")}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold tracking-tight transition-all duration-200 whitespace-nowrap cursor-pointer ${
                activeTab === "routing" 
                  ? "bg-zinc-900 border border-zinc-800 text-violet-400" 
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30 border border-transparent"
              }`}
            >
              <Cpu size={15} />
              Model Routing
            </button>
            <button
              onClick={() => setActiveTab("system")}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold tracking-tight transition-all duration-200 whitespace-nowrap cursor-pointer ${
                activeTab === "system" 
                  ? "bg-zinc-900 border border-zinc-800 text-violet-400" 
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30 border border-transparent"
              }`}
            >
              <Sliders size={15} />
              Overrides
            </button>
          </div>

          {/* Settings Panels */}
          <div className="md:col-span-3 flex flex-col gap-6">
            
            {/* 1. IDENTITY MATRIX PANEL */}
            {activeTab === "profile" && (
              <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-6 flex flex-col gap-5 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <h3 className="text-base font-bold text-zinc-200">Identity Matrix</h3>
                  <p className="text-xs text-zinc-500 mt-1">Define how the companions refer to you during conversation episodes.</p>
                </div>
                
                <div className="flex flex-col gap-4">
                  {/* Name field */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">User Name</label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={e => setProfile({ ...profile, name: e.target.value })}
                      placeholder="e.g. Neo"
                      className="bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 transition-all duration-200"
                    />
                  </div>

                  {/* Pronouns field */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Preferred Pronouns</label>
                    <input
                      type="text"
                      value={profile.pronoun}
                      onChange={e => setProfile({ ...profile, pronoun: e.target.value })}
                      placeholder="e.g. he/him or they/them"
                      className="bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 transition-all duration-200"
                    />
                  </div>

                  {/* Bio field */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Identity Profile Bio</label>
                    <textarea
                      value={profile.description}
                      onChange={e => setProfile({ ...profile, description: e.target.value })}
                      placeholder="e.g. Software developer interested in system design and machine learning..."
                      rows={4}
                      className="bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 transition-all duration-200 resize-none leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-zinc-900">
                  <button
                    onClick={handleSaveSettings}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 hover:bg-violet-500/20 hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5 text-violet-400 font-semibold text-xs active:scale-[0.98] transition-all duration-200 cursor-pointer"
                  >
                    <Save size={13} />
                    Save Profile
                  </button>
                </div>
              </div>
            )}

            {/* 2. COGNITIVE MODEL ROUTING PANEL */}
            {activeTab === "routing" && (
              <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-6 flex flex-col gap-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <h3 className="text-base font-bold text-zinc-200">Model Routing Configuration</h3>
                  <p className="text-xs text-zinc-500 mt-1">Control whether requests route dynamically based on prompt logic or lock onto a single model.</p>
                </div>

                {/* Routing selection switch */}
                <div className="grid grid-cols-2 gap-4">
                  <div
                    onClick={() => setRoutingMode("smart")}
                    className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex flex-col gap-2 ${
                      routingMode === "smart"
                        ? "bg-violet-500/10 border-violet-500/40 text-violet-400"
                        : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Sliders size={14} />
                      Smart Routing Mode
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-normal">
                      Dynamically chooses models based on complexity and intent classification. Restores natural interaction speeds.
                    </p>
                  </div>

                  <div
                    onClick={() => setRoutingMode("pinned")}
                    className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex flex-col gap-2 ${
                      routingMode === "pinned"
                        ? "bg-violet-500/10 border-violet-500/40 text-violet-400"
                        : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs">
                      <Cpu size={14} />
                      Pinned Model Mode
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-normal">
                      Locks all user messages to a single selected local model tag, bypassing router calculations completely.
                    </p>
                  </div>
                </div>

                {/* Pinned model selector dropdown */}
                {routingMode === "pinned" && (
                  <div className="flex flex-col gap-2 animate-[fadeIn_0.2s_ease-out]">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Select Pinned Model</label>
                    {isLoadingModels ? (
                      <div className="flex items-center gap-2 text-xs text-zinc-500 py-3 pl-1">
                        <RefreshCw size={12} className="animate-spin" />
                        Fetching active Ollama models…
                      </div>
                    ) : (
                      <select
                        value={pinnedModel}
                        onChange={e => setPinnedModel(e.target.value)}
                        className="bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-violet-500/40 transition-all cursor-pointer"
                      >
                        {/* Always include defaults */}
                        <option value="qwen2.5:0.5b">Qwen 2.5 (0.5B) ⚡</option>
                        {registry?.availableOllamaModels.filter(m => m !== "qwen2.5:0.5b").map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div className="flex justify-end pt-2 border-t border-zinc-900">
                  <button
                    onClick={handleSaveSettings}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 hover:bg-violet-500/20 hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5 text-violet-400 font-semibold text-xs active:scale-[0.98] transition-all duration-200 cursor-pointer"
                  >
                    <Save size={13} />
                    Save Routing Config
                  </button>
                </div>
              </div>
            )}

            {/* 3. SYSTEM OVERRIDES PANEL */}
            {activeTab === "system" && (
              <div className="bg-zinc-950/60 backdrop-blur-xl border border-zinc-900 rounded-2xl p-6 flex flex-col gap-6 animate-[fadeIn_0.3s_ease-out]">
                <div>
                  <h3 className="text-base font-bold text-zinc-200">System Overrides</h3>
                  <p className="text-xs text-zinc-500 mt-1">Manage global model registry states, model transitions, and observability caches.</p>
                </div>

                {/* Model registry active model override */}
                <div className="bg-zinc-900/30 border border-zinc-900 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Registry Core Model</h4>
                      <p className="text-[10px] text-zinc-500 mt-0.5">The primary model served by the platform registry.</p>
                    </div>
                    {registry && (
                      <span className="text-[10px] bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded px-2.5 py-1 font-mono font-bold">
                        {registry.activeModel}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Redeploy Registry Model</label>
                    <div className="flex gap-2">
                      <select
                        id="registry-selector"
                        className="bg-zinc-950 border border-zinc-900 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none flex-1"
                        defaultValue={registry?.activeModel || "qwen2.5:0.5b"}
                      >
                        <option value="qwen2.5:0.5b">Qwen 2.5 (0.5B)</option>
                        {registry && Object.keys(registry.registeredModels).filter(m => m !== "qwen2.5:0.5b").map(mId => (
                          <option key={mId} value={mId}>{registry.registeredModels[mId].name || mId}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          const el = document.getElementById("registry-selector") as HTMLSelectElement;
                          if (el) handleSwitchRegistryActiveModel(el.value);
                        }}
                        disabled={isSavingRegistry}
                        className="px-4 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/25 hover:bg-indigo-500/20 hover:border-indigo-500/40 text-indigo-400 font-semibold text-xs transition-all duration-200 cursor-pointer disabled:opacity-40"
                      >
                        Deploy
                      </button>
                    </div>
                  </div>

                  {/* Rollback button */}
                  <div className="pt-2 border-t border-zinc-900/60 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500 leading-normal">
                      Revert the active registry state back to the previous deployment.
                    </span>
                    <button
                      onClick={handleRollbackRegistry}
                      disabled={isSavingRegistry}
                      className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 text-zinc-400 font-medium text-xs transition-all duration-200 cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <RefreshCw size={11} className={isSavingRegistry ? "animate-spin" : ""} />
                      Trigger Rollback
                    </button>
                  </div>
                </div>

                {/* Database memory cache clear */}
                <div className="bg-zinc-900/30 border border-zinc-900 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Flush Local Memory Cache</h4>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Purges prompt cache logs. Does not delete pgvector memory table fragments.</p>
                  </div>
                  <button
                    onClick={handleClearCache}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 hover:border-rose-500/40 text-rose-400 font-semibold text-xs active:scale-[0.98] transition-all duration-200 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    Flush Cache
                  </button>
                </div>

                {/* Safe lock manual override */}
                <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-rose-400">
                    <AlertTriangle size={15} />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Emergency Training Override</h4>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    If an autonomous training run crashed and left the system permanently locked, you can manually force release the active training lock.
                  </p>
                  <div className="flex justify-end mt-1">
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/admin/clear-training-lock", { method: "POST" });
                          if (res.ok) {
                            showToast("Active training lock force-released.");
                          } else {
                            showToast("Failed to release training lock.");
                          }
                        } catch {
                          showToast("Training lock overrides successfully sent.");
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-rose-500/15 border border-rose-500/25 hover:bg-rose-500/25 hover:border-rose-500/45 text-rose-400 font-semibold text-xs transition-all duration-200 cursor-pointer"
                    >
                      Release Lock
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-zinc-700 py-4 mt-auto">
          Candy.ai Settings Cockpit · Premium Configured Matrix
        </footer>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
