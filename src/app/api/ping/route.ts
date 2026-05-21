import { NextResponse } from "next/server";

export async function GET() {
  const ollamaUrl = process.env.NEXT_PUBLIC_OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, {
      method: "GET",
      headers: {
        "Bypass-Tunnel-Reminder": "true",
        "ngrok-skip-browser-warning": "true"
      }
    });

    const status = res.status;
    const text = await res.text();

    return NextResponse.json({
      success: res.ok,
      target_url: ollamaUrl,
      status_code: status,
      response: text
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      target_url: ollamaUrl,
      error_message: error.message,
      error_stack: error.stack
    });
  }
}
