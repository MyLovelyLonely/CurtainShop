from fastapi import FastAPI

from app.routers import catalog, search, simulate, window

app = FastAPI(title="Curtain Shop AI Server")

app.include_router(search.router)
app.include_router(catalog.router)
app.include_router(window.router)
app.include_router(simulate.router)


@app.get("/health")
def health():
    return {"status": "ok"}
