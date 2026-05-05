from fastapi import FastAPI
from mangum import Mangum

app = FastAPI()

@app.get("/")
def root():
    return {"message": "API is running 🚀"}

@app.get("/health")
def health():
    return {"status": "ok"}

# Required for Vercel serverless deployment
handler = Mangum(app)
