from fastapi import FastAPI
from api.routes.v1.repo import router as repos_router

app = FastAPI(
    title="YAML Repo API",
    version="1.0.0"
)

app.include_router(repos_router)
