// ============================================================
// 填充编排器
// 协调 扫描→匹配→填充→校验 的完整流程
// ============================================================

import type { FormField, FillResult, FillFieldResult, AIModelConfig } from '../types/models';
import { matchAllFields, type UserDataContext, type MatchResult } from './matchingEngine';
import { llmMatchField } from './llmService';
import {
  personalInfoDB,
  educationDB,
  experienceDB,
  skillDB,
  aiConfigDB,
} from '../storage/db';

/** 填充进度回调 */
export type FillProgressCallback = (step: string, progress: number) => void;

/**
 * 执行完整的一键填充流程
 */
export async function executeFullFill(
  tabId: number,
  onProgress?: FillProgressCallback
): Promise<FillResult> {
  const startTime = new Date().toISOString();

  try {
    // ===== Step 1：加载用户数据 =====
    onProgress?.('正在加载用户数据...', 10);

    const userData = await loadUserData();
    if (!userData.personalInfo.name) {
      throw new Error('请先在「个人信息管理」中填写基本信息');
    }

    // ===== Step 2：扫描页面表单 =====
    onProgress?.('正在扫描页面表单...', 25);

    const fields = await scanPageFields(tabId);
    if (fields.length === 0) {
      throw new Error('当前页面未发现可填充的表单字段');
    }

    onProgress?.(`发现 ${fields.length} 个字段，开始匹配...`, 40);

    // ===== Step 3：执行字段匹配 =====
    const matchResults = matchAllFields(fields, userData);

    // 对未匹配到的字段，尝试 LLM 兜底
    const aiConfig = await aiConfigDB.getActive();
    if (aiConfig) {
      onProgress?.('正在使用 AI 进行智能匹配...', 55);
      await llmFallbackMatch(matchResults, fields, aiConfig, userData);
    }

    // ===== Step 4：过滤有效匹配并执行填充 =====
    onProgress?.('正在填充表单...', 70);

    const fillData = matchResults
      .filter((m) => m.value && m.confidence > 0.3)
      .map((m) => ({
        fieldId: m.fieldId,
        value: m.value,
        type: getFieldType(fields.find((f) => f.id === m.fieldId)),
      }));

    const fillResults = await executePageFill(tabId, fillData);

    // ===== Step 5：生成结果统计 =====
    onProgress?.('填充完成，正在校验...', 90);

    const endTime = new Date().toISOString();

    // 合并匹配和填充结果
    const fieldResults: FillFieldResult[] = matchResults.map((match) => {
      const fillResult = fillResults.find((r) => r.fieldId === match.fieldId);
      const field = fields.find((f) => f.id === match.fieldId);

      if (fillResult) {
        return {
          ...fillResult,
          matchedFrom: match.matchedBy,
          confidence: match.confidence,
        };
      }

      return {
        fieldId: match.fieldId,
        label: field?.label || match.label,
        type: (getFieldType(field) as FillFieldResult['type']) || 'unknown',
        status: match.value ? ('pending' as const) : ('skipped' as const),
        filledValue: match.value || undefined,
        matchedFrom: match.matchedBy,
        confidence: match.confidence,
        errorMessage: match.value ? '匹配到数据但未执行填充' : '未找到匹配的用户数据',
      };
    });

    const result: FillResult = {
      totalFields: fields.length,
      successFields: fieldResults.filter((r) => r.status === 'success').length,
      failedFields: fieldResults.filter((r) => r.status === 'failed').length,
      pendingFields: fieldResults.filter((r) => r.status === 'pending' || r.status === 'skipped').length,
      fields: fieldResults,
      startTime,
      endTime,
    };

    onProgress?.(`✅ 完成！成功 ${result.successFields}/${result.totalFields}`, 100);

    return result;
  } catch (error) {
    throw error;
  }
}

// =================== 内部函数 ===================

/** 加载所有用户数据 */
async function loadUserData(): Promise<UserDataContext> {
  const [personalInfo, educations, experiences, skills] = await Promise.all([
    personalInfoDB.get(),
    educationDB.getAll(),
    experienceDB.getAll(),
    skillDB.getAll(),
  ]);

  const emptyInfo = {
    id: '', name: '', gender: '' as const, birthDate: '', phone: '', email: '',
    targetCities: [], targetPositions: [], createdAt: '', updatedAt: '',
  };

  return {
    personalInfo: personalInfo || emptyInfo,
    educations: educations.sort((a, b) => a.order - b.order),
    experiences: experiences.sort((a, b) => a.order - b.order),
    skills,
  };
}

