// ── CV Data ──────────────────────────────────────────────────────────────────
// Fill in your real data below. All fields marked TODO can be replaced.
// This file is also served as JSON via /api/cv and used by the CV chat tools.

export interface CvSkill {
  name: string;
  category: string; // e.g. "Frontend" | "Backend" | "Language" | "AI/ML" | "DevOps" | "Database" | "Tools"
  proficiency: 'expert' | 'proficient' | 'familiar';
  years?: number;
  tags?: string[]; // synonyms / related keywords for search & highlight
}

export interface CvExperience {
  id: string;
  company: string;
  role: string;
  start: string;  // "YYYY-MM"
  end?: string;   // omit = present
  location?: string;
  description: string;
  highlights: string[];
  technologies: string[];
}

export interface CvEducation {
  institution: string;
  degree: string;
  field: string;
  start: string;
  end?: string;
}

export interface CvProject {
  id: string;
  name: string;
  url?: string;
  description: string;
  technologies: string[];
  highlights?: string[];
}

export interface Cv {
  name: string;
  title: string;
  email?: string;
  location?: string;
  website?: string;
  github?: string;
  summary: string;
  skills: CvSkill[];
  experience: CvExperience[];
  education: CvEducation[];
  projects: CvProject[];
}

export const CV: Cv = {
  name: 'Karol Depka',
  title: 'Full-Stack Software Engineer & Entrepreneur',
  email: 'karol.depka.pr@gmail.com',
  location: 'Poland',
  github: 'github.com/karoldepka',
  summary: `Full-stack engineer and entrepreneur with expertise in web, mobile, and AI-driven development.
Currently building Structable (open-source Airtable alternative) and ComRev (product comparison platform).
Strong background across the stack: from React / React Native frontends to Rust/Node backends, AI agent pipelines, and 3D graphics.`,

  skills: [
    // ── Frontend ──────────────────────────────────────────────────────────────
    { name: 'React',          category: 'Frontend', proficiency: 'expert',     years: 8,  tags: ['javascript', 'jsx', 'hooks', 'web', 'ui', 'components'] },
    { name: 'React Native',   category: 'Mobile',   proficiency: 'expert',     years: 5,  tags: ['mobile', 'expo', 'ios', 'android', 'cross-platform', 'rn'] },
    { name: 'TypeScript',     category: 'Language', proficiency: 'expert',     years: 6,  tags: ['ts', 'javascript', 'typed', 'static analysis'] },
    { name: 'Next.js',        category: 'Frontend', proficiency: 'expert',     years: 4,  tags: ['react', 'ssr', 'ssg', 'web', 'fullstack', 'vercel', 'app router'] },
    { name: 'Three.js',       category: 'Frontend', proficiency: 'proficient', years: 2,  tags: ['3d', 'webgl', 'graphics', 'canvas', 'glsl', 'shaders', 'animation'] },
    { name: 'CSS / Tailwind', category: 'Frontend', proficiency: 'proficient', years: 8,  tags: ['styling', 'ui', 'responsive', 'design', 'tailwindcss'] },

    // ── Backend ───────────────────────────────────────────────────────────────
    { name: 'Rust',           category: 'Language', proficiency: 'proficient', years: 2,  tags: ['systems', 'wasm', 'performance', 'backend', 'webassembly'] },
    { name: 'Node.js',        category: 'Backend',  proficiency: 'expert',     years: 9,  tags: ['javascript', 'server', 'api', 'express', 'fastify'] },
    { name: 'Python',         category: 'Language', proficiency: 'proficient', years: 6,  tags: ['backend', 'ai', 'ml', 'scripting', 'automation', 'langchain'] },
    { name: 'Java',           category: 'Language', proficiency: 'proficient', years: 7,  tags: ['jvm', 'spring', 'spring boot', 'backend', 'oop', 'enterprise', 'maven', 'gradle'] },
    { name: 'Kotlin',         category: 'Language', proficiency: 'familiar',   years: 2,  tags: ['jvm', 'android', 'java', 'coroutines'] },
    { name: 'gRPC / tRPC',    category: 'Backend',  proficiency: 'proficient', years: 2,  tags: ['rpc', 'api', 'protocol', 'rust', 'typescript', 'grpc', 'trpc'] },
    { name: 'GraphQL',        category: 'Backend',  proficiency: 'proficient', years: 3,  tags: ['api', 'query', 'schema', 'backend', 'apollo'] },

    // ── Databases ─────────────────────────────────────────────────────────────
    { name: 'PostgreSQL',     category: 'Database', proficiency: 'expert',     years: 9,  tags: ['sql', 'relational', 'supabase', 'neon', 'postgres', 'jsonb'] },
    { name: 'Supabase',       category: 'Database', proficiency: 'expert',     years: 3,  tags: ['postgres', 'auth', 'realtime', 'storage', 'baas'] },
    { name: 'MongoDB',        category: 'Database', proficiency: 'proficient', years: 4,  tags: ['nosql', 'document', 'json', 'bson'] },
    { name: 'SurrealDB',      category: 'Database', proficiency: 'familiar',   years: 1,  tags: ['multi-model', 'graph', 'nosql', 'document'] },

    // ── AI / ML ───────────────────────────────────────────────────────────────
    { name: 'LangChain / LangGraph', category: 'AI/ML', proficiency: 'proficient', years: 1, tags: ['ai', 'llm', 'agents', 'python', 'react agent', 'tools', 'langgraph'] },
    { name: 'Claude / Anthropic API', category: 'AI/ML', proficiency: 'expert', years: 2, tags: ['anthropic', 'llm', 'ai', 'claude', 'tool-use', 'streaming'] },
    { name: 'Vercel AI SDK',  category: 'AI/ML',    proficiency: 'expert',     years: 1,  tags: ['ai', 'streaming', 'tool-use', 'typescript', 'useChat', 'streamText'] },
    { name: 'OpenAI API',     category: 'AI/ML',    proficiency: 'proficient', years: 2,  tags: ['gpt', 'llm', 'ai', 'openai', 'chatgpt'] },
    { name: 'CopilotKit',     category: 'AI/ML',    proficiency: 'proficient', years: 1,  tags: ['ai', 'copilot', 'agents', 'react', 'coagent'] },

    // ── DevOps / Tools ────────────────────────────────────────────────────────
    { name: 'Docker',         category: 'DevOps',   proficiency: 'proficient', years: 5,  tags: ['containers', 'deployment', 'devops', 'compose'] },
    { name: 'Git',            category: 'Tools',    proficiency: 'expert',     years: 13, tags: ['version-control', 'github', 'collaboration', 'branching'] },
    { name: 'WebAssembly',    category: 'Tools',    proficiency: 'familiar',   years: 1,  tags: ['wasm', 'rust', 'performance', 'web', 'browser'] },
    { name: 'IndexedDB',      category: 'Tools',    proficiency: 'proficient', years: 3,  tags: ['browser', 'offline', 'storage', 'idb', 'local'] },
  ],

  experience: [
    {
      id: 'exp-structable',
      company: 'Self-employed / Entrepreneur',
      role: 'Founder & Lead Engineer',
      start: '2022-01',
      location: 'Remote, Poland',
      description: 'Building Structable (open-source Airtable alternative) and ComRev (product comparison platform) from scratch.',
      highlights: [
        'Designed and built a full-stack comparison platform with real-time sync and offline-first architecture',
        'Integrated AI agents using LangGraph + Claude API for natural-language data querying with tool use',
        'Built a 3D text visualization engine using Three.js / GLSL shaders for animated environments',
        'Implemented offline-first sync using IndexedDB, Supabase Realtime, and a Rust WASM sync core',
        'Developed a pluggable database backend supporting Supabase, MongoDB, and SurrealDB',
      ],
      technologies: ['React Native', 'Next.js', 'TypeScript', 'Rust', 'Supabase', 'Python', 'LangGraph', 'Three.js', 'PostgreSQL', 'Claude API'],
    },
    {
      id: 'exp-2',
      company: 'TODO: Previous Employer',
      role: 'TODO: Your Role',
      start: '2018-01',
      end: '2021-12',
      location: 'TODO: Location',
      description: 'TODO: Describe your role and responsibilities here.',
      highlights: [
        'TODO: Add key achievement 1',
        'TODO: Add key achievement 2',
      ],
      technologies: ['Java', 'Spring Boot', 'PostgreSQL', 'React'],
    },
    {
      id: 'exp-3',
      company: 'TODO: Earlier Employer',
      role: 'TODO: Your Role',
      start: '2015-01',
      end: '2017-12',
      location: 'TODO: Location',
      description: 'TODO: Describe this role.',
      highlights: ['TODO: Add highlights'],
      technologies: ['Java', 'JavaScript', 'MySQL'],
    },
  ],

  education: [
    {
      institution: 'TODO: Your University',
      degree: 'TODO: Degree (e.g. Master of Science)',
      field: 'TODO: Field (e.g. Computer Science)',
      start: '2005',
      end: '2010',
    },
  ],

  projects: [
    {
      id: 'proj-structable',
      name: 'Structable',
      url: 'github.com/karoldepka/ComRev',
      description: 'Open-source alternative to Airtable and Google Sheets with AI-powered querying, real-time sync, offline-first architecture, and pluggable database backends.',
      technologies: ['Next.js', 'TypeScript', 'Supabase', 'PostgreSQL', 'Python', 'LangGraph', 'CopilotKit', 'Vercel AI SDK'],
      highlights: [
        'Everything-is-an-object data model with per-cell comments, notes, and metadata',
        'AI chat for data querying using Claude tool-use and LangGraph ReAct agents',
        'Pluggable sync core in Rust/WASM for peer-to-peer sync capability',
      ],
    },
    {
      id: 'proj-comrev',
      name: 'ComRev',
      description: 'Product and repository comparison tool built on Structable, with live GitHub stats, 3D text visualization, and animated shader environments.',
      technologies: ['React Native', 'Expo', 'TypeScript', 'Three.js', 'GLSL', 'Claude API', 'IndexedDB'],
      highlights: [
        '3D animated text visualizations with plasma, fire, smoke, and fireworks shader effects',
        'Real-time GitHub repository tracking and star-growth analysis',
        'Offline-first with IndexedDB sync and graceful server error recovery',
      ],
    },
  ],
};

