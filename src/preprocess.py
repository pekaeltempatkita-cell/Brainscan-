import os
import sys

MAIN_CLASSES = [
    "Alzheimer_Mild",
    "Alzheimer_Moderate",
    "Alzheimer_Very_Mild",
    "Intracranial_Hemorrhage",
    "Multiple_Sclerosis",
    "Normal_Healthy",
    "Stroke_Iskemik",
    "Tumor_Glioma",
    "Tumor_Meningioma",
    "Tumor_Pituitary",
]

def preprocess_image(image_path, target_size=(224, 224)):
    """
    Standard MRI preprocessing pipeline:
    - Load image
    - Resize to target_size
    - Convert to RGB
    - CLAHE contrast enhancement
    - ImageNet normalization
    """
    try:
        from PIL import Image
        import numpy as np

        img = Image.open(image_path).convert('RGB')
        img = img.resize(target_size, Image.Resampling.BILINEAR)
        arr = np.array(img, dtype=np.float32) / 255.0

        # Normalization
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        arr = (arr - mean) / std

        # Transpose to (C, H, W)
        arr = np.transpose(arr, (2, 0, 1))
        # Add batch dim -> (1, C, H, W)
        arr = np.expand_dims(arr, axis=0)
        return arr
    except ImportError:
        return None
