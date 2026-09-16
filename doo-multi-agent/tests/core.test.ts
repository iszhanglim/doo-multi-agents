import { MessageBus } from '../src/core/MessageBus';
import { AgentOrchestrator } from '../src/core/AgentOrchestrator';
import { DOOModel } from '../src/doo/DOOModel';
import { OBSERVATION_POINTS } from '../src/doo/ObservationPoints';
import { NarrativeParser } from '../src/nlp/NarrativeParser';
import { FeatureExtractor } from '../src/nlp/FeatureExtractor';
import { LLMClient } from '../src/nlp/LLMClient';
import { ExpertAgent } from '../src/agents/ExpertAgent';
import { TeacherAgent } from '../src/agents/TeacherAgent';
import { PeerAgent } from '../src/agents/PeerAgent';
import { PortraitEngine } from '../src/portrait/PortraitEngine';
import { RadarChart } from '../src/portrait/RadarChart';
import { DOODimensions } from '../src/core/types';

describe('Core Infrastructure', () => {
  describe('MessageBus', () => {
    let messageBus: MessageBus;

    beforeEach(() => {
      messageBus = new MessageBus();
    });

    test('should publish and receive messages', () => {
      const handler = jest.fn();
      messageBus.subscribe('expert', 'assessment_request', handler);

      const message = {
        id: 'test-1',
        from: 'expert' as const,
        to: 'all' as const,
        type: 'assessment_request' as const,
        payload: { test: true },
        timestamp: new Date(),
      };

      messageBus.publish(message);
      expect(handler).toHaveBeenCalledWith(message);
    });

    test('should support wildcard subscriptions', () => {
      const handler = jest.fn();
      messageBus.subscribe('all', 'all', handler);

      messageBus.publish({
        id: 'test-1',
        from: 'peer',
        to: 'all',
        type: 'interaction',
        payload: {},
        timestamp: new Date(),
      });

      expect(handler).toHaveBeenCalled();
    });

    test('should maintain message history', () => {
      messageBus.publish({
        id: 'test-1',
        from: 'expert',
        to: 'all',
        type: 'assessment_request',
        payload: {},
        timestamp: new Date(),
      });

      const history = messageBus.getHistory();
      expect(history).toHaveLength(1);
    });
  });

  describe('AgentOrchestrator', () => {
    test('should run scenario phases', async () => {
      const messageBus = new MessageBus();
      const orchestrator = new AgentOrchestrator(messageBus);

      // Register agents for the multi-agent collaboration flow
      const llmClient = new LLMClient({ provider: 'openai', apiKey: '', model: 'gpt-3.5-turbo' });
      const peerAgent = new PeerAgent({ type: 'peer', name: '多多', systemPrompt: '' }, messageBus, llmClient, false);
      const teacherAgent = new TeacherAgent({ type: 'teacher', name: '小欧老师', systemPrompt: '' }, messageBus);
      const expertAgent = new ExpertAgent({ type: 'expert', name: 'D博士', systemPrompt: '' }, messageBus, llmClient);
      orchestrator.registerAgent(peerAgent);
      orchestrator.registerAgent(teacherAgent);
      orchestrator.registerAgent(expertAgent);

      const context = {
        scenario: 'smart_story_corner' as const,
        childId: 'child_001',
        classId: 'class_001',
        narrativeInput: {
          childId: 'child_001',
          childName: '小明',
          classId: 'class_001',
          content: '我今天去公园玩。',
          scenario: 'smart_story_corner' as const,
          timestamp: new Date(),
        },
      };

      const result = await orchestrator.runScenario(context);

      expect(result.scenario).toBe('smart_story_corner');
      expect(result.interactions.length).toBeGreaterThan(0);
      expect(result.reflections.length).toBeGreaterThan(0);
    });
  });
});

describe('DOO Model', () => {
  test('should create empty dimensions', () => {
    const dims = DOOModel.createEmptyDimensions();
    expect(dims.diction.vocabulary).toBe(1);
    expect(dims.organization.narrativeStructure).toBe(1);
    expect(dims.opinion.narrativeViewpoint).toBe(1);
  });

  test('should calculate overall level', () => {
    const dims: DOODimensions = {
      diction: { vocabulary: 3, sentenceStructure: 3 },
      organization: {
        narrativeStructure: 3,
        timeMarker: 3,
        themeRelevance: 3,
        eventExpansion: 3,
        expressiveness: 3,
      },
      opinion: { narrativeViewpoint: 3 },
    };

    expect(DOOModel.calculateOverallLevel(dims)).toBe(3);
  });

  test('should calculate dimension averages', () => {
    const dims: DOODimensions = {
      diction: { vocabulary: 2, sentenceStructure: 3 },
      organization: {
        narrativeStructure: 2,
        timeMarker: 2,
        themeRelevance: 2,
        eventExpansion: 3,
        expressiveness: 2,
      },
      opinion: { narrativeViewpoint: 2 },
    };

    const averages = DOOModel.calculateDimensionAverage(dims);
    expect(averages.diction).toBe(2.5);
    expect(averages.organization).toBe(2.2);
    expect(averages.opinion).toBe(2);
  });

  test('should generate default suggestions', () => {
    const dims = DOOModel.createEmptyDimensions();
    const suggestions = DOOModel.generateDefaultSuggestions(dims);
    expect(suggestions.length).toBeGreaterThan(0);
  });
});

