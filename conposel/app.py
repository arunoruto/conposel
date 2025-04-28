# dash_point_selector.py

import base64
import io

import cv2  # Make sure OpenCV is imported
import dash
import dash_bootstrap_components as dbc
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from dash import Input, Output, State, callback, ctx, dcc, html, no_update

# import plotly.express as px # No longer needed for detail view
from PIL import Image

# --- Configuration ---
DETAIL_VIEW_SIZE = 150  # Pixels for the detail view canvas output (visual size)
DEFAULT_ZOOM = 4.0
MAX_ZOOM = 10.0
MIN_ZOOM = 1.0
POINT_COLOR_FIXED = "red"
POINT_COLOR_MOVING = "blue"
POINT_SYMBOL = "cross"
POINT_SIZE = 10
FIGURE_BGCOLOR = "rgba(0,0,0,0)"  # Transparent background for main figures
CROSSHAIR_COLOR = (0, 255, 0)  # Green in BGR for OpenCV
CROSSHAIR_THICKNESS = 1
PLACEHOLDER_IMAGE_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="  # 1x1 transparent png

# --- Helper Functions ---


def numpy_to_data_uri(im_npy):
    """Convert NumPy array (RGB) to Base64 encoded Data URI for <img> src."""
    if im_npy is None or im_npy.size == 0:
        return PLACEHOLDER_IMAGE_URI
    try:
        # cv2.imencode expects BGR format for PNG encoding
        img_bgr = cv2.cvtColor(im_npy, cv2.COLOR_RGB2BGR)
        is_success, buffer = cv2.imencode(".png", img_bgr)  # buffer is a NumPy array
        if not is_success:
            raise ValueError("cv2.imencode failed")

        # --- CORRECTED LINE ---
        # Directly encode the NumPy buffer array (which contains the PNG bytes)
        encoded = base64.b64encode(buffer).decode("utf-8")
        # --- END CORRECTION ---

        return "data:image/png;base64," + encoded
    except Exception as e:
        print(f"Error converting numpy array to data URI: {e}")
        return PLACEHOLDER_IMAGE_URI  # Return placeholder on error


def parse_image_upload(contents):
    """Parse dcc.Upload contents into a NumPy array (RGB)."""
    if contents is None:
        return None, "No content"
    content_type, content_string = contents.split(",")
    decoded = base64.b64decode(content_string)
    try:
        image = Image.open(io.BytesIO(decoded))
        if image.mode != "RGB":
            image = image.convert("RGB")
        return np.array(image), "Success"  # Return as RGB
    except Exception as e:
        print(f"Error parsing image upload: {e}")
        return None, f"Error: {e}"


def create_main_figure(
    image_data_uri=None, points=None, title="Image", point_color="red"
):
    """Create the Plotly figure for the main image display."""
    fig = go.Figure()
    fig.update_layout(
        title=title,
        margin=dict(l=10, r=10, t=40, b=10),
        plot_bgcolor=FIGURE_BGCOLOR,
        paper_bgcolor=FIGURE_BGCOLOR,
        xaxis=dict(
            visible=False, scaleanchor="y", scaleratio=1, range=[0, 1000]
        ),  # Set some initial range
        yaxis=dict(visible=False, range=[0, 1000]),  # Set some initial range
        uirevision="image_data",  # Helps preserve zoom/pan on data update if only points change
        dragmode="pan",  # Enable panning by default
    )

    img_width, img_height = 1000, 1000  # Default size if no image

    if image_data_uri:
        try:
            fig.add_trace(go.Image(source=image_data_uri))
        except Exception as img_err:
            print(f"Error adding image trace: {img_err}")
            fig.add_annotation(text="Image Error", showarrow=False)

    if points and points["x"]:
        fig.add_trace(
            go.Scatter(
                x=points["x"],
                y=points["y"],
                mode="markers+text",
                marker=dict(color=point_color, size=POINT_SIZE, symbol=POINT_SYMBOL),
                text=[str(i + 1) for i in range(len(points["x"]))],
                textposition="top right",
                name="Points",
                hoverinfo="skip",  # Disable tooltips for points if not needed
            )
        )

    return fig


