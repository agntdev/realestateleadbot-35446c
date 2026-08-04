import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  adminChatId,
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import { leadSummary, newLeadId, now, saveLead, type LeadIntent } from "../leads.js";

type LeadStep = "name" | "phone" | "note" | "confirm";
type LeadSession = {
  leadStep?: LeadStep;
  leadName?: string;
  leadPhone?: string;
  leadIntent?: LeadIntent;
  leadNote?: string;
};

const composer = new Composer<Ctx>();
registerMainMenuItem({ label: "Submit a lead", data: "lead:start", order: 10 });

function state(ctx: Ctx): LeadSession {
  return ctx.session as LeadSession;
}

function clear(ctx: Ctx): void {
  const s = state(ctx);
  delete s.leadStep;
  delete s.leadName;
  delete s.leadPhone;
  delete s.leadIntent;
  delete s.leadNote;
}

const cancelKeyboard = inlineKeyboard([[inlineButton("Cancel", "lead:cancel")]]);

function validPhone(value: string): boolean {
  return value.length <= 32 && /^\+?\d+$/.test(value);
}

function confirmationText(s: Required<LeadSession>): string {
  return `Review your enquiry:\n${leadSummary({ name: s.leadName, phone: s.leadPhone, intent: s.leadIntent, note: s.leadNote })}`;
}

async function askForPhone(ctx: Ctx): Promise<void> {
  state(ctx).leadStep = "phone";
  await ctx.reply("What phone number can the agent use?", { reply_markup: cancelKeyboard });
}

async function showConfirmation(ctx: Ctx): Promise<void> {
  state(ctx).leadStep = "confirm";
  await ctx.reply(confirmationText(state(ctx) as Required<LeadSession>), {
    reply_markup: inlineKeyboard([
      [inlineButton("Confirm", "lead:confirm"), inlineButton("Edit", "lead:edit")],
      [inlineButton("Cancel", "lead:cancel")],
    ]),
  });
}

composer.callbackQuery("lead:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  clear(ctx);
  state(ctx).leadStep = "name";
  await ctx.reply("Tell us your name.", { reply_markup: cancelKeyboard });
});

composer.callbackQuery("lead:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  clear(ctx);
  await ctx.editMessageText("Your enquiry wasn’t submitted.");
});

composer.callbackQuery("lead:edit", async (ctx) => {
  await ctx.answerCallbackQuery();
  clear(ctx);
  state(ctx).leadStep = "name";
  await ctx.editMessageText("Tell us your name.", { reply_markup: cancelKeyboard });
});

composer.callbackQuery(/^lead:intent:(Buy|Sell|Rent|Invest)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  state(ctx).leadIntent = ctx.match[1] as LeadIntent;
  state(ctx).leadStep = "note";
  await ctx.editMessageText("Share any details about the property or your needs.", {
    reply_markup: cancelKeyboard,
  });
});

composer.callbackQuery("lead:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const s = state(ctx) as Required<LeadSession>;
  if (!s.leadName || !s.leadPhone || !s.leadIntent || !s.leadNote) {
    clear(ctx);
    await ctx.editMessageText("Your enquiry expired. Tap Submit a lead to start again.");
    return;
  }
  const lead = {
    id: newLeadId(),
    name: s.leadName,
    phone: s.leadPhone,
    intent: s.leadIntent,
    note: s.leadNote,
    status: "New" as const,
    submitted_at: now().toISOString(),
    confirmed_by_user: true,
  };
  if (!(await saveLead(ctx, lead))) {
    await ctx.editMessageText("Couldn’t save your enquiry right now. Try again in a moment.");
    return;
  }
  clear(ctx);
  await ctx.editMessageText("Your enquiry has been sent. The agent will be in touch.");

  const owner = adminChatId(ctx as Ctx & { env?: Record<string, unknown> });
  if (!owner) return;
  try {
    await ctx.api.sendMessage(owner, `New real-estate enquiry:\n${leadSummary(lead)}`, {
      reply_markup: inlineKeyboard([
        [inlineButton("Mark done", `admin:status:${lead.id}:done`)],
        [inlineButton("View in admin", `admin:view:${lead.id}`)],
      ]),
    });
  } catch {
    // The enquiry is already durably saved; a notification failure must not undo it.
  }
});

composer.on("message:contact", async (ctx) => {
  if (state(ctx).leadStep !== "phone") return;
  const phone = ctx.message.contact.phone_number;
  if (!validPhone(phone)) {
    await ctx.reply("That phone number doesn’t look right. Use digits with an optional + prefix.");
    return;
  }
  state(ctx).leadPhone = phone;
  await ctx.reply("What best describes your plans?", {
    reply_markup: inlineKeyboard([
      [inlineButton("Buy", "lead:intent:Buy"), inlineButton("Sell", "lead:intent:Sell")],
      [inlineButton("Rent", "lead:intent:Rent"), inlineButton("Invest", "lead:intent:Invest")],
      [inlineButton("Cancel", "lead:cancel")],
    ]),
  });
});

composer.on("message:text", async (ctx, next) => {
  const s = state(ctx);
  if (!s.leadStep) return next();
  const value = ctx.message.text.trim();
  if (value.toLowerCase() === "cancel") {
    clear(ctx);
    await ctx.reply("Your enquiry wasn’t submitted.");
    return;
  }
  if (s.leadStep === "name") {
    if (value.length < 2 || value.length > 80) {
      await ctx.reply("Enter your full name so the agent knows how to address you.");
      return;
    }
    s.leadName = value;
    await askForPhone(ctx);
    return;
  }
  if (s.leadStep === "phone") {
    const phone = value;
    if (!validPhone(phone)) {
      await ctx.reply("That phone number doesn’t look right. Use digits with an optional + prefix.");
      return;
    }
    s.leadPhone = phone;
    await ctx.reply("What best describes your plans?", {
      reply_markup: inlineKeyboard([
        [inlineButton("Buy", "lead:intent:Buy"), inlineButton("Sell", "lead:intent:Sell")],
        [inlineButton("Rent", "lead:intent:Rent"), inlineButton("Invest", "lead:intent:Invest")],
        [inlineButton("Cancel", "lead:cancel")],
      ]),
    });
    return;
  }
  if (s.leadStep === "note") {
    if (!value) {
      await ctx.reply("Add a short note about what you need.");
      return;
    }
    if (value.length > 1000) {
      await ctx.reply("Keep your note under 1,000 characters so the agent can review it easily.");
      return;
    }
    s.leadNote = value;
    await showConfirmation(ctx);
  }
});

export default composer;
