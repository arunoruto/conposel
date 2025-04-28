# app.py - No significant changes needed from the previous version
# Keep the Flask setup, /submit_points, /get_points (optional),
# and the root route '/' serving index.html.
# Make sure IMAGE_FOLDER and filenames are either removed or ignored
# if we're doing full client-side loading.

import os

from flask import (  # Keep send_from_directory if you still want to serve default/example images
    Flask,
    jsonify,
    render_template,
    request,
)

app = Flask(__name__)

# Store selected points globally (in a real app, use a database or session)
# Resetting this might be good practice if the server runs long term
selected_points = {"fixed": [], "moving": []}


@app.route("/")
def index():
    """Serves the main HTML page."""
    # No longer need to pass image filenames if using upload/URL
    return render_template("index.html")


# Remove or comment out /static/images/<filename> route if not serving defaults
# @app.route('/static/images/<filename>')
# def serve_image(filename):
#    ...


@app.route("/submit_points", methods=["POST"])
def submit_points():
    """Receives point data from the frontend."""
    global selected_points
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    print("Received data:", data)  # For debugging

    required_keys = "fixed" in data and "moving" in data
    list_type = isinstance(data.get("fixed"), list) and isinstance(
        data.get("moving"), list
    )

    if not (required_keys and list_type):
        return jsonify(
            {
                "error": "Invalid data format. 'fixed' and 'moving' keys with list values required."
            }
        ), 400

    # Add more robust validation for point structure if needed
    is_paired = len(data["fixed"]) == len(data["moving"])

    if not is_paired:
        return jsonify({"error": "Mismatch in number of fixed and moving points"}), 400

    # Store received points (overwrite previous)
    selected_points["fixed"] = data["fixed"]
    selected_points["moving"] = data["moving"]
    print(f"Successfully received {len(data['fixed'])} point pairs.")

    # --- Trigger next analysis step here ---
    # calculate_transform(selected_points)
    # ---------------------------------------

    return jsonify(
        {"message": "Points received successfully", "count": len(data["fixed"])}
    ), 200


# Optional: Endpoint to retrieve the currently stored points
@app.route("/get_points", methods=["GET"])
def get_points():
    return jsonify(selected_points)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
