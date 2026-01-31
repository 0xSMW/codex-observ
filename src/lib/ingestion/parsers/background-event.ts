const BACKGROUND_EVENT_RE = /\bBackgroundEvent:/;

export interface BackgroundEvent {
  kind: "background_event";
  source: "background_event";
  ts: number;
  event_type: "failure";
  exit_code: number | null;
  error: string | null;
  tool_name: string | null;
  command: string | null;
  raw: string;
  source_line: number;
  signature: string;
}

export interface BackgroundEventParseResult {
  event: BackgroundEvent;
  consumed_lines: number;
}

export function parseBackgroundEvent(
  lines: string[],
  index: number,
  ts: number,
  sourceLine: number
): BackgroundEventParseResult | null {
  const line = lines[index];
  if (!BACKGROUND_EVENT_RE.test(line)) return null;

  const lower = line.toLowerCase();
  if (!lower.includes("failed") && !lower.includes("error")) {
    return null;
  }

  const exitCode = parseExitCode(line);
  const error = parseError(line);
  const toolName = parseToolName(line);
  const command = parseCommand(line);
  const signature = buildSignature(toolName, command, line);

  return {
    event: {
      kind: "background_event",
      source: "background_event",
      ts,
      event_type: "failure",
      exit_code: exitCode,
      error,
      tool_name: toolName,
      command,
      raw: line.trim(),
      source_line: sourceLine,
      signature,
    },
    consumed_lines: 0,
  };
}

function parseExitCode(line: string): number | null {
  const match = /exit\s*code\s*=?\s*(-?\d+)/i.exec(line);
  if (match) return toInt(match[1]);
  const match2 = /code\s*=?\s*(-?\d+)/i.exec(line);
  if (match2) return toInt(match2[1]);
  return null;
}

function parseError(line: string): string | null {
  const match = /(Execution failed:|Error:|Failed:)(.*)$/i.exec(line);
  if (!match) return null;
  const value = match[2]?.trim();
  return value || null;
}

function parseToolName(line: string): string | null {
  const match = /tool\s*=?\s*([A-Za-z0-9_.:-]+)/i.exec(line);
  if (match) return match[1];
  return null;
}

function parseCommand(line: string): string | null {
  const match = /command\s*=?\s*("[^"]+"|'[^']+'|[^,]+)$/i.exec(line);
  if (match) return unquote(match[1].trim());
  return null;
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function toInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSignature(toolName: string | null, command: string | null, raw: string): string {
  const normalizedCommand = normalizeCommand(command ?? raw);
  return toolName ? `${toolName}|${normalizedCommand}` : normalizedCommand;
}

function normalizeCommand(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 200);
}
