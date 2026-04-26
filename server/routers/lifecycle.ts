/**
 * Lifecycle router — the Builder→Merchant handoff.
 *
 * A store moves through three phases:
 *   building → transitioning → operating
 *
 * The transition is driven either explicitly (the user clicks
 * "Hand over the keys") or implicitly (the store's first paid order arrives,
 * which we treat as proof the Builder's job is done).
 *
 * Read more in `shared/bots.ts`.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import {
  LIFECYCLE_BY_ID,
  LIFECYCLE_STAGES,
  HANDOFF_NARRATIVE,
  isHandoffReady,
  type LifecycleStage,
  type ReadinessSignals,
} from "@shared/bots";

const storeIdInput = z.object({ storeId: z.number().int().positive() });

async function loadOwnedStore(userId: number, storeId: number) {
  const store = await db.getStoreById(storeId);
  if (!store || store.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
  }
  return store;
}

async function buildSignals(storeId: number, store: Awaited<ReturnType<typeof db.getStoreById>>): Promise<ReadinessSignals> {
  if (!store) {
    return { storeConnected: false, productCount: 0, hasFirstOrder: false, setupMarkedComplete: false };
  }
  const [products, orders] = await Promise.all([
    db.getProductsByStore(storeId),
    db.getOrdersByStore(storeId, 1),
  ]);
  return {
    storeConnected: Boolean(store.platformAccessToken) || store.status === "active",
    productCount: products.length,
    hasFirstOrder: orders.length > 0 || Boolean(store.firstOrderAt),
    setupMarkedComplete: Boolean(store.setupCompletedAt),
  };
}

export const lifecycleRouter = router({
  /**
   * Returns the current stage + the readiness signals that drove it. Used by
   * the dashboard to render the handoff celebration when ready.
   *
   * Side effect: if the store is still in `building` but signals say it is
   * ready, we promote it to `transitioning` here so the celebration surfaces
   * automatically the moment the store earns it. Writes are idempotent.
   */
  get: protectedProcedure
    .input(storeIdInput)
    .query(async ({ ctx, input }) => {
      const store = await loadOwnedStore(ctx.user.id, input.storeId);
      const signals = await buildSignals(input.storeId, store);
      let stage: LifecycleStage = store.lifecycleStage ?? "building";
      let setupCompletedAt = store.setupCompletedAt;
      let firstOrderAt = store.firstOrderAt;

      // Persist firstOrderAt the first time we observe it.
      if (signals.hasFirstOrder && !firstOrderAt) {
        firstOrderAt = new Date();
        await db.updateStore(store.id, { firstOrderAt });
      }

      // Auto-promote `building` → `transitioning` when ready.
      if (stage === "building" && isHandoffReady(signals)) {
        stage = "transitioning";
        if (!setupCompletedAt) setupCompletedAt = new Date();
        await db.updateStore(store.id, { lifecycleStage: stage, setupCompletedAt });
      }

      return {
        storeId: store.id,
        storeName: store.name,
        stage,
        stageProfile: LIFECYCLE_BY_ID[stage],
        signals,
        ready: isHandoffReady(signals),
        setupCompletedAt,
        firstOrderAt,
        handoffAcknowledgedAt: store.handoffAcknowledgedAt,
        narrative: HANDOFF_NARRATIVE,
        allStages: LIFECYCLE_STAGES,
      };
    }),

  /**
   * Returns the lifecycle for every store the user owns — used for
   * dashboard rollups.
   */
  listAll: protectedProcedure.query(async ({ ctx }) => {
    const stores = await db.getStoresByUser(ctx.user.id);
    return stores.map((s) => ({
      storeId: s.id,
      storeName: s.name,
      stage: (s.lifecycleStage ?? "building") as LifecycleStage,
      stageProfile: LIFECYCLE_BY_ID[(s.lifecycleStage ?? "building") as LifecycleStage],
      setupCompletedAt: s.setupCompletedAt,
      firstOrderAt: s.firstOrderAt,
      handoffAcknowledgedAt: s.handoffAcknowledgedAt,
    }));
  }),

  /**
   * Marks the Builder's work as done. Moves stage to `transitioning` so the
   * dashboard surfaces the celebration on next view. Idempotent.
   */
  markSetupComplete: protectedProcedure
    .input(storeIdInput)
    .mutation(async ({ ctx, input }) => {
      const store = await loadOwnedStore(ctx.user.id, input.storeId);
      const next: Partial<{ lifecycleStage: LifecycleStage; setupCompletedAt: Date }> = {
        setupCompletedAt: store.setupCompletedAt ?? new Date(),
      };
      if (store.lifecycleStage === "building") {
        next.lifecycleStage = "transitioning";
      }
      await db.updateStore(store.id, next);
      await db.createAgentTask({
        agentType: "architect",
        taskType: "setup_complete",
        title: `Builder handed off "${store.name}"`,
        description: "The Builder marked store setup complete. The Merchant is now lead.",
        status: "completed",
        storeId: store.id,
      });
      return { storeId: store.id, stage: next.lifecycleStage ?? store.lifecycleStage } as const;
    }),

  /**
   * The user has seen the handoff celebration and acknowledged it. Moves to
   * `operating`. This is the moment the Merchant becomes the default bot.
   */
  acknowledgeHandoff: protectedProcedure
    .input(storeIdInput)
    .mutation(async ({ ctx, input }) => {
      const store = await loadOwnedStore(ctx.user.id, input.storeId);
      if (store.lifecycleStage === "operating") {
        return { storeId: store.id, stage: "operating" as const };
      }
      const now = new Date();
      await db.updateStore(store.id, {
        lifecycleStage: "operating",
        handoffAcknowledgedAt: now,
        setupCompletedAt: store.setupCompletedAt ?? now,
        status: store.status === "setup" ? "active" : store.status,
      });
      await db.createAgentTask({
        agentType: "merchant",
        taskType: "handoff_accepted",
        title: `Merchant took over "${store.name}"`,
        description: "User acknowledged the Builder→Merchant handoff. Merchant is now in command.",
        status: "completed",
        storeId: store.id,
      });
      return { storeId: store.id, stage: "operating" as const };
    }),

  /**
   * Reverts a store back to building mode. Useful if the user is mid-redesign
   * and wants the Builder back as the lead. Soft — does not erase progress.
   */
  reopenBuilder: protectedProcedure
    .input(storeIdInput)
    .mutation(async ({ ctx, input }) => {
      const store = await loadOwnedStore(ctx.user.id, input.storeId);
      await db.updateStore(store.id, { lifecycleStage: "building" });
      return { storeId: store.id, stage: "building" as const };
    }),
});