# --- Dash App Initialization ---
app = dash.Dash(
    __name__,
    external_stylesheets=[dbc.themes.BOOTSTRAP],
    suppress_callback_exceptions=True,
)
server = app.server  # For deployment compatibility

# --- App Layout ---
app.layout = dbc.Container(
    [
        html.H1("Dash Image Point Selector", className="text-center my-4"),
        # Stores
        dcc.Store(
            id="store-fixed-image-array", storage_type="memory"
        ),  # Store numpy array (as list)
        dcc.Store(id="store-moving-image-array", storage_type="memory"),
        dcc.Store(
            id="store-fixed-image-uri", storage_type="memory"
        ),  # Store data URI for display
        dcc.Store(id="store-moving-image-uri", storage_type="memory"),
        dcc.Store(id="store-fixed-points", data={"x": [], "y": []}),
        dcc.Store(id="store-moving-points", data={"x": [], "y": []}),
        dcc.Store(id="store-is-selecting-fixed", data=True),
        dcc.Store(id="store-fixed-zoom", data=DEFAULT_ZOOM),
        dcc.Store(id="store-moving-zoom", data=DEFAULT_ZOOM),
        dcc.Download(id="download-csv"),
        # Upload Section
        dbc.Row(
            [
                dbc.Col(
                    dbc.Card(
                        [
                            dbc.CardHeader("Fixed Image"),
                            dbc.CardBody(
                                [
                                    dcc.Upload(
                                        id="upload-fixed",
                                        children=html.Div(
                                            ["Drag/Drop or ", html.A("Select File")]
                                        ),
                                        style={
                                            "width": "100%",
                                            "height": "60px",
                                            "lineHeight": "60px",
                                            "borderWidth": "1px",
                                            "borderStyle": "dashed",
                                            "borderRadius": "5px",
                                            "textAlign": "center",
                                            "margin": "10px",
                                        },
                                        multiple=False,
                                    ),
                                    html.Div(id="output-fixed-upload-status"),
                                ]
                            ),
                        ]
                    ),
                    width=6,
                ),
                dbc.Col(
                    dbc.Card(
                        [
                            dbc.CardHeader("Moving Image"),
                            dbc.CardBody(
                                [
                                    dcc.Upload(
                                        id="upload-moving",
                                        children=html.Div(
                                            ["Drag/Drop or ", html.A("Select File")]
                                        ),
                                        style={
                                            "width": "100%",
                                            "height": "60px",
                                            "lineHeight": "60px",
                                            "borderWidth": "1px",
                                            "borderStyle": "dashed",
                                            "borderRadius": "5px",
                                            "textAlign": "center",
                                            "margin": "10px",
                                        },
                                        multiple=False,
                                    ),
                                    html.Div(id="output-moving-upload-status"),
                                ]
                            ),
                        ]
                    ),
                    width=6,
                ),
            ],
            className="mb-4",
        ),
        # Display Section
        dbc.Row(
            [
                # Fixed Image Column
                dbc.Col(
                    [
                        dbc.Card(
                            [
                                dbc.CardHeader("Fixed Image View"),
                                dbc.CardBody(
                                    [
                                        dcc.Graph(
                                            id="graph-fixed",
                                            figure=create_main_figure(
                                                title="Fixed Image"
                                            ),
                                            config={"scrollZoom": True},
                                        ),
                                        html.Div(
                                            [  # Detail view and zoom slider grouped
                                                html.Div(
                                                    [  # Wrapper for detail image
                                                        html.Img(
                                                            id="img-detail-fixed",
                                                            src=PLACEHOLDER_IMAGE_URI,
                                                            style={
                                                                "height": f"{DETAIL_VIEW_SIZE}px",
                                                                "width": f"{DETAIL_VIEW_SIZE}px",
                                                                "objectFit": "contain",
                                                                "border": "1px solid black",
                                                                "backgroundColor": "#e0e0e0",
                                                            },
                                                            alt="Fixed Detail",
                                                        ),
                                                    ],
                                                    className="d-inline-block",
                                                ),  # Wrapper style
                                                html.Div(
                                                    [  # Zoom Controls
                                                        html.Label(
                                                            "Zoom:", className="me-2"
                                                        ),
                                                        dcc.Slider(
                                                            id="slider-fixed-zoom",
                                                            min=MIN_ZOOM,
                                                            max=MAX_ZOOM,
                                                            step=0.1,
                                                            value=DEFAULT_ZOOM,
                                                            marks={
                                                                i: f"{i}x"
                                                                for i in range(
                                                                    int(MIN_ZOOM),
                                                                    int(MAX_ZOOM) + 1,
                                                                )
                                                            },
                                                            tooltip={
                                                                "placement": "bottom",
                                                                "always_visible": False,
                                                            },
                                                        ),
                                                        html.Span(
                                                            id="span-fixed-zoom",
                                                            children=f"{DEFAULT_ZOOM:.1f}x",
                                                            className="ms-2",
                                                        ),
                                                    ],
                                                    className="d-flex align-items-center mt-2 justify-content-center",
                                                    style={
                                                        "maxWidth": f"{DETAIL_VIEW_SIZE + 50}px"
                                                    },
                                                ),  # Limit width of controls
                                            ],
                                            className="d-flex flex-column align-items-center mt-3",
                                        ),
                                    ]
                                ),
                            ]
                        )
                    ],
                    width=6,
                ),
                # Moving Image Column
                dbc.Col(
                    [
                        dbc.Card(
                            [
                                dbc.CardHeader("Moving Image View"),
                                dbc.CardBody(
                                    [
                                        dcc.Graph(
                                            id="graph-moving",
                                            figure=create_main_figure(
                                                title="Moving Image"
                                            ),
                                            config={"scrollZoom": True},
                                        ),
                                        html.Div(
                                            [  # Detail view and zoom slider grouped
                                                html.Div(
                                                    [  # Wrapper for detail image
                                                        html.Img(
                                                            id="img-detail-moving",
                                                            src=PLACEHOLDER_IMAGE_URI,
                                                            style={
                                                                "height": f"{DETAIL_VIEW_SIZE}px",
                                                                "width": f"{DETAIL_VIEW_SIZE}px",
                                                                "objectFit": "contain",
                                                                "border": "1px solid black",
                                                                "backgroundColor": "#e0e0e0",
                                                            },
                                                            alt="Moving Detail",
                                                        ),
                                                    ],
                                                    className="d-inline-block",
                                                ),
                                                html.Div(
                                                    [  # Zoom Controls
                                                        html.Label(
                                                            "Zoom:", className="me-2"
                                                        ),
                                                        dcc.Slider(
                                                            id="slider-moving-zoom",
                                                            min=MIN_ZOOM,
                                                            max=MAX_ZOOM,
                                                            step=0.1,
                                                            value=DEFAULT_ZOOM,
                                                            marks={
                                                                i: f"{i}x"
                                                                for i in range(
                                                                    int(MIN_ZOOM),
                                                                    int(MAX_ZOOM) + 1,
                                                                )
                                                            },
                                                            tooltip={
                                                                "placement": "bottom",
                                                                "always_visible": False,
                                                            },
                                                        ),
                                                        html.Span(
                                                            id="span-moving-zoom",
                                                            children=f"{DEFAULT_ZOOM:.1f}x",
                                                            className="ms-2",
                                                        ),
                                                    ],
                                                    className="d-flex align-items-center mt-2 justify-content-center",
                                                    style={
                                                        "maxWidth": f"{DETAIL_VIEW_SIZE + 50}px"
                                                    },
                                                ),
                                            ],
                                            className="d-flex flex-column align-items-center mt-3",
                                        ),
                                    ]
                                ),
                            ]
                        )
                    ],
                    width=6,
                ),
            ]
        ),
        # Controls Section
        dbc.Row(
            dbc.Col(
                dbc.Card(
                    [
                        dbc.CardHeader("Controls"),
                        dbc.CardBody(
                            [
                                html.Div(
                                    id="status-message",
                                    children="Load images to begin.",
                                    className="mb-3",
                                ),
                                html.Div(
                                    [
                                        dbc.Button(
                                            "Delete Last Pair",
                                            id="btn-delete-last",
                                            color="warning",
                                            className="me-2 my-1",
                                            n_clicks=0,
                                        ),
                                        dbc.Button(
                                            "Clear All Points",
                                            id="btn-clear-all",
                                            color="danger",
                                            className="me-2 my-1",
                                            n_clicks=0,
                                        ),
                                        dbc.Button(
                                            "Save Points (CSV)",
                                            id="btn-save-csv",
                                            color="success",
                                            className="me-2 my-1",
                                            n_clicks=0,
                                            disabled=True,
                                        ),
                                    ],
                                    className="d-flex flex-wrap justify-content-center",
                                ),
                            ]
                        ),
                    ]
                ),
                width=12,
            ),
            className="my-4",
        ),
        # Point Counts
        dbc.Row(
            [
                dbc.Col(
                    html.P(id="fixed-point-count", children="Fixed Points: 0"), width=6
                ),
                dbc.Col(
                    html.P(id="moving-point-count", children="Moving Points: 0"),
                    width=6,
                ),
            ]
        ),
    ],
    fluid=True,
)

