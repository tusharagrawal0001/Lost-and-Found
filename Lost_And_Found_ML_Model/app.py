import base64
import io
import os
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
import tensorflow as tf
from pydantic import BaseModel

IMG_SIZE = 224
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "models" / "lost_found_embedding.keras"

app = FastAPI(title="Lost & Found Image Search API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8080", "http://localhost:8080"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MATCH_THRESHOLD = 0.55


def build_embedding_model():
    inputs = tf.keras.layers.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
    base = tf.keras.applications.MobileNetV2(
        weights="imagenet", include_top=False,
        input_shape=(IMG_SIZE, IMG_SIZE, 3)
    )
    base.trainable = False
    x = base(inputs, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    outputs = tf.keras.layers.Lambda(
        lambda value: tf.math.l2_normalize(value, axis=1)
    )(x)
    return tf.keras.Model(inputs, outputs)


if MODEL_PATH.exists():
    model = tf.keras.models.load_model(MODEL_PATH, compile=False)
else:
    # ImageNet MobileNetV2 provides a local embedding fallback when no trained
    # identity model has been generated. No API key or external AI service is used.
    model = build_embedding_model()


class ImageBase64(BaseModel):
    image_base64: str


class CompareRequest(BaseModel):
    first_image_base64: str
    second_image_base64: str


def decode_image(data: bytes) -> np.ndarray:
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
        image = image.resize((IMG_SIZE, IMG_SIZE), Image.Resampling.BILINEAR)
        return np.asarray(image, dtype=np.float32)
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail="Invalid image file") from error


def decode_base64(value: str) -> np.ndarray:
    try:
        data = base64.b64decode(value, validate=True)
        return decode_image(data)
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid base64 image") from error


def embedding_for(images: np.ndarray) -> np.ndarray:
    batch = np.expand_dims(images, axis=0) if images.ndim == 3 else images
    processed = tf.keras.applications.mobilenet_v2.preprocess_input(batch)
    return model(processed, training=False).numpy()


@app.get("/")
def root():
    return {"service": "Lost & Found Image Search", "health": "/health"}


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None, "model_path": str(MODEL_PATH)}


@app.post("/embed-upload")
async def embed_upload(file: UploadFile = File(...)):
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds 10 MB limit")
    image = decode_image(data)
    embedding = embedding_for(image)[0].tolist()
    return {"embedding": embedding}


@app.post("/embed")
def embed(payload: ImageBase64):
    image = decode_base64(payload.image_base64)
    return {"embedding": embedding_for(image)[0].tolist()}


@app.post("/compare")
def compare(payload: CompareRequest):
    first = embedding_for(decode_base64(payload.first_image_base64))[0]
    second = embedding_for(decode_base64(payload.second_image_base64))[0]
    similarity = float(np.dot(first, second))
    similarity = max(-1.0, min(1.0, similarity))
    return {
        "match": similarity >= MATCH_THRESHOLD,
        "confidence": similarity,
        "reason": "Cosine similarity of normalized image embeddings",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)


# cd Lost_And_Found_ML_Model
# .\venv\Scripts\python.exe app.py




# for the frontend
# cd react    
# npm run dev
