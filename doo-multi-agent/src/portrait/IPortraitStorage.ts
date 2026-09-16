import { ChildPortrait, ClassPortraitGroup } from '../core/types';

export interface IPortraitStorage {
  savePortrait(portrait: ChildPortrait): Promise<void>;
  loadPortrait(childId: string): Promise<ChildPortrait | null>;
  deletePortrait(childId: string): Promise<boolean>;
  listPortraits(): Promise<string[]>;
  loadAllPortraits(): Promise<ChildPortrait[]>;
  saveClassGroup(group: ClassPortraitGroup): Promise<void>;
  loadClassGroup(classId: string): Promise<ClassPortraitGroup | null>;
  exportToJSON(): Promise<string>;
  importFromJSON(jsonData: string): Promise<number>;
}