# --- Callbacks ---


# Handle File Uploads
@callback(
    Output("store-fixed-image-array", "data"),
    Output("store-fixed-image-uri", "data"),
    Output("output-fixed-upload-status", "children"),
    Output("store-fixed-points", "data", allow_duplicate=True),
    Output("store-moving-points", "data", allow_duplicate=True),
    Output("store-is-selecting-fixed", "data", allow_duplicate=True),
    Output("status-message", "children", allow_duplicate=True),
    Output("btn-save-csv", "disabled", allow_duplicate=True),
    Input("upload-fixed", "contents"),
    prevent_initial_call=True,
)
def upload_fixed_image(contents):
    reset_points = {"x": [], "y": []}
    reset_status = "New image loaded, points cleared. Select point on Fixed image."
    reset_selecting = True
    reset_save_disabled = True
    if contents:
        img_array, status = parse_image_upload(contents)
        if img_array is not None:
            data_uri = numpy_to_data_uri(img_array)
            if data_uri != PLACEHOLDER_IMAGE_URI:
                status_msg = dbc.Alert(
                    f"Fixed image loaded ({img_array.shape[1]}x{img_array.shape[0]})",
                    color="success",
                    duration=4000,
                )
                return (
                    img_array.tolist(),
                    data_uri,
                    status_msg,
                    reset_points,
                    reset_points,
                    reset_selecting,
                    reset_status,
                    reset_save_disabled,
                )
            else:
                status_msg = dbc.Alert("Failed to encode fixed image.", color="danger")
                return (
                    None,
                    None,
                    status_msg,
                    reset_points,
                    reset_points,
                    reset_selecting,
                    reset_status,
                    reset_save_disabled,
                )
        else:
            status_msg = dbc.Alert(
                f"Failed to load fixed image: {status}", color="danger"
            )
            return (
                None,
                None,
                status_msg,
                reset_points,
                reset_points,
                reset_selecting,
                reset_status,
                reset_save_disabled,
            )
    return (
        no_update,
        no_update,
        "",
        no_update,
        no_update,
        no_update,
        no_update,
        no_update,
    )


