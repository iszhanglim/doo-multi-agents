import React, { useState, useEffect, useRef } from 'react';
import { useAssessment } from '../hooks/useAssessment';
import { useConversation } from '../hooks/useConversation';
import { useAuth } from '../context/AuthContext';
import RadarChart from '../components/RadarChart';
import ReportExport from '../components/ReportExport';
import StarRating from '../components/StarRating';
import VoiceInput from '../components/VoiceInput';
import VoiceOutput from '../components/VoiceOutput';
import type { DOOAssessment } from '../types';

const CLASSES = [
  { id: 'class_001', name: '大班一班' },
  { id: 'class_002', name: '大班二班' },
  { id: 'class_003', name: '大班三班' },
  { id: 'class_004', name: '大班四班' },
];

const SCENARIOS = [
  { id: 'smart_story_corner', label: '🎨 智能故事角', desc: '幼儿自主选择绘本讲述，多多陪伴互动' },
  { id: 'narrative_train', label: '🚂 叙事火车', desc: '师幼集体叙事游戏，多多接力讲故事' },
  { id: 'journey_podcast', label: '🎭 西游播客', desc: '亲子家庭叙事活动，多多倾听陪伴' },
];

const AssessPage: React.FC = () => {
  const { user } = useAuth();
  const { assessment, interactions, reflections, report, loading, error, assess, clearAssessment } = useAssessment();
  const conv = useConversation();
  const [mode, setMode] = useState<'assess' | 'conversation'>('assess');
  const [childName, setChildName] = useState('');
  const [content, setContent] = useState('');
  const [scenario, setScenario] = useState('smart_story_corner');
  const [classId, setClassId] = useState('class_001');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (user?.role === 'teacher' && user?.classId) setClassId(user.classId); }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childName.trim() || !content.trim()) return;
    await assess({ childName: childName.trim(), classId, content: content.trim(), scenario, timestamp: new Date() });
  };

  const handleConvStart = async () => { if (!childName.trim()) return; await conv.start(childName.trim(), classId, scenario); };
  const handleChatSend = async () => {
    if (!chatInput.trim() || conv.loading) return;
    const msg = chatInput.trim(); setChatInput('');
    await conv.send(msg);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const currentScenario = SCENARIOS.find(s => s.id === scenario) || SCENARIOS[0];

  return (
    <div className="assess-page animate-fade-in-up">
      <header className="page-header">
        <h1 className="brand-font gradient-text">叙事能力评估</h1>
        <p>D博士、小欧老师和多多将协同完成评估、支架与互动反馈</p>
      </header>

      <div className="mode-toggle">
        <button className={`mode-tab ${mode === 'assess' ? 'active' : ''}`} onClick={() => setMode('assess')}>📝 评估模式</button>
        <button className={`mode-tab ${mode === 'conversation' ? 'active' : ''}`} onClick={() => setMode('conversation')}>💬 对话模式</button>
      </div>

      {mode === 'conversation' && (
        <div className="conv-layout">
          <div className="conv-sidebar">
            <div className="assess-form">
              <div className="form-group"><label>幼儿姓名</label><input type="text" className="input-field" placeholder="请输入幼儿姓名" value={childName} onChange={(e) => setChildName(e.target.value)} /></div>
              <div className="form-group"><label>所属班级</label>
                {user?.role === 'teacher' && user?.classId ? <input type="text" className="input-field" value={CLASSES.find(c => c.id === user.classId)?.name || user.classId} disabled readOnly />
                  : <select className="input-field" value={classId} onChange={(e) => setClassId(e.target.value)}>{CLASSES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
              </div>
              <div className="form-group"><label>评估场景</label>
                <select className="input-field" value={scenario} onChange={(e) => setScenario(e.target.value)}>{SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
              </div>
              {conv.status === 'idle' ? <button className="btn-primary" onClick={handleConvStart} disabled={!childName.trim() || conv.loading}>{conv.loading ? '⏳ 创建中...' : '🚀 开始对话'}</button>
                : <button className="btn-secondary" onClick={conv.reset}>🔄 重新开始</button>}
              {conv.status === 'chatting' && <div className="conv-progress"><span>第 {conv.turnCount} / {conv.maxTurns} 轮</span><button className="btn-end" onClick={conv.end} disabled={conv.loading}>{conv.loading ? '评估中...' : '📊 结束并评估'}</button></div>}
            </div>
            <div className="scenario-hint"><span className="scenario-hint-label">当前场景</span><span className="scenario-hint-text">{currentScenario.label}</span><span className="scenario-hint-desc">{currentScenario.desc}</span></div>
          </div>
          <div className="conv-chat-area">
            {conv.status === 'idle' && <div className="conv-empty"><div className="conv-empty-icon">💬</div><p>输入幼儿姓名，选择场景，点击"开始对话"</p><p className="conv-empty-hint">多多会和孩子进行多轮对话，最后汇总评估</p></div>}
            {(conv.status === 'chatting' || conv.status === 'assessing') && (
              <div className="conv-chat">
                <div className="chat-header"><span>🧒 {childName || '小朋友'} 与 {conv.agentName === '小欧老师' ? '👩‍🏫 小欧老师' : '🤖 多多'}的对话</span><span className="chat-round">第 {conv.turnCount} 轮</span></div>
                <div className="chat-messages">
                  {conv.messages.map(msg => (<div key={msg.id} className={`chat-bubble ${msg.role === 'child' ? 'child-bubble' : 'peer-bubble'}`}><div className="bubble-avatar">{msg.role === 'child' ? '🧒' : conv.agentName === '小欧老师' ? '👩‍🏫' : '🤖'}</div><div className="bubble-content">{msg.content}{msg.role === 'peer' && <VoiceOutput text={msg.content} />}</div></div>))}
                  {conv.loading && <div className="chat-bubble peer-bubble"><div className="bubble-avatar">{conv.agentName === '小欧老师' ? '👩‍🏫' : '🤖'}</div><div className="bubble-content typing">{conv.agentName === '小欧老师' ? '小欧老师正在思考...' : '多多正在思考...'}</div></div>}<div ref={chatEndRef} />
                </div>
                {conv.status === 'chatting' && (
                  <div className="chat-input-area">
                    <div className="chat-input-row"><input type="text" className="chat-input" placeholder="输入孩子的回答..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleChatSend()} disabled={conv.loading} /><button className="chat-send-btn" onClick={handleChatSend} disabled={!chatInput.trim() || conv.loading}>发送</button></div>
                    <div className="chat-voice-row"><VoiceInput onTranscript={(text) => setChatInput(prev => prev ? prev + text : text)} /></div>
                  </div>)}
                {conv.status === 'assessing' && <div className="chat-assessing"><span className="spinner" /> 三智能体正在协同评估中...</div>}
              </div>)}
            {conv.status === 'done' && conv.assessment && <div className="conv-result"><ResultView childName={childName} assessment={conv.assessment} suggestions={conv.assessment.suggestions || []} interactions={conv.interactions || []} reflections={conv.reflections || []} messages={conv.messages} agentName={conv.agentName} /></div>}
          </div>
        </div>
      )}

      {mode === 'assess' && (
        <div className="assess-layout">
          <div className="assess-form-container">
            <form onSubmit={handleSubmit} className="assess-form">
              <div className="form-group"><label>幼儿姓名</label><input type="text" className="input-field" placeholder="请输入幼儿姓名" value={childName} onChange={(e) => setChildName(e.target.value)} required /></div>
              <div className="form-group"><label>所属班级</label>
                {user?.role === 'teacher' && user?.classId ? <input type="text" className="input-field" value={CLASSES.find(c => c.id === user.classId)?.name || user.classId} disabled readOnly />
                  : <select className="input-field" value={classId} onChange={(e) => setClassId(e.target.value)}>{CLASSES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
              </div>
              <div className="form-group"><label>评估场景</label><select className="input-field" value={scenario} onChange={(e) => setScenario(e.target.value)}>{SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
              <div className="form-group">
                <label>叙事内容 <VoiceInput onTranscript={(text) => setContent(prev => { const t = prev.trim(); if (!t) return text; return t + (/[。！？，、；：]$/.test(t.slice(-1)) ? '' : '。') + text; })} /></label>
                <textarea className="input-field" rows={6} placeholder="请记录幼儿的叙事内容..." value={content} onChange={(e) => setContent(e.target.value)} required />
                <span className="char-count">{content.length} 字</span>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={loading}>{loading ? <><span className="spinner" /> 评估中...</> : <>🎯 开始评估</>}</button>
                {assessment && <button type="button" className="btn-secondary" onClick={clearAssessment}>重新评估</button>}
              </div>
            </form>
            {error && <div className="error-message">❌ {error}</div>}
          </div>
          {assessment && assessment.dimensions && <div className="assess-results"><ResultView childName={childName} assessment={assessment} suggestions={assessment.suggestions || []} interactions={interactions} reflections={reflections} messages={[]} agentName="多多" report={report} /></div>}
        </div>
      )}

      <style>{`
        .assess-page{max-width:1200px;margin:0 auto}.page-header{margin-bottom:20px}.page-header h1{font-size:28px;margin-bottom:8px}.page-header p{color:var(--text-secondary);font-size:15px}
        .mode-toggle{display:flex;gap:4px;background:#fff;border-radius:var(--radius-lg);padding:4px;box-shadow:var(--shadow-soft);margin-bottom:20px;width:fit-content}.mode-tab{padding:10px 24px;border:none;border-radius:var(--radius-md);cursor:pointer;font-size:14px;font-weight:600;background:transparent;color:var(--text-secondary)}.mode-tab.active{background:linear-gradient(135deg,#FF8C42,#6B5B95);color:#fff}
        .conv-layout{display:grid;grid-template-columns:320px 1fr;gap:20px;align-items:start}.conv-sidebar{position:sticky;top:24px}.assess-form{background:#fff;border-radius:var(--radius-lg);padding:22px;box-shadow:var(--shadow-soft);margin-bottom:14px}.form-group{margin-bottom:14px}.form-group label{display:block;font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px}.form-group textarea{resize:vertical;min-height:130px}.char-count{display:block;text-align:right;font-size:12px;color:var(--text-light);margin-top:4px}.form-actions{display:flex;gap:10px;margin-top:18px}.conv-progress{margin-top:10px;display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-secondary)}.btn-end{padding:6px 14px;border:none;border-radius:var(--radius-md);background:linear-gradient(135deg,#FF8C42,#FF6B6B);color:#fff;font-weight:600;cursor:pointer;font-size:13px}.btn-end:disabled{opacity:.6;cursor:not-allowed}
        .scenario-hint{background:#fff;border-radius:var(--radius-lg);padding:14px;box-shadow:var(--shadow-soft)}.scenario-hint-label{display:block;font-size:12px;color:var(--text-light)}.scenario-hint-text{display:block;font-size:15px;font-weight:700;color:var(--text-primary)}.scenario-hint-desc{display:block;font-size:13px;color:var(--text-light);margin-top:4px}
        .conv-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:var(--text-light);background:#fff;border-radius:var(--radius-lg);box-shadow:var(--shadow-soft)}.conv-empty-icon{font-size:48px;margin-bottom:14px}.conv-empty-hint{font-size:13px}
        .conv-chat{background:#fff;border-radius:var(--radius-lg);box-shadow:var(--shadow-soft);display:flex;flex-direction:column;height:500px}.chat-header{padding:10px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:14px}.chat-round{font-size:12px;color:var(--text-light);background:var(--bg-warm);padding:3px 8px;border-radius:12px}.chat-messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#FAFAFA}.chat-bubble{display:flex;gap:8px;max-width:80%}.child-bubble{align-self:flex-end;flex-direction:row-reverse}.bubble-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}.peer-bubble .bubble-avatar{background:#EDE7F6}.child-bubble .bubble-avatar{background:#FFF3E0}.bubble-content{padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.6}.peer-bubble .bubble-content{background:#F3E5F5;color:#4A148C;border-bottom-left-radius:4px}.child-bubble .bubble-content{background:#FFF3E0;color:#E65100;border-bottom-right-radius:4px}.typing{color:var(--text-light)!important;font-style:italic;background:#F5F5F5!important}.chat-input-area{padding:10px 14px;border-top:1px solid var(--border)}.chat-input-row{display:flex;gap:8px}.chat-input{flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:20px;font-size:14px;outline:none}.chat-input:focus{border-color:#FF8C42}.chat-send-btn{padding:8px 18px;border:none;border-radius:20px;background:linear-gradient(135deg,#FF8C42,#6B5B95);color:#fff;font-weight:600;cursor:pointer;font-size:14px}.chat-send-btn:disabled{opacity:.5;cursor:not-allowed}.chat-voice-row{padding-top:6px;border-top:1px solid var(--border);margin-top:6px}.chat-assessing{padding:16px;text-align:center;color:var(--text-secondary);font-size:14px;border-top:1px solid var(--border)}.conv-result{padding:16px}
        .assess-layout{display:grid;grid-template-columns:400px 1fr;gap:20px;align-items:start}.assess-form-container{position:sticky;top:24px}.assess-results{display:flex;flex-direction:column;gap:14px}
        .result-card{background:#fff;border-radius:var(--radius-lg);padding:22px;box-shadow:var(--shadow-soft);margin-bottom:14px}.result-card h3{font-size:16px;margin:0 0 12px;color:var(--text-primary)}
        .overall-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.overall-header h2{font-size:20px}.level-badge{padding:6px 14px;border-radius:20px;font-size:14px;font-weight:600}
        .radar-section{display:flex;justify-content:center;padding:10px 0}
        .dimension-group{margin-bottom:16px}.dimension-header{display:flex;align-items:center;gap:6px;margin-bottom:6px}.dimension-icon{font-size:16px}.dimension-name{font-weight:600;font-size:15px}.dimension-bars{display:flex;flex-direction:column;gap:5px;padding-left:22px}.dim-bar{display:flex;align-items:center;gap:8px}.dim-bar>span:first-child{width:70px;font-size:13px;color:var(--text-secondary);flex-shrink:0}.bar-track{flex:1;height:8px;background:var(--bg-warm);border-radius:4px;overflow:hidden}.bar-fill{height:100%;border-radius:4px;transition:width .8s ease-out}.bar-value{width:20px;text-align:right;font-weight:600;font-size:13px}
        .collaboration-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .collaboration-panel{border-radius:var(--radius-md);padding:16px}
        .teacher-panel{background:linear-gradient(135deg,rgba(255,140,66,.08) 0%,rgba(255,140,66,.14) 100%)}.teacher-panel h4{margin:0 0 10px;font-size:15px}
        .teacher-report-section{margin-bottom:10px}.teacher-report-section h5{margin:0 0 3px;font-size:13px;color:var(--text-primary)}.teacher-report-section p{margin:0;font-size:13px;color:var(--text-secondary);line-height:1.7}
        .teacher-report-section p.activity-case{white-space:pre-line;line-height:1.9;background:rgba(255,255,255,.6);border-radius:8px;padding:10px 12px;border-left:3px solid var(--primary)}
        .teacher-report-section p.teacher-advice{white-space:pre-line;line-height:1.7}
        .db-report-text{white-space:pre-line;line-height:1.8;font-family:'Noto Sans SC',sans-serif;font-size:13px;color:var(--text-secondary);background:#F8F8FC;border-radius:10px;padding:16px;margin:0;border-left:3px solid #6B5B95}
        .teacher-scaffold-list{list-style:decimal;padding:0 0 0 20px;margin:8px 0 0}.teacher-scaffold-list li{padding:4px 0;font-size:13px;color:var(--text-secondary);line-height:1.6;border-bottom:1px solid rgba(0,0,0,.04)}
        .peer-panel{background:linear-gradient(135deg,rgba(107,91,149,.08) 0%,rgba(107,91,149,.14) 100%)}.peer-panel h4{margin:0 0 10px;font-size:15px}.peer-message-card{background:rgba(255,255,255,.78);border-radius:10px;padding:10px;margin-bottom:6px}.peer-message-card p{margin:4px 0 0;color:var(--text-secondary);line-height:1.6}
        .empty-collab{color:var(--text-light);font-size:13px}
        .spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;margin-right:6px}@keyframes spin{to{transform:rotate(360deg)}}.error-message{margin-top:10px;padding:10px;background:#FEE2E2;color:#DC2626;border-radius:var(--radius-md);font-size:14px}
        @media(max-width:1024px){.assess-layout,.conv-layout{grid-template-columns:1fr}.assess-form-container{position:static}.collaboration-grid{grid-template-columns:1fr}}
        @media(max-width:480px){.conv-chat{height:380px}.result-card{padding:14px}}
      `}</style>
    </div>
  );
};

function ResultView({ childName, assessment, suggestions, interactions, reflections, messages, agentName, report }: {
  childName: string; assessment: DOOAssessment; suggestions: string[];
  interactions: any[]; reflections: string[]; messages: any[]; agentName?: string; report?: string;
}) {
  const gc = (l: number) => l < 3 ? '#FF6B6B' : l < 4 ? '#FFB347' : '#4ADE80';
  const cl = (d: DOOAssessment['dimensions']) => {
    const scores = [
      d.diction.vocabulary, d.diction.sentenceStructure,
      d.organization.narrativeStructure, d.organization.timeMarker,
      d.organization.themeRelevance, d.organization.eventExpansion,
      d.organization.expressiveness, d.opinion.narrativeViewpoint,
    ];
    const avg = scores.reduce((s, v) => s + v, 0) / 8;
    return Math.max(1, Math.min(5, Math.round(avg)));
  };
  const level = cl(assessment.dimensions);

  // 提取小欧老师数据
  const teacherMsgs = interactions.filter((m: any) => m.type === 'suggestion' && m.from === 'teacher');
  const teacherNotes = teacherMsgs.flatMap((m: any) => m.payload?.teachingNotes || []);
  const scaffoldItems = teacherMsgs.flatMap((m: any) => m.payload?.scaffoldSuggestions || []);
  const peerMsgs = interactions.filter((m: any) => m.from === 'peer').map((m: any) => m.payload?.message).filter(Boolean);

  return (<>
    <div className="result-card overall">
      <div className="overall-header"><h2>评估结果</h2><div className="level-badge" style={{ background: `${gc(level)}20`, color: gc(level) }}>
        <StarRating score={level} />
      </div></div>
      <div className="radar-section"><RadarChart data={{ diction: ((assessment.dimensions.diction?.vocabulary || 0) + (assessment.dimensions.diction?.sentenceStructure || 0)) / 2, organization: ((assessment.dimensions.organization?.narrativeStructure || 0) + (assessment.dimensions.organization?.timeMarker || 0) + (assessment.dimensions.organization?.themeRelevance || 0) + (assessment.dimensions.organization?.eventExpansion || 0) + (assessment.dimensions.organization?.expressiveness || 0)) / 5, opinion: assessment.dimensions.opinion?.narrativeViewpoint || 0 }} /></div>
    </div>

    <div className="result-card dimensions"><h3>详细维度分析</h3>
      {[['📝','词句维度',[['词汇丰富度',assessment.dimensions.diction?.vocabulary,'#FF8C42'],['句型复杂度',assessment.dimensions.diction?.sentenceStructure,'#FF8C42']]],['🧩','组织维度',[['叙事结构',assessment.dimensions.organization?.narrativeStructure,'#6B5B95'],['时间标记',assessment.dimensions.organization?.timeMarker,'#6B5B95'],['主题关联',assessment.dimensions.organization?.themeRelevance,'#6B5B95'],['事件扩展',assessment.dimensions.organization?.eventExpansion,'#6B5B95'],['表现力',assessment.dimensions.organization?.expressiveness,'#6B5B95']]],['💭','观点维度',[['叙事观点',assessment.dimensions.opinion?.narrativeViewpoint,'#88D8B0']]]].map(([icon,name,bars]) => (
        <div key={name as string} className="dimension-group"><div className="dimension-header"><span className="dimension-icon">{icon as string}</span><span className="dimension-name">{name as string}</span></div>
          <div className="dimension-bars">{(bars as any[]).map(([l,v,c]: [string,number,string]) => (<div key={l} className="dim-bar"><span>{l}</span><div className="bar-track"><div className="bar-fill" style={{width:`${((v||0)/5)*100}%`,background:c}}/></div><span className="bar-value">{v||0}分</span></div>))}</div></div>))}
    </div>

    {suggestions.length > 0 && <div className="result-card"><h3>💡 发展建议</h3><ul style={{margin:0,paddingLeft:18}}>{suggestions.map((s,i) => <li key={i} style={{color:'var(--text-secondary)',lineHeight:1.7,marginBottom:4}}>{s}</li>)}</ul></div>}

    {/* 多智能体协同反馈 */}
    {(teacherNotes.length > 0 || scaffoldItems.length > 0 || peerMsgs.length > 0) && (
      <div className="result-card"><h3>🤝 多智能体协同反馈</h3>
        <div className="collaboration-grid">
          <div className="collaboration-panel teacher-panel">
            <h4>👩‍🏫 小欧老师</h4>
            {teacherNotes.length > 0 ? (
              <div>
                <div className="teacher-report-section"><h5>📋 本次观察结果</h5><p>{teacherNotes[0]}</p></div>
                {teacherNotes[1] && <div className="teacher-report-section"><h5>💡 整体建议</h5><p className="teacher-advice">{teacherNotes[1]}</p></div>}
                {teacherNotes[2] && <div className="teacher-report-section"><h5>🔜 下次活动提示</h5><p className="activity-case">{teacherNotes[2]}</p></div>}
                {scaffoldItems.length > 0 && (
                  <div className="teacher-report-section">
                    <h5>📌 DOO支架建议</h5>
                    <ul className="teacher-scaffold-list">{scaffoldItems.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                  </div>
                )}
              </div>
            ) : <p className="empty-collab">暂无数据</p>}
          </div>
          <div className="collaboration-panel peer-panel">
            <h4>🧒 多多同伴回应</h4>
            {peerMsgs.length > 0 ? <div>{peerMsgs.map((msg: string, i: number) => <div key={i} className="peer-message-card"><p>{msg}</p></div>)}</div> : <p className="empty-collab">暂未生成。</p>}
          </div>
        </div>
      </div>
    )}

    {reflections.length > 0 && <div className="result-card"><h3>🔁 反思优化</h3><ul style={{margin:0,paddingLeft:18}}>{reflections.map((r,i) => <li key={i} style={{color:'var(--text-secondary)',lineHeight:1.7,marginBottom:4}}>{r}</li>)}</ul></div>}

    {messages.length > 0 && (
      <div className="result-card"><h3>📝 完整对话记录</h3><div className="chat-messages" style={{maxHeight:'none'}}>
        {messages.map((msg: any) => (<div key={msg.id} className={`chat-bubble ${msg.role === 'child' ? 'child-bubble' : 'peer-bubble'}`}><div className="bubble-avatar">{msg.role === 'child' ? '🧒' : agentName === '小欧老师' ? '👩‍🏫' : '🤖'}</div><div className="bubble-content">{msg.content}{msg.role === 'peer' && <VoiceOutput text={msg.content} autoPlay={false} />}</div></div>))}
      </div></div>
    )}

    {report && (
      <div className="result-card db-report">
        <h3>🔬 D博士个体评估报告</h3>
        <pre className="db-report-text">{report}</pre>
      </div>
    )}

    <ReportExport childName={childName} assessment={assessment} />
  </>);
}

export default AssessPage;
