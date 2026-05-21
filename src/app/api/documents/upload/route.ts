import { NextResponse } from "next/server";
import { chunkText } from "@/lib/ai/chunker";
import { storeSemanticMemory } from "@/lib/ai/memory";

function stripHtmlTags(htmlStr: string): string {
  // Replace style block contents completely
  let clean = htmlStr.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  // Replace script block contents completely
  clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  // Replace remaining HTML tags with whitespace
  clean = clean.replace(/<[^>]*>/g, " ");
  // Normalize whitespace
  clean = clean.replace(/\s+/g, " ");
  return clean.trim();
}

export async function POST(req: Request) {
  try {
    const { fileName, text } = await req.json();

    if (!fileName || !text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Invalid document data provided." },
        { status: 400 }
      );
    }

    // Auto-detect HTML content by file name or contents
    let processedText = text;
    const isHtml = fileName.toLowerCase().endsWith(".html") || fileName.toLowerCase().endsWith(".htm") || text.trim().startsWith("<!DOCTYPE") || text.includes("<html") || text.includes("<div");
    
    if (isHtml) {
      console.log(`[Document Pipeline] HTML syntax detected. Cleaning up CSS style blocks and tags for high-precision vector indexing.`);
      processedText = stripHtmlTags(text);
    }

    console.log(`[Document Pipeline] Uploading & chunking: "${fileName}" (${processedText.length} chars)`);

    // 1. Split document text into semantic chunks (500 chars with 100 overlap)
    const chunks = chunkText(processedText, 500, 100);
    console.log(`[Document Pipeline] Created ${chunks.length} chunks for vector database insertion.`);

    let successfulInsertions = 0;

    // 2. Loop through chunks, embed, and store into the database
    for (const chunk of chunks) {
      const formattedSnippet = `[Document: ${fileName}] (Section ${chunk.index + 1}): ${chunk.text}`;
      
      const saved = await storeSemanticMemory(formattedSnippet);
      if (saved) {
        successfulInsertions++;
      }
    }

    console.log(`[Document Pipeline] Successfully ingested ${successfulInsertions}/${chunks.length} chunks into Supabase pgvector!`);

    return NextResponse.json({
      success: true,
      fileName,
      totalChunks: chunks.length,
      insertedChunks: successfulInsertions
    });
  } catch (error: any) {
    console.error("[Document Pipeline] Exception during ingestion:", error);
    return NextResponse.json(
      { error: "Document parsing & ingestion failed.", details: error.message },
      { status: 500 }
    );
  }
}
