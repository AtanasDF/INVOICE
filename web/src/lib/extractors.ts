import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

export type ScanEngine = "claude" | "gemini";
export const SCAN_ENGINES: readonly ScanEngine[] = ["claude", "gemini"];
export const CLAUDE_MODEL = "claude-opus-5";
export const GEMINI_MODEL = "gemini-3.5-flash-lite";

export type ScanPage = { mediaType: string; base64: string };

export type ExtractStructuredOptions = {
  engine: ScanEngine;
  name: string;
  description: string;
  // Claude-strict form: additionalProperties:false on every object, every
  // property required, nullable as type ["string","null"]. Converted for
  // Gemini on the way out.
  schema: Record<string, unknown>;
  prompt: string;
  pages: ScanPage[];
  maxTokens?: number;
  // Claude only: how hard it thinks. Copying details off a page needs less
  // than reading amounts that have to add up.
  effort?: "low" | "medium" | "high";
};

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

// Claude's strict tool schemas reject an enum under a ["string","null"]
// type ("Enum value ... does not match declared type"), which failed every
// Claude scan; a nullable choice is an anyOf of the choice and null.
export function nullableEnum(values: readonly string[], description: string) {
  return { anyOf: [{ type: "string", enum: [...values] }, { type: "null" }], description };
}

export const CUT_OFF = "The reading was cut off before the document was finished. Try scanning fewer pages at once.";
export const NOT_STRUCTURED = "The model didn't return structured data. Try again.";
export const ENGINE_BUSY = "The scanner is busy right now. Try again in a minute.";

export async function extractStructured<T>(opts: ExtractStructuredOptions): Promise<T> {
  return opts.engine === "gemini" ? extractWithGemini<T>(opts) : extractWithClaude<T>(opts);
}

async function extractWithClaude<T>(opts: ExtractStructuredOptions): Promise<T> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const pageBlocks: Anthropic.ContentBlockParam[] = opts.pages.map((p) =>
    p.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.base64 } }
      : { type: "image", source: { type: "base64", media_type: p.mediaType as ImageMediaType, data: p.base64 } }
  );

  // claude-opus-5 thinks adaptively by default and its thinking tokens
  // count against max_tokens, so the ceiling has to leave room for both
  // the reasoning and a long line-item list; medium effort keeps the
  // thinking share proportionate for a read-and-copy task.
  // Not strict: strict tools allow at most 16 nullable fields and the scan
  // schema has 29, and emulating null with "" made the model leak its own
  // tool-call syntax into empty fields. The forced tool keeps the shape;
  // conformToSchema fills any gap.
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    output_config: { effort: opts.effort ?? "medium" },
    tools: [{ name: opts.name, description: opts.description, input_schema: opts.schema as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: opts.name },
    messages: [{ role: "user", content: [...pageBlocks, { type: "text", text: opts.prompt }] }],
  });

  if (response.stop_reason === "max_tokens") throw new Error(CUT_OFF);
  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) throw new Error(NOT_STRUCTURED);
  return conformToSchema(opts.schema, toolUse.input) as T;
}

