import { MessageBus } from '../src/core/MessageBus';
import { AgentOrchestrator } from '../src/core/AgentOrchestrator';
import { ExpertAgent } from '../src/agents/ExpertAgent';
import { TeacherAgent } from '../src/agents/TeacherAgent';
import { PeerAgent } from '../src/agents/PeerAgent';
import { LLMClient } from '../src/nlp/LLMClient';
import { DOOModel } from '../src/doo/DOOModel';
import { loadConfig } from '../src/config/default';

describe('Agents', () => {
  let messageBus: MessageBus;
  let orchestrator: AgentOrchestrator;
  let llmClient: LLMClient;

  beforeEach(() => {
    messageBus = new MessageBus();
    orchestrator = new AgentOrchestrator(messageBus);
    const config = loadConfig();
    llmClient = new LLMClient(config.llm);
  });

  afterEach(() => {
    orchestrator.destroy();
  });

  describe('ExpertAgent', () => {
    test('should create expert agent', () => {
      const config = loadConfig();
      const agent = new ExpertAgent(config.agents.expert, messageBus, llmClient);

      expect(agent.type).toBe('expert');
      expect(agent.name).toBe('D博士');

      agent.destroy();
    });

    test('should generate personalized plan', async () => {
      const config = loadConfig();
      const agent = new ExpertAgent(config.agents.expert, messageBus, llmClient);

      const assessment = {
        id: 'test',
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

      const plan = await agent.generatePersonalizedPlan(assessment);
      expect(plan.length).toBeGreaterThan(0);

      agent.destroy();
    });

    test('should generate meta assessment', () => {
      const config = loadConfig();
      const agent = new ExpertAgent(config.agents.expert, messageBus, llmClient);

      const assessments = [
        {
          id: 'a1',
          childId: 'c1',
          childName: 'test',
          classId: 'class1',
          timestamp: new Date('2024-01-01'),
          dimensions: DOOModel.createEmptyDimensions(),
          overallLevel: 1 as const,
          suggestions: [],
          narrativeContent: '',
          scenario: 'smart_story_corner' as const,
        },
        {
          id: 'a2',
          childId: 'c1',
          childName: 'test',
          classId: 'class1',
          timestamp: new Date('2024-06-01'),
          dimensions: DOOModel.createEmptyDimensions(),
          overallLevel: 2 as const,
          suggestions: [],
          narrativeContent: '',
          scenario: 'smart_story_corner' as const,
        },
      ];

      const meta = agent.generateMetaAssessment(assessments);
      expect(meta.trend).toBeDefined();
      expect(meta.recommendation).toBeDefined();

      agent.destroy();
    });
  });

  describe('TeacherAgent', () => {
    test('should create teacher agent', () => {
      const config = loadConfig();
      const agent = new TeacherAgent(config.agents.teacher, messageBus);

      expect(agent.type).toBe('teacher');
      expect(agent.name).toBe('小欧老师');

      agent.destroy();
    });

    test('should generate class report', () => {
      const config = loadConfig();
      const agent = new TeacherAgent(config.agents.teacher, messageBus);

      const assessments = [
        {
          id: 'a1',
          childId: 'c1',
          childName: '小明',
          classId: 'class_001',
          timestamp: new Date(),
          dimensions: DOOModel.createEmptyDimensions(),
          overallLevel: 2 as const,
          suggestions: [],
          narrativeContent: '',
          scenario: 'smart_story_corner' as const,
        },
        {
          id: 'a2',
          childId: 'c2',
          childName: '小红',
          classId: 'class_001',
          timestamp: new Date(),
          dimensions: DOOModel.createEmptyDimensions(),
          overallLevel: 3 as const,
          suggestions: [],
          narrativeContent: '',
          scenario: 'smart_story_corner' as const,
        },
      ];

      const report = agent.generateClassReport('class_001', assessments);
      expect(report).toContain('班级叙事能力评估报告');
      expect(report).toContain('2人');

      agent.destroy();
    });
  });

  describe('PeerAgent', () => {
    test('should create peer agent', () => {
      const config = loadConfig();
      const agent = new PeerAgent(config.agents.peer, messageBus);

      expect(agent.type).toBe('peer');
      expect(agent.name).toBe('多多');

      agent.destroy();
    });

    test('should maintain conversation history', () => {
      const config = loadConfig();
      const agent = new PeerAgent(config.agents.peer, messageBus);

      const childId = 'child_001';
      expect(agent.getConversationHistory(childId)).toHaveLength(0);

      agent.destroy();
    });
  });
});
