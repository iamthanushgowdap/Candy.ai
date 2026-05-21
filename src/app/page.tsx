"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Plus, 
  Volume2, 
  VolumeX, 
  User, 
  Activity, 
  Compass, 
  Sparkles, 
  Paperclip, 
  Square, 
  Send, 
  Trash2, 
  X, 
  ShieldCheck, 
  Edit3,
  Menu,
  Database,
  Cpu,
  Brain,
  MessageSquare
} from "lucide-react";

import { Sidebar } from "@/components/Sidebar";
import { MessageBubble } from "@/components/MessageBubble";
import { supabase } from "@/lib/supabaseClient";

interface ChatSession {
  id: string;
  name: string;
  created_at: string;
}

interface Message {
  id: string;
  session_id: string;
  sender: "user" | "companion" | "system";
  content: string;
  created_at: string;
  feedback?: "up" | "down" | null;
  feedback_correction?: string | null;
  feedback_reason?: string | null;
}

const STARTER_PROMPTS = [
  "Design a personal dashboard in Next.js",
  "Explain quantum computing in simple terms",
  "Write a script to visualize data in Python",
  "Help me debug a React memory leak"
];

export default function Home() {
  // Navigation & Sessions
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  // Settings & Routing States
  const [routingMode, setRoutingMode] = useState<"smart" | "pinned">("smart");
  const [pinnedModel, setPinnedModel] = useState("qwen2.5:0.5b");
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Telemetry Observability states (Headers / JSON trace)
  const [allocatedModel, setAllocatedModel] = useState("");
  const [resolvedModel, setResolvedModel] = useState("");
  const [routingReason, setRoutingReason] = useState("");
  const [complexityScore, setComplexityScore] = useState(0);
  const [routingConfidence, setRoutingConfidence] = useState(0);
  
  // UI states
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // User Profile
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userName, setUserName] = useState("User Identity");
  const [userProfile, setUserProfile] = useState({
    name: "User Identity",
    pronoun: "they/them",
    description: "Interested in software development, technical specs, and local AI workflows"
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentControllerRef = useRef<AbortController | null>(null);

  // Helper: Toast
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Helper: Synth Beep (wow factor)
  const playAmbientPulse = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5 note
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      // AudioContext fails if not user interacted yet
    }
  }, [soundEnabled]);

  // Fetch all chat threads from Supabase
  const fetchSessions = useCallback(async (selectId?: string) => {
    try {
      const { data: dbSessions, error } = await supabase
        .from("candy_sessions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped: ChatSession[] = (dbSessions || []).map((s) => ({
        id: s.id,
        name: s.title || "Untitled Conversation",
        created_at: s.created_at
      }));

      setSessions(mapped);

      if (mapped.length > 0) {
        if (selectId) {
          const found = mapped.find(s => s.id === selectId);
          if (found) setSelectedSession(found);
        } else if (!selectedSession) {
          setSelectedSession(mapped[0]);
        }
      } else {
        setSelectedSession(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Error fetching sessions:", err);
    }
  }, [selectedSession]);

  // Fetch messages inside a conversation thread
  const fetchMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/messages?sessionId=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  }, []);

  // Fetch session data on selected thread change
  useEffect(() => {
    if (selectedSession) {
      fetchMessages(selectedSession.id);
    }
  }, [selectedSession, fetchMessages]);

  // Initial load
  useEffect(() => {
    fetchSessions();

    const savedProfile = localStorage.getItem("candy_user_profile");
    if (savedProfile) {
      try {
        const parsed = JSON.parse(savedProfile);
        setUserName(parsed.name || "User Identity");
        setUserProfile(parsed);
      } catch (e) {
        console.error("Error loading user profile:", e);
      }
    }

    const savedRoutingMode = localStorage.getItem("candy_settings_routing_mode");
    if (savedRoutingMode === "smart" || savedRoutingMode === "pinned") {
      setRoutingMode(savedRoutingMode as "smart" | "pinned");
    }

    const savedPinnedModel = localStorage.getItem("candy_settings_pinned_model");
    if (savedPinnedModel) {
      setPinnedModel(savedPinnedModel);
    }
  }, [fetchSessions]);

  // Scroll chat list to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Clean timers
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Initialize a new conversation thread
  const handleNewSession = async () => {
    try {
      const { data: newSession, error } = await supabase
        .from("candy_sessions")
        .insert({ title: "New Conversation" })
        .select()
        .single();

      if (error) throw error;

      if (newSession) {
        await fetchSessions(newSession.id);
        setMessages([]);
        showToast("New conversation thread initialized.");
        playAmbientPulse();
      }
    } catch (err) {
      console.error("Failed to initialize conversation thread:", err);
      showToast("Error creating conversation.");
    }
  };

  // Keyboard shortcut: Abort generation
  const handleAbort = () => {
    if (currentControllerRef.current) {
      currentControllerRef.current.abort();
      setIsLoading(false);
      setIsTyping(false);
      showToast("Generation cancelled.");
    }
  };

  // Submit chat prompt
  const handleSendMessage = async (customMessage?: string) => {
    const textToSend = (customMessage || inputMessage).trim();
    if (!textToSend || isLoading) return;

    setInputMessage("");
    setIsLoading(true);
    setIsTyping(true);

    // Cancel any active stream controller first
    if (currentControllerRef.current) {
      currentControllerRef.current.abort();
    }

    const controller = new AbortController();
    currentControllerRef.current = controller;

    let activeSessionId = selectedSession?.id || "";

    // Optimistically add user message
    const userTempMsg: Message = {
      id: Math.random().toString(),
      session_id: activeSessionId,
      sender: "user",
      content: textToSend,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userTempMsg]);

    try {
      const activeModelParam = routingMode === "smart" ? null : pinnedModel;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          message: textToSend,
          userProfile,
          model: activeModelParam,
          stream: true
        }),
        signal: controller.signal
      });

      if (res.status === 429) {
        let errorMessage = "Rate limit reached. Please wait.";
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          try {
            const rawText = await res.text();
            errorMessage = rawText || errorMessage;
          } catch {}
        }
        showToast(errorMessage);
        setMessages((prev) => prev.filter(m => m.id !== userTempMsg.id));
        setIsLoading(false);
        setIsTyping(false);
        return;
      }

      if (!res.ok) {
        let errorMessage = "Failed to communicate with AI orchestrator.";
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          try {
            const rawText = await res.text();
            errorMessage = rawText || errorMessage;
          } catch {}
        }
        throw new Error(errorMessage);
      }

      // Check stream type headers
      const returnedSessionId = res.headers.get("x-session-id") || activeSessionId;
      const allocatedModelHeader = res.headers.get("x-allocated-model") || "";
      const resolvedModelHeader = res.headers.get("x-resolved-model") || "";
      const routingReasonHeader = res.headers.get("x-routing-reason") || "";
      const complexityScoreHeader = parseFloat(res.headers.get("x-complexity-score") || "0");
      const confidenceHeader = parseFloat(res.headers.get("x-confidence") || "0");

      if (allocatedModelHeader) setAllocatedModel(allocatedModelHeader);
      if (resolvedModelHeader) setResolvedModel(resolvedModelHeader);
      if (routingReasonHeader) setRoutingReason(routingReasonHeader);
      setComplexityScore(complexityScoreHeader);
      setRoutingConfidence(confidenceHeader);

      // Handle session auto-generation updates
      if (!activeSessionId && returnedSessionId) {
        await fetchSessions(returnedSessionId);
      }

      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("text/event-stream") && res.body) {
        // Stream text reader
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        const assistantTempId = Math.random().toString();
        // Append initial assistant message
        setMessages((prev) => [
          ...prev,
          {
            id: assistantTempId,
            session_id: returnedSessionId,
            sender: "companion",
            content: "",
            created_at: new Date().toISOString()
          }
        ]);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const token = decoder.decode(value);
            fullContent += token;

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantTempId
                  ? { ...m, content: fullContent }
                  : m
              )
            );
          }
          playAmbientPulse();
        } finally {
          reader.releaseLock();
        }
      } else {
        // Non-streaming response payload
        const data = await res.json();
        
        if (data.allocatedModel) setAllocatedModel(data.allocatedModel);
        if (data.resolvedModel) setResolvedModel(data.resolvedModel);
        if (data.routingReason) {
          setRoutingReason(data.routingReason.reason || "");
          setComplexityScore(data.routingReason.complexityScore || 0);
          setRoutingConfidence(data.routingReason.confidence || 0);
        }

        const assistantMsg: Message = {
          id: Math.random().toString(),
          session_id: data.sessionId || returnedSessionId,
          sender: "companion",
          content: data.response || "",
          created_at: new Date().toISOString()
        };
        setMessages((prev) => [...prev, assistantMsg]);
        playAmbientPulse();
      }

      // Re-fetch database messages to ensure synchrony
      if (returnedSessionId) {
        await fetchMessages(returnedSessionId);
      }

    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("Failed to execute chat request:", err);
      showToast(err.message || "Network error. Please verify local servers.");
      // Rollback user input state
      setInputMessage(textToSend);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
      currentControllerRef.current = null;
    }
  };

  // Submit thumbs-up/down feedback
  const handleFeedbackSubmit = async (
    messageId: string, 
    feedback: "up" | "down", 
    correction?: string, 
    reason?: string
  ) => {
    try {
      const targetMsg = messages.find((m) => m.id === messageId);
      const sessId = targetMsg?.session_id || selectedSession?.id || "";
      const msgContent = targetMsg?.content || "";

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, feedback, feedback_correction: correction, feedback_reason: reason }
            : msg
        )
      );

      const res = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          sessionId: sessId,
          content: msgContent,
          feedback,
          correction,
          reason
        })
      });

      if (res.ok) {
        showToast(feedback === "up" ? "Thank you for the positive feedback!" : "Feedback logged. We'll use this to improve.");
      } else {
        console.error("Failed to save feedback");
      }
    } catch (err) {
      console.error("Error submitting feedback:", err);
    }
  };

  const handleClearHistory = async () => {
    if (!selectedSession) return;
    try {
      const res = await fetch(`/api/messages?sessionId=${selectedSession.id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setMessages([]);
        showToast("Conversation cache cleared.");
        playAmbientPulse();
      } else {
        showToast("Failed to clear chat cache.");
      }
    } catch (err) {
      console.error("Error clearing chat cache:", err);
      showToast("Error clearing chat cache.");
    }
  };

  // Document Ingestion/Upload
  const handleFileUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text || text.trim().length === 0) {
        showToast("Uploaded document is empty.");
        return;
      }

      setIsUploading(true);
      showToast(`Ingesting "${file.name}" into pgvector matrix...`);

      try {
        const response = await fetch("/api/documents/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            text: text
          })
        });

        if (!response.ok) {
          let errorMsg = "Failed to vector chunk document.";
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch {
            try {
              const rawText = await response.text();
              errorMsg = rawText || errorMsg;
            } catch {}
          }
          showToast(errorMsg);
          return;
        }

        const data = await response.json();
        if (data.success) {
          showToast(`Vectorized ${data.insertedChunks} sections of "${file.name}"!`);
        } else {
          showToast(data.error || "Failed to vector chunk document.");
        }
      } catch (err) {
        console.error("Document ingestion fail:", err);
        showToast("Error processing document vectors.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.onerror = () => {
      showToast("Failed to parse file.");
    };

    reader.readAsText(file);
  };

  // Save profile updates
  const handleSaveProfile = (newProfile: typeof userProfile) => {
    localStorage.setItem("candy_user_profile", JSON.stringify(newProfile));
    setUserName(newProfile.name);
    setUserProfile(newProfile);
    setShowProfileModal(false);
    showToast("Identity configuration saved.");
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Sidebar Panel */}
      <div className="w-80 h-full hidden md:block shrink-0">
        <Sidebar
          sessions={sessions}
          selectedSession={selectedSession}
          onSelectSession={setSelectedSession}
          onNewSession={handleNewSession}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          onOpenProfile={() => setShowProfileModal(true)}
          userName={userName}
        />
      </div>

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-full bg-zinc-950 overflow-hidden relative">
        {/* Ambient top decoration */}
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-indigo-500/[0.03] to-transparent z-0" />
        
        {/* Header telemetry details */}
        <header className="relative z-10 px-6 py-4 border-b border-zinc-900 bg-zinc-950/40 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-2 -ml-2 rounded-lg text-zinc-400 hover:text-zinc-200">
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-zinc-200 truncate max-w-[200px] sm:max-w-xs">
                {selectedSession ? selectedSession.name : "Chat Console"}
              </h2>
              {/* Telemetry info row */}
              {selectedSession && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-indigo-400 uppercase tracking-wide">
                    {routingMode === "smart" ? "Smart Router" : "Pinned Mode"}
                  </span>
                  {allocatedModel && (
                    <>
                      <span className="text-[10px] text-zinc-650">•</span>
                      <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-violet-400" />
                        {allocatedModel}
                      </span>
                    </>
                  )}
                  {resolvedModel && resolvedModel !== allocatedModel && (
                    <>
                      <span className="text-[10px] text-zinc-650">•</span>
                      <span className="text-[10px] text-zinc-500">
                        Resolved: {resolvedModel}
                      </span>
                    </>
                  )}
                  {routingReason && (
                    <>
                      <span className="text-[10px] text-zinc-650">•</span>
                      <span className="text-[10px] text-zinc-550 italic truncate max-w-[150px] sm:max-w-xs" title={routingReason}>
                        {routingReason}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isLoading && (
              <button 
                onClick={handleAbort}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 hover:border-rose-500/50 bg-rose-500/10 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-all cursor-pointer"
              >
                <Square className="w-3 h-3 fill-rose-400" />
                Cancel
              </button>
            )}
            {selectedSession && messages.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 border border-transparent hover:border-zinc-850 transition-all cursor-pointer"
                title="Clear Chat Cache"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* Message Stream list */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 relative z-10">
          {messages.length === 0 ? (
            /* Starter Console view */
            <div className="max-w-2xl mx-auto py-12 flex flex-col items-center justify-center text-center h-full">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400 mb-6 shadow-xl shadow-indigo-500/5">
                <Sparkles className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-black text-zinc-100 tracking-tight mb-2 sm:text-3xl">
                Candy Autonomous AI Cockpit
              </h1>
              <p className="text-sm text-zinc-500 max-w-md leading-relaxed mb-10">
                A localized self-optimizing LLM framework. Run queries, inject documents, or evaluate model intelligence cycles.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSendMessage(prompt)}
                    className="p-4 rounded-xl text-left bg-zinc-900/30 hover:bg-zinc-900/80 border border-zinc-900 hover:border-zinc-800 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer group flex items-center justify-between"
                  >
                    <span>{prompt}</span>
                    <Send className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-indigo-400 transition-opacity ml-2" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Conversation list */
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  copiedId={null}
                  onCopy={(id, text) => {
                    navigator.clipboard.writeText(text);
                    showToast("Copied to clipboard.");
                  }}
                  onFeedback={(messageId, feedback, correction, reason) => 
                    handleFeedbackSubmit(messageId, feedback, correction, reason)
                  }
                />
              ))}
              {isTyping && (
                <div className="flex items-center gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs">
                    ✦
                  </div>
                  <span className="text-xs text-zinc-500 font-medium">Candy is routing &amp; generating...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Dock panel */}
        <div className="relative z-10 max-w-3xl w-full mx-auto px-4 pb-4">
          <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-900 rounded-2xl p-3 shadow-2xl flex flex-col gap-2">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Query the self-improving node..."
              rows={2}
              disabled={isLoading}
              className="w-full text-sm bg-transparent border-0 outline-none placeholder-zinc-650 text-zinc-200 resize-none font-sans py-1 px-1 focus:ring-0 focus:outline-none"
            />

            <div className="flex items-center justify-between pt-2 border-t border-zinc-900/60">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".txt,.html,.htm,.md,.json"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleFileUploadClick}
                  disabled={isUploading || isLoading}
                  className="p-2 rounded-xl text-zinc-500 hover:text-zinc-350 hover:bg-zinc-900/80 border border-zinc-900/20 hover:border-zinc-850 transition-all cursor-pointer"
                  title="Ingest Vector Document"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                {isUploading && (
                  <span className="text-[10px] text-indigo-400 font-semibold animate-pulse">
                    Ingesting matrix...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {routingMode === "smart" ? (
                  <span className="text-[10px] font-bold text-zinc-550 border border-zinc-900 px-2.5 py-1.5 rounded-xl bg-zinc-950/40 select-none">
                    Smart Router
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-zinc-500 border border-zinc-900 px-2.5 py-1.5 rounded-xl bg-zinc-950/40 select-none">
                    Pinned: {pinnedModel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isLoading}
                  className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-40 disabled:hover:bg-indigo-600 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-indigo-600/10"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* User profile setting modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowProfileModal(false)} />
          <div className="relative bg-zinc-950 border border-zinc-900 shadow-2xl rounded-2xl w-full max-w-md p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-zinc-200">User Identity Matrix</h3>
              <button 
                onClick={() => setShowProfileModal(false)}
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Identity Alias</label>
                <input
                  type="text"
                  value={userProfile.name}
                  onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })}
                  placeholder="Enter name..."
                  className="w-full text-xs bg-zinc-900 border border-zinc-850 rounded-xl p-3 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Pronouns</label>
                <input
                  type="text"
                  value={userProfile.pronoun}
                  onChange={(e) => setUserProfile({ ...userProfile, pronoun: e.target.value })}
                  placeholder="e.g. they/them..."
                  className="w-full text-xs bg-zinc-900 border border-zinc-850 rounded-xl p-3 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Behavioral Description</label>
                <textarea
                  value={userProfile.description}
                  onChange={(e) => setUserProfile({ ...userProfile, description: e.target.value })}
                  placeholder="Context for autonomous model alignment..."
                  rows={4}
                  className="w-full text-xs bg-zinc-900 border border-zinc-850 rounded-xl p-3 text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-zinc-900">
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="px-4 py-2 rounded-xl border border-zinc-900 hover:bg-zinc-900 text-zinc-400 text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveProfile(userProfile)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-indigo-600/10"
              >
                Save Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-850 rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-xs font-semibold text-zinc-200">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
