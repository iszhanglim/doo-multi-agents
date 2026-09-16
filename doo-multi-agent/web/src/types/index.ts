export interface DOOAssessment {
  id?: string;
  childId?: string;
  childName?: string;
  classId?: string;
  timestamp?: Date;
  overallLevel: number;
  dimensions: {
    diction: {
      vocabulary: number;
      sentenceStructure: number;
    };
    organization: {
      narrativeStructure: number;
      timeMarker: number;
      themeRelevance: number;
      eventExpansion: number;
      expressiveness: number;
    };
    opinion: {
      narrativeViewpoint: number;
    };
  };
  suggestions: string[];
  observationPoints?: string[];
  narrativeContent?: string;
  scenario?: string;
}

export interface ChildPortrait {
  childId: string;
  name: string;
  classId: string;
  basePortrait: {
    createdAt: Date;
    updatedAt: Date;
    assessments: DOOAssessment[];
  };
  progressivePortraits: unknown[];
  currentRadar: {
    diction: number;
    organization: number;
    opinion: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface NarrativeInput {
  childId?: string;
  childName: string;
  classId: string;
  content: string;
  scenario: string;
  timestamp: Date;
}

export interface ScenarioResult {
  scenario: string;
  success: boolean;
  assessment?: DOOAssessment;
  portrait?: ChildPortrait;
  interactions: AgentMessage[];
  reflections: string[];
}

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
  timestamp: Date;
}

export interface AssessmentRunResult {
  success: boolean;
  assessment: DOOAssessment;
  portrait?: ChildPortrait;
  childId: string;
  interactions: AgentMessage[];
  reflections: string[];
  report?: string;
}
