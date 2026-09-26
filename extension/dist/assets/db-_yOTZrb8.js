function b(e){if(e.baseUrl)return e.baseUrl.replace(/\/$/,"");switch(e.provider){case"openai":return"https://api.openai.com/v1";case"claude":return"https://api.anthropic.com/v1";case"doubao":return"https://ark.cn-beijing.volces.com/api/v3";case"qianwen":return"https://dashscope.aliyuncs.com/compatible-mode/v1";case"minimax":return"https://api.minimax.chat/v1";case"deepseek":return"https://api.deepseek.com/v1";case"zhipu":return"https://open.bigmodel.cn/api/paas/v4";case"moonshot":return"https://api.moonshot.cn/v1";case"baichuan":return"https://api.baichuan-ai.com/v1";case"ollama":return"http://localhost:11434/v1";case"custom":return e.baseUrl||"https://api.openai.com/v1";default:return"https://api.openai.com/v1"}}async function P(e,a){var s,c,l;const n=b(e);if(e.provider==="claude")return R(e,a);const r=await fetch(`${n}/chat/completions`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${e.apiKey||""}`},body:JSON.stringify({model:e.model,messages:a.messages,temperature:a.temperature??.3,max_tokens:a.maxTokens??1e3})});if(!r.ok){const m=await r.text();throw new Error(`LLM API 调用失败 (${r.status}): ${m}`)}const o=await r.json();return{content:((l=(c=(s=o.choices)==null?void 0:s[0])==null?void 0:c.message)==null?void 0:l.content)||"",usage:o.usage?{promptTokens:o.usage.prompt_tokens,completionTokens:o.usage.completion_tokens}:void 0}}async function R(e,a){var l,m,i;const n=b(e),r=(l=a.messages.find(u=>u.role==="system"))==null?void 0:l.content,o=a.messages.filter(u=>u.role!=="system"),s=await fetch(`${n}/messages`,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":e.apiKey||"","anthropic-version":"2023-06-01"},body:JSON.stringify({model:e.model,max_tokens:a.maxTokens??1e3,system:r,messages:o.map(u=>({role:u.role,content:u.content}))})});if(!s.ok){const u=await s.text();throw new Error(`Claude API 调用失败 (${s.status}): ${u}`)}const c=await s.json();return{content:((i=(m=c.content)==null?void 0:m[0])==null?void 0:i.text)||"",usage:c.usage?{promptTokens:c.usage.input_tokens,completionTokens:c.usage.output_tokens}:void 0}}async function x(e,a,n,r){const o=`你是一个校招网申表单智能填充助手。
  
用户的个人信息如下：
${r}

当前需要填写的表单字段是：
- 字段标签：${a}
- 字段上下文：${n}

请根据用户的个人信息，给出这个字段最合适的填写内容。
注意：
1. 只返回填写的内容本身，不要有任何解释
2. 如果用户信息中没有对应的内容，返回空字符串
3. 确保内容格式正确（如日期、电话号码等）
4. 内容应简洁明了，符合求职场景`;try{const c=(await P(e,{messages:[{role:"system",content:"你是校招网申智能填充助手，只返回表单字段的填写内容。"},{role:"user",content:o}],temperature:.1,maxTokens:500})).content.trim();return{value:c,confidence:c?.7:0}}catch(s){return console.error("[CampusApply] LLM 匹配失败:",s),{value:"",confidence:0}}}async function k(e,a,n,r){const o=`你是一个资深的校招求职辅导专家。

用户的个人信息和经历：
${n}



请帮用户回答以下网申开放性问题：
"${a}"

要求：
1. 回答要个性化，基于用户的真实经历，避免通用模板化内容
2. 400字以内，结构清晰
3. 突出与岗位的匹配度
4. 语气真诚、自信、专业
5. 直接给出答案文本，不要加引号或额外说明`;try{return(await P(e,{messages:[{role:"system",content:"你是校招求职辅导专家，帮助应届生撰写个性化的网申回答。"},{role:"user",content:o}],temperature:.6,maxTokens:1e3})).content.trim()}catch(s){throw console.error("[CampusApply] LLM 生成失败:",s),s}}async function j(e,a){const n=`请将以下简历文本解析为 JSON 结构化数据。

简历文本：
${a.substring(0,5e3)}

请按以下 JSON 格式输出（只输出 JSON，不要有其他文字）：
{
  "name": "姓名",
  "gender": "男/女",
  "phone": "手机号",
  "email": "邮箱",
  "birthDate": "YYYY-MM-DD",
  "nativePlace": "籍贯",
  "politicalStatus": "政治面貌",
  "educations": [
    {
      "type": "本科/硕士/博士",
      "school": "学校名称",
      "college": "学院",
      "major": "专业",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "gpa": "绩点",
      "ranking": "排名"
    }
  ],
  "experiences": [
    {
      "type": "实习/项目/科研/校园",
      "organization": "公司/组织",
      "role": "岗位",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "description": "描述",
      "bullets": ["要点1", "要点2"]
    }
  ],
  "skills": ["技能1", "技能2"]
}

注意：
1. 只输出合法的 JSON，不要有任何前缀后缀
2. 无法提取的字段留空字符串
3. 日期统一为 YYYY-MM 格式`;try{let o=(await P(e,{messages:[{role:"system",content:"你是简历解析专家，将简历文本转换为结构化 JSON 数据。只输出 JSON。"},{role:"user",content:n}],temperature:.1,maxTokens:2e3})).content.trim();return o=o.replace(/^```(?:json)?\s*/,"").replace(/\s*```$/,""),JSON.parse(o)}catch(r){throw console.error("[CampusApply] 简历解析失败:",r),r}}const D="CampusApplyAgent",_=1,t={PERSONAL_INFO:"personalInfo",EDUCATIONS:"educations",EXPERIENCES:"experiences",SKILLS:"skills",ATTACHMENTS:"attachments",QA_MATERIALS:"qaMaterials",AI_CONFIGS:"aiConfigs",APPLICATION_RECORDS:"applicationRecords"};function I(){return new Promise((e,a)=>{const n=indexedDB.open(D,_);n.onupgradeneeded=r=>{const o=r.target.result;if(o.objectStoreNames.contains(t.PERSONAL_INFO)||o.createObjectStore(t.PERSONAL_INFO,{keyPath:"id"}),!o.objectStoreNames.contains(t.EDUCATIONS)){const s=o.createObjectStore(t.EDUCATIONS,{keyPath:"id"});s.createIndex("type","type",{unique:!1}),s.createIndex("order","order",{unique:!1})}if(!o.objectStoreNames.contains(t.EXPERIENCES)){const s=o.createObjectStore(t.EXPERIENCES,{keyPath:"id"});s.createIndex("type","type",{unique:!1}),s.createIndex("order","order",{unique:!1})}if(o.objectStoreNames.contains(t.SKILLS)||o.createObjectStore(t.SKILLS,{keyPath:"id"}),o.objectStoreNames.contains(t.ATTACHMENTS)||o.createObjectStore(t.ATTACHMENTS,{keyPath:"id"}).createIndex("type","type",{unique:!1}),o.objectStoreNames.contains(t.QA_MATERIALS)||o.createObjectStore(t.QA_MATERIALS,{keyPath:"id"}).createIndex("category","category",{unique:!1}),o.objectStoreNames.contains(t.AI_CONFIGS)||o.createObjectStore(t.AI_CONFIGS,{keyPath:"id"}),!o.objectStoreNames.contains(t.APPLICATION_RECORDS)){const s=o.createObjectStore(t.APPLICATION_RECORDS,{keyPath:"id"});s.createIndex("status","status",{unique:!1}),s.createIndex("appliedAt","appliedAt",{unique:!1})}},n.onsuccess=()=>e(n.result),n.onerror=()=>a(n.error)})}function L(){return`${Date.now()}_${Math.random().toString(36).substring(2,9)}`}async function p(e){const a=await I();return new Promise((n,r)=>{const c=a.transaction(e,"readonly").objectStore(e).getAll();c.onsuccess=()=>n(c.result),c.onerror=()=>r(c.error)})}async function f(e,a){const n=await I();return new Promise((r,o)=>{const l=n.transaction(e,"readonly").objectStore(e).get(a);l.onsuccess=()=>r(l.result),l.onerror=()=>o(l.error)})}async function S(e,a){const n=await I();return new Promise((r,o)=>{const s=n.transaction(e,"readwrite");s.objectStore(e).put(a),s.oncomplete=()=>r(),s.onerror=()=>o(s.error)})}async function d(e,a){const n=await I();return new Promise((r,o)=>{const s=n.transaction(e,"readwrite");s.objectStore(e).delete(a),s.oncomplete=()=>r(),s.onerror=()=>o(s.error)})}async function A(e){const a=await I();return new Promise((n,r)=>{const o=a.transaction(e,"readwrite");o.objectStore(e).clear(),o.oncomplete=()=>n(),o.onerror=()=>r(o.error)})}const E={get:async()=>(await p(t.PERSONAL_INFO))[0],save:e=>S(t.PERSONAL_INFO,e),clear:()=>A(t.PERSONAL_INFO)},h={getAll:()=>p(t.EDUCATIONS),getById:e=>f(t.EDUCATIONS,e),save:e=>S(t.EDUCATIONS,e),delete:e=>d(t.EDUCATIONS,e),clear:()=>A(t.EDUCATIONS)},O={getAll:()=>p(t.EXPERIENCES),getById:e=>f(t.EXPERIENCES,e),save:e=>S(t.EXPERIENCES,e),delete:e=>d(t.EXPERIENCES,e),clear:()=>A(t.EXPERIENCES)},g={getAll:()=>p(t.SKILLS),save:e=>S(t.SKILLS,e),delete:e=>d(t.SKILLS,e),clear:()=>A(t.SKILLS)},y={getAll:()=>p(t.ATTACHMENTS),getById:e=>f(t.ATTACHMENTS,e),save:e=>S(t.ATTACHMENTS,e),delete:e=>d(t.ATTACHMENTS,e),clear:()=>A(t.ATTACHMENTS)},N={getAll:()=>p(t.QA_MATERIALS),save:e=>S(t.QA_MATERIALS,e),delete:e=>d(t.QA_MATERIALS,e),clear:()=>A(t.QA_MATERIALS)},T={getAll:()=>p(t.AI_CONFIGS),getActive:async()=>(await p(t.AI_CONFIGS)).find(a=>a.isActive),save:e=>S(t.AI_CONFIGS,e),delete:e=>d(t.AI_CONFIGS,e),clear:()=>A(t.AI_CONFIGS)},C={getAll:()=>p(t.APPLICATION_RECORDS),getById:e=>f(t.APPLICATION_RECORDS,e),save:e=>S(t.APPLICATION_RECORDS,e),delete:e=>d(t.APPLICATION_RECORDS,e),clear:()=>A(t.APPLICATION_RECORDS)};async function v(){const[e,a,n,r,o,s,c,l]=await Promise.all([E.get(),h.getAll(),O.getAll(),g.getAll(),y.getAll(),N.getAll(),T.getAll(),C.getAll()]);return{version:"1.0.0",exportedAt:new Date().toISOString(),personalInfo:e||M(),educations:a,experiences:n,skills:r,attachments:o,qaMaterials:s,aiConfigs:c,applicationRecords:l}}async function w(e){var n,r,o,s,c,l,m;await Promise.all([E.clear(),h.clear(),O.clear(),g.clear(),y.clear(),N.clear(),T.clear(),C.clear()]);const a=[];e.personalInfo&&a.push(E.save(e.personalInfo)),(n=e.educations)==null||n.forEach(i=>a.push(h.save(i))),(r=e.experiences)==null||r.forEach(i=>a.push(O.save(i))),(o=e.skills)==null||o.forEach(i=>a.push(g.save(i))),(s=e.attachments)==null||s.forEach(i=>a.push(y.save(i))),(c=e.qaMaterials)==null||c.forEach(i=>a.push(N.save(i))),(l=e.aiConfigs)==null||l.forEach(i=>a.push(T.save(i))),(m=e.applicationRecords)==null||m.forEach(i=>a.push(C.save(i))),await Promise.all(a)}function M(){const e=new Date().toISOString();return{id:L(),name:"",gender:"",birthDate:"",phone:"",email:"",targetCities:[],targetPositions:[],createdAt:e,updatedAt:e}}const Y=Object.freeze(Object.defineProperty({__proto__:null,aiConfigDB:T,applicationDB:C,attachmentDB:y,educationDB:h,experienceDB:O,exportAllData:v,generateId:L,importAllData:w,personalInfoDB:E,qaMaterialDB:N,skillDB:g},Symbol.toStringTag,{value:"Module"}));export{T as a,O as b,k as c,j as d,h as e,v as f,L as g,Y as h,w as i,x as l,E as p,g as s};