// Model output isn't strictly typed: non-strict tool use can drop a
// property, send "" or null, a number as text, or an enum value off the
// list. This walks the schema and returns exactly its shape: absent values
// become null where the schema allows it and otherwise an empty value (0,
// "", false, [], an object of those); numbers are parsed ("£1,200" ->
// 1200); an off-list enum is matched ignoring case, else "other" or the
// first option ("low" for a missing confidence).
export function conformToSchema(schema: unknown, value: unknown): unknown {
  if (!schema || typeof schema !== "object") return value;
  const node = schema as Record<string, unknown>;
  const branches = Array.isArray(node.anyOf) ? (node.anyOf as Record<string, unknown>[]) : [];
  const types = (Array.isArray(node.type) ? node.type : node.type !== undefined ? [node.type] : branches.map((b) => b.type)).filter(
    (t): t is string => typeof t === "string"
  );
  const nullable = types.includes("null");
  const concrete = types.find((t) => t !== "null") ?? (node.properties ? "object" : undefined);
  const options = ((node.enum as unknown[] | undefined) ?? (branches.find((b) => Array.isArray(b.enum))?.enum as unknown[] | undefined))?.filter(
    (v): v is string => typeof v === "string"
  );
  // "other" for a kind of thing, "low" for a confidence the model didn't give.
  const fallbackOption = options && (options.includes("other") ? "other" : options.includes("low") ? "low" : options[0]);

  if (value === undefined || value === null || (value === "" && nullable)) {
    if (nullable) return null;
    if (concrete === "array") return [];
    if (concrete === "object") return conformToSchema(node, {});
    if (concrete === "number" || concrete === "integer") return 0;
    if (concrete === "boolean") return false;
    if (concrete === "string") return fallbackOption ?? "";
    return value;
  }
  if (concrete === "number" || concrete === "integer") {
    const n = typeof value === "number" ? value : Number(String(value).replace(/[£$€,\s]/g, ""));
    return Number.isFinite(n) ? n : nullable ? null : 0;
  }
  if (concrete === "boolean") return typeof value === "boolean" ? value : String(value).toLowerCase() === "true";
  if (concrete === "string") {
    const text = typeof value === "string" ? value : String(value);
    if (!options || options.includes(text)) return text;
    const match = options.find((o) => o.toLowerCase() === text.toLowerCase());
    if (match) return match;
    // A currency the list doesn't have is still a currency: turning it into
    // null would book it as pounds.
    if (options.every((o) => /^[A-Z]{3}$/.test(o)) && /^[a-z]{3}$/i.test(text.trim())) return text.trim().toUpperCase();
    return nullable ? null : fallbackOption;
  }
  if (concrete === "array") return Array.isArray(value) ? value.map((v) => conformToSchema(node.items, v)) : [];
  if (concrete === "object") {
    const props = node.properties as Record<string, unknown> | undefined;
    const obj = typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    return props ? Object.fromEntries(Object.keys(props).map((k) => [k, conformToSchema(props[k], obj[k])])) : obj;
  }
  return value;
}

async function extractWithGemini<T>(opts: ExtractStructuredOptions): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  // The SDK retries 429/5xx five times with backoff by default, which on
  // a quota error turns into a hang that outlives the route's 60s budget.
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 40_000, retryOptions: { attempts: 2, initialDelay: 1000, maxDelay: 3000 } },
  });

  let interaction;
  try {
    interaction = await client.interactions.create({
      model: GEMINI_MODEL,
      input: [
        ...opts.pages.map((p) =>
          p.mediaType === "application/pdf"
            ? ({ type: "document", data: p.base64, mime_type: "application/pdf" } as const)
            : ({ type: "image", data: p.base64, mime_type: p.mediaType } as const)
        ),
        { type: "text", text: `${opts.prompt}\n\n${opts.description}` },
      ],
      response_format: { type: "text", mime_type: "application/json", schema: toGeminiSchema(opts.schema) },
      generation_config: { max_output_tokens: opts.maxTokens ?? 16000, thinking_level: "low" },
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 429 || status === 503) throw new Error(ENGINE_BUSY);
    throw err;
  }

  if (interaction.status === "incomplete" || interaction.status === "budget_exceeded") throw new Error(CUT_OFF);
  if (interaction.status === "failed") {
    throw new Error(interaction.errors?.[0]?.message || "The Gemini engine failed to read the document. Try again.");
  }
  try {
    return conformToSchema(opts.schema, JSON.parse(interaction.output_text ?? "")) as T;
  } catch {
    throw new Error(NOT_STRUCTURED);
  }
}

// Gemini's JSON-schema mode takes anyOf but not type arrays or
// additionalProperties, so a Claude-strict schema is rewritten node by
// node: ["string","null"] becomes anyOf [{type:"string"},{type:"null"}]
// with any enum moved onto the non-null branch (minus its null entry).
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const source = { ...(node as Record<string, unknown>) };
  delete source.additionalProperties;
  const { type, enum: values, properties, ...rest } = source;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) out[k] = k === "required" || k === "description" ? v : toGeminiSchema(v);
  if (properties && typeof properties === "object") {
    out.properties = Object.fromEntries(
      Object.entries(properties as Record<string, unknown>).map(([k, v]) => [k, toGeminiSchema(v)])
    );
  }
  if (Array.isArray(type)) {
    const concrete = (values as unknown[] | undefined)?.filter((v) => v !== null);
    const branches: Record<string, unknown>[] = type
      .filter((t) => t !== "null")
      .map((t) => (concrete ? { type: t, enum: concrete } : { type: t }));
    if (type.includes("null")) branches.push({ type: "null" });
    if (branches.length === 1) Object.assign(out, branches[0]);
    else out.anyOf = branches;
    return out;
  }
  if (type !== undefined) out.type = type;
  if (values !== undefined) out.enum = values;
  return out;
}
