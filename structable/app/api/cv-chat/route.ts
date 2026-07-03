import { anthropic } from '@ai-sdk/anthropic';
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from 'ai';
import { z } from 'zod';
import { CV, searchCv, filterSkills, sortSkills, filterExperience } from '@/data/cv';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an intelligent assistant that helps people explore and understand Karol Depka's CV and professional profile.
You have access to structured CV tools. Always use them to fetch accurate data rather than relying on memory.

Formatting rules:
- Use **bold** to highlight matched/relevant items when the user asks to highlight something.
- Use bullet points for lists.
- Use a concise Markdown table when comparing multiple items.
- When filtering or sorting, state which criteria you applied.
- Keep answers focused — don't dump the entire CV unless asked.

Example queries you can handle:
- "What are Karol's Java-related skills?" → use get_cv_skills(keyword="java")
- "Highlight skills related to AI" → use get_cv_skills, then bold the matches in your reply
- "Show experience sorted by most recent" → use get_cv_experience
- "What projects use TypeScript?" → use search_cv(query="TypeScript", sections=["projects"])
- "Sort skills by proficiency descending" → use sort_skills(by="proficiency", order="desc")
- "Make a table with database topics and usage" → use get_skill_usage_matrix(category="Database"), then format as a Markdown table
- Any "make a table" request → use appropriate tool(s) and respond with a Markdown table using | col | syntax
`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(8),
    tools: {
      get_cv_overview: tool({
        description: 'Get the top-level CV overview: name, title, location, summary.',
        inputSchema: z.object({}),
        execute: async () => ({
          name: CV.name,
          title: CV.title,
          email: CV.email,
          location: CV.location,
          github: CV.github,
          summary: CV.summary,
        }),
      }),

      get_cv_skills: tool({
        description: 'Return all skills, optionally filtered and/or sorted.',
        inputSchema: z.object({
          keyword:     z.string().optional().describe('Filter by this keyword (matches name, category, or tags)'),
          category:    z.string().optional().describe('Filter by category e.g. Frontend, Backend, AI/ML, Language, Database, DevOps, Tools'),
          proficiency: z.enum(['expert', 'proficient', 'familiar']).optional().describe('Filter by proficiency level'),
          sort_by:     z.enum(['name', 'proficiency', 'years', 'category']).optional().describe('Sort field'),
          sort_order:  z.enum(['asc', 'desc']).optional().describe('Sort direction (default: asc)'),
        }),
        execute: async ({ keyword, category, proficiency, sort_by, sort_order }) => {
          let skills = filterSkills({ keyword, category, proficiency });
          if (sort_by) skills = sortSkills(skills, sort_by, sort_order ?? 'asc');
          return { count: skills.length, skills };
        },
      }),

      search_cv: tool({
        description: 'Keyword search across all or specific CV sections.',
        inputSchema: z.object({
          query:    z.string().describe('Search term'),
          sections: z.array(z.enum(['skills', 'experience', 'projects', 'education', 'all']))
                     .optional()
                     .describe('Which sections to search (default: all)'),
        }),
        execute: async ({ query, sections }) =>
          searchCv(query, sections ?? ['all']),
      }),

      get_cv_experience: tool({
        description: 'Return work experience entries, optionally filtered by keyword.',
        inputSchema: z.object({
          keyword: z.string().optional().describe('Filter by technology, role, company, or keyword in description'),
        }),
        execute: async ({ keyword }) => {
          const experience = keyword ? filterExperience(keyword) : CV.experience;
          return { count: experience.length, experience };
        },
      }),

      get_cv_education: tool({
        description: 'Return education history.',
        inputSchema: z.object({}),
        execute: async () => ({ education: CV.education }),
      }),

      get_cv_projects: tool({
        description: 'Return notable projects, optionally filtered by keyword.',
        inputSchema: z.object({
          keyword: z.string().optional().describe('Filter by technology or keyword in description'),
        }),
        execute: async ({ keyword }) => {
          const projects = keyword
            ? CV.projects.filter(p =>
                p.name.toLowerCase().includes(keyword.toLowerCase()) ||
                p.description.toLowerCase().includes(keyword.toLowerCase()) ||
                p.technologies.some(t => t.toLowerCase().includes(keyword.toLowerCase())) ||
                p.highlights?.some(h => h.toLowerCase().includes(keyword.toLowerCase()))
              )
            : CV.projects;
          return { count: projects.length, projects };
        },
      }),

      sort_skills: tool({
        description: 'Return all skills sorted by a given field.',
        inputSchema: z.object({
          by:    z.enum(['name', 'proficiency', 'years', 'category']),
          order: z.enum(['asc', 'desc']).optional(),
        }),
        execute: async ({ by, order }) => {
          const skills = sortSkills(CV.skills, by, order ?? 'asc');
          return { count: skills.length, skills };
        },
      }),

      get_skill_usage_matrix: tool({
        description: 'Return a matrix of skills with project and experience counts — ideal for "how many projects use X" table requests.',
        inputSchema: z.object({
          category: z.string().optional().describe('Filter by category e.g. Database, Frontend, AI/ML, Language'),
          keyword:  z.string().optional().describe('Filter by keyword'),
        }),
        execute: async ({ category, keyword }) => {
          const skills = filterSkills({ category, keyword });
          const matrix = skills.map(skill => {
            const nameLower = skill.name.toLowerCase();
            const projectCount = CV.projects.filter(p =>
              p.technologies.some(t =>
                t.toLowerCase().includes(nameLower) || nameLower.includes(t.toLowerCase())
              )
            ).length;
            const expCount = CV.experience.filter(e =>
              (e.technologies as string[] | undefined)?.some(t =>
                t.toLowerCase().includes(nameLower) || nameLower.includes(t.toLowerCase())
              ) ?? false
            ).length;
            return {
              skill: skill.name,
              category: skill.category,
              proficiency: skill.proficiency,
              years: skill.years,
              projects: projectCount,
              experiences: expCount,
            };
          });
          return { count: matrix.length, skills_usage: matrix };
        },
      }),
    },
  });

  return result.toTextStreamResponse();
}
