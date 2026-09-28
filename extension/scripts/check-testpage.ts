// ============================================================
// 本地测试页 (public/test-form.html) 匹配率验证
// 用真实 matchingEngine 断言页面上每个字段的 label → dataPath 映射，
// 保证「打开测试页点填充」的预期结果与引擎行为一致。
//
// 运行：npm run check:testpage
// ============================================================

import { matchAllFields, type UserDataContext } from '../src/engine/matchingEngine';
import type { FormField } from '../src/types/models';

/** 与 check-matching.ts 保持同一份示例数据，便于对照 */
const userData: UserDataContext = {
  personalInfo: {
    id: 'p1',
    name: '郭欣融',
    nameEn: 'Guo Xinrong',
    gender: '女',
    birthDate: '2002-05-20',
    idNumber: '440300200205200021',
    ethnicity: '汉族',
    politicalStatus: '共青团员',
    nativePlace: '广东省广州市',
    currentCity: '广东省深圳市',
    phone: '18595921669',
    email: 'guocindy730868@outlook.com',
    wechat: 'guo_xinrong',
    github: 'https://github.com/example',
    targetCities: ['深圳市'],
    targetPositions: ['前端开发工程师'],
    expectedSalary: '15K-25K',
    expectedMonthlySalary: '15K-25K',
    expectedAnnualSalary: '20W-35W',
    expectedIndustry: '互联网',
    availableDate: '2027-07-01',
    acceptsAdjustment: '否',
    recruitmentChannel: '公司官网',
    cityPreferenceReason: '长期在此求学',
    createdAt: '',
    updatedAt: '',
  },
  educations: [
    {
      id: 'e1', type: '硕士', school: '纽约大学', college: '计算机学院',
      major: '计算机科学与技术', startDate: '2026-01-01', endDate: '2027-01-01',
      gpa: '3.8', gpaTotal: '4.0', ranking: '5/120', trainingMode: '全日制',
      cet4: '620', cet6: '580', mainCourses: ['数据结构', '操作系统', '计算机网络'],
      awards: ['国家奖学金', '校级三好学生'],
      isPrimary: true, order: 0, tags: [], createdAt: '', updatedAt: '',
    },
  ],
  experiences: [
    {
      id: 'x1', type: '实习', organization: '某科技公司', role: '大模型应用实习生',
      startDate: '2025-06-01', endDate: '2025-09-01', location: '深圳市',
      description: '负责网申表单自动填充能力建设', bullets: [], versions: [],
      techStack: ['TypeScript', 'React'], achievements: ['填充成功率提升至 92%'],
      abilityTags: [], industryTags: [], order: 0, createdAt: '', updatedAt: '',
    },
    {
      id: 'x2', type: '项目', organization: '欣融项目', role: '项目负责人',
      startDate: '2025-03-01', endDate: '2025-06-01',
      description: '项目描述', bullets: [], versions: [],
      techStack: ['Chrome Extension', 'IndexedDB'], achievements: [],
      abilityTags: [], industryTags: [], order: 1, createdAt: '', updatedAt: '',
    },
  ],
  skills: [{ id: 's1', category: '编程语言', items: ['JavaScript', 'TypeScript', 'Python'] }],
};

let seq = 0;
function f(label: string, opts: Partial<FormField> = {}): FormField {
  return {
    id: `tp${++seq}`,
    tagName: 'input',
    label,
    required: false,
    xpath: '',
    cssSelector: '',
    ...opts,
  };
}

interface Case {
  /** 测试页上的可见标签 */
  name: string;
  field: FormField;
  expectPath: string;
  expectValue?: string;
  /** 该字段在测试页中是否被设计为「不应被扫描」的干扰项 */
  ignored?: boolean;
}

