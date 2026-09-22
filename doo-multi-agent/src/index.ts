import { MessageBus } from './core/MessageBus';
import { AgentOrchestrator } from './core/AgentOrchestrator';
import { ExpertAgent } from './agents/ExpertAgent';
import { TeacherAgent } from './agents/TeacherAgent';
import { PeerAgent } from './agents/PeerAgent';
import { PortraitEngine } from './portrait/PortraitEngine';
import { PortraitStorage } from './portrait/PortraitStorage';
import { PostgresStorage } from './portrait/PostgresStorage';
import { IPortraitStorage } from './portrait/IPortraitStorage';
import { RadarChart } from './portrait/RadarChart';
import { AssessmentEngine } from './doo/AssessmentEngine';
import { LLMClient } from './nlp/LLMClient';
import { NarrativeParser } from './nlp/NarrativeParser';
import { FeatureExtractor } from './nlp/FeatureExtractor';
import { SmartStoryCorner } from './scenarios/SmartStoryCorner';
import { NarrativeTrain } from './scenarios/NarrativeTrain';
import { JourneyPodcast } from './scenarios/JourneyPodcast';
import { loadConfig } from './config/default';
import {
  NarrativeInput,
  ScenarioType,
  ChildPortrait,
  DOOAssessment,
} from './core/types';

export class DOOMultiAgentSystem {
  public messageBus: MessageBus;
  public orchestrator: AgentOrchestrator;
  public expertAgent: ExpertAgent;
  public teacherAgent: TeacherAgent;
  public peerAgent: PeerAgent;
  public portraitEngine: PortraitEngine;
  public portraitStorage: IPortraitStorage;
  public radarChart: RadarChart;
  public assessmentEngine: AssessmentEngine;
  public llmClient: LLMClient;
  public narrativeParser: NarrativeParser;
  public featureExtractor: FeatureExtractor;
  public smartStoryCorner: SmartStoryCorner;
  public narrativeTrain: NarrativeTrain;
  public journeyPodcast: JourneyPodcast;

  private initialized: boolean = false;
  /** PostgreSQL 建表等异步初始化：构造期发起，`initialize()` 中统一 await */
  private initPromise: Promise<void> = Promise.resolve();

  constructor() {
    const config = loadConfig();

    // Core infrastructure
    this.messageBus = new MessageBus();
    this.orchestrator = new AgentOrchestrator(this.messageBus);

    // NLP components
    this.llmClient = new LLMClient(config.llm);
    this.narrativeParser = new NarrativeParser();
    this.featureExtractor = new FeatureExtractor();

    // Assessment
    // 是否启用 LLM：
    //  - coze    ：平台托管，凭据自动注入，恒可用
    //  - custom  ：endpoint 由部署方给定，允许免鉴权的自建服务（callCustom 不强制 apiKey）
    //  - openai / anthropic：必须有 key，否则每次调用都抛 LLMConfigError
    const needsApiKey = config.llm.provider === 'openai' || config.llm.provider === 'anthropic';
    const hasApiKey = !!(config.llm.apiKey && config.llm.apiKey.trim());
    const useLLM = !needsApiKey || hasApiKey;
    if (!useLLM) {
      console.warn(
        `⚠️ LLM_PROVIDER=${config.llm.provider} 未提供 LLM_API_KEY —— 已关闭 LLM，全部走规则引擎`
      );
    }
    this.assessmentEngine = new AssessmentEngine(this.llmClient, useLLM, {
      system: config.agents.expert.systemPrompt,
      temperature: config.agents.expert.temperature,
      model: config.agents.expert.model,
    });

    // Portrait system
    this.portraitEngine = new PortraitEngine();
    if (process.env.DATABASE_URL) {
      const pg = new PostgresStorage(process.env.DATABASE_URL);
      this.portraitStorage = pg;
      // 构造函数不能 async，因此这里只发起、不等待；由 initialize() 统一 await。
      // 原先直接 `pg.init().catch(...)` 不 await，冷启动首个请求可能命中「表不存在」。
      // 失败不向上抛：避免一次建表失败让后续所有请求都被拒绝（可用性优先），但会明确告警。
      this.initPromise = pg.init().catch((err: unknown) => {
        console.error('❌ PostgreSQL 初始化失败（数据表可能未创建）:', err instanceof Error ? err.message : err);
      });
      console.log('📦 使用 PostgreSQL 持久化存储');
    } else {
      this.portraitStorage = new PortraitStorage(config.storage);
      this.initPromise = Promise.resolve();
      console.log('📦 使用 JSON 文件存储');
    }
    this.radarChart = new RadarChart();

    // Agents
    this.expertAgent = new ExpertAgent(
      config.agents.expert,
      this.messageBus,
      this.llmClient,
      useLLM,
      // 注入同一个 AssessmentEngine 实例，避免与 this.assessmentEngine 出现两套配置
      this.assessmentEngine
    );
    this.teacherAgent = new TeacherAgent(config.agents.teacher, this.messageBus, this.llmClient, useLLM);
    this.peerAgent = new PeerAgent(config.agents.peer, this.messageBus, this.llmClient, useLLM);

    // Register agents with orchestrator
    this.orchestrator.registerAgent(this.expertAgent);
    this.orchestrator.registerAgent(this.teacherAgent);
    this.orchestrator.registerAgent(this.peerAgent);

    // Scenarios
    this.smartStoryCorner = new SmartStoryCorner(
      this.orchestrator,
      this.portraitEngine,
      this.portraitStorage,
      this.assessmentEngine
    );
    this.narrativeTrain = new NarrativeTrain(
      this.orchestrator,
      this.portraitEngine,
      this.portraitStorage,
      this.assessmentEngine
    );
    this.journeyPodcast = new JourneyPodcast(
      this.orchestrator,
      this.portraitEngine,
      this.portraitStorage
    );
  }

