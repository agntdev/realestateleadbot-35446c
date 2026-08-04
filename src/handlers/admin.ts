import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";
import {
  deleteLead,
  getLead,
  leadSummary,
  listLeads,
  updateLeadStatus,
  type Lead,
  type LeadStatus,
} from "../leads.js";

const composer = new Composer<Ctx>();
const PER_PAGE = 5;

function filterLabel(status?: LeadStatus): string {
  return status ?? "All";
}

function leadButtons(lead: Lead) {
  return [inlineButton(`${lead.status} · ${lead.name}`, `admin:view:${lead.id}`)];
}

export async function showLeadList(
  ctx: Ctx,
  status?: LeadStatus,
  page = 0,
  edit = false,
): Promise<void> {
  const leads = await listLeads(ctx, status);
  if (!leads) {
    const text = "Lead management isn’t available yet.";
    if (edit) await ctx.editMessageText(text);
    else await ctx.reply(text);
    return;
  }
  const totalPages = Math.max(1, Math.ceil(leads.length / PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const pageLeads = leads.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);
  const rows = pageLeads.map(leadButtons);
  rows.push([
    inlineButton(`All${status ? "" : " ✓"}`, "admin:filter:all:0"),
    inlineButton(`New${status === "New" ? " ✓" : ""}`, "admin:filter:new:0"),
    inlineButton(`Done${status === "Done" ? " ✓" : ""}`, "admin:filter:done:0"),
  ]);
  if (totalPages > 1) {
    const navigation = [];
    if (safePage > 0) navigation.push(inlineButton("Previous", `admin:page:${status ?? "all"}:${safePage - 1}`));
    if (safePage < totalPages - 1) navigation.push(inlineButton("Next", `admin:page:${status ?? "all"}:${safePage + 1}`));
    rows.push(navigation);
  }
  const text = pageLeads.length === 0
    ? `No ${filterLabel(status).toLowerCase()} leads yet.`
    : `${filterLabel(status)} leads · page ${safePage + 1} of ${totalPages}`;
  if (edit) await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
  else await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
}

export async function showLeadDetail(ctx: Ctx, lead: Lead, edit = true): Promise<void> {
  const action = lead.status === "Done" ? "new" : "done";
  const actionLabel = lead.status === "Done" ? "Mark new" : "Mark done";
  const text = `${leadSummary(lead)}\nStatus: ${lead.status}`;
  const markup = inlineKeyboard([
    [inlineButton(actionLabel, `admin:status:${lead.id}:${action}`)],
    [inlineButton("Delete", `admin:delete:${lead.id}`)],
    [inlineButton("Back to leads", "admin:filter:all:0")],
  ]);
  if (edit) await ctx.editMessageText(text, { reply_markup: markup });
  else await ctx.reply(text, { reply_markup: markup });
}

composer.command("admin", async (ctx) => {
  if (!(await requireOwner(ctx))) return;
  await showLeadList(ctx);
});

composer.callbackQuery(/^admin:filter:(all|new|done):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const status = ctx.match[1] === "all" ? undefined : (ctx.match[1] === "new" ? "New" : "Done");
  await showLeadList(ctx, status, Number(ctx.match[2]), true);
});

composer.callbackQuery(/^admin:page:(all|New|Done):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const status = ctx.match[1] === "all" ? undefined : ctx.match[1] as LeadStatus;
  await showLeadList(ctx, status, Number(ctx.match[2]), true);
});

composer.callbackQuery(/^admin:status:([^:]+):(new|done)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const lead = await updateLeadStatus(ctx, ctx.match[1], ctx.match[2] === "done" ? "Done" : "New");
  if (!lead) {
    await ctx.editMessageText("That lead is no longer available.");
    return;
  }
  await showLeadDetail(ctx, lead);
});

composer.callbackQuery(/^admin:delete:([^:]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const lead = await getLead(ctx, ctx.match[1]);
  if (!lead) {
    await ctx.editMessageText("That lead is no longer available.");
    return;
  }
  await ctx.editMessageText(`Delete ${lead.name}'s lead permanently?`, {
    reply_markup: inlineKeyboard([
      [inlineButton("Delete", `admin:deleteconfirm:${lead.id}:yes`), inlineButton("Keep lead", `admin:deleteconfirm:${lead.id}:no`)],
    ]),
  });
});

composer.callbackQuery(/^admin:deleteconfirm:([^:]+):(yes|no)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const id = ctx.match[1];
  if (ctx.match[2] === "no") {
    const lead = await getLead(ctx, id);
    if (lead) await showLeadDetail(ctx, lead);
    else await ctx.editMessageText("That lead is no longer available.");
    return;
  }
  if (!(await deleteLead(ctx, id))) {
    await ctx.editMessageText("Couldn’t delete that lead. Try again in a moment.");
    return;
  }
  await ctx.editMessageText("Lead deleted permanently.");
});

export default composer;
