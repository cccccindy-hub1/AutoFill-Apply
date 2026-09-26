// ============================================================
// LLM API 调用服务
// 支持 OpenAI / Claude / 通义千问 / 豆包 / MiniMax / DeepSeek
//       智谱GLM / 月之暗面Kimi / 百川 / Ollama / 自定义
// API Key 仅存储在本地，直接调用厂商官方 API
// ============================================================

import type { AIModelConfig } from '../types/models';

/** LLM 调用参数 */
interface LLMRequest {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature?: number;
  maxTokens?: number;
}

/** LLM 响应 */
interface LLMResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

/** 获取 API base URL */
function getBaseUrl(config: AIModelConfig): string {
  if (config.baseUrl) return config.baseUrl.replace(/\/$/, '');

  switch (config.provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'claude':
      return 'https://api.anthropic.com/v1';
    case 'doubao':
      return 'https://ark.cn-beijing.volces.com/api/v3';
    case 'qianwen':
      return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    case 'minimax':
      return 'https://api.minimax.chat/v1';
    case 'deepseek':
      return 'https://api.deepseek.com/v1';
    case 'zhipu':
      return 'https://open.bigmodel.cn/api/paas/v4';
    case 'moonshot':
      return 'https://api.moonshot.cn/v1';
    case 'baichuan':
      return 'https://api.baichuan-ai.com/v1';
    case 'ollama':
      return 'http://localhost:11434/v1';
    case 'custom':
      return config.baseUrl || 'https://api.openai.com/v1';
    default:
      return 'https://api.openai.com/v1';
  }
}

/** 调用 LLM API（OpenAI 兼容格式） */
export async function callLLM(
  config: AIModelConfig,
  request: LLMRequest
): Promise<LLMResponse> {
  const baseUrl = getBaseUrl(config);

  // Claude 使用不同的 API 格式
  if (config.provider === 'claude') {
    return callClaudeAPI(config, request);
  }

  // OpenAI 兼容格式（适用于 OpenAI / 通义千问 / 豆包 / Ollama / 自定义）
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey || ''}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API 调用失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
        }
      : undefined,
  };
}

/** 调用 Claude API */
async function callClaudeAPI(
  config: AIModelConfig,
  request: LLMRequest
): Promise<LLMResponse> {
  const baseUrl = getBaseUrl(config);
  const systemMessage = request.messages.find((m) => m.role === 'system')?.content;
  const otherMessages = request.messages.filter((m) => m.role !== 'system');

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: request.maxTokens ?? 1000,
      system: systemMessage,
      messages: otherMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API 调用失败 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    content: data.content?.[0]?.text || '',
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
        }
      : undefined,
  };
}

// =================== 高层接口 ===================

/**
 * 使用 LLM 进行字段智能匹配
 */
export async function llmMatchField(
  config: AIModelConfig,
  fieldLabel: string,
  fieldContext: string,
  userDataSummary: string
): Promise<{ value: string; confidence: number }> {
  const prompt = `你是一个校招网申表单智能填充助手。
  
用户的个人信息如下：
${userDataSummary}

当前需要填写的表单字段是：
- 字段标签：${fieldLabel}
- 字段上下文：${fieldContext}

请根据用户的个人信息，给出这个字段最合适的填写内容。
注意：
1. 只返回填写的内容本身，不要有任何解释
2. 如果用户信息中没有对应的内容，返回空字符串
3. 确保内容格式正确（如日期、电话号码等）
4. 内容应简洁明了，符合求职场景`;

  try {
    const response = await callLLM(config, {
      messages: [
        { role: 'system', content: '你是校招网申智能填充助手，只返回表单字段的填写内容。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      maxTokens: 500,
    });

    const value = response.content.trim();
    return {
      value,
      confidence: value ? 0.7 : 0,
    };
  } catch (error) {
    console.error('[CampusApply] LLM 匹配失败:', error);
    return { value: '', confidence: 0 };
  }
}

/**
 * 使用 LLM 生成开放性问题答案
 */
export async function llmGenerateAnswer(
  config: AIModelConfig,
  question: string,
  userDataSummary: string,
  jobDescription?: string
): Promise<string> {
  const prompt = `你是一个资深的校招求职辅导专家。

用户的个人信息和经历：
${userDataSummary}

${jobDescription ? `目标岗位的招聘描述：\n${jobDescription}\n` : ''}

请帮用户回答以下网申开放性问题：
"${question}"

要求：
1. 回答要个性化，基于用户的真实经历，避免通用模板化内容
2. 400字以内，结构清晰
3. 突出与岗位的匹配度
4. 语气真诚、自信、专业
5. 直接给出答案文本，不要加引号或额外说明`;

  try {
    const response = await callLLM(config, {
      messages: [
        { role: 'system', content: '你是校招求职辅导专家，帮助应届生撰写个性化的网申回答。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.6,
      maxTokens: 1000,
    });

    return response.content.trim();
  } catch (error) {
    console.error('[CampusApply] LLM 生成失败:', error);
    throw error;
  }
}

/**
 * 使用 LLM 解析简历文本为结构化数据
 */
export async function llmParseResume(
  config: AIModelConfig,
  resumeText: string
): Promise<Record<string, unknown>> {
  const prompt = `请将以下简历文本解析为 JSON 结构化数据。

简历文本：
${resumeText.substring(0, 5000)}

请按以下 JSON 格式输出（只输出 JSON，不要有其他文字）：
{
  "name": "姓名",
  "gender": "男/女",
  "phone": "手机号",
  "email": "邮箱",
  "birthDate": "YYYY-MM-DD",
  "nativePlace": "籍贯",
  "politicalStatus": "政治面貌",
  "educations": [
    {
      "type": "本科/硕士/博士",
      "school": "学校名称",
      "college": "学院",
      "major": "专业",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "gpa": "绩点",
      "ranking": "排名"
    }
  ],
  "experiences": [
    {
      "type": "实习/项目/科研/校园",
      "organization": "公司/组织",
      "role": "岗位",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "description": "描述",
      "bullets": ["要点1", "要点2"]
    }
  ],
  "skills": ["技能1", "技能2"]
}

注意：
1. 只输出合法的 JSON，不要有任何前缀后缀
2. 无法提取的字段留空字符串
3. 日期统一为 YYYY-MM 格式`;

  try {
    const response = await callLLM(config, {
      messages: [
        { role: 'system', content: '你是简历解析专家，将简历文本转换为结构化 JSON 数据。只输出 JSON。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      maxTokens: 2000,
    });

    // 提取 JSON
    let jsonStr = response.content.trim();
    // 去掉可能的 markdown 代码块
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('[CampusApply] 简历解析失败:', error);
    throw error;
  }
}
