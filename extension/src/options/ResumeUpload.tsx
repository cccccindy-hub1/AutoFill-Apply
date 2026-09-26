import { useState, useRef } from 'react';
import { aiConfigDB } from '../storage/db';
import {
  extractTextFromPDF,
  extractTextFromWord,
  extractTextFromFile,
  parseResumeText,
  saveResumeData,
  type ResumeParseResult,
} from '../engine/resumeParser';

interface ResumeUploadProps {
  onComplete?: () => void;
}

/** 简历上传解析组件 */
export default function ResumeUpload({ onComplete }: ResumeUploadProps) {
  const [status, setStatus] = useState<'idle' | 'extracting' | 'parsing' | 'saving' | 'done' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [parseResult, setParseResult] = useState<ResumeParseResult | null>(null);
  const [saveResult, setSaveResult] = useState<{ saved: string[]; skipped: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB限制
    if (file.size > maxSize) {
      setStatus('error');
      setStatusMessage('文件大小超过 10MB 限制');
      return;
    }

    try {
      // Step 1: 提取文本
      setStatus('extracting');
      setStatusMessage(`正在从 ${file.name} 中提取文本...`);

      let text: string;
      const fileName = file.name.toLowerCase();
      if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
        text = await extractTextFromPDF(file);
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileName.endsWith('.docx')
      ) {
        text = await extractTextFromWord(file);
      } else {
        text = await extractTextFromFile(file);
      }

      if (text.length < 30) {
        throw new Error('提取的文本内容太少，请确认文件是否正确');
      }

      setStatusMessage(`已提取 ${text.length} 个字符，正在智能解析...`);

      // Step 2: AI 结构化解析
      setStatus('parsing');
      const aiConfig = await aiConfigDB.getActive();
      if (!aiConfig) {
        setStatus('error');
        setStatusMessage('请先在「AI 模型配置」中配置并激活一个 AI 模型');
        return;
      }

      const result = await parseResumeText(text, aiConfig);
      setParseResult(result);

      if (!result.success) {
        setStatus('error');
        setStatusMessage(`解析失败：${result.message}`);
        return;
      }

      setStatusMessage('解析成功，正在保存数据...');

      // Step 3: 保存到本地
      setStatus('saving');
      const saved = await saveResumeData(result.data);
      setSaveResult(saved);

      setStatus('done');
      const savedMsg = saved.saved.length > 0 ? `已保存：${saved.saved.join('、')}` : '';
      const skippedMsg = saved.skipped.length > 0 ? `已跳过：${saved.skipped.join('、')}` : '';
      setStatusMessage([savedMsg, skippedMsg].filter(Boolean).join('。'));

      onComplete?.();
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : '解析失败');
    }

    // 重置 input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getStepBadge = (step: string, current: boolean, done: boolean) => (
    <div className={`resume-step ${done ? 'done' : current ? 'active' : ''}`}>
      <span className="resume-step-icon">{done ? '✅' : current ? '⏳' : '○'}</span>
      <span>{step}</span>
    </div>
  );

  return (
    <div className="resume-upload">
      <h3 style={{ marginBottom: '4px' }}>📄 简历智能解析</h3>
      <p style={{ fontSize: '12px', color: 'var(--ca-text-muted)', marginBottom: '12px' }}>
        上传简历文件，AI 自动提取并填充个人信息（支持 Word / PDF / TXT / Markdown）
      </p>

      {/* 上传区域 */}
      <div
        className="resume-upload-zone"
        onClick={() => fileInputRef.current?.click()}
        style={{ cursor: status === 'idle' || status === 'done' || status === 'error' ? 'pointer' : 'default' }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.pdf,.txt,.md,.markdown"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          disabled={status === 'extracting' || status === 'parsing' || status === 'saving'}
        />
        {status === 'idle' && (
          <>
            <div className="resume-upload-icon">📁</div>
            <p>点击选择简历文件</p>
            <p style={{ fontSize: '11px', color: 'var(--ca-text-muted)' }}>
              支持 Word(.docx)、PDF、TXT、Markdown
            </p>
          </>
        )}
        {(status === 'extracting' || status === 'parsing' || status === 'saving') && (
          <>
            <div className="ca-spinner" style={{ width: '24px', height: '24px', marginBottom: '8px' }} />
            <p>{statusMessage}</p>
          </>
        )}
        {status === 'done' && (
          <>
            <div className="resume-upload-icon">✅</div>
            <p>解析完成！点击上传新的简历</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="resume-upload-icon">❌</div>
            <p>{statusMessage}</p>
            <p style={{ fontSize: '11px', color: 'var(--ca-text-muted)', marginTop: '4px' }}>
              点击重新选择文件
            </p>
          </>
        )}
      </div>

      {/* 进度步骤 */}
      {status !== 'idle' && (
        <div className="resume-steps">
          {getStepBadge('文本提取', status === 'extracting', ['parsing', 'saving', 'done'].includes(status))}
          {getStepBadge('AI 解析', status === 'parsing', ['saving', 'done'].includes(status))}
          {getStepBadge('数据保存', status === 'saving', status === 'done')}
        </div>
      )}

      {/* 解析结果预览 */}
      {parseResult?.success && parseResult.data && (
        <div className="resume-result">
          <h4 style={{ marginBottom: '8px' }}>解析结果预览</h4>
          {parseResult.data.personalInfo?.name && (
            <div className="resume-result-item">
              <span className="resume-result-label">姓名</span>
              <span>{parseResult.data.personalInfo.name}</span>
            </div>
          )}
          {parseResult.data.personalInfo?.phone && (
            <div className="resume-result-item">
              <span className="resume-result-label">手机</span>
              <span>{parseResult.data.personalInfo.phone}</span>
            </div>
          )}
          {parseResult.data.personalInfo?.email && (
            <div className="resume-result-item">
              <span className="resume-result-label">邮箱</span>
              <span>{parseResult.data.personalInfo.email}</span>
            </div>
          )}
          {parseResult.data.educations?.map((edu, i) => (
            <div key={i} className="resume-result-item">
              <span className="resume-result-label">教育{i + 1}</span>
              <span>{edu.school} · {edu.major} · {edu.type}</span>
            </div>
          ))}
          {parseResult.data.experiences?.map((exp, i) => (
            <div key={i} className="resume-result-item">
              <span className="resume-result-label">{exp.type || '经历'}{i + 1}</span>
              <span>{exp.organization} · {exp.role}</span>
            </div>
          ))}
        </div>
      )}

      {/* 保存结果 */}
      {saveResult && (
        <div className="resume-save-result" style={{ marginTop: '8px', fontSize: '12px' }}>
          {saveResult.saved.length > 0 && (
            <p style={{ color: 'var(--ca-success)' }}>✅ {saveResult.saved.join('、')}</p>
          )}
          {saveResult.skipped.length > 0 && (
            <p style={{ color: 'var(--ca-warning)' }}>⚠️ {saveResult.skipped.join('、')}</p>
          )}
        </div>
      )}
    </div>
  );
}
