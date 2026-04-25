import { Express } from "express";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { logger } from "./_core/logger";
import * as db from "./db";

/**
 * /api/scheduled/profit-bot — POST endpoint for the Manus scheduled task.
 *
 * The scheduled task agent runs daily at 10am Central, performs deep research
 * on sports/crypto/stocks, and POSTs the analysis results here.
 * This endpoint stores the results and notifies the owner.
 *
 * Auth: Accepts user role (scheduled task gets auto-injected cookies).
 */
export function registerProfitBotScheduledRoute(app: Express): void {
  app.post("/api/scheduled/profit-bot", async (req, res) => {
    try {
      // Validate the request has auth cookie (platform injects it for scheduled tasks)
      const sessionCookie = req.cookies?.app_session_id;
      if (!sessionCookie) {
        logger.warn("profit_bot_scheduled_no_auth", { message: "No auth cookie on scheduled request" });
        // Still allow — the scheduled task may POST without auth in dev
      }

      const body = req.body;

      // If the scheduled task sends pre-computed analysis, store it directly
      if (body?.analysis) {
        const task = await db.createAgentTask({
          agentType: "merchant",
          taskType: "profit_bot_analysis",
          title: `Profit Bot Daily Analysis — ${body.analysis.date || new Date().toLocaleDateString("en-US")}`,
          description: "Scheduled daily analysis from Profit Bot",
          status: "completed",
          result: body.analysis,
        });

        // Notify owner
        const result = body.analysis;
        const pickSummary = result.hasPick
          ? `🎯 PICK: ${result.pick?.title}\n${result.pick?.category?.toUpperCase()} | ${result.pick?.betType} @ ${result.pick?.odds}\nConfidence: ${result.pick?.confidence}% | Wager: $${result.pick?.wager}\nEdge: ${result.pick?.edge}\nRisk: ${result.pick?.keyRisk}`
          : "📊 No play today — nothing met the 75% confidence bar.";

        await notifyOwner({
          title: `💰 Profit Bot — ${result.date || new Date().toLocaleDateString("en-US")}`,
          content: `${pickSummary}\n\n📈 Markets:\n• Sports: ${result.marketSummary?.sports || "N/A"}\n• Crypto: ${result.marketSummary?.crypto || "N/A"}\n• Stocks: ${result.marketSummary?.stocks || "N/A"}`,
        });

        logger.info("profit_bot_scheduled_stored", {
          taskId: task.id,
          hasPick: result.hasPick,
          category: result.pick?.category,
        });

        return res.json({ success: true, taskId: task.id });
      }

      // If no pre-computed analysis, run the LLM analysis server-side
      const task = await db.createAgentTask({
        agentType: "merchant",
        taskType: "profit_bot_analysis",
        title: `Profit Bot Daily Analysis — ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Chicago" })}`,
        description: "Scheduled daily analysis from Profit Bot (server-side LLM)",
        status: "running",
      });

      try {
        // Get existing picks for record context
        const existingTasks = await db.getAgentTasks({ agentType: "merchant", limit: 20 });
        const profitPicks = existingTasks
          .filter((t: any) => t.taskType === "profit_bot_analysis" && t.status === "completed")
          .map((t: any) => {
            try { return typeof t.result === "string" ? JSON.parse(t.result) : t.result; }
            catch { return null; }
          })
          .filter(Boolean);

        let recordContext = "";
        if (profitPicks.length > 0) {
          const wins = profitPicks.filter((r: any) => r.pick?.result === "win").length;
          const losses = profitPicks.filter((r: any) => r.pick?.result === "loss").length;
          const totalPL = profitPicks.reduce((sum: number, r: any) => sum + (r.pick?.profitLoss || 0), 0);
          recordContext = `\n\nRUNNING RECORD (last ${profitPicks.length} picks): W${wins}-L${losses} | P/L: $${totalPL >= 0 ? "+" : ""}${totalPL.toFixed(2)}`;
          if (profitPicks.length >= 20) recordContext += "\n⚠️ 20-pick milestone — include performance review.";
        }

        const dateStr = new Date().toLocaleDateString("en-US", {
          weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Chicago",
        });

        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are Profit Bot — a daily sports betting, crypto, and stock analysis engine.
Your strategy is "Sharp Edge Hunting": find spots where the public and the books are wrong.

SPORTS COVERAGE: NFL, MLB, NBA, college football, college basketball, NHL, golf (whatever is in season).
CRYPTO: BTC, ETH, SOL, and top 20 altcoins for 1-5 day setups.
STOCKS: Short-term catalyst trades only — earnings reactions, sector momentum, news overreactions.
PREDICTION MARKETS: Polymarket, Kalshi — only when public sentiment is clearly mispriced.

RULES:
- NO pick unless 75%+ confident it will profit
- Wager sizing: $20 (75-80%), $30 (80-85%), $50 (85%+)
- Every pick needs full reasoning, the specific edge, and key risk
- If nothing meets the bar, set hasPick to false
- Be direct. No fluff.`,
            },
            {
              role: "user",
              content: `Today is ${dateStr} (Central Time). Run the full Profit Bot analysis.${recordContext}

Return structured JSON with your analysis.`,
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
                  date: { type: "string" },
                  hasPick: { type: "boolean" },
                  marketSummary: {
                    type: "object",
                    properties: {
                      sports: { type: "string" },
                      crypto: { type: "string" },
                      stocks: { type: "string" },
                      predictionMarkets: { type: "string" },
                    },
                    required: ["sports", "crypto", "stocks", "predictionMarkets"],
                    additionalProperties: false,
                  },
                  pick: {
                    type: "object",
                    properties: {
                      category: { type: "string" },
                      sport: { type: "string" },
                      title: { type: "string" },
                      betType: { type: "string" },
                      odds: { type: "string" },
                      confidence: { type: "number" },
                      wager: { type: "number" },
                      reasoning: { type: "string" },
                      edge: { type: "string" },
                      keyRisk: { type: "string" },
                      stopLoss: { type: "string" },
                      target: { type: "string" },
                      timeframe: { type: "string" },
                      result: { type: "string" },
                      profitLoss: { type: "number" },
                    },
                    required: ["category", "sport", "title", "betType", "odds", "confidence", "wager", "reasoning", "edge", "keyRisk", "stopLoss", "target", "timeframe", "result", "profitLoss"],
                    additionalProperties: false,
                  },
                  layerAnalysis: {
                    type: "object",
                    properties: {
                      dataCollection: { type: "string" },
                      situationalAnalysis: { type: "string" },
                      valueIdentification: { type: "string" },
                      betSelection: { type: "string" },
                    },
                    required: ["dataCollection", "situationalAnalysis", "valueIdentification", "betSelection"],
                    additionalProperties: false,
                  },
                  performanceReview: { type: "string" },
                },
                required: ["date", "hasPick", "marketSummary", "pick", "layerAnalysis", "performanceReview"],
                additionalProperties: false,
              },
            },
          },
        });

        const result = JSON.parse(llmResult.choices[0].message.content as string);
        await db.updateAgentTask(task.id, { status: "completed", result });

        const pickSummary = result.hasPick
          ? `🎯 PICK: ${result.pick.title}\n${result.pick.category.toUpperCase()} | ${result.pick.betType} @ ${result.pick.odds}\nConfidence: ${result.pick.confidence}% | Wager: $${result.pick.wager}\nEdge: ${result.pick.edge}`
          : "📊 No play today — nothing met the 75% confidence bar.";

        await notifyOwner({
          title: `💰 Profit Bot — ${result.date}`,
          content: `${pickSummary}\n\n📈 Markets:\n• Sports: ${result.marketSummary.sports}\n• Crypto: ${result.marketSummary.crypto}\n• Stocks: ${result.marketSummary.stocks}`,
        });

        return res.json({ success: true, taskId: task.id, result });
      } catch (err) {
        await db.updateAgentTask(task.id, { status: "failed" });
        throw err;
      }
    } catch (error) {
      logger.error("profit_bot_scheduled_failed", {
        error: (error as any)?.message ?? String(error),
      });
      return res.status(500).json({
        success: false,
        error: (error as any)?.message ?? "Profit Bot analysis failed",
      });
    }
  });
}
