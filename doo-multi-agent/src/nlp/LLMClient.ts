import { LLMConfig } from '../core/types';
import { LLMClient as CozeLLMClient, Config as CozeConfig } from 'coze-coding-dev-sdk';

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 单次 LLM 调用超时（毫秒）。
 * 平台对「无数据交互」有 90s 断连；重试 2 次 + 60s 超时最坏会到 120s，
 * 因此默认降到 30s（最坏 60s + 退避，仍在平台窗口内）。
 */
const REQUEST_TIMEOUT = Number(process.env.LLM_TIMEOUT_MS) || 30000;
/** 最多 2 次尝试（首次 + 1 次重试） */
const MAX_ATTEMPTS = 2;
/** 重试退避基数：500ms、1000ms……
 *  瞬时抖动给一次机会，同时避免对限流场景连环打。 */
const RETRY_BASE_DELAY_MS = 500;

/** 额外字段里不允许被透传覆盖的保留键（改写它们会静默改变请求语义） */
const RESERVED_BODY_KEYS = new Set(['messages', 'model']);

/** 配置类错误：重试无意义，直接抛出，不做退避 */
export class LLMConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMConfigError';
  }
}

/** 调用类错误：网络/限流/5xx 等，可重试 */
export class LLMRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMRequestError';
  }
}

export interface CompleteOptions {
  /** 覆盖全局 model（用于让各 Agent 的 model 配置真正生效） */
  model?: string;
  /** 覆盖全局 temperature（评估类 Agent 需要更低温度以保证可复现） */
  temperature?: number;
  /** 作为 system 消息下发（AgentConfig.systemPrompt） */
  system?: string;
}

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async complete(prompt: string, opts: CompleteOptions = {}): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        switch (this.config.provider) {
          case 'openai':
            return await this.callOpenAI(prompt, opts);
          case 'anthropic':
            return await this.callAnthropic(prompt, opts);
          case 'custom':
            return await this.callCustom(prompt, opts);
          case 'coze':
            return await this.callCoze(prompt, opts);
          default:
            throw new LLMConfigError(`Unsupported LLM provider: ${this.config.provider}`);
        }
      } catch (error) {
        lastError = error;
        // 配置错误不重试，直接抛出
        if (error instanceof LLMConfigError) {
          throw error;
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
          console.warn(
            `LLM 调用失败，${delay}ms 后重试（${attempt + 1}/${MAX_ATTEMPTS}）: ${(error as Error).message}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  /**
   * 过滤额外字段：丢弃会静默改变请求语义的保留键，并告警。
   * 与 `LLM_EXTRA_BODY` 的文档语义一致（用于补 `thinking` 之类的额外字段）。
   */
  private extraFields(): Record<string, unknown> {
    const raw = this.config.extraBody;
    if (!raw) return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (RESERVED_BODY_KEYS.has(key)) {
        console.warn(`LLM_EXTRA_BODY 中的保留键 "${key}" 已被忽略（请改用 LLM_MODEL / 内置 prompt）`);
        continue;
      }
      out[key] = value;
    }
    return out;
  }

  /** 统一的请求体构造：四条 provider 链路共用，保证 extraBody 一致生效 */
  private buildBody(prompt: string, opts: CompleteOptions): Record<string, unknown> {
    return {
      model: opts.model || this.config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: opts.temperature ?? this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 2000,
      ...this.extraFields(),
    };
  }

  private async postJson(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    label: string
  ): Promise<any> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
    } catch (error) {
      // 超时/网络中断：可重试
      throw new LLMRequestError(`${label} 请求失败: ${(error as Error).message}`);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new LLMRequestError(
        `${label} API error: ${response.status} ${response.statusText}${detail ? ` - ${detail.slice(0, 200)}` : ''}`
      );
    }

    try {
      return await response.json();
    } catch {
      throw new LLMRequestError(`${label} 返回的不是合法 JSON`);
    }
  }

  private async callOpenAI(prompt: string, opts: CompleteOptions): Promise<string> {
    if (!this.config.apiKey) {
      throw new LLMConfigError('OpenAI API key is not configured');
    }
    const url = this.config.baseURL || 'https://api.openai.com/v1/chat/completions';
    const body = this.buildBody(prompt, opts);
    if (opts.system) {
      (body.messages as Array<{ role: string; content: string }>).unshift({
        role: 'system',
        content: opts.system,
      });
    }
    const data = await this.postJson(
      url,
      {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body,
      'OpenAI'
    );
    return data.choices?.[0]?.message?.content || '';
  }

  private async callAnthropic(prompt: string, opts: CompleteOptions): Promise<string> {
    if (!this.config.apiKey) {
      throw new LLMConfigError('Anthropic API key is not configured');
    }
    const url = this.config.baseURL || 'https://api.anthropic.com/v1/messages';
    const data = await this.postJson(
      url,
      {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      {
        model: opts.model || this.config.model || 'claude-3-sonnet-20240229',
        // Anthropic 的 system 是顶层字段，不是 messages 角色
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens ?? 2000,
        temperature: opts.temperature ?? this.config.temperature ?? 0.7,
        ...this.extraFields(),
      },
      'Anthropic'
    );
    return data.content?.[0]?.text || '';
  }

  private async callCustom(prompt: string, opts: CompleteOptions): Promise<string> {
    if (!this.config.baseURL) {
      throw new LLMConfigError('Custom LLM provider requires baseURL（LLM_BASE_URL 必须是完整 endpoint）');
    }
    const body = this.buildBody(prompt, opts);
    if (opts.system) {
      (body.messages as Array<{ role: string; content: string }>).unshift({
        role: 'system',
        content: opts.system,
      });
    }
    const data = await this.postJson(
      this.config.baseURL,
      {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body,
      'Custom LLM'
    );
    return data.choices?.[0]?.message?.content || data.content || data.text || '';
  }

  /** 平台托管大模型（coze-coding-dev-sdk，凭据自动注入），model 默认豆包 Seed 旗舰 */
  private async callCoze(prompt: string, opts: CompleteOptions): Promise<string> {
    const client = new CozeLLMClient(new CozeConfig({ timeout: REQUEST_TIMEOUT }));
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (opts.system) {
      messages.push({ role: 'system', content: opts.system });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await client.invoke(messages, {
      model: opts.model || this.config.model || 'doubao-seed-2-0-pro-260215',
      temperature: opts.temperature ?? this.config.temperature ?? 0.7,
      caching: 'enabled',
      // 注：SDK 的 invoke 入参不含 max_tokens / extraBody，
      // 因此 coze 路径不受 LLM_MAX_TOKENS 与 LLM_EXTRA_BODY 控制（见 AGENTS.md §6）。
    });
    return response.content;
  }
}
