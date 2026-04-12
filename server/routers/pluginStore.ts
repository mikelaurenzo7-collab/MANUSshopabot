/**
 * App Store / First-Party Plugin Router
 *
 * Phase 2: Plugin marketplace for micro-bots.
 * Manages the registry of official first-party plugins and user installations.
 * Plugins integrate with botCoordination.ts event bus via dynamic handler registration.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const pluginRouter = router({
  /**
   * Browse available plugins in the App Store.
   */
  listAvailable: protectedProcedure.query(async () => {
    return db.listPlugins();
  }),

  /**
   * Get details of a specific plugin.
   */
  getPlugin: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getPluginById(input.id);
    }),

  /**
   * List plugins installed by the current user.
   */
  myPlugins: protectedProcedure.query(async ({ ctx }) => {
    const installed = await db.getInstalledPlugins(ctx.user.id);
    // Enrich with plugin metadata
    const enriched = [];
    for (const inst of installed) {
      const plugin = await db.getPluginById(inst.pluginId);
      enriched.push({ ...inst, plugin });
    }
    return enriched;
  }),

  /**
   * Install a plugin (1-click from the App Store).
   */
  install: protectedProcedure
    .input(z.object({ pluginId: z.number(), config: z.record(z.string(), z.any()).optional() }))
    .mutation(async ({ ctx, input }) => {
      // Check plugin exists
      const plugin = await db.getPluginById(input.pluginId);
      if (!plugin) throw new Error("Plugin not found");

      // Check not already installed
      const existing = await db.getInstalledPlugins(ctx.user.id);
      if (existing.some((e: any) => e.pluginId === input.pluginId)) {
        throw new Error("Plugin already installed");
      }

      const id = await db.installPlugin({
        userId: ctx.user.id,
        pluginId: input.pluginId,
        configJson: input.config || {},
        enabled: true,
      });

      // Notify user
      await db.createNotification({
        userId: ctx.user.id,
        agentType: "architect",
        type: "info",
        title: `Plugin "${plugin.pluginName}" installed`,
        message: `${plugin.pluginName} v${plugin.version} is now active and connected to your bot event bus.`,
        actionUrl: "/plugins",
        metadata: { pluginId: input.pluginId },
      });

      return { id, success: true };
    }),

  /**
   * Uninstall a plugin.
   */
  uninstall: protectedProcedure
    .input(z.object({ pluginId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.uninstallPlugin(ctx.user.id, input.pluginId);
      return { success: true };
    }),

  /**
   * Enable/disable a plugin without uninstalling.
   */
  toggle: protectedProcedure
    .input(z.object({ pluginId: z.number(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db.togglePlugin(ctx.user.id, input.pluginId, input.enabled);
      return { success: true };
    }),
});
