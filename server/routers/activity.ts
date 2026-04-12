import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const activityRouter = router({
  list: protectedProcedure
    .input(z.object({
      agentType: z.enum(["architect", "merchant", "social"]).optional(),
      storeId: z.number().optional(),
      limit: z.number().min(1).max(200).default(20),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      return db.getAgentTasks({
        agentType: input?.agentType,
        storeId: input?.storeId,
        limit: input?.limit ?? 20,
        offset: input?.offset ?? 0,
      });
    }),
});
