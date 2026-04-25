/**
 * Chat.tsx — Conversational Bot Interface
 *
 * Talk to any of your three SHOPaBOT operators in natural language.
 * The selected bot has full context of your stores, metrics, and history.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, Package, Megaphone, Sparkles, Store } from "lucide-react";

// ─── Bot config ───────────────────────────────────────────────────────────────

type AgentType = "architect" | "merchant" | "social";

const BOTS: Record<
  AgentType,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    accent: string;
    badge: string;
    placeholder: string;
    suggested: string[];
  }
> = {
  architect: {
    label: "Builder Bot",
    icon: Bot,
    color: "text-cyan-400",
    accent: "bg-cyan-500/10 border-cyan-500/20",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    placeholder: "Ask Builder Bot about niches, products, or store strategy…",
    suggested: [
      "What are the most profitable niches right now?",
      "Analyse my store's catalogue and suggest gaps",
      "Which products should I add to hit $10k/month?",
      "How do I optimise my product titles for SEO?",
    ],
  },
  merchant: {
    label: "Merchant Bot",
    icon: Package,
    color: "text-violet-400",
    accent: "bg-violet-500/10 border-violet-500/20",
    badge: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    placeholder: "Ask Merchant Bot about inventory, pricing, or fulfilment…",
    suggested: [
      "Which products are at risk of going out of stock?",
      "How should I price my bestsellers to maximise margin?",
      "Summarise my fulfilment performance this month",
      "What's my AOV and how can I improve it?",
    ],
  },
  social: {
    label: "Social Bot",
    icon: Megaphone,
    color: "text-pink-400",
    accent: "bg-pink-500/10 border-pink-500/20",
    badge: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    placeholder: "Ask Social Bot about ads, content, or campaigns…",
    suggested: [
      "Write 3 Facebook ad headlines for my top product",
      "What ad creative format performs best on TikTok?",
      "Build a 30-day content calendar for my Instagram",
      "How can I reduce my CPA without cutting my budget?",
    ],
  },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Chat() {
  const [agentType, setAgentType] = useState<AgentType>("architect");
  const [storeId, setStoreId] = useState<number | undefined>(undefined);

  // Per-bot conversation history (keyed by agentType so switching bots
  // gives a fresh thread without losing the previous one)
  const [history, setHistory] = useState<Record<AgentType, Message[]>>({
    architect: [],
    merchant: [],
    social: [],
  });

  const storesQuery = trpc.chat.stores.useQuery();

  const chatMutation = trpc.chat.message.useMutation({
    onSuccess: (data) => {
      setHistory((prev) => ({
        ...prev,
        [agentType]: [
          ...prev[agentType],
          { role: "assistant", content: data.reply },
        ],
      }));
    },
    onError: (err) => {
      toast.error(err.message || "Failed to get bot response");
    },
  });

  const bot = BOTS[agentType];
  const BotIcon = bot.icon;
  const messages = history[agentType];

  function handleSend(content: string) {
    const newMsg: Message = { role: "user", content };
    const updatedHistory = [...messages, newMsg];
    setHistory((prev) => ({ ...prev, [agentType]: updatedHistory }));
    chatMutation.mutate({
      agentType,
      messages: updatedHistory.filter(
        (m): m is { role: "user" | "assistant"; content: string } =>
          m.role === "user" || m.role === "assistant"
      ),
      storeId,
    });
  }

  function handleBotSwitch(value: string) {
    setAgentType(value as AgentType);
  }

  return (
    <div className="page-enter p-6 flex flex-col h-full space-y-4" style={{ minHeight: "calc(100vh - 64px)" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between shrink-0">
        <div>
          <p className="micro-label mb-1">AI Operations</p>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-sky-400" />
            Bot Chat
          </h1>
          <p className="text-sm text-white/40 mt-0.5">
            Converse with your operators — they know your stores, metrics, and history
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Store selector */}
          {(storesQuery.data?.length ?? 0) > 0 && (
            <Select
              value={storeId?.toString() ?? "none"}
              onValueChange={(v) => setStoreId(v === "none" ? undefined : Number(v))}
            >
              <SelectTrigger className="w-44 bg-white/5 border-white/10 text-sm h-9">
                <Store className="h-3.5 w-3.5 mr-1.5 text-white/40 shrink-0" />
                <SelectValue placeholder="Store context…" />
              </SelectTrigger>
              <SelectContent className="bg-[#0a0a0f] border-white/10">
                <SelectItem value="none">All stores</SelectItem>
                {storesQuery.data?.map((s: any) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Bot selector */}
          <div className="flex rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.02] p-0.5 gap-0.5">
            {(Object.keys(BOTS) as AgentType[]).map((key) => {
              const b = BOTS[key];
              const Icon = b.icon;
              const isActive = agentType === key;
              return (
                <button
                  key={key}
                  onClick={() => handleBotSwitch(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    isActive
                      ? `${b.accent} ${b.color} shadow-sm`
                      : "text-white/35 hover:text-white/65 hover:bg-white/[0.04]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active bot badge */}
      <div className="shrink-0">
        <Badge className={`border text-xs ${bot.badge}`}>
          <BotIcon className="h-3 w-3 mr-1" />
          Chatting with {bot.label}
          {storeId && storesQuery.data && (
            <span className="ml-1 opacity-70">
              — {storesQuery.data.find((s: any) => s.id === storeId)?.name ?? ""}
            </span>
          )}
        </Badge>
      </div>

      {/* Chat Box */}
      <div className="flex-1 min-h-0">
        <AIChatBox
          messages={messages}
          onSendMessage={handleSend}
          isLoading={chatMutation.isPending}
          placeholder={bot.placeholder}
          suggestedPrompts={messages.length === 0 ? bot.suggested : undefined}
          className="h-full border-white/10 bg-white/[0.02]"
          height="100%"
          emptyStateMessage={`${bot.label} is ready. Ask me anything about your e-commerce business.`}
        />
      </div>
    </div>
  );
}
