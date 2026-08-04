import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { requireOwner } from "../toolkit/index.js";
import { getLead } from "../leads.js";
import { showLeadDetail, showLeadList } from "./admin.js";

const composer = new Composer<Ctx>();

// Kept as a generic callback for integrations that can only open the desk,
// while notification buttons include the lead id and open the exact record.
composer.callbackQuery("admin:view_lead", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  await showLeadList(ctx, undefined, 0, true);
});

composer.callbackQuery(/^admin:view:([^:]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const lead = await getLead(ctx, ctx.match[1]);
  if (!lead) {
    await ctx.editMessageText("That lead is no longer available.");
    return;
  }
  await showLeadDetail(ctx, lead);
});

export default composer;