// ============ 第 1 区：原生控件 ============
const nativeCases: Case[] = [
  { name: '姓名', field: f('姓名', { sectionContext: '基本信息' }), expectPath: 'personalInfo.name', expectValue: '郭欣融' },
  { name: '英文姓名', field: f('英文姓名', { sectionContext: '基本信息' }), expectPath: 'personalInfo.nameEn', expectValue: 'Guo Xinrong' },
  { name: '手机号码', field: f('手机号码'), expectPath: 'personalInfo.phone', expectValue: '18595921669' },
  { name: '电子邮箱', field: f('电子邮箱'), expectPath: 'personalInfo.email', expectValue: 'guocindy730868@outlook.com' },
  { name: '身份证号', field: f('身份证号'), expectPath: 'personalInfo.idNumber', expectValue: '440300200205200021' },
  { name: '出生日期', field: f('出生日期', { tagName: 'input', inputType: 'date', widgetKind: 'native-date' }), expectPath: 'personalInfo.birthDate', expectValue: '2002-05-20' },
  { name: '民族', field: f('民族'), expectPath: 'personalInfo.ethnicity', expectValue: '汉族' },
  { name: '政治面貌', field: f('政治面貌', { tagName: 'select', widgetKind: 'native-select', options: ['中共党员', '中共预备党员', '共青团员', '群众', '民主党派'] }), expectPath: 'personalInfo.politicalStatus', expectValue: '共青团员' },
  { name: '籍贯', field: f('籍贯'), expectPath: 'personalInfo.nativePlace' },
  { name: '现居城市', field: f('现居城市'), expectPath: 'personalInfo.currentCity' },
  { name: '微信号', field: f('微信号'), expectPath: 'personalInfo.wechat' },
  { name: 'GitHub 链接', field: f('GitHub 链接'), expectPath: 'personalInfo.github' },
  { name: '性别（单选组）', field: f('性别', { inputType: 'radio', widgetKind: 'radio-group', options: ['男', '女', '其他'], sectionContext: '基本信息' }), expectPath: 'personalInfo.gender', expectValue: '女' },
  { name: '是否接受调剂（单选组）', field: f('是否接受调剂', { inputType: 'radio', widgetKind: 'radio-group', options: ['是', '否'] }), expectPath: 'personalInfo.acceptsAdjustment', expectValue: '否' },
  // 回归：该标签同时命中技能规则「专业技能」与专业规则「专业」，
  // 修复前会被「个人技能」分区里的教育加权顶掉，填成 education.major
  { name: '专业技能（复选组）', field: f('专业技能', { inputType: 'checkbox', widgetKind: 'checkbox-group', options: ['JavaScript', 'TypeScript', 'React', 'Node.js'] }), expectPath: 'skills' },
  { name: '自我评价', field: f('自我评价', { tagName: 'textarea', widgetKind: 'textarea', sectionContext: '基本信息' }), expectPath: 'special.selfIntroduction', expectValue: '' },
  { name: '兴趣特长（maxlength=8，验证截断来源）', field: f('兴趣特长', { maxLength: 8 }), expectPath: 'special.hobbies', expectValue: '' },
];

// ============ 第 2 区：antd 风格 ============
const antdCases: Case[] = [
  { name: '毕业院校', field: f('毕业院校', { sectionContext: '教育经历' }), expectPath: 'education.school', expectValue: '纽约大学' },
  { name: '所在学院', field: f('所在学院', { sectionContext: '教育经历' }), expectPath: 'education.college', expectValue: '计算机学院' },
  { name: '所学专业', field: f('所学专业', { sectionContext: '教育经历' }), expectPath: 'education.major', expectValue: '计算机科学与技术' },
  { name: '最高学历（自定义下拉）', field: f('最高学历', { tagName: 'select', widgetKind: 'custom-select', options: ['大专', '本科', '硕士', '博士'], sectionContext: '教育经历' }), expectPath: 'education.type', expectValue: '硕士' },
  { name: 'GPA', field: f('GPA', { sectionContext: '教育经历' }), expectPath: 'education.gpa', expectValue: '3.8' },
  { name: '专业排名', field: f('专业排名', { sectionContext: '教育经历' }), expectPath: 'education.ranking', expectValue: '5/120' },
  { name: '英语四级', field: f('英语四级', { sectionContext: '教育经历' }), expectPath: 'education.cet4', expectValue: '620' },
  { name: '英语六级', field: f('英语六级', { sectionContext: '教育经历' }), expectPath: 'education.cet6', expectValue: '580' },
  { name: '入学时间（自定义日期）', field: f('入学时间', { tagName: 'input', inputType: 'date', widgetKind: 'custom-date', sectionContext: '教育经历' }), expectPath: 'education.startDate', expectValue: '2026-01-01' },
  { name: '毕业时间（自定义日期）', field: f('毕业时间', { tagName: 'input', inputType: 'date', widgetKind: 'custom-date', sectionContext: '教育经历' }), expectPath: 'education.endDate', expectValue: '2027-01-01' },
  { name: '培养方式', field: f('培养方式', { tagName: 'select', widgetKind: 'native-select', options: ['全日制', '非全日制'], sectionContext: '教育经历' }), expectPath: 'education.trainingMode', expectValue: '全日制' },
  { name: '主修课程', field: f('主修课程', { sectionContext: '教育经历' }), expectPath: 'education.mainCourses' },
  { name: '在校获奖情况', field: f('在校获奖情况', { tagName: 'textarea', widgetKind: 'textarea', sectionContext: '教育经历' }), expectPath: 'education.awards' },
];

