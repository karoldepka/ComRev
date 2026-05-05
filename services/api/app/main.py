from fastapi import FastAPI
from mangum import Mangum

app = FastAPI()

# 👉 All routes are now under /api/*
api = FastAPI()

@api.get("/")
def root():
    return {"message": "API root working"}

@api.get("/health")
def health():
    return {"status": "ok"}

# Mount under /api
app.mount("/api", api)

# Vercel handler
handler = Mangum(app)
