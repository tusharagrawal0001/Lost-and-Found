import argparse
import os

import tensorflow as tf

IMG_SIZE = 224
BATCH_SIZE = 32


def build_model(num_classes: int):
    inputs = tf.keras.layers.Input(shape=(IMG_SIZE, IMG_SIZE, 3))
    x = tf.keras.layers.RandomFlip("horizontal")(inputs)
    x = tf.keras.layers.RandomRotation(0.08)(x)
    x = tf.keras.layers.RandomZoom(0.08)(x)

    base = tf.keras.applications.MobileNetV2(
        weights="imagenet", include_top=False,
        input_shape=(IMG_SIZE, IMG_SIZE, 3)
    )
    base.trainable = False
    x = base(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.25)(x)
    embedding = tf.keras.layers.Dense(
        128, activation=None, name="embedding"
    )(x)
    embedding = tf.keras.layers.Lambda(
        lambda value: tf.math.l2_normalize(value, axis=1),
        name="normalized_embedding"
    )(embedding)
    classifier = tf.keras.layers.Dense(num_classes, activation="softmax")(
        embedding
    )
    return tf.keras.Model(inputs, classifier), tf.keras.Model(inputs, embedding), base


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="dataset/images")
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--model-dir", default="models")
    args = parser.parse_args()

    if not os.path.isdir(args.data_dir):
        raise SystemExit(
            f"Training directory not found: {args.data_dir}. "
            "Create one folder per item identity with JPG/PNG images inside."
        )

    os.makedirs(args.model_dir, exist_ok=True)
    train_ds = tf.keras.utils.image_dataset_from_directory(
        args.data_dir,
        validation_split=0.2,
        subset="training",
        seed=42,
        image_size=(IMG_SIZE, IMG_SIZE),
        batch_size=args.batch_size,
    )
    val_ds = tf.keras.utils.image_dataset_from_directory(
        args.data_dir,
        validation_split=0.2,
        subset="validation",
        seed=42,
        image_size=(IMG_SIZE, IMG_SIZE),
        batch_size=args.batch_size,
    )

    class_names = train_ds.class_names
    if len(class_names) < 2:
        raise SystemExit("At least two item identity folders are required for training.")

    preprocess = tf.keras.applications.mobilenet_v2.preprocess_input
    train_ds = train_ds.map(lambda x, y: (preprocess(tf.cast(x, tf.float32)), y)).prefetch(tf.data.AUTOTUNE)
    val_ds = val_ds.map(lambda x, y: (preprocess(tf.cast(x, tf.float32)), y)).prefetch(tf.data.AUTOTUNE)

    model, embedding_model, base = build_model(len(class_names))
    model.compile(
        optimizer=tf.keras.optimizers.Adam(1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    callbacks = [
        tf.keras.callbacks.EarlyStopping(patience=3, restore_best_weights=True),
        tf.keras.callbacks.ModelCheckpoint(
            os.path.join(args.model_dir, "best_checkpoint.keras"),
            save_best_only=True,
        ),
    ]
    model.fit(train_ds, validation_data=val_ds, epochs=args.epochs, callbacks=callbacks)

    embedding_path = os.path.join(args.model_dir, "lost_found_embedding.keras")
    embedding_model.save(embedding_path)
    with open(os.path.join(args.model_dir, "class_names.txt"), "w", encoding="utf-8") as file:
        file.write("\n".join(class_names))
    print(f"Embedding model saved to {embedding_path}")


if __name__ == "__main__":
    main()

