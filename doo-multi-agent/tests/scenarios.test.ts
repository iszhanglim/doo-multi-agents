import { MessageBus } from '../src/core/MessageBus';
import { AgentOrchestrator } from '../src/core/AgentOrchestrator';
import { ExpertAgent } from '../src/agents/ExpertAgent';
import { TeacherAgent } from '../src/agents/TeacherAgent';
import { PeerAgent } from '../src/agents/PeerAgent';
import { PortraitEngine } from '../src/portrait/PortraitEngine';
import { PortraitStorage } from '../src/portrait/PortraitStorage';
import { AssessmentEngine } from '../src/doo/AssessmentEngine';
import { LLMClient } from '../src/nlp/LLMClient';
import { SmartStoryCorner } from '../src/scenarios/SmartStoryCorner';
import { NarrativeTrain } from '../src/scenarios/NarrativeTrain';
import { JourneyPodcast } from '../src/scenarios/JourneyPodcast';
import { loadConfig } from '../src/config/default';
import { NarrativeInput } from '../src/core/types';

describe('Scenarios', () => {
  let messageBus: MessageBus;
  let orchestrator: AgentOrchestrator;
  let portraitEngine: PortraitEngine;
  let portraitStorage: PortraitStorage;
  let assessmentEngine: AssessmentEngine;
  let llmClient: LLMClient;

  beforeEach(() => {
    messageBus = new MessageBus();
    orchestrator = new AgentOrchestrator(messageBus);
    portraitEngine = new PortraitEngine();
    portraitStorage = new PortraitStorage({ type: 'json', path: './test-data' });
    const config = loadConfig();
    llmClient = new LLMClient(config.llm);
    assessmentEngine = new AssessmentEngine(llmClient);

    // Register agents
    const expertAgent = new ExpertAgent(config.agents.expert, messageBus, llmClient);
    const teacherAgent = new TeacherAgent(config.agents.teacher, messageBus);
    const peerAgent = new PeerAgent(config.agents.peer, messageBus);

    orchestrator.registerAgent(expertAgent);
    orchestrator.registerAgent(teacherAgent);
    orchestrator.registerAgent(peerAgent);
  });

  afterEach(() => {
    orchestrator.destroy();
  });

  describe('SmartStoryCorner', () => {
    test('should create scenario', () => {
      const scenario = new SmartStoryCorner(
        orchestrator,
        portraitEngine,
        portraitStorage,
        assessmentEngine
      );
      expect(scenario).toBeDefined();
    });

    test('should generate story prompts', () => {
      const scenario = new SmartStoryCorner(
        orchestrator,
        portraitEngine,
        portraitStorage,
        assessmentEngine
      );
      const prompt = scenario.generateStoryPrompt();
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(0);
    });

    test('should generate language games', () => {
      const scenario = new SmartStoryCorner(
        orchestrator,
        portraitEngine,
        portraitStorage,
        assessmentEngine
      );
      const game = scenario.generateLanguageGame();
      expect(game).toBeDefined();
      expect(game.name).toBeTruthy();
      expect(game.prompt).toBeTruthy();
    });

    test('should generate encouragement messages', () => {
      const scenario = new SmartStoryCorner(
        orchestrator,
        portraitEngine,
        portraitStorage,
        assessmentEngine
      );
      const message = scenario.generateEncouragementMessage();
      expect(message).toBeTruthy();
    });
  });

  describe('NarrativeTrain', () => {
    test('should create scenario', () => {
      const scenario = new NarrativeTrain(orchestrator, portraitEngine, portraitStorage, assessmentEngine);
      expect(scenario).toBeDefined();
    });

    test('should generate game instructions', () => {
      const scenario = new NarrativeTrain(orchestrator, portraitEngine, portraitStorage, assessmentEngine);
      const instructions = scenario.generateGameInstructions('story_chain');
      expect(instructions).toBeDefined();
      expect(instructions.title).toBeTruthy();
      expect(instructions.steps.length).toBeGreaterThan(0);
    });

    test('should generate peer evaluation form', () => {
      const scenario = new NarrativeTrain(orchestrator, portraitEngine, portraitStorage, assessmentEngine);
      const form = scenario.generatePeerEvaluationForm();
      expect(form).toBeDefined();
      expect(form.questions.length).toBeGreaterThan(0);
    });
  });

  describe('JourneyPodcast', () => {
    test('should create scenario', () => {
      const scenario = new JourneyPodcast(orchestrator, portraitEngine, portraitStorage);
      expect(scenario).toBeDefined();
    });

    test('should generate chapter guides', () => {
      const scenario = new JourneyPodcast(orchestrator, portraitEngine, portraitStorage);
      const guide = scenario.generateChapterGuide('birth');
      expect(guide).toBeDefined();
      expect(guide.title).toBeTruthy();
      expect(guide.characters.length).toBeGreaterThan(0);
    });

    test('should generate character cards', () => {
      const scenario = new JourneyPodcast(orchestrator, portraitEngine, portraitStorage);
      const cards = scenario.generateCharacterCards();
      expect(cards.length).toBeGreaterThan(0);
      expect(cards[0].name).toBeTruthy();
    });

    test('should generate narrative drawing prompts', () => {
      const scenario = new JourneyPodcast(orchestrator, portraitEngine, portraitStorage);
      const prompts = scenario.generateNarrativeDrawingPrompt('journey');
      expect(prompts).toBeDefined();
      expect(prompts.drawingPrompts.length).toBeGreaterThan(0);
    });

    test('should generate family discussion guide', () => {
      const scenario = new JourneyPodcast(orchestrator, portraitEngine, portraitStorage);
      const guide = scenario.generateFamilyDiscussionGuide();
      expect(guide).toBeDefined();
      expect(guide.beforeReading.length).toBeGreaterThan(0);
      expect(guide.duringReading.length).toBeGreaterThan(0);
      expect(guide.afterReading.length).toBeGreaterThan(0);
    });

    test('should create and retrieve episodes', () => {
      const scenario = new JourneyPodcast(orchestrator, portraitEngine, portraitStorage);
      const episode = scenario.createEpisode(
        'child_001',
        '小明',
        '我的西游记故事',
        '今天我要讲孙悟空的故事...',
        'birth',
        '孙悟空',
        '孩子讲得很投入'
      );

      expect(episode).toBeDefined();
      expect(episode.title).toBe('我的西游记故事');

      const episodes = scenario.getEpisodes('child_001');
      expect(episodes).toHaveLength(1);
    });

    test('should generate podcast script', () => {
      const scenario = new JourneyPodcast(orchestrator, portraitEngine, portraitStorage);
      const episode = scenario.createEpisode(
        'child_001',
        '小明',
        '我的西游记故事',
        '今天我要讲孙悟空的故事...',
        'birth',
        '孙悟空'
      );

      const script = scenario.generatePodcastScript(episode);
      expect(script).toContain('我的西游记故事');
      expect(script).toContain('小明');
    });
  });
});
