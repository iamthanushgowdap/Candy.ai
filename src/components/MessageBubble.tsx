import React, { useState } from "react";
import { Copy, Check, Edit2, Share2, ThumbsUp, ThumbsDown } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Message {
  id: string;
  session_id: string;
  sender: "user" | "companion" | "system";
  content: string;
  created_at: string;
  feedback?: 'up' | 'down' | null;
  feedback_correction?: string | null;
  feedback_reason?: string | null;
}

interface MessageBubbleProps {
  msg: Message;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onEdit?: (text: string) => void;
  onShare?: (text: string) => void;
  onFeedback?: (messageId: string, feedback: 'up' | 'down', correction?: string, reason?: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg,
  copiedId,
  onCopy,
  onEdit,
  onShare,
  onFeedback
}) => {
  const isUser = msg.sender === "user";
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(msg.feedback || null);
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionText, setCorrectionText] = useState(msg.feedback_correction || "");
  const [reason, setReason] = useState(msg.feedback_reason || "");

  const handleFeedback = (type: 'up' | 'down') => {
    setFeedback(type);
    if (type === 'up') {
      setShowCorrectionForm(false);
      if (onFeedback) {
        onFeedback(msg.id, 'up');
      }
    } else {
      setShowCorrectionForm(true);
    }
  };

  const submitCorrection = () => {
    if (onFeedback) {
      onFeedback(msg.id, 'down', correctionText, reason);
    }
    setShowCorrectionForm(false);
  };

  return (
    <div className={`flex items-start gap-4 ${isUser ? "flex-row-reverse" : ""} animate-fade-in-up`}>
      {/* Avatar */}
      {!isUser ? (
        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-base shrink-0 select-none">
          ✦
        </div>
      ) : (
        <div className="w-8 h-8 rounded-lg bg-zinc-850 border border-zinc-800 flex items-center justify-center text-xs font-bold shrink-0 select-none">
          👤
        </div>
      )}

      {/* Speech Content */}
      <div className="flex-1 max-w-2xl min-w-0">
        <div
          className={`p-4 rounded-2xl border transition-colors ${
            isUser
              ? "bg-zinc-900 border-zinc-800/80 text-zinc-100"
              : "bg-zinc-900/30 border-zinc-900/40 text-zinc-200"
          }`}
        >
          <div className="font-sans text-[13px] sm:text-sm">
            <MarkdownRenderer content={msg.content} />
          </div>

          {/* Interactive Toolbar */}
          <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-zinc-900/40">
            <div className="flex items-center gap-2">
              {isUser ? (
                <>
                  <button
                    onClick={() => onCopy(msg.id, msg.content)}
                    className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/80 transition-colors cursor-pointer"
                    title="Copy Message"
                  >
                    {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  {onEdit && (
                    <button
                      onClick={() => onEdit(msg.content)}
                      className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/80 transition-colors cursor-pointer"
                      title="Edit Message"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => onCopy(msg.id, msg.content)}
                    className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/80 transition-colors cursor-pointer"
                    title="Copy Response"
                  >
                    {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  {onShare && (
                    <button
                      onClick={() => onShare(msg.content)}
                      className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/80 transition-colors cursor-pointer"
                      title="Share Response"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <div className="h-3 w-[1px] bg-zinc-800" />
                  <button
                    onClick={() => handleFeedback('up')}
                    className={`p-1 rounded transition-all cursor-pointer ${
                      feedback === 'up' ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-500 hover:text-emerald-300 hover:bg-zinc-900/80'
                    }`}
                    title="Thumbs Up"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleFeedback('down')}
                    className={`p-1 rounded transition-all cursor-pointer ${
                      feedback === 'down' ? 'text-rose-400 bg-rose-500/10' : 'text-zinc-500 hover:text-rose-300 hover:bg-zinc-900/80'
                    }`}
                    title="Thumbs Down"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            <span className="text-[10px] text-zinc-650 font-semibold select-none font-mono">
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {showCorrectionForm && (
            <div className="mt-4 p-4 rounded-xl border border-zinc-800 bg-zinc-950/80 backdrop-blur-md space-y-3.5 animate-fade-in text-left">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Why is this response incorrect?
                </label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {[
                    { value: "wrong_info", label: "Wrong Info" },
                    { value: "low_quality", label: "Low Quality" },
                    { value: "refusal", label: "Refusal / Error" },
                    { value: "formatting", label: "Style / Format" },
                    { value: "other", label: "Other" }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setReason(opt.value)}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-medium text-left transition-all cursor-pointer ${
                        reason === opt.value
                          ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                          : "bg-zinc-900 border-zinc-850 hover:border-zinc-700 text-zinc-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Corrected Response (Optional)
                </label>
                <textarea
                  value={correctionText}
                  onChange={(e) => setCorrectionText(e.target.value)}
                  placeholder="Provide the ideal answer for training..."
                  rows={3}
                  className="w-full text-xs bg-zinc-900 border border-zinc-855 rounded-lg p-2.5 text-zinc-200 placeholder-zinc-550 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 resize-none font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCorrectionForm(false)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-zinc-400 text-xs font-semibold cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitCorrection}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer shadow-lg shadow-rose-500/10 transition-all flex items-center gap-1"
                >
                  Submit Feedback
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
