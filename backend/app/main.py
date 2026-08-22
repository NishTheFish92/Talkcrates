from fastapi import FastAPI

app = FastAPI(title="TalkCrates")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    """Liveness check for the container. Returns 200 as long as the process is up."""
    return {"status": "ok"}