@callback(
    Output("store-moving-image-array", "data"),
    Output("store-moving-image-uri", "data"),
    Output("output-moving-upload-status", "children"),
    Output("store-fixed-points", "data", allow_duplicate=True),
    Output("store-moving-points", "data", allow_duplicate=True),
    Output("store-is-selecting-fixed", "data", allow_duplicate=True),
    Output("status-message", "children", allow_duplicate=True),
    Output("btn-save-csv", "disabled", allow_duplicate=True),
    Input("upload-moving", "contents"),
    prevent_initial_call=True,
)
def upload_moving_image(contents):
    reset_points = {"x": [], "y": []}
    reset_status = "New image loaded, points cleared. Select point on Fixed image."
    reset_selecting = True
    reset_save_disabled = True
    if contents:
        img_array, status = parse_image_upload(contents)
        if img_array is not None:
            data_uri = numpy_to_data_uri(img_array)
            if data_uri != PLACEHOLDER_IMAGE_URI:
                status_msg = dbc.Alert(
                    f"Moving image loaded ({img_array.shape[1]}x{img_array.shape[0]})",
                    color="success",
                    duration=4000,
                )
                return (
                    img_array.tolist(),
                    data_uri,
                    status_msg,
                    reset_points,
                    reset_points,
                    reset_selecting,
                    reset_status,
                    reset_save_disabled,
                )
            else:
                status_msg = dbc.Alert("Failed to encode moving image.", color="danger")
                return (
                    None,
                    None,
                    status_msg,
                    reset_points,
                    reset_points,
                    reset_selecting,
                    reset_status,
                    reset_save_disabled,
                )
        else:
            status_msg = dbc.Alert(
                f"Failed to load moving image: {status}", color="danger"
            )
            return (
                None,
                None,
                status_msg,
                reset_points,
                reset_points,
                reset_selecting,
                reset_status,
                reset_save_disabled,
            )
    return (
        no_update,
        no_update,
        "",
        no_update,
        no_update,
        no_update,
        no_update,
        no_update,
    )


