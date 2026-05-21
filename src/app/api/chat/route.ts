import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { orchestrateResponse } from "@/lib/ai/orchestrator";
import { telemetry } from "@/lib/ai/metrics";
import { postProcessCompleteText } from "@/lib/ai/postprocess";
import { generateCodeFallback } from "@/lib/ai/codeTemplates";
import { streamSessionManager } from "@/lib/ai/streamSession";
import { queryCache } from "@/lib/ai/cache";
import { isRateLimited } from "@/lib/ai/rateLimiter";

export async function POST(req: NextRequest) {
  const requestId = `api-req-${Date.now()}`;
  let activeSessionId = "";
  try {
    const { sessionId, message, userProfile, model, trace, stream } = await req.json();

    // 0. Perform sliding window rate limit check
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "local-ip";
    const limitKey = sessionId || clientIp;
    const rateLimitResult = await isRateLimited(limitKey);
    
    if (rateLimitResult.limited) {
      const waitSeconds = Math.ceil(rateLimitResult.retryAfterMs / 1000);
      return NextResponse.json(
        { error: `Too Many Requests. Please wait ${waitSeconds}s before retrying.` },
        { 
          status: 429,
          headers: {
            "Retry-After": waitSeconds.toString()
          }
        }
      );
    }

    if (!message) {
      return NextResponse.json({ error: "Missing message query" }, { status: 400 });
    }

    activeSessionId = sessionId;

    // 1. If no session exists, create a new conversation thread automatically
    if (!activeSessionId) {
      const generatedTitle = message.length > 40 ? message.slice(0, 37) + "..." : message;
      
      const { data: newSession, error: sessionError } = await supabase
        .from("candy_sessions")
        .insert({ title: generatedTitle })
        .select()
        .single();

      if (sessionError || !newSession) {
        console.error("Failed to generate chat session:", sessionError);
        return NextResponse.json({ error: "Failed to initialize chat session" }, { status: 500 });
      }

      activeSessionId = newSession.id;
    }

    // 2. Fetch recent conversation history (latest 10 messages)
    const { data: history } = await supabase
      .from("candy_messages")
      .select("*")
      .eq("session_id", activeSessionId)
      .order("created_at", { ascending: false })
      .limit(10);

    const formattedHistory = (history || [])
      .reverse()
      .map((msg) => ({
        role: (msg.sender === "user" ? "user" : "assistant") as "user" | "assistant",
        content: msg.content
      }));

    // 3. Persist User`s General Query immediately
    await supabase.from("candy_messages").insert({
      session_id: activeSessionId,
      sender: "user",
      content: message
    });

    // 4. Trigger the General AI Assistant Orchestrator with Client Abort Signal
    telemetry.startSession(requestId);
    
    const orchestration = await orchestrateResponse({
      sessionId: activeSessionId,
      message,
      userProfile: userProfile || { name: "User", pronoun: "they/them", description: "" },
      chatHistory: formattedHistory,
      model,
      signal: req.signal, // Link client request abort directly to Ollama call
      requestId
    });

    if (orchestration.stream && stream !== false) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const reader = orchestration.stream.getReader();

      const responseStream = new ReadableStream({
        async start(controller) {
          let buffer = "";
          let fullResponseText = "";
          let firstTokenMarked = false;

          try {
            let shouldBreak = false;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunkStr = decoder.decode(value, { stream: true });
              buffer += chunkStr;

              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                try {
                  const parsed = JSON.parse(trimmed);
                  
                  if (parsed.done === true) {
                    shouldBreak = true;
                  }

                  const token = parsed.message?.content || "";
                  if (token) {
                    if (!firstTokenMarked) {
                      telemetry.mark(requestId, "firstToken");
                      firstTokenMarked = true;
                    }
                    fullResponseText += token;
                    controller.enqueue(encoder.encode(token));
                  }
                } catch (e) {
                  // Wait for complete JSON segment
                }
              }

              if (shouldBreak) {
                break;
              }
            }

            // Flush remaining buffer
            if (buffer.trim()) {
              try {
                const parsed = JSON.parse(buffer.trim());
                const token = parsed.message?.content || "";
                if (token) {
                  fullResponseText += token;
                  controller.enqueue(encoder.encode(token));
                }
              } catch {}
            }

            // Post-process response to strip conversational fluff
            let cleanedText = postProcessCompleteText(fullResponseText);

            // Smart Refusal Interceptor: fallback if low quality or blank
            const isRefusal = /^(i`?m sorry|i cannot|i can'?t|i apologize|unfortunately|i don'?t have the capability|i am not able|i`m not able)/i.test(cleanedText.trim());
            const isLowQuality = cleanedText.trim().length < 40;

            const isCodeGenRequest = message ? /\b(landing page|html page|react component|javascript function|typescript function|python function|python script|express api|rest api|webpage|web page|html template)\b/i.test(message) : false;
            const hasCodeBlock = 
              cleanedText.includes("```") || 
              cleanedText.includes("`html") || 
              cleanedText.includes("`css") || 
              cleanedText.includes("`javascript") || 
              cleanedText.includes("<!DOCTYPE") || 
              cleanedText.includes("<html>") ||
              cleanedText.includes("import React") ||
              cleanedText.includes("const ") ||
              cleanedText.includes("def ") ||
              cleanedText.includes("class ") ||
              cleanedText.includes("function ");
            const isDescriptiveInsteadOfCode = isCodeGenRequest && !hasCodeBlock;

            if ((isRefusal || isLowQuality || isDescriptiveInsteadOfCode) && message) {
              const lowerMsg = message.toLowerCase();
              const codeGenFallback = generateCodeFallback(lowerMsg);
              if (codeGenFallback) {
                cleanedText = codeGenFallback;
                console.log(`[Route] Code-gen fallback triggered — model output recovery.`);
              }
            }

            // Append search footnotes if a web search was executed
            let footnote = "";
            if (orchestration.toolResult) {
              try {
                const parsed = JSON.parse(orchestration.toolResult);
                if (Array.isArray(parsed) && parsed.length > 0 && !parsed[0].title.includes("DuckDuckGo Search for")) {
                  footnote = `\n\n---\n\n### 🔍 Live Verified Search Sources\n\n`;
                  parsed.slice(0, 3).forEach((r: any) => {
                    footnote += `- **[${r.title}](${r.url})**\n  *${r.snippet}*\n`;
                  });
                  controller.enqueue(encoder.encode(footnote));
                }
              } catch {}
            }

            const completeText = cleanedText + footnote;

            // 5. Persist Assistant Response in background
            if (completeText.trim()) {
              queryCache.set(message.toLowerCase().trim(), completeText.trim());
              await supabase.from("candy_messages").insert({
                session_id: activeSessionId,
                sender: "companion",
                content: completeText.trim()
              });
            }

            // End Telemetry session
            telemetry.endSession(requestId, {
              query: message,
              promptSize: Math.ceil(message.length / 4),
              responseSize: Math.ceil(completeText.length / 4),
              sessionId: activeSessionId
            });

          } catch (streamError) {
            console.error("Stream reading error:", streamError);
          } finally {
            controller.close();
            reader.releaseLock();
            // Release active stream lock
            streamSessionManager.releaseSessionModel(activeSessionId);
          }
        }
      });

      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
          "x-session-id": activeSessionId,
          "x-allocated-model": orchestration.allocatedModel,
          "x-resolved-model": orchestration.resolvedModel,
          "x-routing-reason": orchestration.routingReason.reason,
          "x-complexity-score": String(orchestration.routingReason.complexityScore),
          "x-confidence": String(orchestration.routingReason.confidence)
        }
      });
    } else {
      // 5. Non-streaming response / Fallback
      let processedResponse = "";
      const toolTriggered = orchestration.toolTriggered;
      const memorySaved = orchestration.memorySaved;

      if (orchestration.stream) {
        const decoder = new TextDecoder();
        const reader = orchestration.stream.getReader();
        let buffer = "";
        let fullResponseText = "";
        let firstTokenMarked = false;

        try {
          let shouldBreak = false;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunkStr = decoder.decode(value, { stream: true });
            buffer += chunkStr;

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              try {
                const parsed = JSON.parse(trimmed);
                if (parsed.done === true) {
                  shouldBreak = true;
                }
                const token = parsed.message?.content || "";
                if (token) {
                  if (!firstTokenMarked) {
                    telemetry.mark(requestId, "firstToken");
                    firstTokenMarked = true;
                  }
                  fullResponseText += token;
                }
              } catch (e) {
                // Wait for complete JSON segment
              }
            }

            if (shouldBreak) break;
          }

          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim());
              const token = parsed.message?.content || "";
              if (token) fullResponseText += token;
            } catch {}
          }
        } finally {
          reader.releaseLock();
          streamSessionManager.releaseSessionModel(activeSessionId);
        }

        processedResponse = postProcessCompleteText(fullResponseText);
      } else {
        processedResponse = postProcessCompleteText(orchestration.response);
        streamSessionManager.releaseSessionModel(activeSessionId);
      }

      // Safe Refusal & Low Quality check
      const isRefusal = /^(i`?m sorry|i cannot|i can'?t|i apologize|unfortunately|i am not able|i'm not able)/i.test(processedResponse.trim());
      const isLowQuality = processedResponse.trim().length < 40;
      const isCodeGen = /\b(landing page|html page|react component|javascript function|typescript function|python function|python script|express api|rest api|webpage|web page|html template)\b/i.test(message);
      const hasCodeBlock = 
        processedResponse.includes("```") || 
        processedResponse.includes("`html") || 
        processedResponse.includes("`css") || 
        processedResponse.includes("`javascript") || 
        processedResponse.includes("<!DOCTYPE") || 
        processedResponse.includes("<html>") ||
        processedResponse.includes("import React") ||
        processedResponse.includes("const ") ||
        processedResponse.includes("def ") ||
        processedResponse.includes("class ") ||
        processedResponse.includes("function ");
      const noCodeBlock = isCodeGen && !hasCodeBlock;
      if ((isRefusal || isLowQuality || noCodeBlock) && message) {
        const fallback = generateCodeFallback(message.toLowerCase());
        if (fallback) processedResponse = fallback;
      }

      // Append search footnotes if a web search was executed
      let footnote = "";
      if (orchestration.toolResult) {
        try {
          const parsed = JSON.parse(orchestration.toolResult);
          if (Array.isArray(parsed) && parsed.length > 0 && !parsed[0].title.includes("DuckDuckGo Search for")) {
            footnote = `\n\n---\n\n### 🔍 Live Verified Search Sources\n\n`;
            parsed.slice(0, 3).forEach((r: any) => {
              footnote += `- **[${r.title}](${r.url})**\n  *${r.snippet}*\n`;
            });
          }
        } catch {}
      }

      const completeText = processedResponse + footnote;

      if (completeText.trim()) {
        queryCache.set(message.toLowerCase().trim(), completeText.trim());
        await supabase.from("candy_messages").insert({
          session_id: activeSessionId,
          sender: "companion",
          content: completeText.trim()
        });
      }

      telemetry.endSession(requestId, {
        query: message,
        promptSize: Math.ceil(message.length / 4),
        responseSize: Math.ceil(completeText.length / 4),
        sessionId: activeSessionId
      });

      let responseTrace = undefined;
      if (trace && orchestration.inferenceTrace) {
        responseTrace = {
          ...orchestration.inferenceTrace,
          model_response: completeText.trim()
        };
      }

      return NextResponse.json({ 
        response: completeText.trim(),
        sessionId: activeSessionId,
        toolTriggered,
        memorySaved,
        allocatedModel: orchestration.allocatedModel,
        resolvedModel: orchestration.resolvedModel,
        routingReason: orchestration.routingReason,
        ...(responseTrace ? { inferenceTrace: responseTrace } : {})
      });
    }

  } catch (err: any) {
    if (activeSessionId) {
      streamSessionManager.releaseSessionModel(activeSessionId);
    }
    if (err.name === "AbortError") {
      console.log(`[API Route] Active request aborted: ${requestId}`);
      return new Response("Generation cancelled", { status: 499 });
    }
    console.error("Orchestrated Chat API Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
