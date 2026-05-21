import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const { data: messages, error } = await supabase
      .from("candy_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ messages });
  } catch (err: any) {
    console.error("Fetch messages error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // Delete chat history for this specific session
    const { error: msgError } = await supabase
      .from("candy_messages")
      .delete()
      .eq("session_id", sessionId);

    if (msgError) {
      throw msgError;
    }

    return NextResponse.json({ success: true, message: "Chat history cleared successfully for this session." });
  } catch (err: any) {
    console.error("Reset chat history error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { messageId, sessionId, content, feedback, correction, reason } = await req.json();

    if (!messageId) {
      return NextResponse.json({ error: "Missing messageId" }, { status: 400 });
    }

    let targetId = messageId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId);

    if (!isUuid) {
      console.log(`[PATCH Feedback] messageId "${messageId}" is not a valid UUID. Attempting fallback lookup...`);
      if (!sessionId) {
        return NextResponse.json({ error: "Invalid messageId and missing sessionId for lookup fallback" }, { status: 400 });
      }

      // Look up by sessionId and optionally content matching, ordering by created_at descending
      let query = supabase
        .from("candy_messages")
        .select("id, content")
        .eq("session_id", sessionId)
        .eq("sender", "companion");

      if (content) {
        query = query.eq("content", content);
      }

      const { data: matchedMessages, error: lookupError } = await query
        .order("created_at", { ascending: false })
        .limit(1);

      if (lookupError || !matchedMessages || matchedMessages.length === 0) {
        console.error("[PATCH Feedback] Lookup fallback failed:", lookupError);
        
        // If content matching failed, try getting the absolute latest companion message in the session
        const { data: latestMsg, error: latestError } = await supabase
          .from("candy_messages")
          .select("id")
          .eq("session_id", sessionId)
          .eq("sender", "companion")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (latestError || !latestMsg) {
          return NextResponse.json({ error: "Could not resolve temporary message ID to a database record" }, { status: 404 });
        }
        targetId = latestMsg.id;
      } else {
        targetId = matchedMessages[0].id;
      }
      console.log(`[PATCH Feedback] Resolved temporary messageId "${messageId}" to database UUID "${targetId}"`);
    }

    const { data, error } = await supabase
      .from("candy_messages")
      .update({
        feedback: feedback || null,
        feedback_correction: correction || null,
        feedback_reason: reason || null
      })
      .eq("id", targetId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, message: data });
  } catch (err: any) {
    console.error("Update feedback error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