# Update Main Graphs
@callback(
    Output("graph-fixed", "figure"),
    Input("store-fixed-image-uri", "data"),
    Input("store-fixed-points", "data"),
)
def update_fixed_graph(image_uri, points_data):
    return create_main_figure(image_uri, points_data, "Fixed Image", POINT_COLOR_FIXED)


@callback(
    Output("graph-moving", "figure"),
    Input("store-moving-image-uri", "data"),
    Input("store-moving-points", "data"),
)
def update_moving_graph(image_uri, points_data):
    return create_main_figure(
        image_uri, points_data, "Moving Image", POINT_COLOR_MOVING
    )


# Handle Point Clicks
@callback(
    Output("store-fixed-points", "data", allow_duplicate=True),
    Output("store-moving-points", "data", allow_duplicate=True),
    Output("store-is-selecting-fixed", "data"),
    Output("status-message", "children"),
    Output("btn-save-csv", "disabled", allow_duplicate=True),
    Input("graph-fixed", "clickData"),
    Input("graph-moving", "clickData"),
    State("store-fixed-points", "data"),
    State("store-moving-points", "data"),
    State("store-is-selecting-fixed", "data"),
    State("store-fixed-image-uri", "data"),
    State("store-moving-image-uri", "data"),
    prevent_initial_call=True,
)
def handle_click(
    clickData_f,
    clickData_m,
    fixed_pts,
    moving_pts,
    is_selecting_fixed,
    fixed_uri,
    moving_uri,
):
    triggered_id = ctx.triggered_id
    if not fixed_uri or not moving_uri:
        return no_update, no_update, no_update, "Please load both images first.", True
    new_status = no_update
    save_disabled = no_update
    fixed_pts_out = fixed_pts
    moving_pts_out = moving_pts

    if triggered_id == "graph-fixed" and clickData_f:
        point = clickData_f["points"][0]
        x, y = round(point["x"]), round(point["y"])
        if is_selecting_fixed:
            new_fixed_x = fixed_pts_out["x"] + [x]
            new_fixed_y = fixed_pts_out["y"] + [y]
            fixed_pts_out = {"x": new_fixed_x, "y": new_fixed_y}
            print(f"Added Fixed point: ({x}, {y})")
            new_status = "Select corresponding point on Moving image."
            is_selecting_fixed = False
            save_disabled = True
        else:
            new_status = "Click on Moving image to complete the pair."
    elif triggered_id == "graph-moving" and clickData_m:
        point = clickData_m["points"][0]
        x, y = round(point["x"]), round(point["y"])
        if not is_selecting_fixed:
            if len(fixed_pts_out["x"]) > len(moving_pts_out["x"]):
                new_moving_x = moving_pts_out["x"] + [x]
                new_moving_y = moving_pts_out["y"] + [y]
                moving_pts_out = {"x": new_moving_x, "y": new_moving_y}
                print(f"Added Moving point: ({x}, {y}) - Pair Complete.")
                new_status = f"Pair {len(moving_pts_out['x'])} complete. Select next point on Fixed image."
                is_selecting_fixed = True
                save_disabled = False
            else:
                new_status = "Select a point on Fixed image first."
                is_selecting_fixed = True
        else:
            new_status = "Click on Fixed image first to start a new pair."
    else:
        return no_update, no_update, no_update, no_update, no_update
    return fixed_pts_out, moving_pts_out, is_selecting_fixed, new_status, save_disabled


