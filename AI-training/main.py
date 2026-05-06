from pathlib import Path

from inference import predict_image


def main():
    base_dir = Path(__file__).resolve().parent
    images = sorted((base_dir / "images").glob("*"))
    if not images:
        raise SystemExit("images directory is empty")

    result = predict_image(image_url=images[0].resolve().as_uri())
    print(result)


if __name__ == "__main__":
    main()
