"""CV data for Karol Depka. Keep in sync with structable/data/cv.ts."""

CV = {
    "name": "Karol Depka",
    "title": "Full-Stack Software Engineer & Entrepreneur",
    "email": "karol.depka.pr@gmail.com",
    "location": "Poland",
    "github": "github.com/karoldepka",
    "summary": (
        "Full-stack engineer and entrepreneur with expertise in web, mobile, and AI-driven development. "
        "Currently building Structable (open-source Airtable alternative) and ComRev (product comparison platform). "
        "Strong background across the stack: from React / React Native frontends to Rust/Node backends, "
        "AI agent pipelines, and 3D graphics."
    ),
    "skills": [
        # Frontend
        {"name": "React",           "category": "Frontend", "proficiency": "expert",     "years": 8,  "tags": ["javascript", "jsx", "hooks", "web", "ui", "components"]},
        {"name": "React Native",    "category": "Mobile",   "proficiency": "expert",     "years": 5,  "tags": ["mobile", "expo", "ios", "android", "cross-platform", "rn"]},
        {"name": "TypeScript",      "category": "Language", "proficiency": "expert",     "years": 6,  "tags": ["ts", "javascript", "typed", "static analysis"]},
        {"name": "Next.js",         "category": "Frontend", "proficiency": "expert",     "years": 4,  "tags": ["react", "ssr", "ssg", "web", "fullstack", "vercel", "app router"]},
        {"name": "Three.js",        "category": "Frontend", "proficiency": "proficient", "years": 2,  "tags": ["3d", "webgl", "graphics", "canvas", "glsl", "shaders", "animation"]},
        {"name": "CSS / Tailwind",  "category": "Frontend", "proficiency": "proficient", "years": 8,  "tags": ["styling", "ui", "responsive", "design", "tailwindcss"]},
        # Backend
        {"name": "Rust",            "category": "Language", "proficiency": "proficient", "years": 2,  "tags": ["systems", "wasm", "performance", "backend", "webassembly"]},
        {"name": "Node.js",         "category": "Backend",  "proficiency": "expert",     "years": 9,  "tags": ["javascript", "server", "api", "express", "fastify"]},
        {"name": "Python",          "category": "Language", "proficiency": "proficient", "years": 6,  "tags": ["backend", "ai", "ml", "scripting", "automation", "langchain"]},
        {"name": "Java",            "category": "Language", "proficiency": "proficient", "years": 7,  "tags": ["jvm", "spring", "spring boot", "backend", "oop", "enterprise", "maven", "gradle"]},
        {"name": "Kotlin",          "category": "Language", "proficiency": "familiar",   "years": 2,  "tags": ["jvm", "android", "java", "coroutines"]},
        {"name": "gRPC / tRPC",     "category": "Backend",  "proficiency": "proficient", "years": 2,  "tags": ["rpc", "api", "protocol", "rust", "typescript", "grpc", "trpc"]},
        {"name": "GraphQL",         "category": "Backend",  "proficiency": "proficient", "years": 3,  "tags": ["api", "query", "schema", "backend", "apollo"]},
        # Databases
        {"name": "PostgreSQL",      "category": "Database", "proficiency": "expert",     "years": 9,  "tags": ["sql", "relational", "supabase", "neon", "postgres", "jsonb"]},
        {"name": "Supabase",        "category": "Database", "proficiency": "expert",     "years": 3,  "tags": ["postgres", "auth", "realtime", "storage", "baas"]},
        {"name": "MongoDB",         "category": "Database", "proficiency": "proficient", "years": 4,  "tags": ["nosql", "document", "json", "bson"]},
        {"name": "SurrealDB",       "category": "Database", "proficiency": "familiar",   "years": 1,  "tags": ["multi-model", "graph", "nosql", "document"]},
        # AI/ML
        {"name": "LangChain / LangGraph", "category": "AI/ML", "proficiency": "proficient", "years": 1, "tags": ["ai", "llm", "agents", "python", "react agent", "tools", "langgraph"]},
        {"name": "Claude / Anthropic API", "category": "AI/ML", "proficiency": "expert", "years": 2, "tags": ["anthropic", "llm", "ai", "claude", "tool-use", "streaming"]},
        {"name": "Vercel AI SDK",   "category": "AI/ML",    "proficiency": "expert",     "years": 1,  "tags": ["ai", "streaming", "tool-use", "typescript", "useChat", "streamText"]},
        {"name": "OpenAI API",      "category": "AI/ML",    "proficiency": "proficient", "years": 2,  "tags": ["gpt", "llm", "ai", "openai", "chatgpt"]},
        {"name": "CopilotKit",      "category": "AI/ML",    "proficiency": "proficient", "years": 1,  "tags": ["ai", "copilot", "agents", "react", "coagent"]},
        # DevOps / Tools
        {"name": "Docker",          "category": "DevOps",   "proficiency": "proficient", "years": 5,  "tags": ["containers", "deployment", "devops", "compose"]},
        {"name": "Git",             "category": "Tools",    "proficiency": "expert",     "years": 13, "tags": ["version-control", "github", "collaboration", "branching"]},
        {"name": "WebAssembly",     "category": "Tools",    "proficiency": "familiar",   "years": 1,  "tags": ["wasm", "rust", "performance", "web", "browser"]},
        {"name": "IndexedDB",       "category": "Tools",    "proficiency": "proficient", "years": 3,  "tags": ["browser", "offline", "storage", "idb", "local"]},
    ],
    "experience": [
        {
            "id": "exp-structable",
            "company": "Self-employed / Entrepreneur",
            "role": "Founder & Lead Engineer",
            "start": "2022-01",
            "location": "Remote, Poland",
            "description": "Building Structable (open-source Airtable alternative) and ComRev (product comparison platform).",
            "highlights": [
                "Designed and built a full-stack comparison platform with real-time sync and offline-first architecture",
                "Integrated AI agents using LangGraph + Claude API for natural-language data querying with tool use",
                "Built a 3D text visualization engine using Three.js / GLSL shaders for animated environments",
                "Implemented offline-first sync using IndexedDB, Supabase Realtime, and a Rust WASM sync core",
                "Developed a pluggable database backend supporting Supabase, MongoDB, and SurrealDB",
            ],
            "technologies": ["React Native", "Next.js", "TypeScript", "Rust", "Supabase", "Python", "LangGraph", "Three.js", "PostgreSQL", "Claude API"],
        },
        {
            "id": "exp-2",
            "company": "TODO: Previous Employer",
            "role": "TODO: Your Role",
            "start": "2018-01",
            "end": "2021-12",
            "description": "TODO: Fill in your previous experience.",
            "highlights": ["TODO: Add key achievement 1", "TODO: Add key achievement 2"],
            "technologies": ["Java", "Spring Boot", "PostgreSQL", "React"],
        },
        {
            "id": "exp-3",
            "company": "TODO: Earlier Employer",
            "role": "TODO: Your Role",
            "start": "2015-01",
            "end": "2017-12",
            "description": "TODO: Fill in this role.",
            "highlights": ["TODO: Add highlights"],
            "technologies": ["Java", "JavaScript", "MySQL"],
        },
    ],
    "education": [
        {
            "institution": "TODO: Your University",
            "degree": "TODO: Degree",
            "field": "TODO: Field of Study",
            "start": "2005",
            "end": "2010",
        }
    ],
    "projects": [
        {
            "id": "proj-structable",
            "name": "Structable",
            "url": "github.com/karoldepka/ComRev",
            "description": "Open-source alternative to Airtable with AI-powered querying, real-time sync, offline-first architecture, and pluggable backends.",
            "technologies": ["Next.js", "TypeScript", "Supabase", "PostgreSQL", "Python", "LangGraph", "CopilotKit", "Vercel AI SDK"],
            "highlights": [
                "Everything-is-an-object data model with per-cell comments and metadata",
                "AI chat for data querying using Claude tool-use and LangGraph ReAct agents",
                "Pluggable sync core in Rust/WASM for peer-to-peer sync capability",
            ],
        },
        {
            "id": "proj-comrev",
            "name": "ComRev",
            "description": "Product and repository comparison tool with live GitHub stats, 3D visualization, and animated shader environments.",
            "technologies": ["React Native", "Expo", "TypeScript", "Three.js", "GLSL", "Claude API", "IndexedDB"],
            "highlights": [
                "3D animated text visualizations with plasma, fire, smoke, and fireworks shaders",
                "Real-time GitHub repository tracking and star-growth analysis",
                "Offline-first with IndexedDB sync and graceful server error recovery",
            ],
        },
    ],
}


