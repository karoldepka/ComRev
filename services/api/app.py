from fastapi import FastAPI
from api.routes.v1.health import router as health_router
from api.routes.v1.users import router as users_router

def create_app():
    app = FastAPI(
        title="ComRev API",

        # 👇 makes everything live under /api/*
        root_path="/api",

        # 👇 move docs under /api/docs
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json"
    )

    app.include_router(health_router, prefix="/v1")
    app.include_router(users_router, prefix="/v1")

    return app
    