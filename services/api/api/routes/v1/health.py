from fastapi import APIRouter
from datetime import datetime

router = APIRouter()

@router.get("/health")
def health():
    return {
        "status": "ok ok",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
