// ============================================================
// 智能字段匹配引擎
// 实现三级匹配：规则匹配 → 语义匹配 → LLM 兜底
// ============================================================

import type { FormField, PersonalInfo, Education, Experience, SkillInfo } from '../types/models';
import { ALL_FIELD_RULES, type FieldMappingRule } from './fieldMappingRules';

/** 匹配结果 */
export interface MatchResult {
  fieldId: string;
  label: string;
  /** 匹配到的值 */
  value: string;
  /** 匹配方式 */
  matchedBy: 'rule' | 'semantic' | 'llm' | 'none';
  /** 匹配的规则 */
  matchedRule?: FieldMappingRule;
  /** 匹配置信度 0-1 */
  confidence: number;
  /** 是否需要选项匹配（下拉框） */
  needOptionMatch: boolean;
  /** 推荐选项值（如果是下拉框） */
  recommendedOption?: string;
}

/** 用户数据上下文 */
export interface UserDataContext {
  personalInfo: PersonalInfo;
  educations: Education[];
  experiences: Experience[];
  skills: SkillInfo[];
}

// =================== 核心匹配逻辑 ===================

/**
 * 对所有表单字段执行智能匹配
 */
export function matchAllFields(
  fields: FormField[],
  userData: UserDataContext
): MatchResult[] {
  return fields.map((field) => matchSingleField(field, userData));
}

/**
 * 匹配单个表单字段
 */
export function matchSingleField(
  field: FormField,
  userData: UserDataContext
): MatchResult {
  const needsOption = needsOptionMatch(field);

  // 第一级：规则快速匹配
  const ruleMatch = tryRuleMatch(field, userData);
  if (ruleMatch && ruleMatch.confidence >= 0.8) {
    return ruleMatch;
  }

  // 第二级：语义相似度匹配（基于关键词模糊匹配）
  const semanticMatch = trySemanticMatch(field, userData);
  if (semanticMatch && semanticMatch.confidence >= 0.6) {
    return semanticMatch;
  }

  // 如果有部分匹配结果，返回置信度最高的
  if (ruleMatch) return ruleMatch;
  if (semanticMatch) return semanticMatch;

  // 无匹配
  return {
    fieldId: field.id,
    label: field.label,
    value: '',
    matchedBy: 'none',
    confidence: 0,
    needOptionMatch: needsOption,
  };
}

/** 该字段是否需要在下拉选项中做匹配 */
function needsOptionMatch(field: FormField): boolean {
  return field.tagName === 'select'
    || field.widgetKind === 'custom-select'
    || field.widgetKind === 'radio-group'
    || field.widgetKind === 'checkbox-group';
}

// =================== 关键词匹配打分 ===================

/**
 * 计算单个关键词与单个文本的匹配分（0 表示不匹配）
 *
 * 关键约束：
 * - 单字符关键词只允许完全相等，避免「名」命中「项目名称」这类误匹配
 * - 正向包含（文本含关键词）正常计分；反向包含（关键词含文本，如标签「薪资」
 *   vs 关键词「期望薪资」）只给低分，避免长关键词吃掉泛化标签
 * - 英文要求词边界，避免 to/from 命中任意标签
 */
function keywordMatches(keyword: string, text: string): number {
  const kw = keyword.toLowerCase().trim();
  const txt = text.toLowerCase().trim();
  if (!kw || !txt) return 0;
  if (kw === txt) return 1.0;

  // 单字符关键词（中文单字或单个字母）只认完全相等
  if (kw.length < 2) return 0;

  const isCjk = /[\u4e00-\u9fa5]/.test(kw);

  if (isCjk) {
    if (txt.includes(kw)) {
      return 0.55 + 0.45 * Math.min(kw.length, txt.length) / Math.max(kw.length, txt.length);
    }
    // 标签比关键词短（「薪资」vs「期望薪资」）：允许但降权，不超过正向匹配的下限
    if (txt.length >= 2 && kw.includes(txt)) {
      return 0.45 + 0.25 * (txt.length / kw.length);
    }
    return 0;
  }

  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  if (!re.test(txt)) return 0;
  return 0.55 + 0.45 * Math.min(kw.length, txt.length) / Math.max(kw.length, txt.length);
}

/** 匹配来源及其权重 */
function buildMatchSources(field: FormField): { text: string; weight: number }[] {
  return [
    { text: normalizeLabel(field.label), weight: 1.0 },
    { text: (field.placeholder || '').toLowerCase(), weight: 0.9 },
    { text: (field.elementName || '').toLowerCase(), weight: 0.8 },
    { text: (field.elementId || '').toLowerCase(), weight: 0.7 },
  ].filter((s) => s.text.length > 0);
}

// =================== 分区上下文消歧 ===================

