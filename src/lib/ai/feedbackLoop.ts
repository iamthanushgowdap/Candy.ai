import fs from "fs";
import path from "path";
import { supabase } from "../supabaseClient";

async function generateLocalCorrection(userQuery: string, failedResponse: string, reason: string): Promise<string> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_OLLAMA_URL || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:0.5b",
        messages: [
          {
            role: "system",
            content: "You are an AI feedback curation engine. Your job is to correct a failed assistant response. Analyze the user's query, the failed response, and the reason for failure. Then, output a perfect, high-quality, professional correction that represents the ideal response. Provide ONLY the corrected text, absolutely no conversational filler, preambles, or markdown commentary."
          },
          {
            role: "user",
            content: `User Query: "${userQuery}"\nFailed Response: "${failedResponse}"\nFailure Reason: "${reason}"\n\nGenerate the perfect corrected response:`
          }
        ],
        options: { temperature: 0.1, num_thread: 4 },
        stream: false
      })
    });
    if (res.ok) {
      const json = await res.json();
      return json.message?.content?.trim() || failedResponse;
    }
  } catch (e) {
    console.error("Local correction generation failed:", e);
  }
  return failedResponse;
}

function calculateJaccard(s1: string, s2: string): number {
  const words1 = new Set(s1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(s2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

function extractTags(query: string, response: string): string[] {
  const tags: string[] = [];
  const combined = (query + " " + response).toLowerCase();
  
  // Coding
  if (
    combined.includes("```") || 
    /\b(function|const|let|var|class|import|def|return|html|css|javascript|typescript|python|json|api|npm|git)\b/i.test(combined)
  ) {
    tags.push("coding");
  }
  
  // Reasoning
  if (
    /\b(why|how|explain|because|calculate|solve|step|prove|formula|logic|math)\b/i.test(combined)
  ) {
    tags.push("reasoning");
  }
  
  // Tool use / RAG
  if (
    combined.includes("search sources") || 
    combined.includes("duckduckgo") || 
    /\b(weather|temperature|forecast|live|latest|search|browse|fetch)\b/i.test(combined)
  ) {
    tags.push("tool-use");
  }
  
  // Memory
  if (
    /\b(remember|forgot|recall|my name|who am i|who is|cognitive|vector)\b/i.test(combined)
  ) {
    tags.push("memory-recall");
  }
  
  if (tags.length === 0) {
    tags.push("chat");
  }
  
  return tags;
}

/**
 * Estimates confidence score of the original assistant response.
 * Ambiguous queries, thumbs-down clicks, and major delta corrections yield lower confidence.
 */
function estimateConfidenceScore(
  userQuery: string,
  originalResponse: string,
  correctedResponse: string,
  feedback: "up" | "down",
  reason?: string
): number {
  let score = 1.0;

  if (feedback === "down") {
    score -= 0.3;
  }

  if (reason && /\b(confused|hallucination|unsure|incorrect|wrong|mistake|fail|error)\b/i.test(reason)) {
    score -= 0.3;
  }

  const similarity = calculateJaccard(originalResponse, correctedResponse);
  if (similarity < 0.4) {
    score -= 0.2; // Large correction needed implies base model was highly unconfident/wrong
  }

  if (userQuery.length > 100 && originalResponse.length < 20) {
    score -= 0.1; // Extremely abrupt answer to a long prompt suggests avoidance
  }

  return Math.max(0.1, Math.min(1.0, score));
}

export async function curateFeedbackDataset() {
  console.log("[Curation Loop] Pulling feedback messages from Supabase...");
  
  // 1. Fetch all messages ordered by time
  const { data: allMessages, error } = await supabase
    .from("candy_messages")
    .select("*")
    .order("created_at", { ascending: true });

  if (error || !allMessages) {
    console.error("Curation engine: failed to fetch messages", error);
    throw new Error("Failed to fetch messages");
  }

  // 2. Pre-calculate dynamic user trust scores per session ID
  // trust_score = 1.0 + (positive_clicks * 0.1) + (corrections * 0.2) - (negative_clicks * 0.05), clamped between 0.5 and 2.0
  const sessionStats: Record<string, { positive: number; negative: number; corrections: number }> = {};
  
  for (const m of allMessages) {
    if (m.sender === "companion" && m.feedback) {
      const sId = m.session_id;
      if (!sessionStats[sId]) {
        sessionStats[sId] = { positive: 0, negative: 0, corrections: 0 };
      }
      if (m.feedback === "up") {
        sessionStats[sId].positive += 1;
      } else if (m.feedback === "down") {
        if (m.feedback_correction) {
          sessionStats[sId].corrections += 1;
        } else {
          sessionStats[sId].negative += 1;
        }
      }
    }
  }

  const getSessionTrustScore = (sessionId: string): number => {
    const stats = sessionStats[sessionId];
    if (!stats) return 1.0;
    const computed = 1.0 + (stats.positive * 0.1) + (stats.corrections * 0.2) - (stats.negative * 0.05);
    return Math.max(0.5, Math.min(2.0, computed));
  };

  const feedbackMessages = allMessages.filter(m => m.sender === "companion" && m.feedback);
  const curatedPairs: any[] = [];

  for (const compMsg of feedbackMessages) {
    // Find preceding user message in same session
    const sessionMsgs = allMessages.filter(
      m => m.session_id === compMsg.session_id && new Date(m.created_at) < new Date(compMsg.created_at)
    );
    const userMsg = sessionMsgs.reverse().find(m => m.sender === "user");

    if (!userMsg) continue;

    const userQuery = userMsg.content;
    let assistantResponse = compMsg.content;
    let feedbackWeight = compMsg.feedback === "up" ? 1.0 : -1.0;
    let baseTrainingWeight = compMsg.feedback === "up" ? 1.0 : 1.2;

    if (compMsg.feedback === "down") {
      if (compMsg.feedback_correction) {
        assistantResponse = compMsg.feedback_correction;
        feedbackWeight = 1.5; // Correction gives +1.5 highest priority
        baseTrainingWeight = 1.5;
      } else {
        // Run local model correction fallback
        console.log(`[Curation] Running model auto-correction for message ${compMsg.id}`);
        const corrected = await generateLocalCorrection(userQuery, compMsg.content, compMsg.feedback_reason || "general");
        if (corrected && corrected !== compMsg.content) {
          assistantResponse = corrected;
          baseTrainingWeight = 1.3; // Decent priority for auto-corrected failures
        }
      }
    }

    // A. User trust score integration
    const trustScore = getSessionTrustScore(compMsg.session_id);

    // B. Confidence scoring integration
    const confidenceScore = estimateConfidenceScore(
      userQuery,
      compMsg.content,
      assistantResponse,
      compMsg.feedback as "up" | "down",
      compMsg.feedback_reason
    );
    
    // low-confidence answers are prioritized for retraining
    const confidenceMultiplier = confidenceScore < 0.6 ? 1.5 : 1.0;

    // C. Repeated failures penalty scaling
    // Counts Jaccard-similar historical queries in same session that had negative feedback
    let failureCount = 0;
    const priorSessionFailures = allMessages.filter(
      m => m.session_id === compMsg.session_id && 
           m.sender === "companion" && 
           m.feedback === "down" &&
           new Date(m.created_at) < new Date(compMsg.created_at)
    );
    for (const priorFail of priorSessionFailures) {
      const priorUserMsg = allMessages
        .filter(m => m.session_id === compMsg.session_id && m.sender === "user" && new Date(m.created_at) < new Date(priorFail.created_at))
        .reverse()[0];
      if (priorUserMsg && calculateJaccard(userQuery, priorUserMsg.content) > 0.6) {
        failureCount += 1;
      }
    }
    const repeatedFailureMultiplier = 1.0 + (failureCount * 0.5);

    // D. Compute consolidated sample weight
    const sampleWeight = baseTrainingWeight * trustScore * confidenceMultiplier * repeatedFailureMultiplier;

    const tags = extractTags(userQuery, assistantResponse);

    curatedPairs.push({
      id: compMsg.id,
      messages: [
        { role: "system", content: "You are Antigravity, a highly capable local AI companion optimized for helpful chat, coding, and logical reasoning." },
        { role: "user", content: userQuery },
        { role: "assistant", content: assistantResponse }
      ],
      tags,
      quality_score: compMsg.feedback === "up" ? 1.0 : (compMsg.feedback_correction ? 0.9 : 0.75),
      feedback_source: compMsg.feedback === "up" ? "thumbs_up" : "thumbs_down",
      reason: compMsg.feedback_reason || null,
      created_at: compMsg.created_at,
      session_id: compMsg.session_id,
      trust_score: parseFloat(trustScore.toFixed(3)),
      confidence_score: parseFloat(confidenceScore.toFixed(3)),
      feedback_weight: feedbackWeight,
      repeated_failures: failureCount,
      sample_weight: parseFloat(sampleWeight.toFixed(3))
    });
  }

  // 3. Deduplication using Jaccard Similarity (0.60 threshold)
  const uniqueCurated: any[] = [];
  for (const candidate of curatedPairs) {
    let isDuplicate = false;
    const candidateQuery = candidate.messages[1].content;
    
    for (let i = 0; i < uniqueCurated.length; i++) {
      const existingQuery = uniqueCurated[i].messages[1].content;
      const similarity = calculateJaccard(candidateQuery, existingQuery);
      
      if (similarity > 0.60) {
        isDuplicate = true;
        // Keep the one with the higher sample weight
        if (candidate.sample_weight > uniqueCurated[i].sample_weight) {
          uniqueCurated[i] = candidate;
        }
        break;
      }
    }
    
    if (!isDuplicate) {
      uniqueCurated.push(candidate);
    }
  }

  // 4. Category distribution and report generation
  const counts: Record<string, number> = { coding: 0, reasoning: 0, "tool-use": 0, "memory-recall": 0, chat: 0 };
  let totalQuality = 0;

  for (const item of uniqueCurated) {
    item.tags.forEach((tag: string) => {
      if (counts[tag] !== undefined) counts[tag]++;
    });
    totalQuality += item.quality_score;
  }

  const averageQuality = uniqueCurated.length > 0 ? totalQuality / uniqueCurated.length : 0;
  const trainingReady = uniqueCurated.length >= 5 && averageQuality > 0.70;

  const report = {
    total_samples_curated: feedbackMessages.length,
    total_samples_deduplicated: uniqueCurated.length,
    average_quality_score: parseFloat(averageQuality.toFixed(2)),
    category_distribution: counts,
    training_ready: trainingReady,
    curation_timestamp: new Date().toISOString()
  };

  // 5. Save to files
  const trainingDir = path.join(process.cwd(), "training", "datasets");
  if (!fs.existsSync(trainingDir)) {
    fs.mkdirSync(trainingDir, { recursive: true });
  }

  const jsonPath = path.join(trainingDir, "evolution.json");
  const jsonlPath = path.join(trainingDir, "evolution.jsonl");

  // Save JSON
  fs.writeFileSync(jsonPath, JSON.stringify({ report, dataset: uniqueCurated }, null, 2), "utf8");

  // Save JSONL with sample weights embedded
  const jsonlLines = uniqueCurated.map(item => JSON.stringify({
    messages: item.messages,
    tags: item.tags,
    quality_score: item.quality_score,
    sample_weight: item.sample_weight
  })).join("\n");
  fs.writeFileSync(jsonlPath, jsonlLines, "utf8");

  console.log(`[Curation] Successfully saved ${uniqueCurated.length} curated samples with dynamic weights. Training ready: ${trainingReady}`);
  return { report, dataset: uniqueCurated };
}
