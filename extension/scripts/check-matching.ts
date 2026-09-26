import { matchAllFields, type UserDataContext } from '../src/engine/matchingEngine';
import type { FormField } from '../src/types/models';

const personalInfo = {
  id: 'p1', name: '郭欣融', nameEn: 'Guo Xinrong', gender: '女' as const,
  birthDate: '2002-05-20', ethnicity: '汉族', politicalStatus: '共青团员',
  nativePlace: '广东省广州市', currentCity: '广东省深圳市',
  phone: '18595921669', email: 'guocindy730868@outlook.com',
  targetCities: ['深圳市'], targetPositions: ['开发'], expectedSalary: '15K-25K',
  expectedMonthlySalary: '15K-25K', expectedAnnualSalary: '20W-35W',
  expectedIndustry: '互联网', availableDate: '2027-07-01',
  acceptsAdjustment: '否' as const, recruitmentChannel: '公司官网',
  cityPreferenceReason: '长期在此求学',
  createdAt: '', updatedAt: '',
};

const userData: UserDataContext = {
  personalInfo,
  educations: [
    { id: 'e1', type: '硕士', school: '纽约大学', major: '计算机科学与技术', startDate: '2026-01-01', endDate: '2027-01-01', trainingMode: '全日制', isPrimary: true, order: 0, tags: [], createdAt: '', updatedAt: '' },
    { id: 'e2', type: '本科', school: '纽约大学', major: '计算机科学与技术', startDate: '2022-01-01', endDate: '2026-01-01', isPrimary: false, order: 1, tags: [], createdAt: '', updatedAt: '' },
  ],
  experiences: [
    { id: 'x1', type: '实习', organization: '某科技公司', role: '大模型应用实习生', startDate: '2025-06-01', endDate: '2025-09-01', description: '实习描述', bullets: [], versions: [], abilityTags: [], industryTags: [], order: 0, createdAt: '', updatedAt: '' },
    { id: 'x2', type: '项目', organization: '欣融项目', role: '项目负责人', startDate: '2025-03-01', endDate: '2025-06-01', description: '项目描述', bullets: [], versions: [], abilityTags: [], industryTags: [], order: 1, createdAt: '', updatedAt: '' },
  ],
  skills: [],
};

let seq = 0;
function f(label: string, opts: Partial<FormField> = {}): FormField {
  return {
    id: `f${++seq}`, tagName: 'input', label, required: false,
    xpath: '', cssSelector: '', ...opts,
  };
}

interface Case {
  name: string;
  field: FormField;
  expectValue?: string;
  expectPath?: string;
  expectEmpty?: boolean;
}

