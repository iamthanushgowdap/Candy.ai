/**
 * Intent Classifier — Structured Intent Detection Engine
 * 
 * Centralizes all intent routing logic into a typed, testable, extensible system.
 * Replaces scattered regex blocks across orchestrator.ts.
 * Designed for easy swap to a model-based planner in the future.
 */

export interface IntentResult {
  isGreeting: boolean;
  isCodeGen: boolean;
  isIdentityQuery: boolean;
  isConversational: boolean;
  isSelfReferential: boolean;
  isTaskDirective: boolean;
  needsWebSearch: boolean;
  needsWeather: boolean;
  needsMemoryRecall: boolean;
  /** Dominant intent label for logging */
  label: string;
}

// ─── Pattern Libraries ─────────────────────────────────────────────────────────

const GREETING_REGEX = /^(hi+|hello+|hey+|hlo+|hloo+|yo+|sup|welcome|thanks|thank\s*you|howdy|greetings|salut|namaste|hiya|wassup|whassup)$/i;

const GREETING_PHRASES = [
  "good morning", "good afternoon", "good evening", "good night",
  "how`s your day", "how are you doing", "nice to meet you"
];

const IDENTITY_PATTERNS = [
  "who are you", "what are you", "what is your name", "what`s your name",
  "what is you name", "who am i talking to", "your creator", "who created you",
  "who built you", "who made you", "what model are you", "are you an ai",
  "are you human", "introduce yourself", "tell me about yourself",
  "what can you do", "what do you do", "your capabilities"
];

const CONVERSATIONAL_PATTERNS = [
  "how are you", "how's it going", "how is it going", "whats up", "what's up",
  "tell me a joke", "tell a joke", "say something funny", "make me laugh",
  "sing a song", "write a poem", "write me a poem", "tell me a story",
  "i'm bored", "im bored", "chat with me", "let's talk", "lets talk",
  "what do you think", "your opinion", "do you like", "favorite"
];

const TASK_DIRECTIVE_PREFIXES = [
  "write a", "write me", "create a", "create me", "make a", "make me",
  "code a", "code me", "generate a", "generate me", "build a", "build me",
  "design a", "design me", "calculate", "solve", "translate",
  "summarize", "summarise", "explain the code", "format this",
  "debug this", "refactor", "optimize", "fix this", "improve",
  "convert this", "parse this", "implement"
];

const CODE_GEN_PATTERNS = [
  "landing page", "html page", "react component", "javascript function",
  "typescript function", "python function", "python script", "express api",
  "rest api", "webpage", "web page", "html template", "css style",
  "function that", "class that", "component that", "script that"
];

const SELF_REFERENTIAL_REGEX = /^(are you|do you|can you|will you|should you|what do you|how do you|why do you|could you|would you|have you|did you|were you)\b/i;

const WEATHER_PATTERNS = [
  "weather", "temperature", "forecast", "temp in", "rain in", "wind in",
  "humidity", "climate in", "sunny in", "cold in", "hot in"
];

const MEMORY_RECALL_PATTERNS = [
  "remember", "forget", "recall", "do you know my", "who am i",
  "my name", "what do i love", "my favorite", "where do i live",
  "my project", "my cv", "my resume", "what did i say", "last time"
];

// ─── Classifier ────────────────────────────────────────────────────────────────

export function classifyIntent(message: string, hasHistory = false): IntentResult {
  const lower = message.toLowerCase();
  const cleaned = lower.replace(/[.,?!]/g, "").trim();

  // ── Greeting ─────────────────────────────────────
  const isGreeting =
    GREETING_REGEX.test(cleaned) ||
    GREETING_PHRASES.some(p => cleaned === p || cleaned.startsWith(p + " ") || cleaned.endsWith(" " + p));

  // ── Identity ──────────────────────────────────────
  const isIdentityQuery = IDENTITY_PATTERNS.some(p => cleaned.includes(p));

  // ── Conversational & Contextual Followups ──────────
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;

  const isContextualFollowup = hasHistory && (() => {
    // 1. Single-word queries are always contextual followups (e.g. "cities?", "why?", "population")
    if (wordCount === 1) return true;

    // 2. Simple 2-word followups that aren't starting a brand new question
    if (wordCount === 2) {
      const isQuestionStart = /^(who|what|where|when|why|how|define|search)\s+(is|are|was|were|in|on|at|of|the|a|an)\b/i.test(cleaned);
      if (!isQuestionStart) return true;
    }

    // 3. Sentences referencing the assistant or the previous context
    const hasConversationRef =
      /\b(you|your|it|that|this|they|them|those|these|him|her)\b/i.test(cleaned) &&
      /\b(say|said|mean|mention|talk|refer|show|explain|tell|ask|do|think|write|code|make)\b/i.test(cleaned);

    if (hasConversationRef) return true;

    // 4. Common conversational phrases and transitions
    const conversationalPhrases = [
      "tell me more", "explain further", "give me examples", "what do you mean",
      "why is that", "why so", "how come", "what about", "how about", "go on", "continue"
    ];
    if (conversationalPhrases.some(phrase => lower.includes(phrase))) {
      return true;
    }

    // 5. Conversational conjunction starts
    if (/^(and|or|but|so|then|actually|specifically|more|less)\b/i.test(cleaned)) {
      return true;
    }

    return false;
  })();

  const isConversational =
    CONVERSATIONAL_PATTERNS.some(p => cleaned.includes(p)) ||
    isContextualFollowup;

  // ── Task Directive ────────────────────────────────
  const isTaskDirective = TASK_DIRECTIVE_PREFIXES.some(
    prefix => cleaned.startsWith(prefix) || cleaned.includes(" " + prefix + " ")
  );

  // ── Code Generation ───────────────────────────────
  const isCodeGen = CODE_GEN_PATTERNS.some(p => cleaned.includes(p)) || isTaskDirective;

  // ── Self-Referential ──────────────────────────────
  const isSelfReferential = SELF_REFERENTIAL_REGEX.test(cleaned) && !isIdentityQuery;

  // ── Weather ───────────────────────────────────────
  const needsWeather = WEATHER_PATTERNS.some(p => lower.includes(p));

  // ── Memory Recall ─────────────────────────────────
  const needsMemoryRecall = MEMORY_RECALL_PATTERNS.some(p => lower.includes(p));

  // ── Web Search ────────────────────────────────────
  // Search is only useful when: not a greeting, not conversational/directive, not self-referential,
  // not identity, not code gen — and there's an actual external entity/fact being asked about
  const bypassSearch = isGreeting || isConversational || isIdentityQuery ||
    isTaskDirective || isSelfReferential || isCodeGen;

  const needsWebSearch = !bypassSearch && !needsWeather;

  // ── Label ─────────────────────────────────────────
  let label = "general";
  if (isGreeting) label = "greeting";
  else if (isIdentityQuery) label = "identity";
  else if (isCodeGen) label = "codegen";
  else if (isConversational) label = "conversational";
  else if (isSelfReferential) label = "self_referential";
  else if (isTaskDirective) label = "task_directive";
  else if (needsWeather) label = "weather";
  else if (needsMemoryRecall) label = "memory_recall";
  else if (needsWebSearch) label = "web_search";

  return {
    isGreeting,
    isCodeGen,
    isIdentityQuery,
    isConversational,
    isSelfReferential,
    isTaskDirective,
    needsWebSearch,
    needsWeather,
    needsMemoryRecall,
    label
  };
}
