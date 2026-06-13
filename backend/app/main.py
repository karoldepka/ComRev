from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from strawberry.fastapi import GraphQLRouter
from .inspiration_generator import (
    InspirationGenerateRequest,
    InspirationGenerateResponse,
    generate_inspiration,
)
from .schema import schema

app = FastAPI(title="ComRev Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8082",
        "http://127.0.0.1:8082",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

graphql_router = GraphQLRouter(schema, graphql_ide="graphiql")
app.include_router(graphql_router, prefix="/graphql")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/inspiration/generate", response_model=InspirationGenerateResponse)
async def generate_inspiration_route(
    request: InspirationGenerateRequest,
) -> InspirationGenerateResponse:
    return generate_inspiration(request)
