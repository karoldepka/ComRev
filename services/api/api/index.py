import json
from app.main import app
from mangum import Mangum

handler = Mangum(app)

# Optional: simple debug entry (NOT required by Vercel)
def debug(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Vercel function is running",
            "event": event
        })
    }
