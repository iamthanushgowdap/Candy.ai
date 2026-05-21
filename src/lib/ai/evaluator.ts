import { withRecovery } from "./recovery";

export interface EvalPrompt {
  id: string;
  category: string;
  prompt: string;
  system: string;
}

export interface EvalResult {
  promptId: string;
  prompt: string;
  category: string;
  responseA: string;
  responseB: string;
  scoreA: number;
  scoreB: number;
  latencyA: number;
  latencyB: number;
  justification: string;
}

export interface SuiteReport {
  success: boolean;
  oldModelId: string;
  newModelId: string;
  avgScoreOld: number;
  avgScoreNew: number;
  avgReasoningOld: number;
  avgReasoningNew: number;
  avgCodingOld: number;
  avgCodingNew: number;
  avgLatencyOldMs: number;
  avgLatencyNewMs: number;
  latencyRegressionPercent: number;
  improvementPercent: number;
  gatePassed: boolean;
  evaluations: EvalResult[];
  details: string[];
}

export const HELD_OUT_EVAL_SUITE: EvalPrompt[] = [
  {
    id: "greet",
    category: "greeting",
    prompt: "Hello! Who are you and what are your primary capabilities?",
    system: "You are Antgravity, a premium conversational AI companion. Be concise, direct, and warm."
  },
  {
    id: "emo",
    category: "emotional",
    prompt: "I`ve had a really stressful day at work and feel like nothing I do is enough. Any words of encouragement?",
    system: "You are Antgravity, a premium conversational AI companion. Respond with empathy, understanding, and encouraging words."
  },
  {
    id: "logic",
    category: "reasoning",
    prompt: "A farmer has 15 sheep. All but 8 die. How many sheep does the farmer have left? Explain your step-by-step logic.",
    system: "You are Antgravity, a premium conversational AI companion. Be logical, clear, and explain your reasoning steps."
  },
  {
    id: "qa",
    category: "general_qa",
    prompt: "Explain quantum computing in simple terms for a 10-year-old child.",
    system: "You are Antgravity, a premium conversational AI companion. Explain complex concepts in simple, intuitive terms suitable for a kid."
  },
  {
    id: "code",
    category: "coding",
    prompt: "Write a JavaScript function that checks if a string is a palindrome, ignoring casing and special characters.",
    system: "You are Antgravity, a premium conversational AI companion. Provide clean, correct, well-structured code with zero filler explanations."
  }
];

/**
 * Queries Ollama for a specific model response
 */
async function generateOllamaResponse(modelId: string, system: string, prompt: string): Promise<string> {
  return await withRecovery(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000); // 15s timeout per generation

      const res = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          prompt: `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`,
          stream: false,
          options: {
            temperature: 0.15,
            num_thread: 4
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) throw new Error(`Ollama returned status ${res.status}`);
      const data = await res.json();
      return data.response?.trim() || "";
    },
    "",
    { context: `EvalOllamaGen-${modelId}`, timeoutMs: 16000 }
  );
}

/**
 * Uses the small local base model as a judge to compare and score the two outputs.
 */
async function judgeOutputs(
  judgeModelId: string,
  userPrompt: string,
  responseA: string,
  responseB: string
): Promise<{ scoreA: number; scoreB: number; justification: string }> {
  const prompt = `System Directive: You are an objective, strict AI evaluation judge. Compare and grade two responses (A and B) to the user's prompt on a scale of 1.0 to 10.0 based on accuracy, naturalness, reasoning, and instruction-following. Return ONLY a single JSON object containing "score_a", "score_b", and a brief "justification". Do not include markdown codeblocks or other formatting outside the JSON.

User Prompt:
${userPrompt}

Response A (from Old Model):
${responseA}

Response B (from New Model):
${responseB}

JSON Output (matching exactly {"score_a": <float>, "score_b": <float>, "justification": "<string>"}):`;

  const rawJudgeText = await withRecovery(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000); // 12s timeout

      const res = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: judgeModelId,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.05, // Ultra low temperature for deterministic evaluation
            num_thread: 4
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) throw new Error(`Ollama returned status ${res.status}`);
      const data = await res.json();
      return data.response?.trim() || "";
    },
    "",
    { context: "EvalJudgeLLM", timeoutMs: 13000 }
  );

  // Parse JSON from the judge response
  try {
    let cleanJson = rawJudgeText.trim();
    if (cleanJson.includes("```")) {
      const parts = cleanJson.split("```");
      const codeblock = parts.find((p: string) => p.toLowerCase().includes("json") || p.startsWith("{"));
      if (codeblock) {
        cleanJson = codeblock.replace(/^[a-zA-Z]+/g, "").trim();
      }
    }

    // Direct JSON regex fallback if parsing fails
    const match = cleanJson.match(/\{[\s\S]*?\}/);
    if (match) {
      cleanJson = match[0];
    }

    const parsed = JSON.parse(cleanJson);
    const scoreA = Number(parsed.score_a ?? parsed.scoreA ?? 5.0);
    const scoreB = Number(parsed.score_b ?? parsed.scoreB ?? 5.0);
    const justification = parsed.justification || parsed.reason || "Evaluated by AI Judge.";

    return { scoreA, scoreB, justification };
  } catch (err) {
    console.warn("[Evaluator] Failed to parse JSON from judge response:", rawJudgeText);
    
    // Fuzzy parser fallback
    const scoreAMatch = rawJudgeText.match(/score_?a[``\s:]+(\d+(\.\d+)?)/i);
    const scoreBMatch = rawJudgeText.match(/score_?b[``\s:]+(\d+(\.\d+)?)/i);
    
    const scoreA = scoreAMatch ? parseFloat(scoreAMatch[1]) : 5.0;
    const scoreB = scoreBMatch ? parseFloat(scoreBMatch[1]) : 5.0;
    
    return {
      scoreA,
      scoreB,
      justification: `Fuzzy parsed. Raw: ${rawJudgeText.substring(0, 100)}...`
    };
  }
}

