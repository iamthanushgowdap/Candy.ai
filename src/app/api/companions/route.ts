import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  try {
    const { data: sessions, error } = await supabase
      .from("candy_sessions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Mapping candy_sessions to companion-like structure to maintain front-end property compatibility 
    // and keep type-safety simple while refactoring the UI.
    const mappedSessions = (sessions || []).map(s => ({
      id: s.id,
      name: s.title,
      avatar: "custom",
      bio: "Active Conversation Session",
      personality: "Helpful & Structured",
      relationship: "AI Assistant",
      greeting: "How can I help you today?",
      voice_style: "Factual",
      is_custom: true,
      created_at: s.created_at
    }));

    return NextResponse.json({ companions: mappedSessions });
  } catch (err: any) {
    console.error("Fetch sessions error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title } = await req.json();

    const { data: newSession, error } = await supabase
      .from("candy_sessions")
      .insert({
        title: title || "New Conversation"
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    const mapped = {
      id: newSession.id,
      name: newSession.title,
      avatar: "custom",
      bio: "Active Conversation Session",
      personality: "Helpful & Structured",
      relationship: "AI Assistant",
      greeting: "How can I help you today?",
      voice_style: "Factual",
      is_custom: true,
      created_at: newSession.created_at
    };

    return NextResponse.json({ companion: mapped });
  } catch (err: any) {
    console.error("Create session error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
