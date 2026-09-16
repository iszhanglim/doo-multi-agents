import { AgentMessage, AgentType, MessageType } from './types';

export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

export class MessageBus {
  private subscribers: Map<string, MessageHandler[]> = new Map();
  private messageHistory: AgentMessage[] = [];
  /** 历史消息上限，防止长驻进程内存无限增长 */
  private static readonly MAX_HISTORY = 5000;

  subscribe(
    agentType: AgentType | 'all',
    messageType: MessageType | 'all',
    handler: MessageHandler
  ): () => void {
    const key = this.getKey(agentType, messageType);
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }
    this.subscribers.get(key)!.push(handler);

    return () => {
      const handlers = this.subscribers.get(key);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  publish(message: AgentMessage): void {
    this.messageHistory.push(message);
    if (this.messageHistory.length > MessageBus.MAX_HISTORY) {
      this.messageHistory.splice(0, this.messageHistory.length - MessageBus.MAX_HISTORY);
    }

    const specificKey = this.getKey(message.from, message.type);
    const agentAllKey = this.getKey(message.from, 'all');
    const typeAllKey = this.getKey('all', message.type);
    const allAllKey = this.getKey('all', 'all');
    const receiverSpecificKey = this.getKey(message.to, message.type);
    const receiverAllKey = this.getKey(message.to, 'all');

    const keys = [specificKey, agentAllKey, typeAllKey, allAllKey, receiverSpecificKey, receiverAllKey];
    const notified = new Set<MessageHandler>();

    for (const key of keys) {
      const handlers = this.subscribers.get(key);
      if (handlers) {
        for (const handler of handlers) {
          if (!notified.has(handler)) {
            notified.add(handler);
            try {
              const result = handler(message);
              if (result instanceof Promise) {
                result.catch(err => console.error('Message handler error:', err));
              }
            } catch (err) {
              console.error('Message handler error:', err);
            }
          }
        }
      }
    }
  }

  getHistory(
    filter?: {
      from?: AgentType;
      to?: AgentType | 'all';
      type?: MessageType;
    }
  ): AgentMessage[] {
    if (!filter) {
      return [...this.messageHistory];
    }

    return this.messageHistory.filter(msg => {
      if (filter.from && msg.from !== filter.from) return false;
      if (filter.to && msg.to !== filter.to) return false;
      if (filter.type && msg.type !== filter.type) return false;
      return true;
    });
  }

  clearHistory(): void {
    this.messageHistory = [];
  }

  private getKey(agentType: string, messageType: string): string {
    return `${agentType}:${messageType}`;
  }
}
