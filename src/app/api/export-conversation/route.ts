/**
 * Conversation Export API — Antgravity Self-Improvement Pipeline
 *
 * Exports a conversation session as a training-ready JSON file,
 * then saves it to training/conversations/ for the self-improvement pipeline.
 *
 * POST /api/export-conversation
 * Body: { sessionId: string, includeSystem?: boolean, corrections?: {...}[] }
 *
 * Also supports marking specific messages as corrections:
 * POST /api/export-conversation
 * Body: { sessionId: string, corrections: [{ messageId: string, correctedContent: string }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import fs from "fs";
import path from "path";

interface Correction {
  messageId: string;
  correctedContent: string;
  correctionNote?: string;
}

interface ExportRequest {
  sessionId: string;
  includeSystem?: boolean;
  corrections?: Correction[];
  label?: string; // optional human label for this export (e.g. "good example", "corrected")
}

export async function POST(req: NextRequest) {
  try {
    const body: ExportRequest = await req.json();
    const { sessionId, includeSystem = false, corrections = [], label = "" } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // ── 1. Fetch session metadata ─────────────────────────────────────────────
    const { data: session, error: sessError } = await supabase
      .from("candy_sessions")
      .select("id, title, created_at")
      .eq("id", sessionId)
      .single();

    if (sessError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // ── 2. Fetch all messages ─────────────────────────────────────────────────
    const { data: messages, error: msgError } = await supabase
      .from("candy_messages")
      .select("id, sender, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (msgError || !messages || messages.length < 2) {
      return NextResponse.json({ error: "Not enough messages to export" }, { status: 400 });
    }

    // ── 3. Apply corrections ──────────────────────────────────────────────────
    const correctionMap = new Map(corrections.map((c) => [c.messageId, c]));
    const correctionNotes: string[] = [];

    // ── 4. Build messages array in training format ────────────────────────────
    const formattedMessages: { role: string; content: string }[] = [];

    for (const msg of messages) {
      // Filter system messages unless requested
      if (msg.sender === "system" && !includeSystem) continue;

      // Skip recap/system injections
      if (
        msg.content.startsWith("[System Recap]:") ||
        msg.content.startsWith("[Recap of previous conversation]:")
      ) continue;

      // Strip search footnotes from training data (don`t train on URLs)
      const cleanContent = msg.content
        .split("\n\n---\n\n### 🔍 Live Verified Search Sources")[0]
        .trim();

      if (!cleanContent) continue;

      // Apply correction if present
      const correction = correctionMap.get(msg.id);
      let finalContent = cleanContent;
      if (correction) {
        finalContent = correction.correctedContent.trim();
        if (correction.correctionNote) {
          correctionNotes.push(correction.correctionNote);
        }
      }

      const role =
        msg.sender === "user"
          ? "user"
          : msg.sender === "companion"
          ? "assistant"
          : "system";

      formattedMessages.push({ role, content: finalContent });
    }

    // ── 5. Validate — must have at least 1 user + 1 assistant turn ────────────
    const roles = new Set(formattedMessages.map((m) => m.role));
    if (!roles.has("user") || !roles.has("assistant")) {
      return NextResponse.json(
        { error: "Export requires at least one user and one assistant message" },
        { status: 400 }
      );
    }

    // ── 6. Build export object ────────────────────────────────────────────────
    const isCorrection = corrections.length > 0;
    const exportData = {
      messages: formattedMessages,
      _meta: {
        session_id: sessionId,
        session_title: session.title,
        exported_at: new Date().toISOString(),
        is_correction: isCorrection,
        correction_notes: correctionNotes,
        label: label || (isCorrection ? "correction" : "export"),
        message_count: formattedMessages.length
      }
    };

    // ── 7. Save to training/conversations/ ────────────────────────────────────
    const conversationsDir = isCorrection
      ? path.join(process.cwd(), "training", "conversations", "corrections")
      : path.join(process.cwd(), "training", "conversations");

    // Ensure directories exist
    fs.mkdirSync(conversationsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const prefix = isCorrection ? "correction" : "export";
    const filename = `${prefix}_${sessionId.slice(0, 8)}_${timestamp}.json`;
    const filepath = path.join(conversationsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), "utf-8");

    // ── 8. Return success ──────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      filename,
      messageCount: formattedMessages.length,
      isCorrection,
      savedTo: filepath,
      preview: formattedMessages.slice(0, 2)
    });

  } catch (err: unknown) {
    console.error("[Export Conversation] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/export-conversation?sessionId=xxx
 * Returns metadata about how many messages are exportable from a session.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const { data: messages } = await supabase
    .from("candy_messages")
    .select("id, sender, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  const exportable = (messages || []).filter(
    (m) => m.sender === "user" || m.sender === "companion"
  );

  // Count existing exports for this session
  const conversationsDir = path.join(process.cwd(), "training", "conversations");
  let existingExports = 0;
  try {
    existingExports = fs
      .readdirSync(conversationsDir)
      .filter((f) => f.includes(sessionId.slice(0, 8))).length;
  } catch {
    // Directory doesn`t exist yet
  }

  return NextResponse.json({
    sessionId,
    exportableMessages: exportable.length,
    existingExports,
    canExport: exportable.length >= 2
  });
}