# Update Detail Image Views on Hover
@callback(
    Output("img-detail-fixed", "src"),
    Input("graph-fixed", "hoverData"),
    State("store-fixed-image-array", "data"),
    State("store-fixed-zoom", "data"),
    prevent_initial_call=True,
)
def update_detail_fixed_img(hoverData, image_list, zoom):
    if hoverData and image_list:
        try:
            image_array = np.array(image_list, dtype=np.uint8)
            if image_array.size == 0:
                return PLACEHOLDER_IMAGE_URI
            point = hoverData["points"][0]
            center_x, center_y = point["x"], point["y"]
            img_h, img_w = image_array.shape[:2]
            source_w = max(1, int(DETAIL_VIEW_SIZE / zoom))
            source_h = max(1, int(DETAIL_VIEW_SIZE / zoom))
            sx = int(center_x - source_w / 2)
            sy = int(center_y - source_h / 2)
            src_y_start_clamped = max(0, sy)
            src_y_end_clamped = min(img_h, sy + source_h)
            src_x_start_clamped = max(0, sx)
            src_x_end_clamped = min(img_w, sx + source_w)
            zoomed_patch = image_array[
                src_y_start_clamped:src_y_end_clamped,
                src_x_start_clamped:src_x_end_clamped,
                :,
            ]

            if (
                zoomed_patch.size > 0
                and zoomed_patch.shape[0] > 0
                and zoomed_patch.shape[1] > 0
            ):
                resized_patch_cv = cv2.resize(
                    zoomed_patch,
                    (DETAIL_VIEW_SIZE, DETAIL_VIEW_SIZE),
                    interpolation=cv2.INTER_NEAREST,
                )
                detail_img_canvas = np.full(
                    (DETAIL_VIEW_SIZE, DETAIL_VIEW_SIZE, 3), 255, dtype=np.uint8
                )
                offset_x = max(0, -sx) * zoom
                offset_y = max(0, -sy) * zoom
                target_x_start = int(offset_x)
                target_y_start = int(offset_y)
                place_h = min(
                    DETAIL_VIEW_SIZE - target_y_start, resized_patch_cv.shape[0]
                )
                place_w = min(
                    DETAIL_VIEW_SIZE - target_x_start, resized_patch_cv.shape[1]
                )
                if place_h > 0 and place_w > 0:
                    detail_img_canvas[
                        target_y_start : target_y_start + place_h,
                        target_x_start : target_x_start + place_w,
                        :,
                    ] = resized_patch_cv[:place_h, :place_w, :]

                center_detail = DETAIL_VIEW_SIZE // 2
                cv2.line(
                    detail_img_canvas,
                    (center_detail, 0),
                    (center_detail, DETAIL_VIEW_SIZE - 1),
                    CROSSHAIR_COLOR,
                    CROSSHAIR_THICKNESS,
                )
                cv2.line(
                    detail_img_canvas,
                    (0, center_detail),
                    (DETAIL_VIEW_SIZE - 1, center_detail),
                    CROSSHAIR_COLOR,
                    CROSSHAIR_THICKNESS,
                )
                return numpy_to_data_uri(detail_img_canvas)
            else:
                return PLACEHOLDER_IMAGE_URI
        except Exception as e:
            print(f"Error updating fixed detail img: {e}")
            return PLACEHOLDER_IMAGE_URI
    return PLACEHOLDER_IMAGE_URI