# ── Utility functions ─────────────────────────────────────────────────────────

PROF_RANK = {"expert": 3, "proficient": 2, "familiar": 1}


def _matches(text: str, query: str) -> bool:
    return query.lower() in text.lower()


def search_cv(query: str, sections: list[str] | None = None) -> dict:
    """Keyword search across CV sections."""
    all_sections = not sections or "all" in sections
    result: dict = {}

    def skill_match(s):
        return (
            _matches(s["name"], query)
            or _matches(s["category"], query)
            or any(_matches(t, query) for t in s.get("tags", []))
        )

    def exp_match(e):
        return (
            _matches(e["company"], query)
            or _matches(e["role"], query)
            or _matches(e["description"], query)
            or any(_matches(h, query) for h in e.get("highlights", []))
            or any(_matches(t, query) for t in e.get("technologies", []))
        )

    def proj_match(p):
        return (
            _matches(p["name"], query)
            or _matches(p["description"], query)
            or any(_matches(t, query) for t in p.get("technologies", []))
            or any(_matches(h, query) for h in p.get("highlights", []))
        )

    if all_sections or "skills" in sections:
        result["skills"] = [s for s in CV["skills"] if skill_match(s)]
    if all_sections or "experience" in sections:
        result["experience"] = [e for e in CV["experience"] if exp_match(e)]
    if all_sections or "projects" in sections:
        result["projects"] = [p for p in CV["projects"] if proj_match(p)]
    if all_sections or "education" in sections:
        q = query.lower()
        result["education"] = [
            e for e in CV["education"]
            if q in e["institution"].lower() or q in e["degree"].lower() or q in e["field"].lower()
        ]
    return result


def filter_skills(
    keyword: str | None = None,
    category: str | None = None,
    proficiency: str | None = None,
) -> list[dict]:
    skills = list(CV["skills"])
    if keyword:
        q = keyword.lower()
        skills = [
            s for s in skills
            if q in s["name"].lower()
            or q in s["category"].lower()
            or any(q in t.lower() for t in s.get("tags", []))
        ]
    if category:
        cat = category.lower()
        skills = [s for s in skills if cat in s["category"].lower()]
    if proficiency:
        skills = [s for s in skills if s["proficiency"] == proficiency]
    return skills


def sort_skills(skills: list[dict], by: str, order: str = "asc") -> list[dict]:
    reverse = order == "desc"
    if by == "name":
        return sorted(skills, key=lambda s: s["name"], reverse=reverse)
    if by == "proficiency":
        return sorted(skills, key=lambda s: PROF_RANK.get(s["proficiency"], 0), reverse=reverse)
    if by == "years":
        return sorted(skills, key=lambda s: s.get("years", 0), reverse=reverse)
    if by == "category":
        return sorted(skills, key=lambda s: s["category"], reverse=reverse)
    return skills
