import argparse
import numpy as np
import tensorflow as tf
from PIL import Image

IMG_SIZE = 224


def load_image(path: str):
    image = Image.open(path).convert("RGB")
    image = image.resize((IMG_SIZE, IMG_SIZE), Image.Resampling.BILINEAR)
    return np.asarray(image, dtype=np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("first_image")
    parser.add_argument("second_image")
    parser.add_argument("--model", default="models/lost_found_embedding.keras")
    args = parser.parse_args()

    model = tf.keras.models.load_model(args.model, compile=False)
    first = tf.keras.applications.mobilenet_v2.preprocess_input(
        np.expand_dims(load_image(args.first_image), axis=0)
    )
    second = tf.keras.applications.mobilenet_v2.preprocess_input(
        np.expand_dims(load_image(args.second_image), axis=0)
    )
    first_embedding = model(first, training=False).numpy()[0]
    second_embedding = model(second, training=False).numpy()[0]
    similarity = float(np.dot(first_embedding, second_embedding))
    print(f"Similarity: {similarity:.4f}")
    print("Match:", similarity >= 0.70)


if __name__ == "__main__":
    main()