@callback(
    Output("img-detail-moving", "src"),
    Input("graph-moving", "hoverData"),
    State("store-moving-image-array", "data"),
    State("store-moving-zoom", "data"),
    prevent_initial_call=True,
)
def update_detail_moving_img(hoverData, image_list, zoom):
    # Identical logic to fixed, just uses moving data
    if hoverData and image_list:
        try:
            image_array = np.array(image_list, dtype=np.uint8)
            if image_array.size == 0:
                return PLACEHOLDER_IMAGE_URI
            point = hoverData["points"][0]
            center_x, center_y = point["x"], point["y"]
            img_h, img_w = image_array.shape[:2]
            source_w = max(1, int(DETAIL_VIEW_SIZE / zoom))
            source_h = max(1, int(DETAIL_VIEW_SIZE / zoom))
            sx = int(center_x - source_w / 2)
            sy = int(center_y - source_h / 2)
            src_y_start_clamped = max(0, sy)
            src_y_end_clamped = min(img_h, sy + source_h)
            src_x_start_clamped = max(0, sx)
            src_x_end_clamped = min(img_w, sx + source_w)
            zoomed_patch = image_array[
                src_y_start_clamped:src_y_end_clamped,
                src_x_start_clamped:src_x_end_clamped,
                :,
            ]

            if (
                zoomed_patch.size > 0
                and zoomed_patch.shape[0] > 0
                and zoomed_patch.shape[1] > 0
            ):
                resized_patch_cv = cv2.resize(
                    zoomed_patch,
                    (DETAIL_VIEW_SIZE, DETAIL_VIEW_SIZE),
                    interpolation=cv2.INTER_NEAREST,
                )
                detail_img_canvas = np.full(
                    (DETAIL_VIEW_SIZE, DETAIL_VIEW_SIZE, 3), 255, dtype=np.uint8
                )
                offset_x = max(0, -sx) * zoom
                offset_y = max(0, -sy) * zoom
                target_x_start = int(offset_x)
                target_y_start = int(offset_y)
                place_h = min(
                    DETAIL_VIEW_SIZE - target_y_start, resized_patch_cv.shape[0]
                )
                place_w = min(
                    DETAIL_VIEW_SIZE - target_x_start, resized_patch_cv.shape[1]
                )
                if place_h > 0 and place_w > 0:
                    detail_img_canvas[
                        target_y_start : target_y_start + place_h,
                        target_x_start : target_x_start + place_w,
                        :,
                    ] = resized_patch_cv[:place_h, :place_w, :]

                center_detail = DETAIL_VIEW_SIZE // 2
                cv2.line(
                    detail_img_canvas,
                    (center_detail, 0),
                    (center_detail, DETAIL_VIEW_SIZE - 1),
                    CROSSHAIR_COLOR,
                    CROSSHAIR_THICKNESS,
                )
                cv2.line(
                    detail_img_canvas,
                    (0, center_detail),
                    (DETAIL_VIEW_SIZE - 1, center_detail),
                    CROSSHAIR_COLOR,
                    CROSSHAIR_THICKNESS,
                )
                return numpy_to_data_uri(detail_img_canvas)
            else:
                return PLACEHOLDER_IMAGE_URI
        except Exception as e:
            print(f"Error updating moving detail img: {e}")
            return PLACEHOLDER_IMAGE_URI
    return PLACEHOLDER_IMAGE_URI


# Update Zoom Store and Display value from Sliders
@callback(
    Output("store-fixed-zoom", "data"),
    Output("span-fixed-zoom", "children"),
    Input("slider-fixed-zoom", "value"),
    prevent_initial_call=True,
)
def update_fixed_zoom(value):
    return value, f"{value:.1f}x"


@callback(
    Output("store-moving-zoom", "data"),
    Output("span-moving-zoom", "children"),
    Input("slider-moving-zoom", "value"),
    prevent_initial_call=True,
)
def update_moving_zoom(value):
    return value, f"{value:.1f}x"