// ============ 第 3 区：Element 风格 ============
const elementCases: Case[] = [
  { name: '公司名称', field: f('公司名称', { sectionContext: '实习经历' }), expectPath: 'experience.organization', expectValue: '某科技公司' },
  { name: '实习岗位', field: f('实习岗位', { sectionContext: '实习经历' }), expectPath: 'experience.role', expectValue: '大模型应用实习生' },
  { name: '工作地点', field: f('工作地点', { sectionContext: '实习经历' }), expectPath: 'experience.location', expectValue: '深圳市' },
  { name: '实习开始时间', field: f('实习开始时间', { sectionContext: '实习经历' }), expectPath: 'experience.startDate', expectValue: '2025-06-01' },
  { name: '实习结束时间', field: f('实习结束时间', { sectionContext: '实习经历' }), expectPath: 'experience.endDate', expectValue: '2025-09-01' },
  { name: '工作内容', field: f('工作内容', { tagName: 'textarea', widgetKind: 'textarea', sectionContext: '实习经历' }), expectPath: 'experience.description', expectValue: '负责网申表单自动填充能力建设' },
  { name: '工作成果', field: f('工作成果', { tagName: 'textarea', widgetKind: 'textarea', sectionContext: '实习经历' }), expectPath: 'experience.achievements' },
];

// ============ 第 4 区：项目经历与求职意向 ============
const intentionCases: Case[] = [
  { name: '项目名称', field: f('项目名称', { sectionContext: '项目经历' }), expectPath: 'experience.organization', expectValue: '欣融项目' },
  { name: '项目角色', field: f('项目角色', { sectionContext: '项目经历' }), expectPath: 'experience.role', expectValue: '项目负责人' },
  { name: '项目开始时间', field: f('项目开始时间', { sectionContext: '项目经历' }), expectPath: 'experience.startDate', expectValue: '2025-03-01' },
  { name: '项目结束时间', field: f('项目结束时间', { sectionContext: '项目经历' }), expectPath: 'experience.endDate', expectValue: '2025-06-01' },
  { name: '技术栈', field: f('技术栈', { sectionContext: '项目经历' }), expectPath: 'experience.techStack' },
  { name: '期望工作城市', field: f('期望工作城市', { sectionContext: '求职意向' }), expectPath: 'personalInfo.targetCities' },
  { name: '期望岗位', field: f('期望岗位', { sectionContext: '求职意向' }), expectPath: 'personalInfo.targetPositions' },
  { name: '期望月薪', field: f('期望月薪', { sectionContext: '求职意向' }), expectPath: 'personalInfo.expectedMonthlySalary', expectValue: '15K-25K' },
  { name: '到岗时间', field: f('到岗时间', { sectionContext: '求职意向' }), expectPath: 'personalInfo.availableDate' },
  { name: '招聘渠道来源', field: f('招聘渠道来源', { tagName: 'select', widgetKind: 'native-select', options: ['校园宣讲会', '官方招聘网站', 'BOSS直聘', '牛客网', '内部推荐'], sectionContext: '求职意向' }), expectPath: 'personalInfo.recruitmentChannel' },
  { name: '期望从事行业', field: f('期望从事行业', { sectionContext: '求职意向' }), expectPath: 'personalInfo.expectedIndustry' },
  { name: '职业规划', field: f('职业规划', { tagName: 'textarea', widgetKind: 'textarea' }), expectPath: 'special.careerPlan', expectValue: '' },
];

