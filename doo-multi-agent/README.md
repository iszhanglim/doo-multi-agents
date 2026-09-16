# DOO多智能体系统

基于DOO多智能体的大班幼儿叙事能力提升工具，用于5-6岁幼儿叙事能力的诊断评估与个性化支持。

## 核心概念

- **DOO**: 叙事能力的三个维度 —— 词句(Diction)、语言组织(Organization)、独白观点(Opinion)
- **多智能体**: D博士(专家)、小欧老师(助教)、多多(同伴) 三个AI角色协同工作
- **评估标准**: 基于《学前儿童语言学习量表》，7个子维度各分3级评分

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 LLM API 密钥

# 运行演示
npm start demo

# 评估单条叙事
npm start assess "我今天去公园玩，看到了很多花，很开心。"

# 运行场景
npm start scenario smart_story_corner "有一天，小兔子去找胡萝卜..."

# 查看幼儿画像
npm start portrait child_001

# 运行测试
npm test

# 启动Web界面（legacy，端口3000）
npm run web

# 启动React前端（端口5173 + 后端端口3001）
cd web && npm install && npm run dev
```

## 目录结构

```
src/
├── core/              # 核心框架：消息总线、智能体基类、编排器
├── agents/            # 三个智能体：D博士、小欧老师、多多
├── doo/               # DOO评估模型：评估引擎、观测点定义
├── nlp/               # NLP模块：LLM客户端、叙事解析、特征提取
├── portrait/          # 画像系统：画像引擎、存储、雷达图
├── scenarios/         # 三个场景：智能故事角、叙事火车、西游播客
├── config/            # 配置管理
├── web/               # Web服务器（legacy）
└── index.ts           # 系统入口和CLI
```

## 三个应用场景

| 场景 | 说明 | 适用 |
|------|------|------|
| 智能故事角 | 个体叙事活动，自适性绘本讲述和语言游戏 | 个别化指导 |
| 叙事火车 | 班级集体活动，小组叙事游戏和同伴互评 | 集体教学 |
| 西游播客 | 《西游记》主题，亲子共读和播客录制 | 家园共育 |

## 配置说明

支持通过环境变量配置（参见 `.env.example`）：

- `LLM_PROVIDER` — LLM提供商（openai/anthropic/custom）
- `LLM_API_KEY` — API密钥
- `LLM_MODEL` — 模型名称（默认 gpt-3.5-turbo）
- `STORAGE_TYPE` — 存储类型（json/sqlite）
- `DATA_PATH` — 数据目录路径

## 技术栈

- **后端**: TypeScript + Node.js
- **前端**: React 19 + Vite 8
- **AI**: 支持 OpenAI / Anthropic / 自定义端点
- **存储**: JSON文件（可扩展SQLite）
- **测试**: Jest