const cases: Case[] = [
  // ---- 误识别回归（本次修复的核心） ----
  { name: '项目名称 不能匹配到姓名', field: f('项目名称', { sectionContext: '项目经历' }), expectPath: 'experience.organization', expectValue: '欣融项目' },
  { name: '姓名 正常匹配', field: f('姓名', { sectionContext: '个人信息' }), expectPath: 'personalInfo.name', expectValue: '郭欣融' },
  { name: '单字「名」精确匹配 → 名', field: f('名'), expectPath: 'personalInfo.name', expectValue: '欣融' },
  { name: '单字「姓」精确匹配 → 姓', field: f('姓'), expectPath: 'personalInfo.name', expectValue: '郭' },
  { name: '职务 → experience.role', field: f('职务', { sectionContext: '项目经历' }), expectPath: 'experience.role' },

  // ---- 分区消歧 ----
  { name: '教育经历/开始时间 → education.startDate', field: f('开始时间', { sectionContext: '教育经历' }), expectPath: 'education.startDate' },
  { name: '项目经历/开始时间 → experience.startDate', field: f('开始时间', { sectionContext: '项目经历' }), expectPath: 'experience.startDate' },
  { name: '项目与获奖经历/开始时间 → experience.startDate', field: f('开始时间', { sectionContext: '项目与获奖经历' }), expectPath: 'experience.startDate' },
  { name: '项目经历/结束时间 → experience.endDate', field: f('结束时间', { sectionContext: '项目经历' }), expectPath: 'experience.endDate' },

  // ---- 项目模块新增规则 ----
  { name: '项目描述', field: f('项目描述', { sectionContext: '项目经历' }), expectPath: 'experience.description', expectValue: '项目描述' },
  { name: '项目中职责', field: f('项目中职责', { sectionContext: '项目经历' }), expectPath: 'experience.description' },
  { name: '学习形式 → trainingMode', field: f('学习形式', { sectionContext: '教育经历' }), expectPath: 'education.trainingMode', expectValue: '全日制' },

  // ---- 短标签（反向包含） ----
  { name: '薪资（短标签）', field: f('薪资'), expectPath: 'personalInfo.expectedSalary' },
  { name: '期望年薪', field: f('期望年薪'), expectPath: 'personalInfo.expectedAnnualSalary' },
  { name: '期望月薪(税前)', field: f('期望月薪(税前)'), expectPath: 'personalInfo.expectedMonthlySalary' },
  { name: '期望从事行业', field: f('期望从事行业'), expectPath: 'personalInfo.expectedIndustry' },
  { name: '招聘渠道来源', field: f('招聘渠道来源'), expectPath: 'personalInfo.recruitmentChannel' },
  { name: '来深工作原因', field: f('来深工作原因'), expectPath: 'personalInfo.cityPreferenceReason' },

  // ---- 基础信息 ----
  { name: '籍贯', field: f('籍贯'), expectPath: 'personalInfo.nativePlace' },
  { name: '现居住地', field: f('现居住地'), expectPath: 'personalInfo.currentCity' },
  { name: '民族', field: f('民族'), expectPath: 'personalInfo.ethnicity' },
  { name: '毕业时间', field: f('毕业时间', { sectionContext: '个人信息' }), expectPath: 'education.endDate' },
];

// ---- 单选/下拉选项匹配 ----
const radioCases: Case[] = [
  {
    name: '性别 单选组 options=[男,女] value=女',
    field: f('性别', { tagName: 'input', inputType: 'radio', widgetKind: 'radio-group', options: ['男', '女'], sectionContext: '个人信息' }),
    expectValue: '女',
  },
  {
    name: '是否接受调剂 options=[接受,不接受] value=否 → 必须选不接受',
    field: f('是否接受调剂', { tagName: 'input', inputType: 'radio', widgetKind: 'radio-group', options: ['接受', '不接受'] }),
    expectValue: '不接受',
  },
  {
    name: '是否接受调剂 options=[不接受,接受] value=否 → 必须选不接受',
    field: f('是否接受调剂', { tagName: 'input', inputType: 'radio', widgetKind: 'radio-group', options: ['不接受', '接受'] }),
    expectValue: '不接受',
  },
  {
    name: '性别 options=[female,male] value=女 → 必须选 female',
    field: f('性别', { tagName: 'input', inputType: 'radio', widgetKind: 'radio-group', options: ['female', 'male'] }),
    expectValue: 'female',
  },
  {
    name: '学历 options=[本科,硕士研究生,博士研究生] value=硕士',
    field: f('学历', { tagName: 'select', widgetKind: 'native-select', options: ['本科', '硕士研究生', '博士研究生'], sectionContext: '教育经历' }),
    expectValue: '硕士研究生',
  },
];

const results = matchAllFields([...cases.map((c) => c.field), ...radioCases.map((c) => c.field)], userData);
let pass = 0;
let fail = 0;

function check(label: string, actual: string | undefined, expected: string | undefined) {
  const ok = actual === expected;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

for (const c of [...cases, ...radioCases]) {
  const r = results.find((x) => x.fieldId === c.field.id);
  const path = r?.matchedRule?.dataPath;
  const val = r?.value;
  if (c.expectPath) check(`${c.name} [path]`, path, c.expectPath);
  if (c.expectValue) check(`${c.name} [value]`, val, c.expectValue);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
