import threading

from fastapi import FastAPI

from app.routers import catalog, search, simulate, window
from app.services import product_search, yolo_sam

app = FastAPI(title="Curtain Shop AI Server")

app.include_router(search.router)
app.include_router(catalog.router)
app.include_router(window.router)
app.include_router(simulate.router)


@app.on_event("startup")
def _warm_up():
    product_search.warm_up()
    threading.Thread(target=yolo_sam.warm, daemon=True).start()


@app.get("/health")
def health():
    return {"status": "ok"}
