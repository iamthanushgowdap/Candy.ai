/**
 * Formats a runtime or compilation error inside the sandbox into a structured
 * conversational prompt for the AI to auto-fix the code.
 */
export function generateAutoRepairPrompt(
  filename: string,
  code: string,
  errorMessage: string,
  stackTrace: string
): string {
  return `[System Error Report - Auto-Repair Mode Activated]

An error occurred while compiling/rendering the component **${filename}** in the sandboxed preview runtime.

### Error Details
- **Message**: ${errorMessage}
${stackTrace ? `- **Stack Trace**:\n\`\`\`text\n${stackTrace}\n\`\`\`` : ""}

### Current Source Code
\`\`\`tsx
// File: ${filename}
${code}
\`\`\`

Please analyze this error, inspect the stack trace, and rewrite the component to fix the bug. Provide only the corrected code blocks for **${filename}** and any other affected files. Make sure to keep the premium design style intact.`;
}
