import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const layer = searchParams.get("layer");
    const q = searchParams.get("q");

    let query = supabase
      .from("candy_memories")
      .select("id, memory_text, layer, importance, created_at")
      .order("created_at", { ascending: false });

    if (layer) {
      query = query.eq("layer", layer);
    }
    if (q) {
      query = query.ilike("memory_text", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[MemoriesAPI] Error fetching from candy_memories:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ memories: data || [] });
  } catch (err: any) {
    console.error("[MemoriesAPI] GET exception:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch memories" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing memory ID" }, { status: 400 });
    }

    const { error } = await supabase
      .from("candy_memories")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[MemoriesAPI] Error deleting memory:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[MemoriesAPI] DELETE exception:", err);
    return NextResponse.json({ error: err.message || "Failed to delete memory" }, { status: 500 });
  }
}
