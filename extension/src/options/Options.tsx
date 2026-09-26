import { useState, useEffect, useCallback } from 'react';
import type { PersonalInfo, Education, Experience, AIModelConfig } from '../types/models';
import {
  personalInfoDB,
  educationDB,
  experienceDB,
  aiConfigDB,
  generateId,
  exportAllData,
  importAllData,
} from '../storage/db';
import ResumeUpload from './ResumeUpload';
import './Options.css';

type PageType = 'personal' | 'education' | 'experience' | 'ai' | 'resume' | 'backup';

function createEmptyPersonalInfo(): PersonalInfo {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: '',
    gender: '',
    birthDate: '',
    phone: '',
    email: '',
    targetCities: [],
    targetPositions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createEmptyEducation(): Education {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    type: '本科',
    school: '',
    major: '',
    startDate: '',
    endDate: '',
    isPrimary: false,
    order: 0,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

function createEmptyExperience(): Experience {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    type: '实习',
    organization: '',
    role: '',
    startDate: '',
    endDate: '',
    description: '',
    bullets: [''],
    versions: [],
    abilityTags: [],
    industryTags: [],
    order: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export default function Options() {
  const [activePage, setActivePage] = useState<PageType>('personal');
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>(createEmptyPersonalInfo());
  const [educations, setEducations] = useState<Education[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [aiConfigs, setAIConfigs] = useState<AIModelConfig[]>([]);
  const [saveStatus, setSaveStatus] = useState('');

  // 加载数据
  const loadData = useCallback(async () => {
    const [info, edus, exps, configs] = await Promise.all([
      personalInfoDB.get(),
      educationDB.getAll(),
      experienceDB.getAll(),
      aiConfigDB.getAll(),
    ]);
    if (info) setPersonalInfo(info);
    setEducations(edus.sort((a, b) => a.order - b.order));
    setExperiences(exps.sort((a, b) => a.order - b.order));
    setAIConfigs(configs);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 保存个人信息
  const savePersonalInfo = async () => {
    const updated = { ...personalInfo, updatedAt: new Date().toISOString() };
    await personalInfoDB.save(updated);
    setPersonalInfo(updated);
    setSaveStatus('✅ 个人信息已保存');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  // 保存教育经历
  const saveEducation = async (edu: Education) => {
    const updated = { ...edu, updatedAt: new Date().toISOString() };
    await educationDB.save(updated);
    await loadData();
    setSaveStatus('✅ 教育经历已保存');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  // 保存工作经历
  const saveExperience = async (exp: Experience) => {
    const updated = { ...exp, updatedAt: new Date().toISOString() };
    await experienceDB.save(updated);
    await loadData();
    setSaveStatus('✅ 经历已保存');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  // 删除教育经历
  const deleteEducation = async (id: string) => {
    if (confirm('确定删除该教育经历吗？')) {
      await educationDB.delete(id);
      await loadData();
    }
  };

  // 删除经历
  const deleteExperience = async (id: string) => {
    if (confirm('确定删除该经历吗？')) {
      await experienceDB.delete(id);
      await loadData();
    }
  };

  // 保存 AI 配置
  const saveAIConfig = async (config: AIModelConfig) => {
    // 如果设为激活，先取消其他的激活状态
    if (config.isActive) {
      for (const c of aiConfigs) {
        if (c.id !== config.id && c.isActive) {
          await aiConfigDB.save({ ...c, isActive: false });
        }
      }
    }
    await aiConfigDB.save(config);
    await loadData();
    setSaveStatus('✅ AI 配置已保存');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  // 导出数据
  const handleExport = async () => {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campus-apply-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveStatus('✅ 数据已导出');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  // 导入数据
  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.version) {
          alert('无效的备份文件');
          return;
        }
        if (confirm('导入将覆盖所有现有数据，确定继续吗？')) {
          await importAllData(data);
          await loadData();
          setSaveStatus('✅ 数据已成功恢复');
          setTimeout(() => setSaveStatus(''), 2000);
        }
      } catch {
        alert('文件解析失败，请确认文件格式正确');
      }
    };
    input.click();
  };

  return (
    <div className="options-page">
      {/* 侧边导航 */}
      <nav className="options-nav">
        <div className="options-nav-header">
          <span className="options-nav-logo">🎓</span>
          <div>
            <h1>CampusApply</h1>
            <p>个人信息管理中心</p>
          </div>
        </div>
        <div className="options-nav-items">
          {([
            { key: 'personal', icon: '👤', label: '基础信息' },
            { key: 'education', icon: '🎓', label: '教育经历' },
            { key: 'experience', icon: '💼', label: '实习/项目经历' },
            { key: 'ai', icon: '🤖', label: 'AI 模型配置' },
            { key: 'resume', icon: '📄', label: '简历解析' },
            { key: 'backup', icon: '💾', label: '数据备份' },
          ] as { key: PageType; icon: string; label: string }[]).map((item) => (
            <button
              key={item.key}
              className={`options-nav-item ${activePage === item.key ? 'active' : ''}`}
              onClick={() => setActivePage(item.key)}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="options-main">
        {saveStatus && <div className="options-save-status">{saveStatus}</div>}

        {/* ===== 基础信息 ===== */}
        {activePage === 'personal' && (
          <div className="options-section">
            <h2>👤 个人基础信息</h2>
            <p className="options-desc">填写您的个人基础信息，用于自动匹配网申表单字段</p>

            <div className="options-form-grid">
              <div className="ca-form-group">
                <label className="ca-label required">姓名</label>
                <input className="ca-input" value={personalInfo.name}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, name: e.target.value })}
                  placeholder="请输入真实姓名" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">英文名</label>
                <input className="ca-input" value={personalInfo.nameEn || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, nameEn: e.target.value })}
                  placeholder="English Name" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label required">性别</label>
                <select className="ca-input ca-select" value={personalInfo.gender}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, gender: e.target.value as PersonalInfo['gender'] })}>
                  <option value="">请选择</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </div>
              <div className="ca-form-group">
                <label className="ca-label">出生日期</label>
                <input className="ca-input" type="date" value={personalInfo.birthDate}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, birthDate: e.target.value })} />
              </div>
              <div className="ca-form-group">
                <label className="ca-label required">手机号码</label>
                <input className="ca-input" value={personalInfo.phone}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, phone: e.target.value })}
                  placeholder="请输入手机号" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label required">电子邮箱</label>
                <input className="ca-input" type="email" value={personalInfo.email}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, email: e.target.value })}
                  placeholder="请输入邮箱" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">民族</label>
                <input className="ca-input" value={personalInfo.ethnicity || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, ethnicity: e.target.value })}
                  placeholder="如：汉族" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">政治面貌</label>
                <select className="ca-input ca-select" value={personalInfo.politicalStatus || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, politicalStatus: e.target.value })}>
                  <option value="">请选择</option>
                  <option value="群众">群众</option>
                  <option value="共青团员">共青团员</option>
                  <option value="中共党员">中共党员</option>
                  <option value="中共预备党员">中共预备党员</option>
                </select>
              </div>
              <div className="ca-form-group">
                <label className="ca-label">籍贯</label>
                <input className="ca-input" value={personalInfo.nativePlace || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, nativePlace: e.target.value })}
                  placeholder="如：广东省广州市" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">现居城市</label>
                <input className="ca-input" value={personalInfo.currentCity || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, currentCity: e.target.value })}
                  placeholder="如：北京市" />
              </div>
            </div>

            <div className="ca-divider" />
            <h3>🔗 社交账号</h3>
            <div className="options-form-grid">
              <div className="ca-form-group">
                <label className="ca-label">微信号</label>
                <input className="ca-input" value={personalInfo.wechat || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, wechat: e.target.value })} />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">LinkedIn</label>
                <input className="ca-input" value={personalInfo.linkedin || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, linkedin: e.target.value })}
                  placeholder="LinkedIn 主页链接" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">GitHub</label>
                <input className="ca-input" value={personalInfo.github || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, github: e.target.value })}
                  placeholder="GitHub 主页链接" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">作品集</label>
                <input className="ca-input" value={personalInfo.portfolio || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, portfolio: e.target.value })}
                  placeholder="作品集链接" />
              </div>
            </div>

            <div className="ca-divider" />
            <h3>🎯 求职意向</h3>
            <div className="options-form-grid">
              <div className="ca-form-group">
                <label className="ca-label">意向城市</label>
                <input className="ca-input"
                  value={personalInfo.targetCities.join(', ')}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, targetCities: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="如：北京, 上海, 深圳（用逗号分隔）" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">意向岗位</label>
                <input className="ca-input"
                  value={personalInfo.targetPositions.join(', ')}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, targetPositions: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="如：产品经理, 数据分析（用逗号分隔）" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">期望薪资</label>
                <input className="ca-input" value={personalInfo.expectedSalary || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, expectedSalary: e.target.value })}
                  placeholder="如：15K-25K" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">期望月薪（税前）</label>
                <input className="ca-input" value={personalInfo.expectedMonthlySalary || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, expectedMonthlySalary: e.target.value })}
                  placeholder="如：15K-25K" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">期望年薪</label>
                <input className="ca-input" value={personalInfo.expectedAnnualSalary || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, expectedAnnualSalary: e.target.value })}
                  placeholder="如：20W-35W" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">期望从事行业</label>
                <input className="ca-input" value={personalInfo.expectedIndustry || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, expectedIndustry: e.target.value })}
                  placeholder="如：互联网, 人工智能（用逗号分隔）" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">是否接受调剂</label>
                <select className="ca-input ca-select" value={personalInfo.acceptsAdjustment || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, acceptsAdjustment: e.target.value as PersonalInfo['acceptsAdjustment'] })}>
                  <option value="">请选择</option>
                  <option value="是">是</option>
                  <option value="否">否</option>
                </select>
              </div>
              <div className="ca-form-group">
                <label className="ca-label">招聘渠道来源</label>
                <input className="ca-input" value={personalInfo.recruitmentChannel || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, recruitmentChannel: e.target.value })}
                  placeholder="如：公司官网、校园宣讲会" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">选择该城市原因</label>
                <input className="ca-input" value={personalInfo.cityPreferenceReason || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, cityPreferenceReason: e.target.value })}
                  placeholder="如：长期在此求学，希望在此发展" />
              </div>
              <div className="ca-form-group">
                <label className="ca-label">可到岗日期</label>
                <input className="ca-input" type="date" value={personalInfo.availableDate || ''}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, availableDate: e.target.value })} />
              </div>
            </div>

            <button className="ca-btn ca-btn-primary ca-btn-lg" onClick={savePersonalInfo} style={{ marginTop: '16px' }}>
              💾 保存个人信息
            </button>
          </div>
        )}

        {/* ===== 教育经历 ===== */}
        {activePage === 'education' && (
          <div className="options-section">
            <div className="options-section-header">
              <div>
                <h2>🎓 教育经历</h2>
                <p className="options-desc">管理您的教育经历信息</p>
              </div>
              <button className="ca-btn ca-btn-primary" onClick={() => {
                const newEdu = createEmptyEducation();
                newEdu.order = educations.length;
                setEducations([...educations, newEdu]);
              }}>
                ➕ 添加教育经历
              </button>
            </div>

            {educations.length === 0 ? (
              <div className="ca-empty">
                <div className="ca-empty-icon">🎓</div>
                <p>暂无教育经历</p>
                <p style={{ fontSize: '12px' }}>点击上方按钮添加</p>
              </div>
            ) : (
              educations.map((edu, index) => (
                <div key={edu.id} className="ca-card" style={{ marginBottom: '16px' }}>
                  <div className="options-card-header">
                    <h3>教育经历 #{index + 1}</h3>
                    <button className="ca-btn ca-btn-danger ca-btn-sm" onClick={() => deleteEducation(edu.id)}>删除</button>
                  </div>
                  <div className="options-form-grid">
                    <div className="ca-form-group">
                      <label className="ca-label required">学历类型</label>
                      <select className="ca-input ca-select" value={edu.type}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, type: e.target.value as Education['type'] }; setEducations(updated); }}>
                        <option value="本科">本科</option>
                        <option value="硕士">硕士</option>
                        <option value="博士">博士</option>
                        <option value="交换">交换</option>
                      </select>
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label required">学校名称</label>
                      <input className="ca-input" value={edu.school}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, school: e.target.value }; setEducations(updated); }}
                        placeholder="如：北京大学" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">学院</label>
                      <input className="ca-input" value={edu.college || ''}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, college: e.target.value }; setEducations(updated); }}
                        placeholder="如：信息科学技术学院" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label required">专业</label>
                      <input className="ca-input" value={edu.major}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, major: e.target.value }; setEducations(updated); }}
                        placeholder="如：计算机科学与技术" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">入学时间</label>
                      <input className="ca-input" type="date" value={edu.startDate}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, startDate: e.target.value }; setEducations(updated); }} />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">毕业时间</label>
                      <input className="ca-input" type="date" value={edu.endDate}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, endDate: e.target.value }; setEducations(updated); }} />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">GPA</label>
                      <input className="ca-input" value={edu.gpa || ''}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, gpa: e.target.value }; setEducations(updated); }}
                        placeholder="如：3.8" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">GPA 满分</label>
                      <input className="ca-input" value={edu.gpaTotal || ''}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, gpaTotal: e.target.value }; setEducations(updated); }}
                        placeholder="如：4.0" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">排名</label>
                      <input className="ca-input" value={edu.ranking || ''}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, ranking: e.target.value }; setEducations(updated); }}
                        placeholder="如：5/120" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">四级成绩</label>
                      <input className="ca-input" value={edu.cet4 || ''}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, cet4: e.target.value }; setEducations(updated); }}
                        placeholder="如：550" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">六级成绩</label>
                      <input className="ca-input" value={edu.cet6 || ''}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, cet6: e.target.value }; setEducations(updated); }}
                        placeholder="如：520" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">培养方式</label>
                      <select className="ca-input ca-select" value={edu.trainingMode || ''}
                        onChange={(e) => { const updated = [...educations]; updated[index] = { ...edu, trainingMode: e.target.value }; setEducations(updated); }}>
                        <option value="">请选择</option>
                        <option value="全日制">全日制</option>
                        <option value="非全日制">非全日制</option>
                      </select>
                    </div>
                  </div>
                  <button className="ca-btn ca-btn-primary" onClick={() => saveEducation(edu)} style={{ marginTop: '12px' }}>
                    💾 保存此经历
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== 实习/项目经历 ===== */}
        {activePage === 'experience' && (
          <div className="options-section">
            <div className="options-section-header">
              <div>
                <h2>💼 实习 / 项目经历</h2>
                <p className="options-desc">管理您的实习、项目、科研等经历</p>
              </div>
              <button className="ca-btn ca-btn-primary" onClick={() => {
                const newExp = createEmptyExperience();
                newExp.order = experiences.length;
                setExperiences([...experiences, newExp]);
              }}>
                ➕ 添加经历
              </button>
            </div>

            {experiences.length === 0 ? (
              <div className="ca-empty">
                <div className="ca-empty-icon">💼</div>
                <p>暂无经历</p>
              </div>
            ) : (
              experiences.map((exp, index) => (
                <div key={exp.id} className="ca-card" style={{ marginBottom: '16px' }}>
                  <div className="options-card-header">
                    <h3>经历 #{index + 1}</h3>
                    <button className="ca-btn ca-btn-danger ca-btn-sm" onClick={() => deleteExperience(exp.id)}>删除</button>
                  </div>
                  <div className="options-form-grid">
                    <div className="ca-form-group">
                      <label className="ca-label">经历类型</label>
                      <select className="ca-input ca-select" value={exp.type}
                        onChange={(e) => { const u = [...experiences]; u[index] = { ...exp, type: e.target.value as Experience['type'] }; setExperiences(u); }}>
                        <option value="实习">实习</option>
                        <option value="项目">项目</option>
                        <option value="科研">科研</option>
                        <option value="校园">校园</option>
                        <option value="竞赛">竞赛</option>
                        <option value="其他">其他</option>
                      </select>
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label required">公司/组织</label>
                      <input className="ca-input" value={exp.organization}
                        onChange={(e) => { const u = [...experiences]; u[index] = { ...exp, organization: e.target.value }; setExperiences(u); }}
                        placeholder="如：字节跳动" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label required">岗位/角色</label>
                      <input className="ca-input" value={exp.role}
                        onChange={(e) => { const u = [...experiences]; u[index] = { ...exp, role: e.target.value }; setExperiences(u); }}
                        placeholder="如：产品经理实习生" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">工作地点</label>
                      <input className="ca-input" value={exp.location || ''}
                        onChange={(e) => { const u = [...experiences]; u[index] = { ...exp, location: e.target.value }; setExperiences(u); }}
                        placeholder="如：北京" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">开始时间</label>
                      <input className="ca-input" type="date" value={exp.startDate}
                        onChange={(e) => { const u = [...experiences]; u[index] = { ...exp, startDate: e.target.value }; setExperiences(u); }} />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">结束时间</label>
                      <input className="ca-input" type="date" value={exp.endDate}
                        onChange={(e) => { const u = [...experiences]; u[index] = { ...exp, endDate: e.target.value }; setExperiences(u); }} />
                    </div>
                  </div>
                  <div className="ca-form-group">
                    <label className="ca-label">核心描述</label>
                    <textarea className="ca-input ca-textarea" value={exp.description}
                      onChange={(e) => { const u = [...experiences]; u[index] = { ...exp, description: e.target.value }; setExperiences(u); }}
                      placeholder="简要描述您在该经历中的角色和贡献" />
                  </div>
                  <div className="ca-form-group">
                    <label className="ca-label">核心要点（每行一条）</label>
                    <textarea className="ca-input ca-textarea" value={exp.bullets.join('\n')}
                      onChange={(e) => { const u = [...experiences]; u[index] = { ...exp, bullets: e.target.value.split('\n') }; setExperiences(u); }}
                      placeholder="• 负责 XXX 产品的需求分析与原型设计&#10;• 实现了 XXX 功能，提升 XX% 用户留存" />
                  </div>
                  <button className="ca-btn ca-btn-primary" onClick={() => saveExperience(exp)} style={{ marginTop: '12px' }}>
                    💾 保存此经历
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== AI 配置 ===== */}
        {activePage === 'ai' && (
          <div className="options-section">
            <div className="options-section-header">
              <div>
                <h2>🤖 AI 模型配置</h2>
                <p className="options-desc">配置您使用的大语言模型，用于智能字段匹配和内容生成</p>
              </div>
              <button className="ca-btn ca-btn-primary" onClick={() => {
                const newConfig: AIModelConfig = {
                  id: generateId(),
                  provider: 'openai',
                  name: '新模型配置',
                  model: 'gpt-4o-mini',
                  isActive: aiConfigs.length === 0,
                  createdAt: new Date().toISOString(),
                };
                setAIConfigs([...aiConfigs, newConfig]);
              }}>
                ➕ 添加模型
              </button>
            </div>

            {aiConfigs.length === 0 ? (
              <div className="ca-card">
                <div className="ca-empty">
                  <div className="ca-empty-icon">🤖</div>
                  <p>暂未配置 AI 模型</p>
                  <p style={{ fontSize: '12px' }}>配置后可使用智能匹配和内容生成功能</p>
                </div>
              </div>
            ) : (
              aiConfigs.map((config, index) => (
                <div key={config.id} className="ca-card" style={{ marginBottom: '16px' }}>
                  <div className="options-card-header">
                    <h3>
                      {config.name}
                      {config.isActive && <span className="ca-badge ca-badge-success" style={{ marginLeft: '8px' }}>当前使用</span>}
                    </h3>
                    <button className="ca-btn ca-btn-danger ca-btn-sm" onClick={async () => {
                      await aiConfigDB.delete(config.id);
                      await loadData();
                    }}>删除</button>
                  </div>
                  <div className="options-form-grid">
                    <div className="ca-form-group">
                      <label className="ca-label">配置名称</label>
                      <input className="ca-input" value={config.name}
                        onChange={(e) => { const u = [...aiConfigs]; u[index] = { ...config, name: e.target.value }; setAIConfigs(u); }} />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">模型提供商</label>
                      <select className="ca-input ca-select" value={config.provider}
                        onChange={(e) => {
                          const provider = e.target.value as AIModelConfig['provider'];
                          const defaultModels: Record<string, string> = {
                            openai: 'gpt-4o-mini',
                            claude: 'claude-3-5-sonnet-20241022',
                            deepseek: 'deepseek-chat',
                            minimax: 'MiniMax-Text-01',
                            zhipu: 'glm-4-flash',
                            moonshot: 'moonshot-v1-8k',
                            qianwen: 'qwen-turbo',
                            doubao: 'doubao-pro-4k',
                            baichuan: 'Baichuan4',
                            ollama: 'llama3',
                            custom: '',
                          };
                          const u = [...aiConfigs];
                          u[index] = { ...config, provider, model: defaultModels[provider] || config.model };
                          setAIConfigs(u);
                        }}>
                        <option value="openai">OpenAI</option>
                        <option value="claude">Anthropic Claude</option>
                        <option value="deepseek">DeepSeek 深度求索</option>
                        <option value="minimax">MiniMax</option>
                        <option value="zhipu">智谱 GLM</option>
                        <option value="moonshot">月之暗面 Kimi</option>
                        <option value="qianwen">阿里通义千问</option>
                        <option value="doubao">字节跳动豆包</option>
                        <option value="baichuan">百川智能</option>
                        <option value="ollama">Ollama（本地）</option>
                        <option value="custom">自定义（兼容 OpenAI 格式）</option>
                      </select>
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">模型名称</label>
                      <input className="ca-input" value={config.model}
                        onChange={(e) => { const u = [...aiConfigs]; u[index] = { ...config, model: e.target.value }; setAIConfigs(u); }}
                        placeholder="如：gpt-4o-mini" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">API Key</label>
                      <input className="ca-input" type="password" value={config.apiKey || ''}
                        onChange={(e) => { const u = [...aiConfigs]; u[index] = { ...config, apiKey: e.target.value }; setAIConfigs(u); }}
                        placeholder="仅存储在本地" />
                    </div>
                    <div className="ca-form-group">
                      <label className="ca-label">API Base URL（可选）</label>
                      <input className="ca-input" value={config.baseUrl || ''}
                        onChange={(e) => { const u = [...aiConfigs]; u[index] = { ...config, baseUrl: e.target.value }; setAIConfigs(u); }}
                        placeholder="如自定义代理地址" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button className="ca-btn ca-btn-primary" onClick={() => saveAIConfig(config)}>
                      💾 保存
                    </button>
                    {!config.isActive && (
                      <button className="ca-btn ca-btn-outline" onClick={() => saveAIConfig({ ...config, isActive: true })}>
                        ✅ 设为默认
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}

            <div className="ca-card" style={{ marginTop: '16px', background: '#f0fdf4' }}>
              <h4>🔒 安全说明</h4>
              <ul style={{ fontSize: '13px', color: '#15803d', paddingLeft: '20px', marginTop: '8px' }}>
                <li>API Key 仅存储在您的浏览器本地存储中</li>
                <li>API 请求直接发送到模型厂商官方服务器</li>
                <li>本插件不会收集、上传或共享您的任何密钥</li>
              </ul>
            </div>
          </div>
        )}

        {/* ===== 简历解析 ===== */}
        {activePage === 'resume' && (
          <div className="options-section">
            <h2>📄 简历智能解析</h2>
            <p className="options-desc">上传简历文件，AI 自动提取个人信息、教育经历、实习经历等数据，一键填充个人信息</p>
            <ResumeUpload onComplete={loadData} />
          </div>
        )}

        {/* ===== 数据备份 ===== */}
        {activePage === 'backup' && (
          <div className="options-section">
            <h2>💾 数据备份与恢复</h2>
            <p className="options-desc">备份或恢复您的所有个人信息，确保数据安全</p>

            <div className="backup-cards">
              <div className="ca-card">
                <h3>📤 导出数据</h3>
                <p style={{ fontSize: '13px', color: 'var(--ca-text-secondary)', margin: '8px 0' }}>
                  将所有个人信息、经历、AI 配置导出为 JSON 文件
                </p>
                <button className="ca-btn ca-btn-primary" onClick={handleExport}>
                  📤 导出全部数据
                </button>
              </div>

              <div className="ca-card">
                <h3>📥 导入数据</h3>
                <p style={{ fontSize: '13px', color: 'var(--ca-text-secondary)', margin: '8px 0' }}>
                  从之前导出的备份文件中恢复数据（将覆盖现有数据）
                </p>
                <button className="ca-btn ca-btn-outline" onClick={handleImport}>
                  📥 从备份恢复
                </button>
              </div>
            </div>

            <div className="ca-card" style={{ marginTop: '16px', background: '#eff6ff' }}>
              <h4>💡 备份建议</h4>
              <ul style={{ fontSize: '13px', color: '#1e40af', paddingLeft: '20px', marginTop: '8px' }}>
                <li>建议定期导出数据作为备份</li>
                <li>更换浏览器或设备前，请先导出数据</li>
                <li>备份文件包含所有个人信息，请妥善保管</li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
