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
        name: (parsed.name as string) || '',
        gender: ((parsed.gender as string) || '') as PersonalInfo['gender'],
        phone: (parsed.phone as string) || '',
        email: (parsed.email as string) || '',
        birthDate: (parsed.birthDate as string) || '',
        nativePlace: (parsed.nativePlace as string) || '',
        politicalStatus: (parsed.politicalStatus as string) || '',
      };
    }

    // 映射教育经历
    if (Array.isArray(parsed.educations)) {
      result.data!.educations = parsed.educations.map((edu: Record<string, unknown>) => ({
        type: ((edu.type as string) || '本科') as Education['type'],
        school: (edu.school as string) || '',
        college: (edu.college as string) || '',
        major: (edu.major as string) || '',
        startDate: (edu.startDate as string) || '',
        endDate: (edu.endDate as string) || '',
        gpa: (edu.gpa as string) || '',
        ranking: (edu.ranking as string) || '',
      }));
    }

    // 映射实习/项目经历
    if (Array.isArray(parsed.experiences)) {
      result.data!.experiences = parsed.experiences.map((exp: Record<string, unknown>) => ({
        type: ((exp.type as string) || '实习') as Experience['type'],
        organization: (exp.organization as string) || '',
        role: (exp.role as string) || '',
        startDate: (exp.startDate as string) || '',
        endDate: (exp.endDate as string) || '',
        description: (exp.description as string) || '',
        bullets: Array.isArray(exp.bullets) ? exp.bullets as string[] : [],
      }));
    }

    // 技能
    if (Array.isArray(parsed.skills)) {
      result.data!.skills = parsed.skills as string[];
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