# Handle Control Buttons (Delete Last, Clear All)
@callback(
    Output("store-fixed-points", "data", allow_duplicate=True),
    Output("store-moving-points", "data", allow_duplicate=True),
    Output("store-is-selecting-fixed", "data", allow_duplicate=True),
    Output("status-message", "children", allow_duplicate=True),
    Output("btn-save-csv", "disabled", allow_duplicate=True),
    Input("btn-delete-last", "n_clicks"),
    Input("btn-clear-all", "n_clicks"),
    State("store-fixed-points", "data"),
    State("store-moving-points", "data"),
    prevent_initial_call=True,
)
def handle_control_buttons(n_delete, n_clear, fixed_pts, moving_pts):
    triggered_id = ctx.triggered_id
    new_status = no_update
    save_disabled = no_update
    is_selecting_fixed_out = no_update
    fixed_pts_out = fixed_pts.copy()
    moving_pts_out = moving_pts.copy()

    if triggered_id == "btn-delete-last":
        print("Delete Last Pair clicked.")
        if moving_pts_out["x"] and len(fixed_pts_out["x"]) == len(moving_pts_out["x"]):
            fixed_pts_out["x"].pop()
            fixed_pts_out["y"].pop()
            moving_pts_out["x"].pop()
            moving_pts_out["y"].pop()
            new_status = "Last pair deleted. Select point on Fixed image."
            is_selecting_fixed_out = True
        elif fixed_pts_out["x"] and len(fixed_pts_out["x"]) > len(moving_pts_out["x"]):
            fixed_pts_out["x"].pop()
            fixed_pts_out["y"].pop()
            new_status = "Last fixed point deleted. Select point on Fixed image."
            is_selecting_fixed_out = True
        else:
            new_status = "No points or pair to delete."
    elif triggered_id == "btn-clear-all":
        print("Clear All Points clicked.")
        fixed_pts_out = {"x": [], "y": []}
        moving_pts_out = {"x": [], "y": []}
        new_status = "All points cleared. Select point on Fixed image."
        is_selecting_fixed_out = True

    save_disabled = not (
        fixed_pts_out["x"] and len(fixed_pts_out["x"]) == len(moving_pts_out["x"])
    )
    return (
        fixed_pts_out,
        moving_pts_out,
        is_selecting_fixed_out,
        new_status,
        save_disabled,
    )


# Update Point Counts Display
@callback(Output("fixed-point-count", "children"), Input("store-fixed-points", "data"))
def update_fixed_count(points):
    return f"Fixed Points: {len(points['x'])}"


@callback(
    Output("moving-point-count", "children"), Input("store-moving-points", "data")
)
def update_moving_count(points):
    return f"Moving Points: {len(points['x'])}"


# Handle Save to CSV Button
@callback(
    Output("download-csv", "data"),
    Input("btn-save-csv", "n_clicks"),
    State("store-fixed-points", "data"),
    State("store-moving-points", "data"),
    prevent_initial_call=True,
)
def save_csv(n_clicks, fixed_pts, moving_pts):
    if (
        n_clicks is None
        or n_clicks == 0
        or not fixed_pts["x"]
        or len(fixed_pts["x"]) != len(moving_pts["x"])
    ):
        return no_update

    print(f"Generating CSV for {len(fixed_pts['x'])} points.")
    try:
        df = pd.DataFrame(
            {
                "FixedX": [round(x) for x in fixed_pts["x"]],
                "FixedY": [round(y) for y in fixed_pts["y"]],
                "MovingX": [round(x) for x in moving_pts["x"]],
                "MovingY": [round(y) for y in moving_pts["y"]],
            }
        )
        return dcc.send_data_frame(df.to_csv, "control_points.csv", index=False)
    except Exception as e:
        print(f"Error generating or sending CSV data: {e}")
        return no_update


# --- Run the App ---
if __name__ == "__main__":
    app.run(debug=True, port=8051)