/** 从模块标题推断该字段所属类别（取最早出现的关键词，避免「项目与获奖经历」被判成教育） */
function detectSectionCategory(section?: string): FieldMappingRule['category'] | null {
  if (!section) return null;

  const patterns: { category: FieldMappingRule['category']; re: RegExp }[] = [
    { category: 'education', re: /教育|学校|院校|学历|专业|语言|获奖|荣誉|成绩|培训/ },
    { category: 'experience', re: /项目|实习|工作|科研|竞赛|实践|经历/ },
    { category: 'intention', re: /意向|期望|求职|投递/ },
    { category: 'basic', re: /个人|基本|联系|身份/ },
  ];

  let bestCategory: FieldMappingRule['category'] | null = null;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const { category, re } of patterns) {
    const match = re.exec(section);
    if (match && match.index < bestIndex) {
      bestIndex = match.index;
      bestCategory = category;
    }
  }
  return bestCategory;
}

/** 规则类别与所在分区一致时加权，无关时降权 */
function sectionMultiplier(ruleCategory: FieldMappingRule['category'], sectionCategory: FieldMappingRule['category'] | null): number {
  if (!sectionCategory) return 1;
  if (ruleCategory === sectionCategory) return 1.35;
  if (ruleCategory === 'other') return 1;
  // 技能/证书类天然横跨各分区（专业技能、语言能力、技能证书…），
  // 拿到别人分区里也应当平权，否则会被同分区高频规则（如教育区的「专业」）吃掉
  if (ruleCategory === 'skill') return 1.35;
  return 0.6;
}

/**
 * 关键词覆盖率加成。
 *
 * 背景：关键词匹配分是「短词在长标签里被稀释」的（0.55~1.0 随长度比下降），
 * 于是标签「专业技能」命中短词「专业」得 0.775（还能吃到教育分区 1.35 倍加权），
 * 反而压过完整命中「专业技能」的 1.0 —— 结果技能组被填成专业。
 *
 * 长度比在标签本身就很长时惩罚过重（「熟练掌握的技能」命中「技能」只有 0.67），
 * 所以这里给「关键词几乎覆盖整个标签、并延伸到标签边界」的情况补回权重：
 * 只有关键词贴近标签长度（lenDiff ≤ 2）时才给加成，且加成上限 1.15，
 * 保证它只能翻越「因长度稀释而失去的那部分分数」，不会翻越分区上下文消歧。
 * 例：标签「姓名」命中「名称」lenDiff=1 → 加成后仍低于完整命中「姓名」，
 * 不会改变既有的消歧行为。
 */
function keywordCoverageBonus(keyword: string, text: string): number {
  const kw = keyword.toLowerCase().trim();
  const txt = text.toLowerCase().trim();
  if (!kw || !txt || !txt.includes(kw)) return 1;

  const lenDiff = txt.length - kw.length;
  if (lenDiff > 2) return 1;

  return 1 + 0.15 * (1 - lenDiff / 3);
}

// =================== 第一级：规则匹配 ===================

function tryRuleMatch(field: FormField, userData: UserDataContext): MatchResult | null {
  const sources = buildMatchSources(field);
  if (!sources.length) return null;

  const sectionCategory = detectSectionCategory(field.sectionContext);

  let best: { rule: FieldMappingRule; score: number; effective: number } | null = null;

  for (const rule of ALL_FIELD_RULES) {
    let matchScore = 0;

    for (const keyword of rule.keywords) {
      for (const source of sources) {
        const score = keywordMatches(keyword, source.text) * source.weight;
        if (score <= 0) continue;
        const boosted = score * keywordCoverageBonus(keyword, source.text);
        if (boosted > matchScore) matchScore = boosted;
      }
    }

    if (matchScore <= 0) continue;

    const effective = matchScore * rule.priority * sectionMultiplier(rule.category, sectionCategory);
    if (!best || effective > best.effective) {
      best = { rule, score: matchScore, effective };
    }
  }

  if (!best) return null;

  const { rule, score } = best;
  const value = resolveDataPath(rule.dataPath, userData, rule.transform, field);

  // 如果是下拉/单选/复选组，尝试匹配选项
  let recommendedOption: string | undefined;
  if (needsOptionMatch(field) && field.options && field.options.length && value) {
    recommendedOption = findBestOption(value, field.options);
  }

  return {
    fieldId: field.id,
    label: field.label,
    value: recommendedOption || value,
    matchedBy: 'rule',
    matchedRule: rule,
    confidence: score,
    needOptionMatch: needsOptionMatch(field),
    recommendedOption,
  };
}

// =================== 第二级：语义模糊匹配 ===================

