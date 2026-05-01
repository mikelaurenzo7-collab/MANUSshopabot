import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2, Send, User, Sparkles, Bot, Package, Megaphone, Zap } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";

const BOT_CONFIGS: Record<string, {
  icon: typeof Bot;
  color: string;
  bg: string;
  glowColor: string;
  ringColor: string;
  bubbleFrom: string;
  bubbleBorder: string;
  welcome: string;
  subline: string;
}> = {
  store: {
    icon: Sparkles,
    color: "text-sky-300",
    bg: "bg-sky-500/10",
    glowColor: "rgba(14,165,233,0.25)",
    ringColor: "rgba(14,165,233,0.3)",
    bubbleFrom: "from-sky-500/[0.12] to-sky-600/[0.06]",
    bubbleBorder: "border-sky-500/[0.18]",
    welcome: "What should we grow today?",
    subline: "One bot for building, operating, marketing, and remembering each store.",
  },
  architect: {
    icon: Zap,
    color: "text-sky-300",
    bg: "bg-sky-500/10",
    glowColor: "rgba(14,165,233,0.25)",
    ringColor: "rgba(14,165,233,0.3)",
    bubbleFrom: "from-sky-500/[0.12] to-sky-600/[0.06]",
    bubbleBorder: "border-sky-500/[0.18]",
    welcome: "What should we build today?",
    subline: "I know every winning niche, every supplier, and every shortcut.",
  },
  merchant: {
    icon: Package,
    color: "text-cyan-300",
    bg: "bg-cyan-500/10",
    glowColor: "rgba(6,182,212,0.25)",
    ringColor: "rgba(6,182,212,0.3)",
    bubbleFrom: "from-cyan-500/[0.12] to-cyan-600/[0.06]",
    bubbleBorder: "border-cyan-500/[0.18]",
    welcome: "What's the inventory looking like?",
    subline: "I watch margins, stock levels, and competitors 24/7.",
  },
  social: {
    icon: Megaphone,
    color: "text-amber-300",
    bg: "bg-amber-500/10",
    glowColor: "rgba(249,115,22,0.2)",
    ringColor: "rgba(249,115,22,0.28)",
    bubbleFrom: "from-amber-500/[0.10] to-amber-600/[0.05]",
    bubbleBorder: "border-amber-500/[0.18]",
    welcome: "Let's make something go viral.",
    subline: "I craft ads, posts, and campaigns that convert while you sleep.",
  },
};

/**
 * Message type matching server-side LLM Message interface
 */
export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIChatBoxProps = {
  /**
   * Messages array to display in the chat.
   * Should match the format used by invokeLLM on the server.
   */
  messages: Message[];

  /**
   * Callback when user sends a message.
   * Typically you'll call a tRPC mutation here to invoke the LLM.
   */
  onSendMessage: (content: string) => void;

  /**
   * Whether the AI is currently generating a response
   */
  isLoading?: boolean;

  /**
   * Placeholder text for the input field
   */
  placeholder?: string;

  /**
   * Custom className for the container
   */
  className?: string;

  /**
   * Height of the chat box (default: 600px)
   */
  height?: string | number;

  /**
   * Empty state message to display when no messages
   */
  emptyStateMessage?: string;

  /**
   * Suggested prompts to display in empty state
   * Click to send directly
   */
  suggestedPrompts?: string[];

  /**
   * Bot type for personalized empty state and typing indicator
   */
  botType?: "store" | "architect" | "merchant" | "social";
};

