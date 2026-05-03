from fastapi import FastAPI
from fastapi.responses import JSONResponse

# Import your core app (recommended structure)
from core.app import app as fastapi_app

# Vercel expects a variable called `app`
app = fastapi_app


# --- Optional: direct fallback routes (if you don't want core/app.py yet) ---
@app.get("/api")
def api_root():
    return JSONResponse({
        "status": "ok",
        "message": "Vercel FastAPI is running"
    })


@app.get("/api/health")
def health_check():
    return JSONResponse({
        "status": "healthy"
    })


@app.get("/api/hello")
def hello():
    return {
        "message": "Hello from Vercel FastAPI",
        "runtime": "serverless"
    }
