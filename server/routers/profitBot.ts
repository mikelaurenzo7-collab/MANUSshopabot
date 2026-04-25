import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import { logger } from "../_core/logger";
import * as db from "../db";

/**
 * Profit Bot — Daily sports betting, crypto, and stock analysis engine.
 *
 * Strategy: "Sharp Edge Hunting"
 * - Find spots where the public and the books are wrong
 * - Only surface picks at 75%+ confidence
 * - Wager sizing: $20 (75-80%), $30 (80-85%), $50 (85%+)
 * - Track running record with full P/L transparency
 */

const SYSTEM_PROMPT = `You are Profit Bot — a daily sports betting, crypto, and stock analysis engine.
Your strategy is "Sharp Edge Hunting": find spots where the public and the books are wrong.

ANALYSIS LAYERS:
1. DATA COLLECTION: Pull today's full slate across all active sports. Check injury reports, lineup confirmations, last-minute scratches, weather data for outdoor sports, line movement tracking (open vs current), public betting percentages, and reverse line movement (sharp money signals).
2. SITUATIONAL ANALYSIS: Rest advantages, schedule spots (back-to-backs), revenge games, divisional rivalries, motivation mismatches, umpire/referee tendencies, pitcher/goalie matchup history, home/away splits, day/night splits, letdown spots, look-ahead spots.
3. VALUE IDENTIFICATION: Compare projected line to actual line — if there's a 2+ point gap or significant odds difference, that's value. Cross-reference with sharp money indicators. Check spread, moneyline, or total for best value.
4. BET SELECTION: Rank all value spots by confidence. Pick the SINGLE best bet where the most layers align.

SPORTS COVERAGE: NFL, MLB, NBA, college football, college basketball, NHL, golf (whatever is in season).
CRYPTO: BTC, ETH, SOL, and top 20 altcoins for 1-5 day setups. Check technical levels, on-chain signals, whale movements, catalysts.
STOCKS: Short-term catalyst trades only — earnings reactions, sector momentum, news overreactions, unusual options flow.
PREDICTION MARKETS: Polymarket, Kalshi — only when public sentiment is clearly mispriced.

RULES:
- NO pick unless 75%+ confident it will profit
- Wager sizing: $20 (75-80%), $30 (80-85%), $50 (85%+)
- Every pick needs full reasoning, the specific edge, and key risk
- If nothing meets the bar, output "No play today" with brief market summary
- Be direct. No fluff. Clean, scannable format.

Today's date is provided in the user message. Use your training knowledge of current sports seasons, schedules, and market conditions to provide the most relevant analysis.`;