function trySemanticMatch(field: FormField, userData: UserDataContext): MatchResult | null {
  const sources = buildMatchSources(field);
  const searchTexts = sources.map((s) => s.text);
  const context = [field.sectionContext || '', ...searchTexts].join(' ');

  // 通过上下文的关键词推断匹配
  const contextRules = [
    { test: /教育|学校|院校|学历|专业/, category: 'education' as const },
    { test: /实习|项目|工作|公司|科研|经历/, category: 'experience' as const },
    { test: /技能|技术|证书|资质/, category: 'skill' as const },
    { test: /意向|期望|求职/, category: 'intention' as const },
  ];

  for (const cr of contextRules) {
    if (cr.test.test(context)) {
      // 在该类别的规则中进行宽松匹配
      const categoryRules = ALL_FIELD_RULES.filter((r) => r.category === cr.category);
      for (const rule of categoryRules) {
        for (const kw of rule.keywords) {
          const kwLower = kw.toLowerCase();
          if (kwLower.length < 2) continue; // 单字不做模糊匹配
          const kwChars = kwLower.split('');
          for (const text of searchTexts) {
            // 字符重叠率匹配
            const overlap = kwChars.filter((c) => text.includes(c)).length / kwChars.length;
            if (overlap >= 0.6 && text.length <= kwLower.length * 2) {
              const value = resolveDataPath(rule.dataPath, userData, rule.transform);
              if (value) {
                return {
                  fieldId: field.id,
                  label: field.label,
                  value,
                  matchedBy: 'semantic',
                  matchedRule: rule,
                  confidence: overlap * 0.7, // 语义匹配置信度较低
                  needOptionMatch: needsOptionMatch(field),
                };
              }
            }
          }
        }
      }
    }
  }

  return null;
}

// =================== 数据路径解析 ===================

/**
 * 根据 dataPath 从用户数据中提取对应的值
 * 例如 "personalInfo.name" → userData.personalInfo.name
 */
function resolveDataPath(
  dataPath: string,
  userData: UserDataContext,
  transform?: string,
  field?: FormField
): string {
  const parts = dataPath.split('.');
  const root = parts[0];
  const fieldName = parts.slice(1).join('.');

  let rawValue: unknown;

  switch (root) {
    case 'personalInfo':
      rawValue = getNestedValue(userData.personalInfo, fieldName);
      break;

    case 'education': {
      // 优先使用 isPrimary 的主学历
      const primaryEdu = userData.educations.find((e) => e.isPrimary) || userData.educations[0];
      if (primaryEdu) {
        rawValue = getNestedValue(primaryEdu, fieldName);
      }
      break;
    }

    case 'experience': {
      // 按模块上下文挑选对应类型的经历，否则取最近一段
      const matched = pickExperience(userData, field);
      if (matched) {
        rawValue = getNestedValue(matched, fieldName);
      }
      break;
    }

    case 'skills':
      rawValue = userData.skills.map((s) => s.items.join('、')).join('；');
      break;

    case 'special':
      // 特殊字段，需要 LLM 生成
      rawValue = '';
      break;

    default:
      rawValue = '';
  }

  // 应用值转换
  const stringValue = rawValue != null ? String(rawValue) : '';
  if (transform && stringValue) {
    return applyTransform(transform, stringValue, userData);
  }

  return stringValue;
}

/** 按模块上下文挑选经历：项目区取项目经历，实习区取实习经历 */
function pickExperience(userData: UserDataContext, field?: FormField): Experience | undefined {
  if (!userData.experiences.length) return undefined;

  const section = field?.sectionContext || '';
  if (/项目|课题|竞赛/.test(section)) {
    const project = userData.experiences.find((e) => e.type === '项目' || e.type === '竞赛');
    if (project) return project;
  }
  if (/实习|工作/.test(section)) {
    const intern = userData.experiences.find((e) => e.type === '实习');
    if (intern) return intern;
  }
  if (/科研/.test(section)) {
    const research = userData.experiences.find((e) => e.type === '科研');
    if (research) return research;
  }
  return userData.experiences[0];
}