  async initialize(): Promise<void> {
    // 先等待异步基础设施就绪（PostgreSQL 建表等），再标记初始化完成。
    // 并发调用会 await 同一个 Promise，天然幂等。
    await this.initPromise;
    if (this.initialized) return;

    console.log('🚀 DOO多智能体系统初始化中...');
    console.log(`   专家智能体: ${this.expertAgent.name}`);
    console.log(`   助教智能体: ${this.teacherAgent.name}`);
    console.log(`   同伴智能体: ${this.peerAgent.name}`);
    console.log('✅ 系统初始化完成');

    this.initialized = true;
  }

  async assessNarrative(input: NarrativeInput): Promise<DOOAssessment> {
    await this.initialize();
    return this.assessmentEngine.assess(input);
  }

  async runScenario(
    scenario: ScenarioType,
    input: NarrativeInput
  ): Promise<{
    assessment: DOOAssessment;
    portrait: ChildPortrait;
    interactions: unknown[];
    reflections: string[];
  }> {
    await this.initialize();

    let result;
    switch (scenario) {
      case 'smart_story_corner':
        result = await this.smartStoryCorner.run(input);
        break;
      case 'narrative_train':
        result = await this.narrativeTrain.run(input);
        break;
      case 'journey_podcast':
        result = await this.journeyPodcast.run(input);
        break;
      default:
        throw new Error(`Unknown scenario: ${scenario}`);
    }

    // 不再用非空断言掩盖失败：orchestrator 全阶段出错时 assessment 为 undefined，
    // 此时画像也不会写库，`!` 会把 null 谎报为有效值并返回 success:true。
    if (!result.assessment) {
      throw new Error(`场景执行未产生评估结果（scenario=${scenario}）`);
    }

    const portrait = await this.portraitStorage.loadPortrait(input.childId);
    if (!portrait) {
      throw new Error(`评估完成但未找到幼儿画像（childId=${input.childId}）`);
    }

    return {
      assessment: result.assessment,
      portrait,
      interactions: result.interactions,
      reflections: result.reflections,
    };
  }

  async getPortrait(childId: string): Promise<ChildPortrait | null> {
    await this.initialize();
    return this.portraitStorage.loadPortrait(childId);
  }

  async generateRadarChart(childId: string): Promise<string> {
    await this.initialize();
    const portrait = await this.portraitStorage.loadPortrait(childId);
    if (!portrait) {
      throw new Error(`Portrait not found for child: ${childId}`);
    }
    return this.radarChart.generateASCII(portrait.currentRadar);
  }

  async generatePortraitReport(childId: string): Promise<string> {
    await this.initialize();
    const portrait = await this.portraitStorage.loadPortrait(childId);
    if (!portrait) {
      throw new Error(`Portrait not found for child: ${childId}`);
    }
    return this.portraitEngine.generatePortraitSummary(portrait);
  }

