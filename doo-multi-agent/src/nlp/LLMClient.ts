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

/** 单次 LLM 调用超时（毫秒），防止请求无限挂死 */
const REQUEST_TIMEOUT = Number(process.env.LLM_TIMEOUT_MS) || 60000;

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async complete(prompt: string): Promise<string> {
    let lastError: unknown;
    // 最多重试 1 次（共 2 次尝试），瞬时网络抖动不应导致整个评估失败
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        switch (this.config.provider) {
          case 'openai':
            if (!this.config.apiKey) {
              throw new Error('OpenAI API key is not configured');
            }
            return await this.callOpenAI(prompt);
          case 'anthropic':
            if (!this.config.apiKey) {
              throw new Error('Anthropic API key is not configured');
            }
            return await this.callAnthropic(prompt);
          case 'custom':
            return await this.callCustom(prompt);
          case 'coze':
            return await this.callCoze(prompt);
          default:
            throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
        }
      } catch (error) {
        lastError = error;
        // 配置错误不重试，直接抛出
        if (error instanceof Error && /not configured|Unsupported|requires baseURL/.test(error.message)) {
          throw error;
        }
        if (attempt === 0) {
          console.warn(`LLM 调用失败，正在重试: ${(error as Error).message}`);
        }
      }
    }
    throw lastError;
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const url = this.config.baseURL || 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens ?? 2000,
        ...(this.config.extraBody || {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const url = this.config.baseURL || 'https://api.anthropic.com/v1/messages';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-3-sonnet-20240229',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens ?? 2000,
        temperature: this.config.temperature ?? 0.7,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0]?.text || '';
  }

  private async callCustom(prompt: string): Promise<string> {
    if (!this.config.baseURL) {
      throw new Error('Custom LLM provider requires baseURL');
    }

    const response = await fetch(this.config.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.maxTokens ?? 2000,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`Custom LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || data.content || data.text || '';
  }

  /** 平台托管大模型（coze-coding-dev-sdk，凭据自动注入），model 默认豆包 Seed 旗舰 */
  private async callCoze(prompt: string): Promise<string> {
    const client = new CozeLLMClient(new CozeConfig({ timeout: REQUEST_TIMEOUT }));
    const response = await client.invoke(
      [{ role: 'user', content: prompt }],
      {
        model: this.config.model || 'doubao-seed-2-0-pro-260215',
        temperature: this.config.temperature ?? 0.7,
        caching: 'enabled',
      },
    );
    return response.content;
  }
}
