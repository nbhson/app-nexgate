/** Các kiểu tương thích OpenAI — subset tối thiểu cần cho proxy. */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "developer";
  content: string | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: string | Record<string, unknown>;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  user?: string;
  [key: string]: unknown;
}

export interface EmbeddingsRequest {
  model: string;
  input: string | string[];
  encoding_format?: "float" | "base64";
  user?: string;
  [key: string]: unknown;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string | null;
  }>;
  usage?: Usage;
}

export interface EmbeddingsResponse {
  object: "list";
  data: Array<{ object: "embedding"; embedding: number[]; index: number }>;
  model: string;
  usage: Usage;
}

export interface ModelInfo {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}