  destroy(): void {
    this.orchestrator.destroy();
    this.initialized = false;
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const system = new DOOMultiAgentSystem();
  await system.initialize();

  try {
    switch (command) {
      case 'assess': {
        const content = args[1] || '我今天去公园玩，看到了很多花，很开心。';
        const input: NarrativeInput = {
          childId: 'child_001',
          childName: '小明',
          classId: 'class_001',
          content,
          scenario: 'smart_story_corner',
          timestamp: new Date(),
        };

        console.log('📝 评估叙事内容...');
        console.log(`内容: ${content}`);
        console.log('');

        const assessment = await system.assessNarrative(input);

        console.log('📊 评估结果:');
        console.log(`整体水平: ${assessment.overallLevel}级`);
        console.log(`词句维度: 词汇${assessment.dimensions.diction.vocabulary}级, 句型${assessment.dimensions.diction.sentenceStructure}级`);
        console.log(`组织维度: 结构${assessment.dimensions.organization.narrativeStructure}级, 时间${assessment.dimensions.organization.timeMarker}级, 主题${assessment.dimensions.organization.themeRelevance}级, 扩展${assessment.dimensions.organization.eventExpansion}级, 表现${assessment.dimensions.organization.expressiveness}级`);
        console.log(`观点维度: 观点${assessment.dimensions.opinion.narrativeViewpoint}级`);
        console.log('');
        console.log('💡 发展建议:');
        assessment.suggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
        break;
      }

      case 'scenario': {
        const scenario = (args[1] as ScenarioType) || 'smart_story_corner';
        const content = args[2] || '我今天去公园玩，看到了很多漂亮的花，有红色的、黄色的，还有蓝色的。蝴蝶在花丛中飞来飞去，我觉得特别开心。';

        const input: NarrativeInput = {
          childId: `child_${Date.now()}`,
          childName: '测试小朋友',
          classId: 'class_001',
          content,
          scenario,
          timestamp: new Date(),
        };

        console.log(`🎮 运行场景: ${scenario}`);
        console.log(`内容: ${content}`);
        console.log('');

        const result = await system.runScenario(scenario, input);

        console.log('📊 评估结果:');
        console.log(`整体水平: ${result.assessment.overallLevel}级`);
        console.log('');
        console.log('💡 发展建议:');
        result.assessment.suggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
        console.log('');
        console.log('📈 画像雷达图:');
        console.log(system.radarChart.generateASCII(result.portrait.currentRadar));
        break;
      }

      case 'portrait': {
        const childId = args[1] || 'child_001';
        const portrait = await system.getPortrait(childId);

        if (!portrait) {
          console.log(`❌ 未找到幼儿画像: ${childId}`);
          break;
        }

        console.log(system.portraitEngine.generatePortraitSummary(portrait));
        console.log('');
        console.log('📈 雷达图:');
        console.log(system.radarChart.generateASCII(portrait.currentRadar));
        break;
      }

      case 'report': {
        const childId = args[1] || 'child_001';
        const report = await system.generatePortraitReport(childId);
        console.log(report);
        break;
      }

      case 'demo': {
        console.log('🎬 运行演示模式');
        console.log('');

        const demoInputs: NarrativeInput[] = [
          {
            childId: 'child_001',
            childName: '小明',
            classId: 'class_001',
            content: '我今天去公园玩，看到了很多漂亮的花，有红色的、黄色的，还有蓝色的。蝴蝶在花丛中飞来飞去，我觉得特别开心。',
            scenario: 'smart_story_corner',
            timestamp: new Date(),
          },
          {
            childId: 'child_002',
            childName: '小红',
            classId: 'class_001',
            content: '昨天我和妈妈去动物园，看到了大象。大象的鼻子长长的，耳朵大大的。它用鼻子卷起了香蕉吃，我觉得好厉害。我最喜欢大象了。',
            scenario: 'smart_story_corner',
            timestamp: new Date(),
          },
          {
            childId: 'child_003',
            childName: '小刚',
            classId: 'class_001',
            content: '有一天，小兔子去找胡萝卜。它走了很久，终于找到了一个大大的胡萝卜。小兔子很高兴，因为它可以回家和妈妈一起分享。',
            scenario: 'smart_story_corner',
            timestamp: new Date(),
          },
        ];

        for (const input of demoInputs) {
          console.log(`👶 评估: ${input.childName}`);
          console.log(`📝 ${input.content}`);
          console.log('');

          const result = await system.runScenario('smart_story_corner', input);

          console.log(`📊 整体水平: ${result.assessment.overallLevel}级`);
          console.log('📈 雷达图:');
          console.log(system.radarChart.generateASCII(result.portrait.currentRadar));
          console.log('');
        }

        const portraits = await system.portraitStorage.loadAllPortraits();
        console.log(`📊 班级画像群统计:`);
        console.log(`  总人数: ${portraits.length}`);
        const avgLevel = portraits.reduce((sum, p) => {
          const latest = p.basePortrait.assessments[p.basePortrait.assessments.length - 1];
          return sum + (latest?.overallLevel || 0);
        }, 0) / portraits.length;
        console.log(`  平均等级: ${avgLevel.toFixed(1)}`);
        break;
      }

      default:
        console.log('🎓 DOO多智能体系统 - 大班幼儿叙事能力提升工具');
        console.log('');
        console.log('使用方法:');
        console.log('  npm start assess [叙事内容]     - 评估单条叙事');
        console.log('  npm start scenario [场景类型] [内容] - 运行场景');
        console.log('  npm start portrait [幼儿ID]     - 查看幼儿画像');
        console.log('  npm start report [幼儿ID]       - 生成评估报告');
        console.log('  npm start demo                  - 运行演示');
        console.log('  npm run web                     - 启动网页界面');
        console.log('');
        console.log('场景类型: smart_story_corner, narrative_train, journey_podcast');
    }
  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    system.destroy();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export default DOOMultiAgentSystem;
