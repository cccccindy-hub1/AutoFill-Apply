// ============================================================
// IndexedDB 本地存储封装
// 所有用户数据存储在浏览器本地，不上传云端
// ============================================================

import type {
  PersonalInfo,
  Education,
  Experience,
  SkillInfo,
  Attachment,
  QAMaterial,
  AIModelConfig,
  ApplicationRecord,
  UserData,
} from '../types/models';

const DB_NAME = 'CampusApplyAgent';
const DB_VERSION = 1;

// Store 名称常量
const STORES = {
  PERSONAL_INFO: 'personalInfo',
  EDUCATIONS: 'educations',
  EXPERIENCES: 'experiences',
  SKILLS: 'skills',
  ATTACHMENTS: 'attachments',
  QA_MATERIALS: 'qaMaterials',
  AI_CONFIGS: 'aiConfigs',
  APPLICATION_RECORDS: 'applicationRecords',
} as const;

/** 打开/初始化数据库 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建所有 Object Store
      if (!db.objectStoreNames.contains(STORES.PERSONAL_INFO)) {
        db.createObjectStore(STORES.PERSONAL_INFO, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.EDUCATIONS)) {
        const store = db.createObjectStore(STORES.EDUCATIONS, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('order', 'order', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.EXPERIENCES)) {
        const store = db.createObjectStore(STORES.EXPERIENCES, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('order', 'order', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SKILLS)) {
        db.createObjectStore(STORES.SKILLS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.ATTACHMENTS)) {
        const store = db.createObjectStore(STORES.ATTACHMENTS, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.QA_MATERIALS)) {
        const store = db.createObjectStore(STORES.QA_MATERIALS, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.AI_CONFIGS)) {
        db.createObjectStore(STORES.AI_CONFIGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.APPLICATION_RECORDS)) {
        const store = db.createObjectStore(STORES.APPLICATION_RECORDS, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('appliedAt', 'appliedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 生成唯一 ID */
export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// =================== 通用 CRUD 操作 ===================

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put<T>(storeName: string, data: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteById(storeName: string, id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// =================== 个人信息 ===================

export const personalInfoDB = {
  get: async (): Promise<PersonalInfo | undefined> => {
    const all = await getAll<PersonalInfo>(STORES.PERSONAL_INFO);
    return all[0]; // 只有一条记录
  },
  save: (info: PersonalInfo) => put(STORES.PERSONAL_INFO, info),
  clear: () => clearStore(STORES.PERSONAL_INFO),
};

// =================== 教育经历 ===================

export const educationDB = {
  getAll: () => getAll<Education>(STORES.EDUCATIONS),
  getById: (id: string) => getById<Education>(STORES.EDUCATIONS, id),
  save: (edu: Education) => put(STORES.EDUCATIONS, edu),
  delete: (id: string) => deleteById(STORES.EDUCATIONS, id),
  clear: () => clearStore(STORES.EDUCATIONS),
};

// =================== 经历 ===================

export const experienceDB = {
  getAll: () => getAll<Experience>(STORES.EXPERIENCES),
  getById: (id: string) => getById<Experience>(STORES.EXPERIENCES, id),
  save: (exp: Experience) => put(STORES.EXPERIENCES, exp),
  delete: (id: string) => deleteById(STORES.EXPERIENCES, id),
  clear: () => clearStore(STORES.EXPERIENCES),
};

// =================== 技能 ===================

export const skillDB = {
  getAll: () => getAll<SkillInfo>(STORES.SKILLS),
  save: (skill: SkillInfo) => put(STORES.SKILLS, skill),
  delete: (id: string) => deleteById(STORES.SKILLS, id),
  clear: () => clearStore(STORES.SKILLS),
};

// =================== 附件 ===================

export const attachmentDB = {
  getAll: () => getAll<Attachment>(STORES.ATTACHMENTS),
  getById: (id: string) => getById<Attachment>(STORES.ATTACHMENTS, id),
  save: (att: Attachment) => put(STORES.ATTACHMENTS, att),
  delete: (id: string) => deleteById(STORES.ATTACHMENTS, id),
  clear: () => clearStore(STORES.ATTACHMENTS),
};

// =================== 问答素材 ===================

export const qaMaterialDB = {
  getAll: () => getAll<QAMaterial>(STORES.QA_MATERIALS),
  save: (qa: QAMaterial) => put(STORES.QA_MATERIALS, qa),
  delete: (id: string) => deleteById(STORES.QA_MATERIALS, id),
  clear: () => clearStore(STORES.QA_MATERIALS),
};

// =================== AI 配置 ===================

export const aiConfigDB = {
  getAll: () => getAll<AIModelConfig>(STORES.AI_CONFIGS),
  getActive: async (): Promise<AIModelConfig | undefined> => {
    const all = await getAll<AIModelConfig>(STORES.AI_CONFIGS);
    return all.find((c) => c.isActive);
  },
  save: (config: AIModelConfig) => put(STORES.AI_CONFIGS, config),
  delete: (id: string) => deleteById(STORES.AI_CONFIGS, id),
  clear: () => clearStore(STORES.AI_CONFIGS),
};

// =================== 投递记录 ===================

export const applicationDB = {
  getAll: () => getAll<ApplicationRecord>(STORES.APPLICATION_RECORDS),
  getById: (id: string) => getById<ApplicationRecord>(STORES.APPLICATION_RECORDS, id),
  save: (record: ApplicationRecord) => put(STORES.APPLICATION_RECORDS, record),
  delete: (id: string) => deleteById(STORES.APPLICATION_RECORDS, id),
  clear: () => clearStore(STORES.APPLICATION_RECORDS),
};

// =================== 数据备份与恢复 ===================

/** 导出所有数据 */
export async function exportAllData(): Promise<UserData> {
  const [personalInfo, educations, experiences, skills, attachments, qaMaterials, aiConfigs, applicationRecords] =
    await Promise.all([
      personalInfoDB.get(),
      educationDB.getAll(),
      experienceDB.getAll(),
      skillDB.getAll(),
      attachmentDB.getAll(),
      qaMaterialDB.getAll(),
      aiConfigDB.getAll(),
      applicationDB.getAll(),
    ]);

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    personalInfo: personalInfo || createEmptyPersonalInfo(),
    educations,
    experiences,
    skills,
    attachments,
    qaMaterials,
    aiConfigs,
    applicationRecords,
  };
}

/** 导入数据（覆盖所有本地数据） */
export async function importAllData(data: UserData): Promise<void> {
  // 清空所有现有数据
  await Promise.all([
    personalInfoDB.clear(),
    educationDB.clear(),
    experienceDB.clear(),
    skillDB.clear(),
    attachmentDB.clear(),
    qaMaterialDB.clear(),
    aiConfigDB.clear(),
    applicationDB.clear(),
  ]);

  // 写入新数据
  const promises: Promise<void>[] = [];

  if (data.personalInfo) {
    promises.push(personalInfoDB.save(data.personalInfo));
  }
  data.educations?.forEach((e) => promises.push(educationDB.save(e)));
  data.experiences?.forEach((e) => promises.push(experienceDB.save(e)));
  data.skills?.forEach((s) => promises.push(skillDB.save(s)));
  data.attachments?.forEach((a) => promises.push(attachmentDB.save(a)));
  data.qaMaterials?.forEach((q) => promises.push(qaMaterialDB.save(q)));
  data.aiConfigs?.forEach((c) => promises.push(aiConfigDB.save(c)));
  data.applicationRecords?.forEach((r) => promises.push(applicationDB.save(r)));

  await Promise.all(promises);
}

/** 创建空的个人信息 */
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
