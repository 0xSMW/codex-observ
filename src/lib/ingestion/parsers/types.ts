export interface ParseContext {
  filePath: string;
  lineNumber: number;
  fallbackTs?: number;
  sessionId?: string | null;
  model?: string | null;
  modelProvider?: string | null;
}

export interface SessionContextUpdate {
  sessionId: string;
  model?: string | null;
  modelProvider?: string | null;
}
