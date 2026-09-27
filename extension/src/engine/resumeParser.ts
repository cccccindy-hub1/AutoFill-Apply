// ============================================================
// 简历解析服务
// 支持 PDF / Word(.docx) / 纯文本 提取 + LLM 结构化
// ============================================================

import type { PersonalInfo, Education, Experience, AIModelConfig } from '../types/models';
import { llmParseResume } from './llmService';
import {
  personalInfoDB,
  educationDB,
  experienceDB,
  generateId,
} from '../storage/db';
import mammoth from 'mammoth';

/** 简历解析结果 */
export interface ResumeParseResult {
  success: boolean;
  message: string;
  data?: {
    personalInfo?: Partial<PersonalInfo>;
    educations?: Partial<Education>[];
    experiences?: Partial<Experience>[];
    skills?: string[];
  };
}

/**
 * 从 PDF 文件中提取文本内容
 * 使用浏览器端的 FileReader 读取 PDF 文本
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  // 方案 1：使用 pdf.js CDN 来解析（如果可用）
  try {
    const arrayBuffer = await file.arrayBuffer();
    // @ts-expect-error pdfjsLib 由 CDN 提供
    if (typeof window.pdfjsLib !== 'undefined') {
      // @ts-expect-error pdfjsLib 由 CDN 提供
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const textParts: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: { str: string }) => item.str)
          .join(' ');
        textParts.push(pageText);
      }
      return textParts.join('\n');
    }
  } catch (e) {
    console.warn('[CampusApply] pdf.js 解析失败，使用备用方案:', e);
  }

  // 方案 2：直接读取文本（对某些 PDF 有效）
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      // 尝试提取可读文本
      const cleanText = text.replace(/[^\x20-\x7E\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanText.length > 50) {
        resolve(cleanText);
      } else {
        reject(new Error('PDF 文本提取失败，请尝试使用纯文本简历'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

/**
 * 从 Word (.docx) 文件中提取文本
 * 使用 mammoth 库解析 .docx 格式
 */
export async function extractTextFromWord(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value.trim();
    if (text.length < 20) {
      throw new Error('Word 文档内容太少');
    }
    if (result.messages.length > 0) {
      console.warn('[CampusApply] Word 解析警告:', result.messages);
    }
    return text;
  } catch (e) {
    if (e instanceof Error && e.message.includes('内容太少')) throw e;
    throw new Error('Word 文档解析失败，请确认文件格式是否正确(.docx)');
  }
}

/**
 * 从纯文本/Markdown 简历中提取文本
 */
export async function extractTextFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      if (text.trim().length < 20) {
        reject(new Error('简历内容太少'));
        return;
      }
      resolve(text);
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

/** 安全地把 LLM 返回的任意值转成字符串 */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 把 LLM 返回的任意值转成字符串数组 */
function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

const EDUCATION_TYPES: Education['type'][] = ['本科', '硕士', '博士', '交换', '其他'];

/** 学历关键词 → 统一枚举（高教优先，避免「本科」被「研究生」以外的词抢走） */
const EDUCATION_TYPE_KEYWORDS: [string, Education['type']][] = [
  ['博士', '博士'],
  ['phd', '博士'],
  ['doctor', '博士'],
  ['硕士', '硕士'],
  ['研究生', '硕士'],
  ['master', '硕士'],
  ['mba', '硕士'],
  ['本科', '本科'],
  ['学士', '本科'],
  ['bachelor', '本科'],
  ['交换', '交换'],
  ['exchange', '交换'],
  ['visiting', '交换'],
];

/**
 * 规整 LLM 返回的学历类型。
 * LLM 可能返回「硕士研究生」「Bachelor's Degree」这类自由文本，
 * 直接断言成联合类型会产生类型系统无法保护的值。
 */
export function normalizeEducationType(value: unknown): Education['type'] {
  const raw = str(value).trim();
  if (!raw) return '本科';
  if ((EDUCATION_TYPES as string[]).includes(raw)) return raw as Education['type'];
  const lower = raw.toLowerCase();
  for (const [keyword, type] of EDUCATION_TYPE_KEYWORDS) {
    if (lower.includes(keyword)) return type;
  }
  return '其他';
}

const EXPERIENCE_TYPES: Experience['type'][] = ['实习', '项目', '科研', '校园', '竞赛', '其他'];

/** 经历关键词 → 统一枚举（顺序即优先级） */
const EXPERIENCE_TYPE_KEYWORDS: [string, Experience['type']][] = [
  ['实习', '实习'],
  ['intern', '实习'],
  ['项目', '项目'],
  ['project', '项目'],
  ['科研', '科研'],
  ['研究', '科研'],
  ['research', '科研'],
  ['论文', '科研'],
  ['竞赛', '竞赛'],
  ['比赛', '竞赛'],
  ['contest', '竞赛'],
  ['hackathon', '竞赛'],
  ['校园', '校园'],
  ['社团', '校园'],
  ['学生会', '校园'],
  ['campus', '校园'],
];

/** 规整 LLM 返回的经历类型 */
export function normalizeExperienceType(value: unknown): Experience['type'] {
  const raw = str(value).trim();
  if (!raw) return '实习';
  if ((EXPERIENCE_TYPES as string[]).includes(raw)) return raw as Experience['type'];
  const lower = raw.toLowerCase();
  for (const [keyword, type] of EXPERIENCE_TYPE_KEYWORDS) {
    if (lower.includes(keyword)) return type;
  }
  return '其他';
}