/**
 * Runs Side-by-Side Model Evaluation (Phase 2 & Phase D)
 * Ensures new model adapter achieves at least 5% quality improvement: Score(New) >= Score(Old) * 1.05
 * Tracks latency change and category specific improvements (reasoning, coding).
 */
export async function runModelEvaluation(
  oldModelId: string,
  newModelId: string,
  judgeModelId: string = "qwen2.5:0.5b"
): Promise<SuiteReport> {
  const report: SuiteReport = {
    success: false,
    oldModelId,
    newModelId,
    avgScoreOld: 0,
    avgScoreNew: 0,
    avgReasoningOld: 0,
    avgReasoningNew: 0,
    avgCodingOld: 0,
    avgCodingNew: 0,
    avgLatencyOldMs: 0,
    avgLatencyNewMs: 0,
    latencyRegressionPercent: 0,
    improvementPercent: 0,
    gatePassed: false,
    evaluations: [],
    details: []
  };

  try {
    console.log(`[Evaluator] Starting side-by-side evaluation. Old: ${oldModelId} vs New: ${newModelId}`);
    report.details.push(`Started side-by-side evaluation between "${oldModelId}" and "${newModelId}" at ${new Date().toISOString()}`);

    let totalScoreOld = 0;
    let totalScoreNew = 0;
    let totalLatencyOld = 0;
    let totalLatencyNew = 0;

    let reasoningOldSum = 0;
    let reasoningNewSum = 0;
    let reasoningCount = 0;

    let codingOldSum = 0;
    let codingNewSum = 0;
    let codingCount = 0;

    // Run evaluations sequentially to avoid RTX 2050 (4GB VRAM) OOM crashes
    for (const test of HELD_OUT_EVAL_SUITE) {
      console.log(`[Evaluator] Evaluating test case "${test.id}" [${test.category}]...`);
      report.details.push(`Test Case: "${test.id}" (${test.category})`);

      // 1. Generate response from Old Model & Track Latency
      const startOld = Date.now();
      const responseA = await generateOllamaResponse(oldModelId, test.system, test.prompt);
      const latencyOld = Date.now() - startOld;
      if (!responseA) {
        throw new Error(`Failed to generate response for test "${test.id}" from old model "${oldModelId}"`);
      }

      // 2. Generate response from New Model & Track Latency
      const startNew = Date.now();
      const responseB = await generateOllamaResponse(newModelId, test.system, test.prompt);
      const latencyNew = Date.now() - startNew;
      if (!responseB) {
        throw new Error(`Failed to generate response for test "${test.id}" from new model "${newModelId}"`);
      }

      // 3. Score using LLM Judge
      const judgment = await judgeOutputs(judgeModelId, test.prompt, responseA, responseB);
      
      console.log(`[Evaluator] Scores for "${test.id}": Old: ${judgment.scoreA.toFixed(1)} (${latencyOld}ms) | New: ${judgment.scoreB.toFixed(1)} (${latencyNew}ms)`);
      report.details.push(`-> Score Old: ${judgment.scoreA} | Score New: ${judgment.scoreB} | Latency Old: ${latencyOld}ms | Latency New: ${latencyNew}ms`);
      report.details.push(`-> Justification: ${judgment.justification}`);

      totalScoreOld += judgment.scoreA;
      totalScoreNew += judgment.scoreB;
      totalLatencyOld += latencyOld;
      totalLatencyNew += latencyNew;

      // Group subscores by coding & reasoning categories
      if (test.category === "reasoning") {
        reasoningOldSum += judgment.scoreA;
        reasoningNewSum += judgment.scoreB;
        reasoningCount++;
      } else if (test.category === "coding") {
        codingOldSum += judgment.scoreA;
        codingNewSum += judgment.scoreB;
        codingCount++;
      }

      report.evaluations.push({
        promptId: test.id,
        prompt: test.prompt,
        category: test.category,
        responseA,
        responseB,
        scoreA: judgment.scoreA,
        scoreB: judgment.scoreB,
        latencyA: latencyOld,
        latencyB: latencyNew,
        justification: judgment.justification
      });
    }

    // 4. Calculate final averages and percentages
    const count = HELD_OUT_EVAL_SUITE.length;
    report.avgScoreOld = totalScoreOld / count;
    report.avgScoreNew = totalScoreNew / count;

    report.avgLatencyOldMs = totalLatencyOld / count;
    report.avgLatencyNewMs = totalLatencyNew / count;
    
    // Latency change (positive = slower, negative = faster)
    if (report.avgLatencyOldMs > 0) {
      report.latencyRegressionPercent = ((report.avgLatencyNewMs - report.avgLatencyOldMs) / report.avgLatencyOldMs) * 100;
    }

    // Subcategory scoring calculations
    report.avgReasoningOld = reasoningCount > 0 ? reasoningOldSum / reasoningCount : 0;
    report.avgReasoningNew = reasoningCount > 0 ? reasoningNewSum / reasoningCount : 0;
    report.avgCodingOld = codingCount > 0 ? codingOldSum / codingCount : 0;
    report.avgCodingNew = codingCount > 0 ? codingNewSum / codingCount : 0;

    let improvementPercent = 0;
    if (report.avgScoreOld > 0) {
      improvementPercent = ((report.avgScoreNew - report.avgScoreOld) / report.avgScoreOld) * 100;
    }
    report.improvementPercent = improvementPercent;

    // Promotion rule: ONLY promote if average overall quality score improvement >= +5%
    const improvementTarget = report.avgScoreOld * 1.05;
    const gatePassed = report.avgScoreNew >= improvementTarget;
    report.gatePassed = gatePassed;
    report.success = true;

    console.log(`[Evaluator] Evaluation Complete.`);
    console.log(`  Avg Score Old: ${report.avgScoreOld.toFixed(2)} | New: ${report.avgScoreNew.toFixed(2)} (${improvementPercent.toFixed(2)}% improvement)`);
    console.log(`  Avg Latency Old: ${report.avgLatencyOldMs.toFixed(0)}ms | New: ${report.avgLatencyNewMs.toFixed(0)}ms (Diff: ${report.latencyRegressionPercent.toFixed(2)}%)`);
    console.log(`  Reasoning Old: ${report.avgReasoningOld.toFixed(2)} | New: ${report.avgReasoningNew.toFixed(2)}`);
    console.log(`  Coding Old: ${report.avgCodingOld.toFixed(2)} | New: ${report.avgCodingNew.toFixed(2)}`);
    console.log(`  Gate Passed: ${gatePassed}`);

    report.details.push(`Evaluation completed. Avg Old: ${report.avgScoreOld.toFixed(2)}, Avg New: ${report.avgScoreNew.toFixed(2)}. Improvement: ${improvementPercent.toFixed(2)}% (Target: +5.00%). Gate Passed: ${gatePassed}`);
    report.details.push(`Latency Change: Old: ${report.avgLatencyOldMs.toFixed(0)}ms, New: ${report.avgLatencyNewMs.toFixed(0)}ms (${report.latencyRegressionPercent.toFixed(2)}% change).`);
    report.details.push(`Reasoning Improvement: ${report.avgReasoningOld.toFixed(2)} -> ${report.avgReasoningNew.toFixed(2)}`);
    report.details.push(`Coding Improvement: ${report.avgCodingOld.toFixed(2)} -> ${report.avgCodingNew.toFixed(2)}`);

  } catch (err: any) {
    console.error(`[Evaluator] Error running side-by-side evaluation:`, err);
    report.details.push(`Fatal error running evaluation suite: ${err.message || err}`);
    report.success = false;
  }

  return report;
}
