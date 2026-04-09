import joblib
import os

def compress_models(models_dir="models"):
    files = ["rf_model.pkl", "xgb_model.pkl", "scaler.pkl"]
    for file in files:
        path = os.path.join(models_dir, file)
        if os.path.exists(path):
            print(f"Compressing {file}...")
            model = joblib.load(path)
            # Compression level 3 is a good balance
            compressed_path = os.path.join(models_dir, file.replace(".pkl", "_compressed.pkl"))
            joblib.dump(model, compressed_path, compress=3)
            
            orig_size = os.path.getsize(path) / (1024 * 1024)
            comp_size = os.path.getsize(compressed_path) / (1024 * 1024)
            print(f"Done: {orig_size:.2f}MB -> {comp_size:.2f}MB")

if __name__ == "__main__":
    compress_models()
