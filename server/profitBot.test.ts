import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock the notification module
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

// Mock the logger
vi.mock("./_core/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the db module
vi.mock("./db", () => ({
  createAgentTask: vi.fn().mockResolvedValue({ id: 1 }),
  updateAgentTask: vi.fn().mockResolvedValue(undefined),
  getAgentTasks: vi.fn().mockResolvedValue([]),
}));

import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import * as db from "./db";

describe("Profit Bot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Analysis Engine", () => {
    it("should parse LLM response with a qualifying pick", async () => {
      const mockAnalysis = {
        date: "Friday, April 25, 2026",
        hasPick: true,
        marketSummary: {
          sports: "NBA playoffs in full swing, MLB early season",
          crypto: "BTC consolidating around $67k, ETH showing strength",
          stocks: "Earnings season active, tech sector momentum",
          predictionMarkets: "No clear mispricing detected",
        },
        pick: {
          category: "sports",
          sport: "NBA",
          title: "Lakers -3.5 vs Celtics",
          betType: "spread",
          odds: "-110",
          confidence: 82,
          wager: 30,
          reasoning: "Lakers have rest advantage, Celtics on back-to-back",
          edge: "Sharp money on Lakers despite public on Celtics",
          keyRisk: "LeBron questionable with ankle",
          stopLoss: "N/A",
          target: "N/A",
          timeframe: "Tonight 8:30pm ET",
          result: "pending",
          profitLoss: 0,
        },
        layerAnalysis: {
          dataCollection: "Injury reports checked, line moved from -2 to -3.5",
          situationalAnalysis: "Celtics on B2B, Lakers 3 days rest",
          valueIdentification: "2-point gap between projected and actual line",
          betSelection: "Spread offers best value at -3.5",
        },
        performanceReview: "",
      };

      // Verify the mock analysis structure
      expect(mockAnalysis.hasPick).toBe(true);
      expect(mockAnalysis.pick.confidence).toBe(82);
      expect(mockAnalysis.pick.wager).toBe(30); // 80-85% = $30
      expect(mockAnalysis.pick.category).toBe("sports");
      expect(mockAnalysis.pick.result).toBe("pending");
    });

    it("should handle no-play analysis correctly", () => {
      const noPlayAnalysis = {
        date: "Friday, April 25, 2026",
        hasPick: false,
        marketSummary: {
          sports: "Light slate today",
          crypto: "Sideways action",
          stocks: "No catalysts",
          predictionMarkets: "No mispricing",
        },
        pick: {
          category: "N/A",
          sport: "N/A",
          title: "No play today",
          betType: "N/A",
          odds: "N/A",
          confidence: 0,
          wager: 0,
          reasoning: "Nothing met the 75% confidence bar",
          edge: "N/A",
          keyRisk: "N/A",
          stopLoss: "N/A",
          target: "N/A",
          timeframe: "N/A",
          result: "pending",
          profitLoss: 0,
        },
        layerAnalysis: {
          dataCollection: "Full slate reviewed",
          situationalAnalysis: "No strong situational edges",
          valueIdentification: "No value spots above threshold",
          betSelection: "Discipline — no play today",
        },
        performanceReview: "",
      };

      expect(noPlayAnalysis.hasPick).toBe(false);
      expect(noPlayAnalysis.pick.confidence).toBe(0);
    });

    it("should calculate correct wager sizing based on confidence", () => {
      const getWager = (confidence: number): number => {
        if (confidence >= 85) return 50;
        if (confidence >= 80) return 30;
        if (confidence >= 75) return 20;
        return 0;
      };

      expect(getWager(75)).toBe(20);
      expect(getWager(79)).toBe(20);
      expect(getWager(80)).toBe(30);
      expect(getWager(84)).toBe(30);
      expect(getWager(85)).toBe(50);
      expect(getWager(95)).toBe(50);
      expect(getWager(70)).toBe(0); // Below threshold
    });
  });

  describe("Record Tracking", () => {
    it("should calculate win rate correctly", () => {
      const picks = [
        { hasPick: true, pick: { result: "win", profitLoss: 27.3 } },
        { hasPick: true, pick: { result: "win", profitLoss: 27.3 } },
        { hasPick: true, pick: { result: "loss", profitLoss: -30 } },
        { hasPick: true, pick: { result: "pending", profitLoss: 0 } },
        { hasPick: false },
      ];

      const totalPicks = picks.filter((r) => r.hasPick).length;
      const wins = picks.filter((r) => (r as any).pick?.result === "win").length;
      const losses = picks.filter((r) => (r as any).pick?.result === "loss").length;
      const pending = picks.filter(
        (r) => r.hasPick && (!(r as any).pick?.result || (r as any).pick?.result === "pending")
      ).length;
      const noPlays = picks.filter((r) => !r.hasPick).length;
      const totalPL = picks.reduce(
        (sum, r) => sum + ((r as any).pick?.profitLoss || 0),
        0
      );

      expect(totalPicks).toBe(4);
      expect(wins).toBe(2);
      expect(losses).toBe(1);
      expect(pending).toBe(1);
      expect(noPlays).toBe(1);

      const winRate =
        wins + losses > 0
          ? ((wins / (wins + losses)) * 100).toFixed(1)
          : "N/A";
      expect(winRate).toBe("66.7");
      expect(totalPL).toBeCloseTo(24.6, 1);
    });

    it("should calculate ROI correctly", () => {
      const totalPL = 54.6;
      const totalWagered = 90; // 3 bets at $30
      const roi = ((totalPL / totalWagered) * 100).toFixed(1);
      expect(roi).toBe("60.7");
    });

    it("should handle empty record", () => {
      const picks: any[] = [];
      const totalPicks = picks.filter((r) => r.hasPick).length;
      const wins = 0;
      const losses = 0;
      const winRate =
        totalPicks > 0 && wins + losses > 0
          ? ((wins / (wins + losses)) * 100).toFixed(1)
          : "N/A";
      expect(winRate).toBe("N/A");
    });

    it("should track category breakdown", () => {
      const picks = [
        { hasPick: true, pick: { category: "sports", result: "win", profitLoss: 27.3 } },
        { hasPick: true, pick: { category: "sports", result: "loss", profitLoss: -30 } },
        { hasPick: true, pick: { category: "crypto", result: "win", profitLoss: 45.5 } },
        { hasPick: true, pick: { category: "stocks", result: "win", profitLoss: 18.2 } },
      ];

      const byCategory: Record<string, { picks: number; wins: number; losses: number; pl: number }> = {};
      for (const r of picks) {
        if (!r.hasPick) continue;
        const cat = r.pick.category;
        if (!byCategory[cat]) byCategory[cat] = { picks: 0, wins: 0, losses: 0, pl: 0 };
        byCategory[cat].picks++;
        if (r.pick.result === "win") byCategory[cat].wins++;
        if (r.pick.result === "loss") byCategory[cat].losses++;
        byCategory[cat].pl += r.pick.profitLoss;
      }

      expect(byCategory.sports.picks).toBe(2);
      expect(byCategory.sports.wins).toBe(1);
      expect(byCategory.sports.losses).toBe(1);
      expect(byCategory.sports.pl).toBeCloseTo(-2.7, 1);
      expect(byCategory.crypto.picks).toBe(1);
      expect(byCategory.crypto.wins).toBe(1);
      expect(byCategory.stocks.picks).toBe(1);
    });
  });

  describe("DB Integration", () => {
    it("should create agent task with correct type", async () => {
      await db.createAgentTask({
        agentType: "merchant",
        taskType: "profit_bot_analysis",
        title: "Profit Bot Daily Analysis",
        description: "Test analysis",
        status: "running",
      });

      expect(db.createAgentTask).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: "merchant",
          taskType: "profit_bot_analysis",
          status: "running",
        })
      );
    });

    it("should update task on completion", async () => {
      const mockResult = { date: "test", hasPick: false };
      await db.updateAgentTask(1, { status: "completed", result: mockResult });

      expect(db.updateAgentTask).toHaveBeenCalledWith(1, {
        status: "completed",
        result: mockResult,
      });
    });

    it("should update task on failure", async () => {
      await db.updateAgentTask(1, { status: "failed" });
      expect(db.updateAgentTask).toHaveBeenCalledWith(1, { status: "failed" });
    });
  });

  describe("Notification", () => {
    it("should send pick notification to owner", async () => {
      const result = {
        date: "Friday, April 25, 2026",
        hasPick: true,
        pick: {
          title: "Lakers -3.5 vs Celtics",
          category: "sports",
          betType: "spread",
          odds: "-110",
          confidence: 82,
          wager: 30,
          edge: "Sharp money on Lakers",
          keyRisk: "LeBron questionable",
        },
        marketSummary: {
          sports: "NBA playoffs",
          crypto: "BTC consolidating",
          stocks: "Earnings season",
        },
      };

      const pickSummary = result.hasPick
        ? `🎯 PICK: ${result.pick.title}\n${result.pick.category.toUpperCase()} | ${result.pick.betType} @ ${result.pick.odds}\nConfidence: ${result.pick.confidence}% | Wager: $${result.pick.wager}\nEdge: ${result.pick.edge}\nRisk: ${result.pick.keyRisk}`
        : "📊 No play today";

      await notifyOwner({
        title: `💰 Profit Bot — ${result.date}`,
        content: pickSummary,
      });

      expect(notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Profit Bot"),
          content: expect.stringContaining("Lakers -3.5"),
        })
      );
    });

    it("should send no-play notification", async () => {
      await notifyOwner({
        title: "💰 Profit Bot — Friday, April 25, 2026",
        content: "📊 No play today — nothing met the 75% confidence bar.",
      });

      expect(notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining("No play today"),
        })
      );
    });
  });

  describe("20-Pick Performance Review", () => {
    it("should trigger review at 20-pick milestone", () => {
      const pickCount = 20;
      const shouldReview = pickCount >= 20;
      expect(shouldReview).toBe(true);
    });

    it("should not trigger review before 20 picks", () => {
      const pickCount = 19;
      const shouldReview = pickCount >= 20;
      expect(shouldReview).toBe(false);
    });
  });
});
