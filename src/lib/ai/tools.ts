import { searchWeb } from "./search";
import { querySemanticMemories, storeSemanticMemory } from "./memory";
import { scrapePage } from "./scraper";
import { getWeather } from "./weather";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: "string" | "number" | "boolean"; description: string }>;
    required: string[];
  };
}

export const ACTIVE_TOOLS: ToolDefinition[] = [
  {
    name: "searchWeb",
    description: "Queries the web for search terms about real-time technology, specifications, lore details, or current news.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The literal query string to search for." }
      },
      required: ["query"]
    }
  },
  {
    name: "getWeather",
    description: "Fetches the real-time, live weather report for any city, sub-locality, or geographical location.",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "The city or location to retrieve the weather report for (e.g., Bangalore, Jp nagar)." }
      },
      required: ["location"]
    }
  },
  {
    name: "scrapePage",
    description: "Extracts and cleans all high-fidelity text content from a public web page URL using a headless browser.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The fully qualified absolute URL to scrape (e.g., https://example.com)." }
      },
      required: ["url"]
    }
  },
  {
    name: "queryMemory",
    description: "Searches the user's global vector database of prior memories/facts.",
    parameters: {
      type: "object",
      properties: {
        queryText: { type: "string", description: "The topic or fact to search memory for." }
      },
      required: ["queryText"]
    }
  },
  {
    name: "storeMemory",
    description: "Stores a specific fact or detail about the user into the global user vector recollections.",
    parameters: {
      type: "object",
      properties: {
        fact: { type: "string", description: "The clean, standalone statement about the user to store." }
      },
      required: ["fact"]
    }
  }
];

export async function runTool(
  toolName: string,
  args: any
): Promise<string> {
  console.log(`[Tool Execution] Running "${toolName}" globally with arguments:`, args);

  switch (toolName) {
    case "searchWeb": {
      if (!args.query) return "Error: Missing query argument.";
      const results = await searchWeb(args.query);
      return JSON.stringify(results.map(r => ({
        title: r.title,
        snippet: r.snippet,
        url: r.url
      })), null, 2);
    }

    case "getWeather": {
      if (!args.location) return "Error: Missing location argument.";
      return await getWeather(args.location);
    }

    case "scrapePage": {
      if (!args.url) return "Error: Missing url argument.";
      return await scrapePage(args.url);
    }

    case "queryMemory": {
      if (!args.queryText) return "Error: Missing queryText argument.";
      const memories = await querySemanticMemories(args.queryText, 3);
      if (memories.length === 0) return "No prior global memory logs found for this query.";
      return JSON.stringify({ recalledMemories: memories }, null, 2);
    }

    case "storeMemory": {
      if (!args.fact) return "Error: Missing fact argument.";
      const stored = await storeSemanticMemory(args.fact);
      return stored 
        ? `Successfully saved fact to global database memory: "${args.fact}"` 
        : "Failed to store global memory log.";
    }

    default:
      return `Error: Tool "${toolName}" is not registered in index.`;
  }
}