/**
 * A ready-to-use AI chat box component that integrates with the LLM system.
 *
 * Features:
 * - Matches server-side Message interface for seamless integration
 * - Markdown rendering with Streamdown
 * - Auto-scrolls to latest message
 * - Loading states
 * - Uses global theme colors from index.css
 *
 * @example
 * ```tsx
 * const ChatPage = () => {
 *   const [messages, setMessages] = useState<Message[]>([
 *     { role: "system", content: "You are a helpful assistant." }
 *   ]);
 *
 *   const chatMutation = trpc.ai.chat.useMutation({
 *     onSuccess: (response) => {
 *       // Assuming your tRPC endpoint returns the AI response as a string
 *       setMessages(prev => [...prev, {
 *         role: "assistant",
 *         content: response
 *       }]);
 *     },
 *     onError: (error) => {
 *       console.error("Chat error:", error);
 *       // Optionally show error message to user
 *     }
 *   });
 *
 *   const handleSend = (content: string) => {
 *     const newMessages = [...messages, { role: "user", content }];
 *     setMessages(newMessages);
 *     chatMutation.mutate({ messages: newMessages });
 *   };
 *
 *   return (
 *     <AIChatBox
 *       messages={messages}
 *       onSendMessage={handleSend}
 *       isLoading={chatMutation.isPending}
 *       suggestedPrompts={[
 *         "Explain quantum computing",
 *         "Write a hello world in Python"
 *       ]}
 *     />
 *   );
 * };
 * ```
 */