/** 规整 LLM 返回的性别；无法识别时返回空串而不是非法值 */
export function normalizeGender(value: unknown): PersonalInfo['gender'] {
  const raw = str(value).trim();
  if (!raw) return '';
  if (raw === '男' || raw === '女' || raw === '其他') return raw;
  const lower = raw.toLowerCase();
  if (lower === 'male' || lower === 'm' || lower.includes('男')) return '男';
  if (lower === 'female' || lower === 'f' || lower.includes('女')) return '女';
  if (lower.includes('other') || lower.includes('其他')) return '其他';
  return '';
}

/**
 * 解析简历文本为结构化数据
 */
export async function parseResumeText(
  text: string,
  aiConfig: AIModelConfig
): Promise<ResumeParseResult> {
  try {
    const parsed = await llmParseResume(aiConfig, text);

    const result: ResumeParseResult = {
      success: true,
      message: '简历解析成功',
      data: {
        personalInfo: {},
        educations: [],
        experiences: [],
        skills: [],
      },
    };

    // 映射个人信息
    if (parsed.name || parsed.phone || parsed.email) {
      result.data!.personalInfo = {
        name: str(parsed.name),
        gender: normalizeGender(parsed.gender),
        phone: str(parsed.phone),
        email: str(parsed.email),
        birthDate: str(parsed.birthDate),
        nativePlace: str(parsed.nativePlace),
        politicalStatus: str(parsed.politicalStatus),
      };
    }

    // 映射教育经历
    if (Array.isArray(parsed.educations)) {
      result.data!.educations = parsed.educations.map((edu: Record<string, unknown>) => ({
        type: normalizeEducationType(edu.type),
        school: str(edu.school),
        college: str(edu.college),
        major: str(edu.major),
        startDate: str(edu.startDate),
        endDate: str(edu.endDate),
        gpa: str(edu.gpa),
        ranking: str(edu.ranking),
      }));
    }

    // 映射实习/项目经历
    if (Array.isArray(parsed.experiences)) {
      result.data!.experiences = parsed.experiences.map((exp: Record<string, unknown>) => ({
        type: normalizeExperienceType(exp.type),
        organization: str(exp.organization),
        role: str(exp.role),
        startDate: str(exp.startDate),
        endDate: str(exp.endDate),
        description: str(exp.description),
        bullets: strArray(exp.bullets),
      }));
    }

    // 技能
    if (Array.isArray(parsed.skills)) {
      result.data!.skills = strArray(parsed.skills);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '解析失败',
    };
  }
}

/**
 * 将解析后的简历数据保存到本地数据库
 */
export async function saveResumeData(
  data: ResumeParseResult['data']
): Promise<{ saved: string[]; skipped: string[] }> {
  const saved: string[] = [];
  const skipped: string[] = [];

  if (!data) return { saved, skipped };

  // 保存个人信息（合并，不覆盖已有数据）
  if (data.personalInfo) {
    const existing = await personalInfoDB.get();
    if (existing) {
      // 只填充空白字段
      const merged = { ...existing };
      for (const [key, value] of Object.entries(data.personalInfo)) {
        if (value && !(merged as Record<string, unknown>)[key]) {
          (merged as Record<string, unknown>)[key] = value;
        }
      }
      await personalInfoDB.save(merged);
      saved.push('个人信息');
    } else {
      // 新建
      const now = new Date().toISOString();
      await personalInfoDB.save({
        id: generateId(),
        name: data.personalInfo.name || '',
        gender: (data.personalInfo.gender || '') as PersonalInfo['gender'],
        birthDate: data.personalInfo.birthDate || '',
        phone: data.personalInfo.phone || '',
        email: data.personalInfo.email || '',
        nativePlace: data.personalInfo.nativePlace || '',
        politicalStatus: data.personalInfo.politicalStatus || '',
        targetCities: [],
        targetPositions: [],
        createdAt: now,
        updatedAt: now,
      });
      saved.push('个人信息（新建）');
    }
  }

  // 保存教育经历
  if (data.educations?.length) {
    const existing = await educationDB.getAll();
    if (existing.length === 0) {
      for (let i = 0; i < data.educations.length; i++) {
        const edu = data.educations[i];
        const now = new Date().toISOString();
        await educationDB.save({
          id: generateId(),
          type: (edu.type || '本科') as Education['type'],
          school: edu.school || '',
          college: edu.college || '',
          major: edu.major || '',
          startDate: edu.startDate || '',
          endDate: edu.endDate || '',
          gpa: edu.gpa || '',
          gpaTotal: '',
          ranking: edu.ranking || '',
          isPrimary: i === 0,
          order: i,
          mainCourses: [],
          awards: [],
          tags: [],
          createdAt: now,
          updatedAt: now,
        });
      }
      saved.push(`${data.educations.length} 条教育经历`);
    } else {
      skipped.push('教育经历（已存在数据）');
    }
  }

  // 保存实习/项目经历
  if (data.experiences?.length) {
    const existing = await experienceDB.getAll();
    if (existing.length === 0) {
      for (let i = 0; i < data.experiences.length; i++) {
        const exp = data.experiences[i];
        const now = new Date().toISOString();
        await experienceDB.save({
          id: generateId(),
          type: (exp.type || '实习') as Experience['type'],
          organization: exp.organization || '',
          role: exp.role || '',
          startDate: exp.startDate || '',
          endDate: exp.endDate || '',
          description: exp.description || '',
          bullets: exp.bullets || [],
          techStack: [],
          achievements: [],
          versions: [],
          abilityTags: [],
          industryTags: [],
          order: i,
          createdAt: now,
          updatedAt: now,
        });
      }
      saved.push(`${data.experiences.length} 条经历`);
    } else {
      skipped.push('经历（已存在数据）');
    }
  }

  return { saved, skipped };
}
