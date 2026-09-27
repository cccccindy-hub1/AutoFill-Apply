// ============================================================
// LLM 提供商元数据（单一事实来源）
// 选项页下拉框、默认模型、默认 base URL 均由此表驱动。
// ============================================================

import type { AIModelConfig } from '../types/models';

/** 提供商元数据 */
export interface ProviderMeta {
  /** 与 AIModelConfig['provider'] 对应的标识 */
  id: AIModelConfig['provider'];
  /** 下拉框展示名称 */
  label: string;
  /** 切换提供商时预填的默认模型 */
  defaultModel: string;
  /** 默认 API base URL（不含尾斜杠） */
  defaultBaseUrl: string;
}

/** 全部支持的提供商 */
export const PROVIDERS: ProviderMeta[] = [
  { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini', defaultBaseUrl: 'https://api.openai.com/v1' },
  { id: 'claude', label: 'Anthropic Claude', defaultModel: 'claude-3-5-sonnet-20241022', defaultBaseUrl: 'https://api.anthropic.com/v1' },
  { id: 'deepseek', label: 'DeepSeek 深度求索', defaultModel: 'deepseek-chat', defaultBaseUrl: 'https://api.deepseek.com/v1' },
  { id: 'minimax', label: 'MiniMax', defaultModel: 'MiniMax-Text-01', defaultBaseUrl: 'https://api.minimax.chat/v1' },
  { id: 'zhipu', label: '智谱 GLM', defaultModel: 'glm-4-flash', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'moonshot', label: '月之暗面 Kimi', defaultModel: 'moonshot-v1-8k', defaultBaseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'qianwen', label: '阿里通义千问', defaultModel: 'qwen-turbo', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'doubao', label: '字节跳动豆包', defaultModel: 'doubao-pro-4k', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'baichuan', label: '百川智能', defaultModel: 'Baichuan4', defaultBaseUrl: 'https://api.baichuan-ai.com/v1' },
  { id: 'ollama', label: 'Ollama（本地）', defaultModel: 'llama3', defaultBaseUrl: 'http://localhost:11434/v1' },
  { id: 'custom', label: '自定义（兼容 OpenAI 格式）', defaultModel: '', defaultBaseUrl: 'https://api.openai.com/v1' },
];

/** 按 id 查找提供商元数据 */
export function findProvider(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
