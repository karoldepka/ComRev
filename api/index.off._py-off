from fastapi import FastAPI

app = FastAPI(
    title="ComRev API",
    version="0.1.0",
)

@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "comrev",
        "message": "API is running on Vercel"
    }