export const profitBotRouter = router({
  /**
   * Run the daily Profit Bot analysis.
   * This is the core engine — called by the scheduled task or manually by the user.
   */
  runAnalysis: protectedProcedure
    .input(z.object({
      forceRun: z.boolean().default(false),
    }).optional())
    .mutation(async ({ ctx }) => {
      const task = await db.createAgentTask({
        agentType: "merchant", // Using merchant since schema doesn't have "profit" type
        taskType: "profit_bot_analysis",
        title: `Profit Bot Daily Analysis — ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
        description: "AI-powered sports, crypto, and stock analysis with sharp edge hunting strategy",
        status: "running",
      });

      try {
        // Get existing record for context
        const existingPicks = await db.getAgentTasks({
          agentType: "merchant",
          limit: 20,
        });
        const profitPicks = existingPicks.filter(
          (t: any) => t.taskType === "profit_bot_analysis" && t.status === "completed"
        );

        // Build record summary for the LLM
        let recordContext = "";
        if (profitPicks.length > 0) {
          const results = profitPicks
            .map((p: any) => {
              try {
                const r = typeof p.result === "string" ? JSON.parse(p.result) : p.result;
                return r;
              } catch { return null; }
            })
            .filter(Boolean);

          const totalPicks = results.length;
          const wins = results.filter((r: any) => r?.pick?.result === "win").length;
          const losses = results.filter((r: any) => r?.pick?.result === "loss").length;
          const pending = results.filter((r: any) => !r?.pick?.result || r?.pick?.result === "pending").length;
          const totalPL = results.reduce((sum: number, r: any) => sum + (r?.pick?.profitLoss || 0), 0);

          recordContext = `\n\nRUNNING RECORD (last ${totalPicks} picks):
Wins: ${wins} | Losses: ${losses} | Pending: ${pending}
Running P/L: $${totalPL >= 0 ? "+" : ""}${totalPL.toFixed(2)}
${totalPicks >= 20 ? "\n⚠️ 20-pick review milestone reached. Include performance review and strategy adjustments." : ""}`;
        }

        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "America/Chicago",
        });

        const llmResult = await invokeLLM({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Today is ${dateStr} (Central Time). Run the full Profit Bot analysis.${recordContext}

Analyze all active sports, crypto markets, and stock catalysts. Apply all 4 layers of the Sharp Edge Hunting strategy. Return your analysis as structured JSON.

If you find a qualifying pick (75%+ confidence), include full details. If nothing qualifies, set hasPick to false and provide a market summary.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "profit_bot_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  date: { type: "string", description: "Analysis date" },
                  hasPick: { type: "boolean", description: "Whether a qualifying pick was found" },
                  marketSummary: {
                    type: "object",
                    properties: {
                      sports: { type: "string", description: "Brief sports landscape summary" },
                      crypto: { type: "string", description: "Brief crypto market summary" },
                      stocks: { type: "string", description: "Brief stock market summary" },
                      predictionMarkets: { type: "string", description: "Brief prediction market summary" },
                    },
                    required: ["sports", "crypto", "stocks", "predictionMarkets"],
                    additionalProperties: false,
                  },
                  pick: {
                    type: "object",
                    properties: {
                      category: { type: "string", description: "sports, crypto, stocks, or prediction_market" },
                      sport: { type: "string", description: "Specific sport if applicable (NFL, NBA, MLB, NHL, NCAAF, NCAAB, golf, N/A)" },
                      title: { type: "string", description: "Short pick title, e.g. 'Lakers -3.5 vs Celtics'" },
                      betType: { type: "string", description: "spread, moneyline, total, over/under, prop, buy, sell, long, short" },
                      odds: { type: "string", description: "Odds or entry price, e.g. '-110', '+150', '$67,500'" },
                      confidence: { type: "number", description: "Confidence percentage 75-100" },
                      wager: { type: "number", description: "Wager amount: $20 (75-80%), $30 (80-85%), $50 (85%+)" },
                      reasoning: { type: "string", description: "Full reasoning with specific edge identified" },
                      edge: { type: "string", description: "The specific edge — why the line is wrong" },
                      keyRisk: { type: "string", description: "Primary risk factor to monitor" },
                      stopLoss: { type: "string", description: "Stop loss level (for crypto/stocks) or N/A" },
                      target: { type: "string", description: "Target price/outcome (for crypto/stocks) or N/A" },
                      timeframe: { type: "string", description: "Expected resolution timeframe" },
                      result: { type: "string", description: "pending, win, or loss" },
                      profitLoss: { type: "number", description: "P/L in dollars (0 if pending)" },
                    },
                    required: ["category", "sport", "title", "betType", "odds", "confidence", "wager", "reasoning", "edge", "keyRisk", "stopLoss", "target", "timeframe", "result", "profitLoss"],
                    additionalProperties: false,
                  },
                  layerAnalysis: {
                    type: "object",
                    properties: {
                      dataCollection: { type: "string", description: "Key data points collected" },
                      situationalAnalysis: { type: "string", description: "Key situational factors" },
                      valueIdentification: { type: "string", description: "Value spots identified" },
                      betSelection: { type: "string", description: "Why this pick was selected (or why no pick)" },
                    },
                    required: ["dataCollection", "situationalAnalysis", "valueIdentification", "betSelection"],
                    additionalProperties: false,
                  },
                  performanceReview: {
                    type: "string",
                    description: "Performance review if 20+ picks milestone reached, otherwise empty string",
                  },
                },
                required: ["date", "hasPick", "marketSummary", "pick", "layerAnalysis", "performanceReview"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = JSON.parse(llmResult.choices[0].message.content as string);
        await db.updateAgentTask(task.id, { status: "completed", result });

        // Notify owner with the daily brief
        const pickSummary = result.hasPick
          ? `🎯 PICK: ${result.pick.title}\n${result.pick.category.toUpperCase()} | ${result.pick.betType} @ ${result.pick.odds}\nConfidence: ${result.pick.confidence}% | Wager: $${result.pick.wager}\nEdge: ${result.pick.edge}\nRisk: ${result.pick.keyRisk}`
          : "📊 No play today — nothing met the 75% confidence bar.";

        await notifyOwner({
          title: `💰 Profit Bot — ${result.date}`,
          content: `${pickSummary}\n\n📈 Markets:\n• Sports: ${result.marketSummary.sports}\n• Crypto: ${result.marketSummary.crypto}\n• Stocks: ${result.marketSummary.stocks}`,
        });

        logger.info("profit_bot_analysis_complete", {
          date: result.date,
          hasPick: result.hasPick,
          confidence: result.pick?.confidence,
          category: result.pick?.category,
        });

        return result;
      } catch (error) {
        await db.updateAgentTask(task.id, { status: "failed" });
        logger.error("profit_bot_analysis_failed", {
          error: (error as any)?.message ?? String(error),
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Profit Bot analysis failed. Please try again.",
        });
      }
    }),

  /**
   * Get analysis history — all past Profit Bot picks.
   */
  getHistory: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const tasks = await db.getAgentTasks({
        agentType: "merchant",
        limit: input?.limit ?? 20,
        offset: input?.offset ?? 0,
      });

      return tasks
        .filter((t: any) => t.taskType === "profit_bot_analysis")
        .map((t: any) => {
          let result = null;
          try {
            result = typeof t.result === "string" ? JSON.parse(t.result) : t.result;
          } catch { /* ignore */ }
          return {
            id: t.id,
            date: t.createdAt,
            status: t.status,
            result,
          };
        });
    }),

  /**
   * Get the running record — aggregate stats across all picks.
   */
  getRecord: protectedProcedure.query(async () => {
    const tasks = await db.getAgentTasks({
      agentType: "merchant",
      limit: 100,
    });

    const profitPicks = tasks
      .filter((t: any) => t.taskType === "profit_bot_analysis" && t.status === "completed")
      .map((t: any) => {
        try {
          return typeof t.result === "string" ? JSON.parse(t.result) : t.result;
        } catch { return null; }
      })
      .filter(Boolean);

    const totalPicks = profitPicks.filter((r: any) => r.hasPick).length;
    const wins = profitPicks.filter((r: any) => r.pick?.result === "win").length;
    const losses = profitPicks.filter((r: any) => r.pick?.result === "loss").length;
    const pending = profitPicks.filter((r: any) => r.hasPick && (!r.pick?.result || r.pick?.result === "pending")).length;
    const noPlays = profitPicks.filter((r: any) => !r.hasPick).length;
    const totalPL = profitPicks.reduce((sum: number, r: any) => sum + (r.pick?.profitLoss || 0), 0);
    const totalWagered = profitPicks
      .filter((r: any) => r.hasPick && r.pick?.result && r.pick.result !== "pending")
      .reduce((sum: number, r: any) => sum + (r.pick?.wager || 0), 0);
    const winRate = totalPicks > 0 && (wins + losses) > 0
      ? ((wins / (wins + losses)) * 100).toFixed(1)
      : "N/A";
    const roi = totalWagered > 0
      ? ((totalPL / totalWagered) * 100).toFixed(1)
      : "N/A";

    // Category breakdown
    const byCategory: Record<string, { picks: number; wins: number; losses: number; pl: number }> = {};
    for (const r of profitPicks) {
      if (!r.hasPick) continue;
      const cat = r.pick?.category || "unknown";
      if (!byCategory[cat]) byCategory[cat] = { picks: 0, wins: 0, losses: 0, pl: 0 };
      byCategory[cat].picks++;
      if (r.pick?.result === "win") byCategory[cat].wins++;
      if (r.pick?.result === "loss") byCategory[cat].losses++;
      byCategory[cat].pl += r.pick?.profitLoss || 0;
    }

    return {
      totalPicks,
      wins,
      losses,
      pending,
      noPlays,
      totalPL,
      totalWagered,
      winRate,
      roi,
      byCategory,
      recentPicks: profitPicks.slice(0, 10).map((r: any) => ({
        date: r.date,
        hasPick: r.hasPick,
        title: r.pick?.title || "No play",
        category: r.pick?.category,
        confidence: r.pick?.confidence,
        wager: r.pick?.wager,
        result: r.pick?.result || "pending",
        profitLoss: r.pick?.profitLoss || 0,
      })),
    };
  }),

  /**
   * Update a pick's result (win/loss) and P/L.
   * Called manually by the user after the event resolves.
   */
  updatePickResult: protectedProcedure
    .input(z.object({
      taskId: z.number(),
      result: z.enum(["win", "loss"]),
      profitLoss: z.number(),
    }))
    .mutation(async ({ input }) => {
      const tasks = await db.getAgentTasks({ agentType: "merchant", limit: 100 });
      const task = tasks.find((t: any) => t.id === input.taskId && t.taskType === "profit_bot_analysis");

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pick not found" });
      }

      let existingResult: any;
      try {
        existingResult = typeof task.result === "string" ? JSON.parse(task.result) : task.result;
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not parse existing result" });
      }

      if (existingResult?.pick) {
        existingResult.pick.result = input.result;
        existingResult.pick.profitLoss = input.profitLoss;
      }

      await db.updateAgentTask(input.taskId, { result: existingResult });

      logger.info("profit_bot_result_updated", {
        taskId: input.taskId,
        result: input.result,
        profitLoss: input.profitLoss,
      });

      return { success: true };
    }),
});