// ── Search / filter / sort utilities ─────────────────────────────────────────

export function searchCv(
  query: string,
  sections: Array<'skills' | 'experience' | 'projects' | 'education' | 'all'> = ['all'],
): Record<string, unknown[]> {
  const q = query.toLowerCase();
  const all = sections.includes('all');
  const result: Record<string, unknown[]> = {};

  const matchSkill = (s: CvSkill) =>
    s.name.toLowerCase().includes(q) ||
    s.category.toLowerCase().includes(q) ||
    s.tags?.some(t => t.toLowerCase().includes(q));

  const matchExp = (e: CvExperience) =>
    e.company.toLowerCase().includes(q) ||
    e.role.toLowerCase().includes(q) ||
    e.description.toLowerCase().includes(q) ||
    e.highlights.some(h => h.toLowerCase().includes(q)) ||
    e.technologies.some(t => t.toLowerCase().includes(q));

  const matchProj = (p: CvProject) =>
    p.name.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q) ||
    p.technologies.some(t => t.toLowerCase().includes(q)) ||
    p.highlights?.some(h => h.toLowerCase().includes(q));

  const matchEdu = (e: CvEducation) =>
    e.institution.toLowerCase().includes(q) ||
    e.degree.toLowerCase().includes(q) ||
    e.field.toLowerCase().includes(q);

  if (all || sections.includes('skills'))     result.skills     = CV.skills.filter(matchSkill);
  if (all || sections.includes('experience')) result.experience = CV.experience.filter(matchExp);
  if (all || sections.includes('projects'))   result.projects   = CV.projects.filter(matchProj);
  if (all || sections.includes('education'))  result.education  = CV.education.filter(matchEdu);

  return result;
}

