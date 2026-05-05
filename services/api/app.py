from fastapi import FastAPI
from api.routes.v1.health import router as health_router
from utils.log import log
#from routes.v1.users import router as users_router
import os

@log
def create_app():
    app = FastAPI(
        title="ComRev API",

        # 👇 critical for Vercel
        root_path=os.getenv("ROOT_PATH", "/api"),

        # 👇 docs at /api/docs (on Vercel)
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # 👇 versioned API
    app.include_router(health_router, prefix="/v1")
    #app.include_router(users_router, prefix="/v1")

    return app

app = create_app()
