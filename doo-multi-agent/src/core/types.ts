export type AgentType = 'expert' | 'teacher' | 'peer';

export type MessageType =
  | 'narrative_input'
  | 'assessment_request'
  | 'assessment_result'
  | 'portrait_update'
  | 'suggestion'
  | 'interaction'
  | 'reflection';

export type Level = 1 | 2 | 3 | 4 | 5;

export type ScenarioType = 'smart_story_corner' | 'narrative_train' | 'journey_podcast';

export interface AgentMessage {
  id: string;
  from: AgentType;
  to: AgentType | 'all';
  type: MessageType;
  payload: unknown;
  timestamp: Date;
}

export interface AgentConfig {
  type: AgentType;
  name: string;
  systemPrompt: string;
  model?: string;
  temperature?: number;
}

export interface NarrativeInput {
  childId: string;
  childName: string;
  classId: string;
  content: string;
  scenario: ScenarioType;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface DictionDimension {
  vocabulary: Level;
  sentenceStructure: Level;
}

export interface OrganizationDimension {
  narrativeStructure: Level;
  timeMarker: Level;
  themeRelevance: Level;
  eventExpansion: Level;
  expressiveness: Level;
}

export interface OpinionDimension {
  narrativeViewpoint: Level;
}

export interface DOODimensions {
  diction: DictionDimension;
  organization: OrganizationDimension;
  opinion: OpinionDimension;
}

export interface DOOAssessment {
  id: string;
  childId: string;
  childName: string;
  classId: string;
  timestamp: Date;
  dimensions: DOODimensions;
  overallLevel: Level;
  suggestions: string[];
  narrativeContent: string;
  scenario: ScenarioType;
}

export interface ObservationPoint {
  name: string;
  dimension: 'diction' | 'organization' | 'opinion';
  level1Description: string;
  level2Description: string;
  level3Description: string;
  /** 5级细化指标（对应《学前儿童叙事能力评定表》水平1-5） */
  detailedLevels?: {
    level1: string;
    level2: string;
    level3: string;
    level4: string;
    level5: string;
  };
  /** 一卡一图一册载体建议（对应支持性策略） */
  carriers?: {
    card: string;   // 一卡：感知积累
    map: string;    // 一图：构思组织
    book: string;   // 一册：练习追踪
  };
}

export interface GrowthPoint {
  period: string;
  assessmentId: string;
  dimensions: DOODimensions;
  overallLevel: Level;
}

export interface BasePortrait {
  createdAt: Date;
  updatedAt: Date;
  assessments: DOOAssessment[];
}

export interface ProgressivePortrait {
  period: string;
  startDate: Date;
  endDate: Date;
  assessments: DOOAssessment[];
  growthTrajectory: GrowthPoint[];
}

export interface RadarData {
  diction: number;
  organization: number;
  opinion: number;
}

export interface ChildPortrait {
  childId: string;
  name: string;
  classId: string;
  basePortrait: BasePortrait;
  progressivePortraits: ProgressivePortrait[];
  currentRadar: RadarData;
}

export interface ClassPortraitGroup {
  classId: string;
  className: string;
  children: ChildPortrait[];
  averageRadar: RadarData;
  generatedAt: Date;
}

export function getScenarioLabel(scenario: ScenarioType): string {
  switch (scenario) {
    case 'smart_story_corner':
      return '智能故事角';
    case 'narrative_train':
      return '叙事火车';
    case 'journey_podcast':
      return '西游播客';
    default:
      return scenario;
  }
}

export interface ScenarioContext {
  scenario: ScenarioType;
  childId?: string;
  classId?: string;
  narrativeInput?: NarrativeInput;
  assessment?: DOOAssessment;
}

export interface ScenarioResult {
  scenario: ScenarioType;
  success: boolean;
  assessment?: DOOAssessment;
  portrait?: ChildPortrait;
  interactions: AgentMessage[];
  reflections: string[];
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'custom' | 'coze';
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  extraBody?: Record<string, unknown>;
}

export interface SystemConfig {
  llm: LLMConfig;
  storage: {
    type: 'sqlite' | 'json';
    path?: string;
  };
  agents: {
    expert: AgentConfig;
    teacher: AgentConfig;
    peer: AgentConfig;
  };
}