export function filterSkills(opts: {
  keyword?: string;
  category?: string;
  proficiency?: 'expert' | 'proficient' | 'familiar';
}): CvSkill[] {
  let skills = [...CV.skills];
  if (opts.keyword) {
    const q = opts.keyword.toLowerCase();
    skills = skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.tags?.some(t => t.toLowerCase().includes(q)) ||
      s.category.toLowerCase().includes(q)
    );
  }
  if (opts.category) {
    const cat = opts.category.toLowerCase();
    skills = skills.filter(s => s.category.toLowerCase().includes(cat));
  }
  if (opts.proficiency) {
    skills = skills.filter(s => s.proficiency === opts.proficiency);
  }
  return skills;
}

const PROF_RANK = { expert: 3, proficient: 2, familiar: 1 } as const;

export function sortSkills(
  skills: CvSkill[],
  by: 'name' | 'proficiency' | 'years' | 'category',
  order: 'asc' | 'desc' = 'asc',
): CvSkill[] {
  return [...skills].sort((a, b) => {
    let diff = 0;
    switch (by) {
      case 'name':        diff = a.name.localeCompare(b.name); break;
      case 'proficiency': diff = (PROF_RANK[a.proficiency] ?? 0) - (PROF_RANK[b.proficiency] ?? 0); break;
      case 'years':       diff = (a.years ?? 0) - (b.years ?? 0); break;
      case 'category':    diff = a.category.localeCompare(b.category); break;
    }
    return order === 'desc' ? -diff : diff;
  });
}

export function filterExperience(keyword: string): CvExperience[] {
  const q = keyword.toLowerCase();
  return CV.experience.filter(e =>
    e.company.toLowerCase().includes(q) ||
    e.role.toLowerCase().includes(q) ||
    e.description.toLowerCase().includes(q) ||
    e.highlights.some(h => h.toLowerCase().includes(q)) ||
    e.technologies.some(t => t.toLowerCase().includes(q))
  );
}
