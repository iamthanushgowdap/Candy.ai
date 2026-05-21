/**
 * Behavioral Memory Engine
 * 
 * Tracks per-session conversational signals:
 *   - User's preferred response length (verbose vs concise)
 *   - Preferred format (code-heavy, prose, bullets)
 *   - Communication tone (casual, technical, formal)
 *   - Inferred expertise level
 * 
 * Stored in-process per session. Periodically serialized to Supabase.
 */

import { supabase } from "@/lib/supabaseClient";

export type ResponseLengthPref = "concise" | "balanced" | "verbose";
export type FormatPref = "code" | "prose" | "bullets" | "mixed";
export type TonePref = "casual" | "technical" | "formal";

export interface BehavioralProfile {
  sessionId: string;
  responseLengthPref: ResponseLengthPref;
  formatPref: FormatPref;
  tonePref: TonePref;
  /** 0=beginner, 1=intermediate, 2=expert */
  expertiseLevel: number;
  messageCount: number;
  lastUpdated: number;
}

/** In-process session store (fast, no DB roundtrip on every message) */
const profileStore = new Map<string, BehavioralProfile>();

function defaultProfile(sessionId: string): BehavioralProfile {
  return {
    sessionId,
    responseLengthPref: "balanced",
    formatPref: "mixed",
    tonePref: "casual",
    expertiseLevel: 1,
    messageCount: 0,
    lastUpdated: Date.now()
  };
}

/**
 * Get or initialize the behavioral profile for a session
 */
export function getBehavioralProfile(sessionId: string): BehavioralProfile {
  if (!profileStore.has(sessionId)) {
    profileStore.set(sessionId, defaultProfile(sessionId));
  }
  return profileStore.get(sessionId)!;
}

/**
 * Update the behavioral profile based on a new user message
 */
export function updateBehavioralProfile(sessionId: string, message: string): void {
  const profile = getBehavioralProfile(sessionId);
  const lower = message.toLowerCase();
  profile.messageCount++;
  profile.lastUpdated = Date.now();

  // Length preference signals
  if (/\b(brief|short|quick|tldr|tl;dr|in short|summarize|concise)\b/.test(lower)) {
    profile.responseLengthPref = "concise";
  } else if (/\b(detailed|explain|thorough|in depth|comprehensive|elaborate|full)\b/.test(lower)) {
    profile.responseLengthPref = "verbose";
  }

  // Format preference signals
  if (/\b(code|function|script|program|implement|build)\b/.test(lower)) {
    profile.formatPref = "code";
  } else if (/\b(bullet|list|steps|enumerate|points)\b/.test(lower)) {
    profile.formatPref = "bullets";
  } else if (/\b(essay|story|poem|paragraph|prose)\b/.test(lower)) {
    profile.formatPref = "prose";
  }

  // Tone signals
  if (/\b(hey|yo|lol|haha|ngl|tbh|idk|wtf|bruh)\b/.test(lower)) {
    profile.tonePref = "casual";
  } else if (/\b(algorithm|api|async|deployment|infrastructure|neural|vector|embedding)\b/.test(lower)) {
    profile.tonePref = "technical";
  }

  // Expertise inference
  const technicalTerms = message.match(/\b(async|await|typescript|vector|embedding|gradient|neural|kubernetes|docker|postgresql|supabase|api|oauth|jwt|regex|recursion|polymorphism)\b/gi);
  if (technicalTerms && technicalTerms.length >= 2) {
    profile.expertiseLevel = Math.min(2, profile.expertiseLevel + 0.3);
  } else if (profile.messageCount > 3 && technicalTerms?.length === 0) {
    profile.expertiseLevel = Math.max(0, profile.expertiseLevel - 0.1);
  }

  profileStore.set(sessionId, profile);

  // Async DB sync every 5 messages
  if (profile.messageCount % 5 === 0) {
    syncProfileToDb(profile).catch(() => {});
  }
}

/**
 * Compact behavioral signal string for prompt injection
 * Keeps it small — every token counts on local CPU models
 */
export function getBehavioralPromptSnippet(sessionId: string): string {
  const p = getBehavioralProfile(sessionId);
  const parts: string[] = [];

  if (p.responseLengthPref === "concise") parts.push("Keep responses brief.");
  if (p.responseLengthPref === "verbose") parts.push("User prefers detailed answers.");
  if (p.formatPref === "code") parts.push("Prefer code over prose.");
  if (p.formatPref === "bullets") parts.push("Use bullet lists where sensible.");
  if (p.tonePref === "technical") parts.push("Use precise technical language.");
  if (p.tonePref === "casual") parts.push("Keep tone casual and direct.");
  if (p.expertiseLevel >= 1.7) parts.push("User is experienced — skip basics.");
  if (p.expertiseLevel <= 0.5) parts.push("User may need simple explanations.");

  return parts.length > 0 ? `[Behavioral Signals]: ${parts.join(" ")}` : "";
}

async function syncProfileToDb(profile: BehavioralProfile): Promise<void> {
  try {
    await supabase.from("candy_behavioral_profiles").upsert({
      session_id: profile.sessionId,
      response_length_pref: profile.responseLengthPref,
      format_pref: profile.formatPref,
      tone_pref: profile.tonePref,
      expertise_level: profile.expertiseLevel,
      message_count: profile.messageCount,
      updated_at: new Date().toISOString()
    }, { onConflict: "session_id" });
  } catch {
    // Silently skip — behavioral memory is non-critical
  }
}