const allCases = [...nativeCases, ...antdCases, ...elementCases, ...intentionCases];

/**
 * 已知能力边界（不视为缺陷，仅记录）：
 * 规则库里技能类关键词为「专业技能/个人技能/技能特长/核心技能/skills/...」，
 * 标签若不含任何完整关键词（单字「技」因长度 <2 被 keywordMatches 拒绝），
 * 则规则与语义两级都匹配不到，只能依赖 LLM 兜底。
 * 目的是让这个边界在测试页验证中被显式记录，而不是悄悄通过。
 */
const knownGapCases: { name: string; field: FormField }[] = [
  { name: '熟练掌握的技能', field: f('熟练掌握的技能', { inputType: 'checkbox', widgetKind: 'checkbox-group', options: ['JavaScript', 'TypeScript'] }) },
];

// ============ 干扰项：即便被扫描到也不应匹配到任何数据 ============
const ignoredCases: Case[] = [
  { name: '导航栏搜索框', field: f('导航栏搜索框'), expectPath: '', ignored: true },
  { name: '图形验证码', field: f('图形验证码'), expectPath: '', ignored: true },
  { name: '密码框', field: f('密码框'), expectPath: '', ignored: true },
  { name: '已阅读并同意《隐私政策》', field: f('已阅读并同意《隐私政策》'), expectPath: '', ignored: true },
  { name: '简历附件', field: f('简历附件'), expectPath: '', ignored: true },
];

const results = matchAllFields(
  [...allCases, ...ignoredCases, ...knownGapCases].map((c) => c.field),
  userData
);

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, actual: string | undefined, expected: string | undefined) {
  const ok = actual === expected;
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push(`${label}  actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  }
}

for (const c of allCases) {
  const r = results.find((x) => x.fieldId === c.field.id);
  check(`[测试页] ${c.name} [path]`, r?.matchedRule?.dataPath, c.expectPath);
  if (c.expectValue !== undefined) {
    check(`[测试页] ${c.name} [value]`, r?.value, c.expectValue);
  }
  // 有真实数据来源的字段不应落到 LLM 兜底
  if (c.expectPath && !c.expectPath.startsWith('special.')) {
    check(`[测试页] ${c.name} [非 LLM 兜底]`, r?.matchedBy === 'llm' ? 'llm' : 'not-llm', 'not-llm');
  }
}

for (const c of ignoredCases) {
  const r = results.find((x) => x.fieldId === c.field.id);
  // 干扰项不应匹配到任何有真实数据支撑的规则
  const matchedRealData = !!r?.value && !!(r?.confidence > 0.3);
  check(`[干扰项] ${c.name} [不应填充]`, matchedRealData ? 'filled' : 'empty', 'empty');
}

// ============ 已知边界：断言它们「确实匹配不到」而非误匹配到别的字段 ============
let gapOk = 0;
let gapBad = 0;
const gapDetails: string[] = [];
for (const c of knownGapCases) {
  const r = results.find((x) => x.fieldId === c.field.id);
  const path = r?.matchedRule?.dataPath;
  const filled = !!(r && r.confidence > 0.3 && r.value);
  if (!path && !filled) {
    gapOk++;
  } else {
    gapBad++;
    gapDetails.push(`${c.name} 意外匹配到 path=${path ?? 'NONE'} value=${JSON.stringify(r?.value)}`);
  }
}
console.log('');
console.log(`已知边界（需 LLM 兜底，断言不误匹配）：${gapOk} 项符合预期`);
for (const d of gapDetails) console.log(`  ⚠ ${d}`);

console.log('');
for (const line of failures) console.log(`FAIL  ${line}`);
console.log(`\n测试页验证：${pass} passed, ${fail} failed`);
if (fail > 0 || gapBad > 0) process.exitCode = 1;