/** 扫描页面表单字段 */
function scanPageFields(tabId: number): Promise<FormField[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'SCAN_FORM_FIELDS' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error('无法连接到页面，请刷新后重试'));
        return;
      }
      if (response?.success) {
        resolve(response.fields);
      } else {
        reject(new Error('页面扫描失败'));
      }
    });
  });
}

/** 执行页面填充 */
function executePageFill(
  tabId: number,
  data: { fieldId: string; value: string; type?: string }[]
): Promise<FillFieldResult[]> {
  return new Promise((resolve, reject) => {
    // 自定义下拉/日期组件需要逐个展开面板，耗时较长，超时兜底避免一直挂起
    const timeout = setTimeout(() => {
      reject(new Error('填充超时，请重试或减少单次填充字段数'));
    }, 60_000);

    try {
      chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_FILL', data }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error('填充执行失败'));
          return;
        }
        if (response?.success) {
          resolve(response.results);
        } else {
          reject(new Error(response?.error || '填充执行失败'));
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error('填充执行失败'));
    }
  });
}

/** LLM 兜底匹配 */
async function llmFallbackMatch(
  matchResults: MatchResult[],
  fields: FormField[],
  aiConfig: AIModelConfig,
  userData: UserDataContext
): Promise<void> {
  // 汇总用户数据为文本
  const userSummary = generateUserDataSummary(userData);

  // 只对未匹配或低置信度的字段调用 LLM
  const unmatchedResults = matchResults.filter((m) => m.confidence < 0.5 && m.matchedBy !== 'rule');

  // 最多并发 5 个 LLM 请求，控制速度和成本
  const batchSize = 5;
  for (let i = 0; i < unmatchedResults.length; i += batchSize) {
    const batch = unmatchedResults.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (matchResult) => {
        const field = fields.find((f) => f.id === matchResult.fieldId);
        if (!field) return;

        try {
          const llmResult = await llmMatchField(
            aiConfig,
            field.label,
            `${field.sectionContext || ''} ${field.placeholder || ''}`.trim(),
            userSummary
          );

          if (llmResult.value && llmResult.confidence > matchResult.confidence) {
            matchResult.value = llmResult.value;
            matchResult.matchedBy = 'llm';
            matchResult.confidence = llmResult.confidence;
          }
        } catch {
          // LLM 调用失败，静默跳过
        }
      })
    );
  }
}

/** 生成用户数据文本摘要（用于 LLM 上下文） */
function generateUserDataSummary(userData: UserDataContext): string {
  const { personalInfo, educations, experiences } = userData;
  const parts: string[] = [];

  // 基础信息
  parts.push(`姓名：${personalInfo.name}`);
  if (personalInfo.gender) parts.push(`性别：${personalInfo.gender}`);
  if (personalInfo.phone) parts.push(`手机：${personalInfo.phone}`);
  if (personalInfo.email) parts.push(`邮箱：${personalInfo.email}`);
  if (personalInfo.currentCity) parts.push(`现居：${personalInfo.currentCity}`);
  if (personalInfo.targetPositions.length) parts.push(`意向岗位：${personalInfo.targetPositions.join('、')}`);

  // 教育经历
  educations.forEach((edu) => {
    parts.push(`\n教育经历：${edu.school} ${edu.major} ${edu.type}`);
    if (edu.gpa) parts.push(`  GPA：${edu.gpa}${edu.gpaTotal ? '/' + edu.gpaTotal : ''}`);
    if (edu.ranking) parts.push(`  排名：${edu.ranking}`);
    if (edu.cet4) parts.push(`  四级：${edu.cet4}`);
    if (edu.cet6) parts.push(`  六级：${edu.cet6}`);
  });

  // 经历
  experiences.forEach((exp) => {
    parts.push(`\n${exp.type}经历：${exp.organization} - ${exp.role}`);
    if (exp.description) parts.push(`  描述：${exp.description}`);
    if (exp.bullets.length) parts.push(`  要点：${exp.bullets.filter(Boolean).join('；')}`);
  });

  return parts.join('\n');
}

/** 获取字段类型字符串 */
function getFieldType(field?: FormField): string {
  if (!field) return 'unknown';
  if (field.tagName === 'select') return 'select';
  if (field.tagName === 'textarea') return 'textarea';
  return field.inputType || 'text';
}

export { generateUserDataSummary };