/** 获取嵌套对象的值 */
function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce((current: unknown, key) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// =================== 值转换函数 ===================

function applyTransform(
  transformName: string,
  value: string,
  _userData: UserDataContext
): string {
  switch (transformName) {
    case 'extractFamilyName':
      // 中文姓名取第一个字（或前两个字如复姓）
      if (/[\u4e00-\u9fa5]/.test(value)) {
        const commonDoubleFamily = ['欧阳', '司马', '上官', '皇甫', '令狐', '诸葛', '司徒', '公孙'];
        const twoChar = value.substring(0, 2);
        if (commonDoubleFamily.includes(twoChar)) return twoChar;
        return value.substring(0, 1);
      }
      // 英文名取最后一个词
      const parts = value.trim().split(/\s+/);
      return parts[parts.length - 1];

    case 'extractGivenName':
      if (/[\u4e00-\u9fa5]/.test(value)) {
        const commonDoubleFamily = ['欧阳', '司马', '上官', '皇甫', '令狐', '诸葛', '司徒', '公孙'];
        const twoChar = value.substring(0, 2);
        if (commonDoubleFamily.includes(twoChar)) return value.substring(2);
        return value.substring(1);
      }
      const nameParts = value.trim().split(/\s+/);
      return nameParts.slice(0, -1).join(' ');

    case 'joinArray':
      // 将数组值用顿号连接
      try {
        const arr = JSON.parse(value);
        if (Array.isArray(arr)) return arr.join('、');
      } catch {
        // 可能已经是字符串
      }
      return value;

    case 'formatSkills':
      // 格式化技能列表
      return value;

    default:
      return value;
  }
}

// =================== 下拉选项匹配 ===================

/**
 * 在下拉选项中找到最匹配的选项
 */
function findBestOption(value: string, options: string[]): string | undefined {
  const normalizedValue = normalizeOption(value);

  // 1. 精确匹配
  const exactMatch = options.find((opt) => normalizeOption(opt) === normalizedValue);
  if (exactMatch) return exactMatch;

  // 2. 包含匹配（否定前缀不可互配，避免「否」选中「接受」）
  const containMatch = options.find((opt) => {
    const o = normalizeOption(opt);
    if (!o || negationConflict(o, normalizedValue)) return false;
    return o.includes(normalizedValue) || normalizedValue.includes(o);
  });
  if (containMatch) return containMatch;

  // 3. 同义值映射（性别、学历、政治面貌等）
  const aliases = OPTION_ALIASES[value.trim()] || OPTION_ALIASES[normalizedValue];
  if (aliases) {
    for (const alias of aliases) {
      const aliasMatch = options.find((opt) => aliasMatchesOption(alias, opt));
      if (aliasMatch) return aliasMatch;
    }
  }

  return undefined;
}

// =================== 标签标准化 ===================

const NEGATION_PREFIXES = ['不', '非', '无', '未'];

/** 否定前缀冲突：「接受」与「不接受」、「是」与「不是」不可互相匹配 */
function negationConflict(a: string, b: string): boolean {
  const strip = (s: string) => s.replace(/^[不非无未]/, '');
  const aNeg = NEGATION_PREFIXES.some((n) => a.startsWith(n));
  const bNeg = NEGATION_PREFIXES.some((n) => b.startsWith(n));
  if (aNeg === bNeg) return false;
  const sa = strip(a);
  const sb = strip(b);
  if (!sa || !sb) return false;
  return sa === sb || sa.includes(sb) || sb.includes(sa);
}

/** 别名与选项文本是否等价（中文要求至少 2 字，拉丁字母要求词边界） */
function aliasMatchesOption(alias: string, option: string): boolean {
  const na = normalizeOption(alias);
  const o = normalizeOption(option);
  if (!na || !o) return false;
  if (negationConflict(na, o)) return false;
  if (na === o) return true;
  if (/[\u4e00-\u9fa5]/.test(na)) return na.length >= 2 && o.includes(na);

  const escaped = na.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(o);
}

/** 选项/标签文本归一：全角转半角、去空白与标点、去提示语 */
function normalizeOption(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, '')
    .replace(/[（）()【】\[\]、,，。.·:：]/g, '')
    .replace(/^(请选择|请填写|请输入)/, '')
    .toLowerCase();
}

/** 常见字段值的同义选项别名 */
const OPTION_ALIASES: Record<string, string[]> = {
  '男': ['男', '男性', 'male', 'm'],
  '女': ['女', '女性', 'female', 'f'],
  '本科': ['本科', '大学本科', '学士', 'bachelor', 'undergraduate'],
  '硕士': ['硕士', '硕士研究生', '研究生', 'master'],
  '博士': ['博士', '博士研究生', 'phd', 'doctor'],
  '全日制': ['全日制', '统招', '普通全日制'],
  '非全日制': ['非全日制', '在职'],
  '群众': ['群众', '普通群众'],
  '共青团员': ['共青团员', '团员'],
  '中共党员': ['中共党员', '党员', '中国共产党党员'],
  '中共预备党员': ['中共预备党员', '预备党员'],
  '是': ['是', 'yes', 'y', '接受', '同意', '可以'],
  '否': ['否', 'no', 'n', '不接受', '不同意', '不可以'],
};

function normalizeLabel(label: string): string {
  return label
    .replace(/[*:\s：（）()【】\[\]]/g, '') // 去掉特殊字符
    .replace(/请输入|请选择|请填写|可选|选填|必填/g, '') // 去掉提示文字
    .trim()
    .toLowerCase();
}