describe('Observation Points', () => {
  test('should have 8 observation points', () => {
    expect(OBSERVATION_POINTS).toHaveLength(8);
  });

  test('should filter by dimension', () => {
    const dictionPoints = OBSERVATION_POINTS.filter(p => p.dimension === 'diction');
    expect(dictionPoints).toHaveLength(2);

    const orgPoints = OBSERVATION_POINTS.filter(p => p.dimension === 'organization');
    expect(orgPoints).toHaveLength(5);

    const opinionPoints = OBSERVATION_POINTS.filter(p => p.dimension === 'opinion');
    expect(opinionPoints).toHaveLength(1);
  });
});

describe('NLP Components', () => {
  describe('NarrativeParser', () => {
    const parser = new NarrativeParser();

    test('should parse narrative text', () => {
      const text = '有一天，小兔子去找胡萝卜。它走了很久，终于找到了一个大大的胡萝卜。小兔子很高兴。';
      const parsed = parser.parse(text);

      expect(parsed.sentences.length).toBeGreaterThan(0);
      expect(parsed.wordCount).toBeGreaterThan(0);
      expect(parsed.elements.events.length).toBeGreaterThan(0);
    });

    test('should detect narrative structure', () => {
      const text = '早上，我去公园。然后看到了花。最后回家了。';
      const parsed = parser.parse(text);

      expect(parsed.hasBeginning).toBe(true);
      expect(parsed.hasMiddle).toBe(true);
      expect(parsed.hasEnd).toBe(true);
    });
  });

  describe('FeatureExtractor', () => {
    const extractor = new FeatureExtractor();

    test('should extract lexical features', () => {
      const text = '我今天去公园玩，看到了很多漂亮的花。';
      const features = extractor.extract(text);

      expect(features.lexical.wordCount).toBeGreaterThan(0);
      expect(features.lexical.lexicalDiversity).toBeGreaterThan(0);
    });

    test('should extract syntactic features', () => {
      const text = '我今天去公园玩。我看到了花。花很漂亮。';
      const features = extractor.extract(text);

      expect(features.syntactic.sentenceCount).toBe(3);
      expect(features.syntactic.averageSentenceLength).toBeGreaterThan(0);
    });

    test('should extract discourse features', () => {
      const text = '早上我去公园。然后看到了花。最后回家了。';
      const features = extractor.extract(text);

      expect(features.discourse.hasBeginning).toBe(true);
      expect(features.discourse.hasEnd).toBe(true);
    });

    test('should extract semantic features', () => {
      const text = '我很开心。我觉得花很漂亮。';
      const features = extractor.extract(text);

      expect(features.semantic.emotionWords).toBeGreaterThan(0);
      expect(features.semantic.opinionExpressions).toBeGreaterThan(0);
    });
  });
});

describe('Portrait System', () => {
  describe('PortraitEngine', () => {
    const engine = new PortraitEngine();

    test('should create base portrait', () => {
      const portrait = engine.createBasePortrait('child_001', '小明', 'class_001');
      expect(portrait.childId).toBe('child_001');
      expect(portrait.name).toBe('小明');
      expect(portrait.basePortrait.assessments).toHaveLength(0);
    });

    test('should update portrait with assessment', () => {
      const portrait = engine.createBasePortrait('child_001', '小明', 'class_001');
      const assessment = {
        id: 'assess_001',
        childId: 'child_001',
        childName: '小明',
        classId: 'class_001',
        timestamp: new Date(),
        dimensions: DOOModel.createEmptyDimensions(),
        overallLevel: 1 as const,
        suggestions: [],
        narrativeContent: 'test',
        scenario: 'smart_story_corner' as const,
      };

      const updated = engine.updatePortrait(portrait, assessment);
      expect(updated.basePortrait.assessments).toHaveLength(1);
    });

    test('should calculate radar data', () => {
      const dims: DOODimensions = {
        diction: { vocabulary: 2, sentenceStructure: 3 },
        organization: {
          narrativeStructure: 2,
          timeMarker: 2,
          themeRelevance: 2,
          eventExpansion: 3,
          expressiveness: 2,
        },
        opinion: { narrativeViewpoint: 2 },
      };

      const radar = engine.calculateRadarData(dims);
      expect(radar.diction).toBe(2.5);
      expect(radar.organization).toBe(2.2);
      expect(radar.opinion).toBe(2);
    });
  });

  describe('RadarChart', () => {
    const chart = new RadarChart();

    test('should generate ASCII chart', () => {
      const data = { diction: 2.5, organization: 2.0, opinion: 1.5 };
      const ascii = chart.generateASCII(data);

      expect(ascii).toContain('词句维度');
      expect(ascii).toContain('2.5');
    });

    test('should generate SVG', () => {
      const data = { diction: 2, organization: 2, opinion: 2 };
      const svg = chart.generateSVG(data);

      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });
  });
});
