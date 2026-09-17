import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

export type ScanEngine = "claude" | "gemini";
export const SCAN_ENGINES: readonly ScanEngine[] = ["claude", "gemini"];
export const CLAUDE_MODEL = "claude-opus-5";
export const GEMINI_MODEL = "gemini-3.8-flash";

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
};

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export const CUT_OFF = "The reading was cut off before the document was finished. Try scanning fewer pages at once.";
export const NOT_STRUCTURED = "The model didn't return structured data. Try again.";

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
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    output_config: { effort: "medium" },
    tools: [{ name: opts.name, description: opts.description, strict: true, input_schema: opts.schema as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: opts.name },
    messages: [{ role: "user", content: [...pageBlocks, { type: "text", text: opts.prompt }] }],
  });

  if (response.stop_reason === "max_tokens") throw new Error(CUT_OFF);
  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) throw new Error(NOT_STRUCTURED);
  return toolUse.input as T;
}

async function extractWithGemini<T>(opts: ExtractStructuredOptions): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const client = new GoogleGenAI({ apiKey });

  const interaction = await client.interactions.create({
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
    generation_config: { max_output_tokens: opts.maxTokens ?? 16000 },
  });

  if (interaction.status === "incomplete" || interaction.status === "budget_exceeded") throw new Error(CUT_OFF);
  if (interaction.status === "failed") {
    throw new Error(interaction.errors?.[0]?.message || "The Gemini engine failed to read the document. Try again.");
  }
  try {
    return JSON.parse(interaction.output_text ?? "") as T;
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
