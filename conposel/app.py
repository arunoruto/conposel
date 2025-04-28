import os
import sys
from pathlib import Path

import imageio.v3 as iio
import napari
import numpy as np

# --- Configuration ---
# Option 1: Use default example images from imageio
# image1_path = 'imageio:camera.png'
# image2_path = 'imageio:astronaut.png' # Needs resizing or use another grayscale image

# Option 2: Define paths to your own images (relative to the script location)
root = Path(__file__).parent
IMAGE_DIR = root / "images"  # Directory where your images are stored
IMG1_NAME = "westconcordaerial.png"  # Replace with your image 1 filename
IMG2_NAME = "westconcordorthophoto.png"  # Replace with your image 2 filename

image1_path = os.path.join(IMAGE_DIR, IMG1_NAME)
image2_path = os.path.join(IMAGE_DIR, IMG2_NAME)

# --- Image Loading ---
try:
    print(f"Loading image 1 from: {image1_path}")
    image1 = iio.imread(image1_path)
    print(f"Image 1 shape: {image1.shape}, dtype: {image1.dtype}")
except FileNotFoundError:
    print(f"Error: Image file not found at {image1_path}")
    print("Using default imageio:camera.png instead.")
    image1 = iio.imread("imageio:camera.png")
except Exception as e:
    print(f"Error loading image 1: {e}")
    sys.exit(1)

try:
    print(f"Loading image 2 from: {image2_path}")
    image2 = iio.imread(image2_path)
    print(f"Image 2 shape: {image2.shape}, dtype: {image2.dtype}")
    # Optional: Simple check if images are vastly different sizes (might make matching harder)
    if (
        abs(image1.shape[0] - image2.shape[0]) > 100
        or abs(image1.shape[1] - image2.shape[1]) > 100
    ):
        print("Warning: Images have significantly different dimensions.")
except FileNotFoundError:
    print(f"Error: Image file not found at {image2_path}")
    print("Using default imageio:camera.png (shifted) instead.")
    # Create a slightly shifted version of image1 as a fallback for image2
    image2 = np.roll(image1, (50, 30), axis=(0, 1))
except Exception as e:
    print(f"Error loading image 2: {e}")
    sys.exit(1)


# --- Napari Viewer Setup ---
viewer = napari.Viewer(title="Napari Control Point Selector")

# Add images as layers
layer1 = viewer.add_image(image1, name=os.path.basename(image1_path), colormap="gray")
layer2 = viewer.add_image(image2, name=os.path.basename(image2_path), colormap="gray")

# Add empty points layers to capture clicks
# ndim=2 assumes 2D images. If you have multi-channel, adjust if needed.
points_layer1 = viewer.add_points(
    ndim=image1.ndim,  # Use image dimensions
    name=f"Points {layer1.name}",
    size=10,
    face_color="red",
)
points_layer2 = viewer.add_points(
    ndim=image2.ndim,  # Use image dimensions
    name=f"Points {layer2.name}",
    size=10,
    face_color="blue",
)

print("\n--- Napari Control Point Selection ---")
print("Instructions:")
print(f"1. Select the '{points_layer1.name}' layer in the layer list (bottom left).")
print(f"2. Click on features in '{layer1.name}'.")
print(f"3. Select the '{points_layer2.name}' layer.")
print(f"4. Click on the corresponding features in '{layer2.name}'.")
print("5. Ensure you add points in the *same order* on both layers!")
print("6. Use the viewer controls (pan, zoom) as needed.")
print("7. Close the Napari window when finished selecting points.")
print("--------------------------------------\n")

# Start the Napari GUI event loop.
# This function will block execution until the viewer window is closed.
napari.run()

# --- Post-processing (After closing the viewer) ---
points1_data = points_layer1.data
points2_data = points_layer2.data

print("\n--- Results ---")
if len(points1_data) == len(points2_data) and len(points1_data) > 0:
    num_pairs = len(points1_data)
    print(f"Successfully collected {num_pairs} point pair(s).")

    # Napari coordinates are typically (z, y, x) or (y, x) for 2D
    # Often, for other libraries (like OpenCV), you need (x, y) format
    # Assuming 2D images here for the xy conversion:
    if image1.ndim == 2:
        points1_xy = points1_data[:, ::-1]  # Reverse order for (x, y)
        points2_xy = points2_data[:, ::-1]  # Reverse order for (x, y)

        print(f"\nPoints from '{layer1.name}' (Y, X):\n", points1_data)
        print(f"\nPoints from '{layer2.name}' (Y, X):\n", points2_data)
        print(f"\nPoints from '{layer1.name}' (X, Y):\n", points1_xy)
        print(f"\nPoints from '{layer2.name}' (X, Y):\n", points2_xy)

        # You can now use points1_data, points2_data (or points1_xy, points2_xy)
        # for further processing, like calculating a transformation.
        # Example: Save to a file
        # np.savez('control_points.npz', points1=points1_data, points2=points2_data, points1_xy=points1_xy, points2_xy=points2_xy)
        # print("\nPoints saved to control_points.npz")

    else:  # Handle higher dimensions if needed
        print(f"\nPoints from '{layer1.name}':\n", points1_data)
        print(f"\nPoints from '{layer2.name}':\n", points2_data)
        print("(Coordinate order depends on image dimensions, typically ZYX or YX)")

elif len(points1_data) != len(points2_data):
    print("\nError: The number of points selected on each image does not match.")
    print(f"  Points on '{layer1.name}': {len(points1_data)}")
    print(f"  Points on '{layer2.name}': {len(points2_data)}")
    print(
        "Please re-run and ensure you select the same number of points in corresponding order."
    )
else:  # len(points1_data) == 0
    print("\nNo control points were selected.")

print("-------------")
