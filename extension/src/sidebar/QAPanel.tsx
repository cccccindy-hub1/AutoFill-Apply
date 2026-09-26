import { useState, useCallback } from 'react';
import type { AIModelConfig } from '../types/models';
import { aiConfigDB, personalInfoDB, educationDB, experienceDB } from '../storage/db';
import { llmGenerateAnswer } from '../engine/llmService';
import { generateUserDataSummary} from '../engine/fillOrchestrator';

interface QAProps {
  onStatusUpdate?: (msg: string) => void;
}

/** 开放性问题 AI 回答组件 */
export default function QAPanel({ onStatusUpdate }: QAProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!question.trim()) return;

    setIsGenerating(true);
    onStatusUpdate?.('🤖 正在生成回答...');

    try {
      // 加载配置
      const config = await aiConfigDB.getActive();
      if (!config) {
        onStatusUpdate?.('❌ 请先配置 AI 模型');
        setIsGenerating(false);
        return;
      }

      // 加载用户数据
      const [personalInfo, educations, experiences] = await Promise.all([
        personalInfoDB.get(),
        educationDB.getAll(),
        experienceDB.getAll(),
      ]);

      if (!personalInfo?.name) {
        onStatusUpdate?.('❌ 请先填写个人信息');
        setIsGenerating(false);
        return;
      }

      const userData = {
        personalInfo,
        educations,
        experiences,
        skills: [],
      };

      const summary = generateUserDataSummary(userData);
      const result = await llmGenerateAnswer(config, question.trim(), summary);
      setAnswer(result);
      onStatusUpdate?.('✅ 回答已生成');
    } catch (error) {
      const msg = error instanceof Error ? error.message : '生成失败';
      onStatusUpdate?.(`❌ ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  }, [question, onStatusUpdate]);

  const handleCopy = () => {
    navigator.clipboard.writeText(answer).then(() => {
      onStatusUpdate?.('📋 已复制到剪贴板');
    });
  };

  return (
    <div className="qa-panel">
      <div className="ca-card">
        <h3 style={{ marginBottom: '8px' }}>💬 开放性问题 AI 回答</h3>
        <p style={{ fontSize: '12px', color: 'var(--ca-text-muted)', marginBottom: '12px' }}>
          输入网申中的开放性问题，AI 根据您的个人信息自动生成个性化回答
        </p>

        <div className="ca-form-group">
          <label className="ca-label">问题</label>
          <textarea
            className="ca-input ca-textarea"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="例如：请简述您的职业规划 / 为什么选择我们公司 / 描述一次teamwork经历"
            rows={3}
          />
        </div>

        <div className="qa-presets">
          {[
            '请简述您的职业规划',
            '为什么选择本公司',
            '你的优缺点是什么',
            '描述一次解决困难的经历',
          ].map((preset) => (
            <button
              key={preset}
              className="qa-preset-btn"
              onClick={() => setQuestion(preset)}
            >
              {preset}
            </button>
          ))}
        </div>

        <button
          className="ca-btn ca-btn-primary ca-btn-block"
          onClick={handleGenerate}
          disabled={isGenerating || !question.trim()}
          style={{ marginTop: '12px' }}
        >
          {isGenerating ? (
            <>
              <span className="ca-spinner" /> 生成中...
            </>
          ) : (
            '🤖 生成回答'
          )}
        </button>
      </div>

      {answer && (
        <div className="ca-card" style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3>📝 生成结果</h3>
            <button className="ca-btn ca-btn-outline ca-btn-sm" onClick={handleCopy}>
              📋 复制
            </button>
          </div>
          <div className="qa-answer">{answer}</div>
        </div>
      )}
    </div>
  );
}
