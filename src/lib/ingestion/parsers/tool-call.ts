const TOOL_CALL_RE = /\bToolCall:\s*([A-Za-z0-9_.:-]+)/;
const TIMESTAMP_START_RE = /^\s*\d{4}-\d{2}-\d{2}[ T]/;

export type ToolCallEventType = "start" | "exit" | "failure";

export interface ToolCallEvent {
  kind: "tool_call";
  source: "tool_call";
  ts: number;
  tool_name: string;
  event_type: ToolCallEventType;
  command: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  stdout_bytes: number | null;
  stderr_bytes: number | null;
  error: string | null;
  raw_args: string | null;
  source_line: number;
  signature: string;
}

export interface ToolCallParseResult {
  event: ToolCallEvent;
  consumed_lines: number;
}

export function parseToolCall(
  lines: string[],
  index: number,
  ts: number,
  sourceLine: number
): ToolCallParseResult | null {
  const line = lines[index];
  const match = TOOL_CALL_RE.exec(line);
  if (!match) return null;

  const toolName = match[1];
  const remainder = line.slice(match.index + match[0].length).trim();
  const { argsText, consumedLines } = collectArgsText(lines, index, remainder);
  const { args, command } = parseArgs(argsText);

  const exitCode = numberOrNull(args.exit_code ?? args.exitCode ?? args.code);
  const durationMs = numberOrNull(args.duration_ms ?? args.durationMs ?? args.duration);
  const stdoutBytes = numberOrNull(args.stdout_bytes ?? args.stdoutBytes ?? args.stdout);
  const stderrBytes = numberOrNull(args.stderr_bytes ?? args.stderrBytes ?? args.stderr);
  const error = stringOrNull(args.error ?? args.err ?? args.message);
  const statusValue = stringOrNull(args.status ?? args.state ?? args.event ?? args.phase);

  let eventType = statusFromText(statusValue ?? "") ?? statusFromLine(line);

  if (!eventType) {
    if (exitCode !== null) {
      eventType = exitCode === 0 ? "exit" : "failure";
    } else if (error) {
      eventType = "failure";
    } else if (durationMs !== null) {
      eventType = "exit";
    } else {
      eventType = "start";
    }
  }

  const signature = buildSignature(toolName, command, argsText);

  return {
    event: {
      kind: "tool_call",
      source: "tool_call",
      ts,
      tool_name: toolName,
      event_type: eventType,
      command,
      exit_code: exitCode,
      duration_ms: durationMs,
      stdout_bytes: stdoutBytes,
      stderr_bytes: stderrBytes,
      error,
      raw_args: argsText,
      source_line: sourceLine,
      signature,
    },
    consumed_lines: consumedLines,
  };
}

function collectArgsText(
  lines: string[],
  index: number,
  remainder: string
): { argsText: string | null; consumedLines: number } {
  let text = cleanupArgsPrefix(remainder);
  let consumedLines = 0;

  if (!text && lines[index + 1]) {
    const next = lines[index + 1].trim();
    if (next.startsWith("{") || next.startsWith("[")) {
      text = next;
      consumedLines = 1;
    }
  }

  if (!text) {
    return { argsText: null, consumedLines: 0 };
  }

  if (text.startsWith("(") && text.endsWith(")")) {
    text = text.slice(1, -1).trim();
  }

  if (text.startsWith("{") || text.startsWith("[")) {
    let combined = text;
    let i = index + consumedLines + 1;
    while (i < lines.length && !tryParseJson(combined)) {
      const nextLine = lines[i];
      if (TIMESTAMP_START_RE.test(nextLine)) break;
      combined += `\n${nextLine}`;
      consumedLines += 1;
      i += 1;
      if (consumedLines > 20) break;
    }
    text = combined;
  }

  return { argsText: text, consumedLines };
}

function cleanupArgsPrefix(value: string): string {
  let text = value.trim();
  if (!text) return text;
  text = text.replace(/^[:\-\s]+/, "");
  text = text.replace(/^args?=\s*/i, "");
  return text.trim();
}

function parseArgs(argsText: string | null): {
  args: Record<string, unknown>;
  command: string | null;
} {
  if (!argsText) return { args: {}, command: null };
  const trimmed = argsText.trim();

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed)) {
        return { args: parsed, command: extractCommand(parsed) };
      }
      return { args: {}, command: null };
    } catch {
      // fall through
    }
  }

  const kv = parseKeyValues(trimmed);
  const command = stringOrNull(kv.cmd) ?? stringOrNull(kv.command);
  return { args: kv, command };
}

function parseKeyValues(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /(\w+)=(("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|[^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input))) {
    const key = match[1];
    const rawValue = match[2];
    result[key] = unquote(rawValue);
  }
  return result;
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function extractCommand(args: Record<string, unknown>): string | null {
  const cmd = stringOrNull(args.cmd) ?? stringOrNull(args.command);
  return cmd;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function tryParseJson(input: string): boolean {
  try {
    JSON.parse(input);
    return true;
  } catch {
    return false;
  }
}

function buildSignature(toolName: string, command: string | null, argsText: string | null): string {
  const normalizedCommand = normalizeCommand(command ?? argsText ?? "");
  return normalizedCommand ? `${toolName}|${normalizedCommand}` : toolName;
}

function normalizeCommand(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 200);
}

function statusFromText(value: string): ToolCallEventType | null {
  const normalized = value.toLowerCase();
  if (["start", "started", "starting", "running", "pending"].includes(normalized)) return "start";
  if (["ok", "success", "succeeded", "complete", "completed", "done", "finished", "exit"].includes(normalized)) {
    return "exit";
  }
  if (["fail", "failed", "failure", "error", "errored"].includes(normalized)) return "failure";
  return null;
}

function statusFromLine(line: string): ToolCallEventType | null {
  const lower = line.toLowerCase();
  if (lower.includes("failed") || lower.includes("error")) return "failure";
  if (lower.includes("completed") || lower.includes("finished") || lower.includes("success")) return "exit";
  if (lower.includes("started") || lower.includes("running") || lower.includes("pending")) return "start";
  return null;
}
