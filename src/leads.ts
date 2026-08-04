import type { Ctx } from "./bot.js";

export type LeadIntent = "Buy" | "Sell" | "Rent" | "Invest";
export type LeadStatus = "New" | "Done";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  intent: LeadIntent;
  note: string;
  status: LeadStatus;
  submitted_at: string;
  confirmed_by_user: boolean;
}

type LeadStoreAction =
  | { action: "save"; lead: Lead }
  | { action: "get"; id: string }
  | { action: "list"; status?: LeadStatus }
  | { action: "status"; id: string; status: LeadStatus }
  | { action: "delete"; id: string };

type LeadStoreResponse = { ok: boolean; lead?: Lead; leads?: Lead[] };

type LeadStoreNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: { method?: string; body?: string }): Promise<Response> };
};

let clock: () => Date = () => new Date();

/** Single clock seam for timestamps; tests may replace it without changing flow code. */
export function now(): Date {
  return clock();
}

export function setClockForTests(value?: () => Date): void {
  clock = value ?? (() => new Date());
}

export function newLeadId(): string {
  return crypto.randomUUID();
}

function namespace(ctx: Ctx): LeadStoreNamespace | undefined {
  const env = (ctx as Ctx & { env?: { CHAT_DO?: LeadStoreNamespace } }).env;
  return env?.CHAT_DO;
}

async function call(ctx: Ctx, action: LeadStoreAction): Promise<LeadStoreResponse | undefined> {
  const ns = namespace(ctx);
  if (!ns) return undefined;
  try {
    const stub = ns.get(ns.idFromName("real-estate-leads"));
    const response = await stub.fetch("https://do/leads", {
      method: "POST",
      body: JSON.stringify(action),
    });
    if (!response.ok) return undefined;
    return (await response.json()) as LeadStoreResponse;
  } catch {
    return undefined;
  }
}

export async function saveLead(ctx: Ctx, lead: Lead): Promise<boolean> {
  return (await call(ctx, { action: "save", lead }))?.ok === true;
}

export async function getLead(ctx: Ctx, id: string): Promise<Lead | undefined> {
  return (await call(ctx, { action: "get", id }))?.lead;
}

export async function listLeads(ctx: Ctx, status?: LeadStatus): Promise<Lead[] | undefined> {
  return (await call(ctx, { action: "list", status }))?.leads;
}

export async function updateLeadStatus(ctx: Ctx, id: string, status: LeadStatus): Promise<Lead | undefined> {
  return (await call(ctx, { action: "status", id, status }))?.lead;
}

export async function deleteLead(ctx: Ctx, id: string): Promise<boolean> {
  return (await call(ctx, { action: "delete", id }))?.ok === true;
}

export function leadSummary(lead: Pick<Lead, "name" | "phone" | "intent" | "note">): string {
  return `Name: ${lead.name}\nPhone: ${lead.phone}\nInterest: ${lead.intent}\nNote: ${lead.note}`;
}
