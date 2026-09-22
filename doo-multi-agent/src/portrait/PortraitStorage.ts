import { ChildPortrait, ClassPortraitGroup, DOOAssessment } from '../core/types';
import { IPortraitStorage } from './IPortraitStorage';
import * as fs from 'fs/promises';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import * as path from 'path';

export interface StorageConfig {
  type: 'json' | 'sqlite';
  path?: string;
}

export class PortraitStorage implements IPortraitStorage {
  private config: StorageConfig;
  private dataDir: string;

  constructor(config: StorageConfig) {
    this.config = config;
    this.dataDir = config.path || path.join(process.cwd(), 'data');
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /** 清洗 ID 并校验解析后的路径仍在数据目录内，防止路径遍历 */
  private sanitizeId(id: string): string {
    const safe = id.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
    const resolved = path.resolve(this.dataDir, `x_${safe}`);
    if (!resolved.startsWith(path.resolve(this.dataDir) + path.sep)) {
      throw new Error(`非法的ID: ${id}`);
    }
    return safe;
  }

  private getPortraitPath(childId: string): string {
    return path.join(this.dataDir, `portrait_${this.sanitizeId(childId)}.json`);
  }

  private getClassPath(classId: string): string {
    return path.join(this.dataDir, `class_${this.sanitizeId(classId)}.json`);
  }

  /**
   * 原子写：先写临时文件再 rename。
   * 直接 `writeFile` 在进程中断时会留下半截 JSON，也会让并发读侧读到空文件。
   * 临时文件名带 pid + 随机后缀，避免同进程内并发写互相覆盖。
   */
  private async writeAtomic(filePath: string, data: string): Promise<void> {
    const tmpPath = `${filePath}.${process.pid}.${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}.tmp`;
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, filePath);
  }

  async savePortrait(portrait: ChildPortrait): Promise<void> {
    const filePath = this.getPortraitPath(portrait.childId);
    await this.writeAtomic(filePath, JSON.stringify(portrait, null, 2));
  }

  async loadPortrait(childId: string): Promise<ChildPortrait | null> {
    const filePath = this.getPortraitPath(childId);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const portrait = JSON.parse(data) as ChildPortrait;

      // 恢复 Date 对象
      portrait.basePortrait.createdAt = new Date(portrait.basePortrait.createdAt);
      portrait.basePortrait.updatedAt = new Date(portrait.basePortrait.updatedAt);
      for (const assessment of portrait.basePortrait.assessments) {
        assessment.timestamp = new Date(assessment.timestamp);
      }
      for (const pp of portrait.progressivePortraits) {
        pp.startDate = new Date(pp.startDate);
        pp.endDate = new Date(pp.endDate);
        for (const assessment of pp.assessments) {
          assessment.timestamp = new Date(assessment.timestamp);
        }
      }

      return portrait;
    } catch (error) {
      console.error(`Failed to load portrait for ${childId}:`, error);
      return null;
    }
  }

  async deletePortrait(childId: string): Promise<boolean> {
    const filePath = this.getPortraitPath(childId);
    if (!existsSync(filePath)) {
      return false;
    }
    await fs.unlink(filePath);
    return true;
  }

  async listPortraits(): Promise<string[]> {
    if (!existsSync(this.dataDir)) {
      return [];
    }

    const files = readdirSync(this.dataDir);
    return files
      .filter(f => f.startsWith('portrait_') && f.endsWith('.json'))
      .map(f => f.replace('portrait_', '').replace('.json', ''));
  }

  async loadAllPortraits(): Promise<ChildPortrait[]> {
    const ids = await this.listPortraits();
    // 并行加载所有画像（原先串行，幼儿数量多时明显偏慢）
    const results = await Promise.all(
      ids.map(id => this.loadPortrait(id).catch(() => null))
    );
    return results.filter((p): p is ChildPortrait => p !== null);
  }

  async saveClassGroup(group: ClassPortraitGroup): Promise<void> {
    const filePath = this.getClassPath(group.classId);
    await this.writeAtomic(filePath, JSON.stringify(group, null, 2));
  }

  async loadClassGroup(classId: string): Promise<ClassPortraitGroup | null> {
    const filePath = this.getClassPath(classId);
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const group = JSON.parse(data) as ClassPortraitGroup;
      group.generatedAt = new Date(group.generatedAt);
      return group;
    } catch (error) {
      console.error(`Failed to load class group ${classId}:`, error);
      return null;
    }
  }

  async exportToJSON(): Promise<string> {
    const portraits = await this.loadAllPortraits();
    const exportData = {
      exportTime: new Date().toISOString(),
      portraitCount: portraits.length,
      portraits,
    };
    return JSON.stringify(exportData, null, 2);
  }

  async importFromJSON(jsonData: string): Promise<number> {
    try {
      const data: unknown = JSON.parse(jsonData);
      const portraits = (data as { portraits?: unknown } | null)?.portraits;
      // 原先直接 `data.portraits as ChildPortrait[]` 纯断言，畸形数据会静默污染库
      if (!Array.isArray(portraits)) {
        console.error('Failed to import portraits: JSON 中缺少 portraits 数组');
        return 0;
      }

      for (const portrait of portraits as ChildPortrait[]) {
        await this.savePortrait(portrait);
      }

      return portraits.length;
    } catch (error) {
      console.error('Failed to import portraits:', error);
      return 0;
    }
  }
}