export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Type your message...",
  className,
  height = "600px",
  emptyStateMessage = "Start a conversation with AI",
  suggestedPrompts,
  botType = "store",
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter out system messages
  const displayMessages = messages.filter((msg) => msg.role !== "system");

  // Calculate min-height for last assistant message to push user message to top
  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  useEffect(() => {
    if (containerRef.current && inputAreaRef.current) {
      const containerHeight = containerRef.current.offsetHeight;
      const inputHeight = inputAreaRef.current.offsetHeight;
      const scrollAreaHeight = containerHeight - inputHeight;

      // Reserve space for:
      // - padding (p-4 = 32px top+bottom)
      // - user message: 40px (item height) + 16px (margin-top from space-y-4) = 56px
      // Note: margin-bottom is not counted because it naturally pushes the assistant message down
      const userMessageReservedHeight = 56;
      const calculatedHeight = scrollAreaHeight - 32 - userMessageReservedHeight;

      setMinHeightForLastMessage(Math.max(0, calculatedHeight));
    }
  }, []);

  // Scroll to bottom helper function with smooth animation
  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement;

    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'smooth'
        });
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    onSendMessage(trimmedInput);
    setInput("");

    // Scroll immediately after sending
    scrollToBottom();

    // Keep focus on input
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const cfg = BOT_CONFIGS[botType] ?? BOT_CONFIGS.store;

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col rounded-xl border border-white/[0.07] bg-[#050508]/80 backdrop-blur-2xl overflow-hidden",
        className
      )}
      style={{ height }}
    >
      {/* Messages Area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col p-5">
            <div className="flex flex-1 flex-col items-center justify-center gap-7">
              {(() => {
                const Icon = cfg.icon;
                return (
                  <div className="flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-500">
                    {/* Bot avatar — layered glow rings */}
                    <div className="relative">
                      <div
                        className="absolute inset-0 rounded-2xl blur-xl opacity-60"
                        style={{ background: cfg.glowColor }}
                      />
                      <div
                        className={`relative h-20 w-20 rounded-2xl ${cfg.bg} border flex items-center justify-center`}
                        style={{
                          borderColor: cfg.ringColor,
                          boxShadow: `0 0 32px ${cfg.glowColor}, inset 0 1px 0 rgba(255,255,255,0.06)`,
                        }}
                      >
                        <Icon className={`h-9 w-9 ${cfg.color}`} />
                      </div>
                    </div>
                    <div className="text-center space-y-1.5">
                      <p className="text-base font-bold text-white/90 font-heading tracking-tight">{cfg.welcome}</p>
                      <p className="text-xs text-white/35 max-w-[300px] leading-relaxed">{cfg.subline}</p>
                    </div>
                  </div>
                );
              })()}

              {suggestedPrompts && suggestedPrompts.length > 0 && (
                <div className="flex max-w-xl flex-wrap justify-center gap-2">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => onSendMessage(prompt)}
                      disabled={isLoading}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs text-white/55 transition-all hover:bg-white/[0.07] hover:border-white/[0.15] hover:text-white/85 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(14,165,233,0.08)] disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ animationDelay: `${index * 80}ms` }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col space-y-5 p-4 pb-2">
              {displayMessages.map((message, index) => {
                const isLastMessage = index === displayMessages.length - 1;
                const shouldApplyMinHeight =
                  isLastMessage && !isLoading && minHeightForLastMessage > 0;

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex gap-3",
                      message.role === "user"
                        ? "justify-end items-end"
                        : "justify-start items-start"
                    )}
                    style={
                      shouldApplyMinHeight
                        ? { minHeight: `${minHeightForLastMessage}px` }
                        : undefined
                    }
                  >
                    {message.role === "assistant" && (
                      <div
                        className={`size-7 shrink-0 mt-0.5 rounded-full ${cfg.bg} border flex items-center justify-center`}
                        style={{ borderColor: cfg.ringColor, boxShadow: `0 0 10px ${cfg.glowColor}` }}
                      >
                        {(() => {
                          const Icon = cfg.icon;
                          return <Icon className={`size-3.5 ${cfg.color}`} />;
                        })()}
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[88%] sm:max-w-[82%] rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 animate-in fade-in slide-in-from-bottom-1 duration-200",
                        message.role === "user"
                          ? "chat-user-bubble"
                          : "chat-bot-bubble"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-white/80 prose-p:leading-relaxed prose-code:text-sky-300 prose-code:bg-sky-500/10 prose-code:rounded prose-code:px-1 prose-pre:bg-white/[0.04] prose-pre:border prose-pre:border-white/[0.08]">
                          <Streamdown>{message.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm text-white/95 leading-relaxed">
                          {message.content}
                        </p>
                      )}
                    </div>

                    {message.role === "user" && (
                      <div className="size-7 shrink-0 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center">
                        <User className="size-3.5 text-white/60" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div
                  className="flex items-start gap-3"
                  style={
                    minHeightForLastMessage > 0
                      ? { minHeight: `${minHeightForLastMessage}px` }
                      : undefined
                  }
                >
                  <div
                    className={`size-7 shrink-0 mt-0.5 rounded-full ${cfg.bg} border flex items-center justify-center`}
                    style={{ borderColor: cfg.ringColor, boxShadow: `0 0 10px ${cfg.glowColor}` }}
                  >
                    {(() => {
                      const Icon = cfg.icon;
                      return <Icon className={`size-3.5 ${cfg.color}`} />;
                    })()}
                  </div>
                  <div className="chat-bot-bubble px-4 py-3 flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="chat-thinking-dot" style={{ animationDelay: "0ms" }} />
                      <span className="chat-thinking-dot" style={{ animationDelay: "200ms" }} />
                      <span className="chat-thinking-dot" style={{ animationDelay: "400ms" }} />
                    </div>
                    <span className="text-[11px] text-white/30 font-mono tracking-wide">thinking…</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input Area */}
      <form
        ref={inputAreaRef}
        onSubmit={handleSubmit}
        className="chat-input-area flex gap-2.5 p-3 items-end"
      >
        <div className="flex-1 chat-input-wrapper">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="chat-textarea flex-1 max-h-32 resize-none min-h-[40px] bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm text-white/85 placeholder:text-white/25"
            rows={1}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || isLoading}
          aria-label={isLoading ? "Sending…" : "Send message"}
          className="shrink-0 h-10 w-10 chat-send-btn"
          style={{ "--ring-color": cfg.ringColor, "--glow-color": cfg.glowColor } as React.CSSProperties}
        >
          {isLoading ? (
            <Loader2 className={`size-4 animate-spin ${cfg.color}`} />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
