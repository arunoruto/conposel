document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    const state = {
        images: [null, null], // Holds the loaded Image objects
        points: [],           // Array of { id, img1: {x, y} | null, img2: {x, y} | null }
        zoomLevels: [2, 2],
        zoomCenters: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }], // Relative centers (0-1)
        nextPointId: 0,
        activePointIndex: -1, // Index in the points array (points to a PAIR)
        draggingPoint: null,  // { pointIndex, imageIndex (0 or 1) } -> imageIndex determines which coordinate is dragged
        draggingZoomRect: null, // { imageIndex, startX, startY, rectStartX, rectStartY }
        canvasContexts: { full: [null, null], zoom: [null, null] },
        canvases: { full: [null, null], zoom: [null, null] },
        pointSize: 8,
        zoomRectStrokeColor: 'rgba(255, 0, 0, 0.7)',
        pointColor: 'rgba(0, 255, 0, 0.8)',
        activePointColor: 'rgba(255, 255, 0, 0.9)',
        incompletePointColor: 'rgba(255, 165, 0, 0.8)', // Orange for points needing the other pair
    };

    // --- DOM Elements ---
    const imageInputs = [document.getElementById('image1-input'), document.getElementById('image2-input')];
    state.canvases.full = [document.getElementById('canvas-img1-full'), document.getElementById('canvas-img2-full')];
    state.canvases.zoom = [document.getElementById('canvas-img1-zoom'), document.getElementById('canvas-img2-zoom')];
    const zoomSliders = [document.getElementById('zoom-slider-1'), document.getElementById('zoom-slider-2')];
    const zoomLevelDisplays = [document.getElementById('zoom-level-1'), document.getElementById('zoom-level-2')];
    const saveButton = document.getElementById('save-btn');
    const pointCountDisplay = document.getElementById('point-count');
    const statusMessage = document.getElementById('status-message'); // Get status message element

    // --- Initialization ---
    function init() {
        console.log("Initializing CPSelect Tool v2");
        setupCanvasContexts();
        setupEventListeners();
        updateStatusMessage(); // Initial status
        updateSaveButtonState();
    }

    function setupCanvasContexts() {
        // ... (same as before)
        for (let i = 0; i < 2; i++) {
            state.canvasContexts.full[i] = state.canvases.full[i].getContext('2d');
            state.canvasContexts.zoom[i] = state.canvases.zoom[i].getContext('2d');
        }
        console.log("Canvas contexts initialized");
    }

    function setupEventListeners() {
        // ... (imageInputs, zoomSliders listeners same as before)
         imageInputs.forEach((input, index) => {
            input.addEventListener('change', (event) => handleImageLoad(event, index));
        });

        zoomSliders.forEach((slider, index) => {
            slider.addEventListener('input', (event) => handleZoomChange(event, index));
        });

        state.canvases.full.forEach((canvas, index) => {
            canvas.addEventListener('mousedown', (event) => handleMouseDown(event, index, 'full'));
            canvas.addEventListener('mousemove', (event) => handleMouseMove(event, index, 'full'));
            // Mouseup/out listeners on window to catch drags outside canvas
        });
         state.canvases.zoom.forEach((canvas, index) => {
            canvas.addEventListener('mousedown', (event) => handleMouseDown(event, index, 'zoom'));
            canvas.addEventListener('mousemove', (event) => handleMouseMove(event, index, 'zoom'));
        });

        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('mouseout', handleMouseOut); // Less reliable, but helps sometimes
        window.addEventListener('keydown', handleKeyDown);

        saveButton.addEventListener('click', handleSavePoints);
        console.log("Event listeners set up");
    }

     // --- Status Update ---
     function updateStatusMessage() {
         if (!state.images[0] || !state.images[1]) {
             statusMessage.textContent = 'Load both images to begin.';
             return;
         }

         if (state.activePointIndex !== -1) {
             const point = state.points[state.activePointIndex];
             if (point) { // Check if point exists (might have been deleted)
                 if (!point.img1) {
                     statusMessage.textContent = `Click on Image 1 to define coordinate for Point ${point.id}.`;
                 } else if (!point.img2) {
                     statusMessage.textContent = `Click on Image 2 to define coordinate for Point ${point.id}.`;
                 } else {
                     statusMessage.textContent = `Point ${point.id} selected. Click+drag to move, Delete key to remove.`;
                 }
             } else {
                 // Active index is invalid, reset it
                 state.activePointIndex = -1;
                  statusMessage.textContent = 'Click on Image 1 to start defining a new point pair.';
             }
         } else {
             statusMessage.textContent = 'Click on Image 1 to start defining a new point pair.';
         }
     }


    // --- Image Handling ---
    function handleImageLoad(event, index) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                console.log(`Image ${index + 1} loaded: ${img.naturalWidth}x${img.naturalHeight}`);
                state.images[index] = img;
                state.zoomCenters[index] = { x: 0.5, y: 0.5 };

                 // Clear points if an image is reloaded? (Optional, maybe confusing)
                 // state.points = [];
                 // state.nextPointId = 0;
                 // state.activePointIndex = -1;

                // Set canvas dimensions
                state.canvases.full[index].width = img.naturalWidth;
                state.canvases.full[index].height = img.naturalHeight;

                // Make zoom canvas square, try to fit parent, max 300px
                const zoomCanvas = state.canvases.zoom[index];
                 const parentStyle = window.getComputedStyle(zoomCanvas.parentElement);
                 const parentWidth = parseFloat(parentStyle.width) - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight);
                 const parentHeight = parseFloat(parentStyle.height) - parseFloat(parentStyle.paddingTop) - parseFloat(parentStyle.paddingBottom);
                 const zoomDim = Math.max(50, Math.min(parentWidth, parentHeight, 300)); // Ensure minimum size
                zoomCanvas.width = zoomDim;
                zoomCanvas.height = zoomDim;

                redrawAll();
                updateSaveButtonState();
                updateStatusMessage(); // Update status after image load
            };
            img.onerror = () => {
                console.error(`Error loading image ${index + 1}.`);
                alert(`Failed to load image ${index + 1}. Please check the file format.`);
                state.images[index] = null; // Ensure state reflects failed load
                updateStatusMessage();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // --- Drawing ---
    function redrawAll() {
        if (!state.canvasContexts.full[0]) return; // Ensure contexts are ready
        for (let i = 0; i < 2; i++) {
            drawImageView(i);
        }
        updatePointCountDisplay();
        updateStatusMessage(); // Update status message on redraw
    }

    function drawImageView(index) {
        const img = state.images[index];
        const ctxFull = state.canvasContexts.full[index];
        const canvasFull = state.canvases.full[index];
        const ctxZoom = state.canvasContexts.zoom[index];
        const canvasZoom = state.canvases.zoom[index];

        // Clear canvases
        ctxFull.clearRect(0, 0, canvasFull.width, canvasFull.height);
        ctxZoom.clearRect(0, 0, canvasZoom.width, canvasZoom.height);

        if (!img) {
             ctxFull.fillStyle = '#ddd'; // Placeholder if no image
             ctxFull.fillRect(0,0, canvasFull.width, canvasFull.height);
             ctxZoom.fillStyle = '#ddd';
             ctxZoom.fillRect(0,0, canvasZoom.width, canvasZoom.height);
            return;
         };

        const zoomLevel = state.zoomLevels[index];
        const zoomCenter = state.zoomCenters[index];

        // --- Draw Full View ---
        ctxFull.drawImage(img, 0, 0, canvasFull.width, canvasFull.height);

        const rectWidth = canvasFull.width / zoomLevel;
        const rectHeight = canvasFull.height / zoomLevel;
        const rectX = (zoomCenter.x * canvasFull.width) - rectWidth / 2;
        const rectY = (zoomCenter.y * canvasFull.height) - rectHeight / 2;
        ctxFull.strokeStyle = state.zoomRectStrokeColor;
        ctxFull.lineWidth = Math.max(1, 2 / (canvasFull.width / img.naturalWidth)); // Scale line width slightly
        ctxFull.strokeRect(rectX, rectY, rectWidth, rectHeight);

        // --- Draw Zoom View ---
        ctxZoom.imageSmoothingEnabled = false;
        const sx = Math.max(0, rectX);
        const sy = Math.max(0, rectY);
        const sw = Math.min(rectWidth, canvasFull.width - sx);
        const sh = Math.min(rectHeight, canvasFull.height - sy);
        const dx = 0, dy = 0, dw = canvasZoom.width, dh = canvasZoom.height;

         if (sw > 0 && sh > 0) {
             try { ctxZoom.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh); }
             catch (e) { console.error("Error drawing zoom image:", e); }
         } else {
              ctxZoom.fillStyle = '#eee';
              ctxZoom.fillRect(0,0, dw, dh);
         }

        // --- Draw Points (Both Views) ---
        state.points.forEach((point, pointIndex) => {
            const coords = (index === 0) ? point.img1 : point.img2;
            const isComplete = point.img1 && point.img2;
            const isActive = (pointIndex === state.activePointIndex);

            if (coords) { // Only draw if coords exist for this image
                 // Determine color
                 let pointColor = state.pointColor;
                 if (isActive) {
                     pointColor = state.activePointColor;
                 } else if (!isComplete) {
                     pointColor = state.incompletePointColor;
                 }

                // Draw on Full View
                ctxFull.fillStyle = pointColor;
                ctxFull.beginPath();
                ctxFull.arc(coords.x, coords.y, state.pointSize / 2, 0, Math.PI * 2);
                ctxFull.fill();
                ctxFull.fillStyle = 'rgba(0,0,0,0.8)';
                ctxFull.font = 'bold 10px sans-serif';
                ctxFull.textAlign = 'center';
                ctxFull.textBaseline = 'bottom';
                ctxFull.fillText(point.id.toString(), coords.x, coords.y - state.pointSize / 2 - 1);

                // Draw on Zoom View (if visible)
                if (coords.x >= sx && coords.x < sx + sw && coords.y >= sy && coords.y < sy + sh && sw > 0 && sh > 0) {
                    const zoomX = ((coords.x - sx) / sw) * dw;
                    const zoomY = ((coords.y - sy) / sh) * dh;
                    ctxZoom.fillStyle = pointColor;
                    ctxZoom.beginPath();
                    ctxZoom.arc(zoomX, zoomY, state.pointSize, 0, Math.PI * 2); // Larger point in zoom
                    ctxZoom.fill();
                    ctxZoom.fillStyle = 'rgba(0,0,0,0.9)';
                    ctxZoom.font = 'bold 14px sans-serif';
                    ctxZoom.textAlign = 'center';
                    ctxZoom.textBaseline = 'bottom';
                    ctxZoom.fillText(point.id.toString(), zoomX, zoomY - state.pointSize - 2);
                }
            }
        });
         // Reset text alignment etc.
         ctxFull.textAlign = 'left';
         ctxFull.textBaseline = 'alphabetic';
         ctxZoom.textAlign = 'left';
         ctxZoom.textBaseline = 'alphabetic';
    }

     // --- Event Handlers ---

    // getMousePos remains the same as before
     function getMousePos(canvas, event, viewType) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let clientX = event.clientX;
        let clientY = event.clientY;
        // Handle touch events if necessary in the future
        // if (event.touches && event.touches.length > 0) {
        //     clientX = event.touches[0].clientX;
        //     clientY = event.touches[0].clientY;
        // }
        let x = (clientX - rect.left) * scaleX;
        let y = (clientY - rect.top) * scaleY;


        // If zoom view, need to translate back to full image coordinates
        if (viewType === 'zoom' && state.images[canvas === state.canvases.zoom[0] ? 0 : 1]) {
             const index = canvas === state.canvases.zoom[0] ? 0 : 1;
             const img = state.images[index];
             if (!img) return {x: -1, y: -1}; // Should not happen if viewType is zoom, but safety check

             const zoomLevel = state.zoomLevels[index];
             const zoomCenter = state.zoomCenters[index];
             const canvasFull = state.canvases.full[index];

             const rectWidth = canvasFull.width / zoomLevel;
             const rectHeight = canvasFull.height / zoomLevel;
             const rectX = Math.max(0, (zoomCenter.x * canvasFull.width) - rectWidth / 2);
             const rectY = Math.max(0, (zoomCenter.y * canvasFull.height) - rectHeight / 2);
             const sw = Math.min(rectWidth, canvasFull.width - rectX);
             const sh = Math.min(rectHeight, canvasFull.height - rectY);

            if (sw <= 0 || sh <= 0) return { x: -1, y: -1 }; // Avoid division by zero if zoom rect is invalid

            // Inverse transform: from zoom canvas coords (x,y) to full image coords
            const imgX = rectX + (x / canvas.width) * sw;
            const imgY = rectY + (y / canvas.height) * sh;

             // Clamp to image bounds after transformation
             const clampedX = Math.max(0, Math.min(imgX, img.naturalWidth));
             const clampedY = Math.max(0, Math.min(imgY, img.naturalHeight));
             return { x: clampedX, y: clampedY };
        } else if (state.images[canvas === state.canvases.full[0] ? 0 : 1]) {
             // Clamp full view clicks too
              const index = canvas === state.canvases.full[0] ? 0 : 1;
              const img = state.images[index];
              if (!img) return {x: -1, y: -1};
              const clampedX = Math.max(0, Math.min(x, img.naturalWidth));
              const clampedY = Math.max(0, Math.min(y, img.naturalHeight));
              return { x: clampedX, y: clampedY };
        }

        return { x, y }; // Return raw if no image
    }

    // findNearbyPoint checks coords for the *specific image index*
    function findNearbyPoint(imageIndex, x, y) {
        let closestPointIndex = -1;
        let minDistanceSq = (state.pointSize * 1.5) ** 2; // Click radius (squared)

        state.points.forEach((point, index) => {
            const coords = (imageIndex === 0) ? point.img1 : point.img2;
            // Only check points that *have* coordinates on this image
            if (coords) {
                const dx = x - coords.x;
                const dy = y - coords.y;
                const distSq = dx * dx + dy * dy;
                if (distSq < minDistanceSq) {
                    minDistanceSq = distSq;
                    closestPointIndex = index;
                }
            }
        });
        return closestPointIndex;
    }

    // isInsideZoomRect remains the same
     function isInsideZoomRect(imageIndex, x, y) {
        const img = state.images[imageIndex];
        if (!img) return false;
        const canvasFull = state.canvases.full[imageIndex];
        const zoomLevel = state.zoomLevels[imageIndex];
        const zoomCenter = state.zoomCenters[imageIndex];

        const rectWidth = canvasFull.width / zoomLevel;
        const rectHeight = canvasFull.height / zoomLevel;
        const rectX = (zoomCenter.x * canvasFull.width) - rectWidth / 2;
        const rectY = (zoomCenter.y * canvasFull.height) - rectHeight / 2;

        return x >= rectX && x <= rectX + rectWidth && y >= rectY && y <= rectY + rectHeight;
    }


    // *** Revised handleMouseDown for Point Pairing Logic ***
    function handleMouseDown(event, imageIndex, viewType) {
        if (!state.images[0] || !state.images[1]) {
             console.log("Need both images loaded.");
             updateStatusMessage(); // Ensure status is updated even if we return early
             return;
        }

        const canvas = (viewType === 'full') ? state.canvases.full[imageIndex] : state.canvases.zoom[imageIndex];
        const { x, y } = getMousePos(canvas, event, viewType);
        if (x < 0 || y < 0) return; // Ignore clicks outside valid area

        // Priority 1: Check if clicking near an existing point *on this image*
        const nearbyPointIndex = findNearbyPoint(imageIndex, x, y);
        if (nearbyPointIndex !== -1) {
            // If clicking the marker of the *incomplete* point on image 1, just select it (don't start drag yet)
            const isClickOnIncompleteImg1 = (imageIndex === 0 &&
                                              state.points[nearbyPointIndex] &&
                                              !state.points[nearbyPointIndex].img2);

            if (!isClickOnIncompleteImg1) {
                 // Allow dragging for complete points or the img2 marker of incomplete ones
                 state.draggingPoint = { pointIndex: nearbyPointIndex, imageIndex: imageIndex };
                 console.log(`Dragging Point ${state.points[nearbyPointIndex].id} on Image ${imageIndex + 1}`);
             } else {
                 console.log(`Selected incomplete Point ${state.points[nearbyPointIndex].id} on Image 1`);
                 // Ensure dragging doesn't start immediately just by clicking the incomplete marker on img1
                 state.draggingPoint = null;
            }
             state.activePointIndex = nearbyPointIndex; // Select the clicked point pair
            redrawAll(); // Redraw needed to update active status and status message
            return;
        }

        // Priority 2: If on full view, check if clicking inside the zoom rectangle to drag it
        if (viewType === 'full' && isInsideZoomRect(imageIndex, x, y)) {
             const canvasFull = state.canvases.full[imageIndex];
             const zoomCenterImgX = state.zoomCenters[imageIndex].x * canvasFull.width;
             const zoomCenterImgY = state.zoomCenters[imageIndex].y * canvasFull.height;
            state.draggingZoomRect = {
                imageIndex: imageIndex,
                offsetX: x - zoomCenterImgX,
                offsetY: y - zoomCenterImgY
            };
            console.log(`Dragging zoom rect ${imageIndex + 1}`);
            canvas.style.cursor = 'grabbing';
             // Ensure active point is deselected if clicking zoom rect away from points
             if (state.activePointIndex !== -1) {
                 state.activePointIndex = -1;
                 redrawAll(); // Redraw needed to show deselection
             }
            return;
        }

        // --- Point Placement Logic ---

        // Check for an existing incomplete point *before* potentially adding a new one
        const incompletePointIndex = state.points.findIndex(p => p.img1 && !p.img2);

        // Case A: Click on Image 1 (index 0)
        if (imageIndex === 0) {
            // *** Add check here ***
            if (incompletePointIndex !== -1) {
                // An incomplete point already exists, prevent adding another
                console.log(`Cannot add new point: Point ${state.points[incompletePointIndex].id} needs to be completed on Image 2 first.`);
                // Select the existing incomplete point to guide the user
                state.activePointIndex = incompletePointIndex;
                // Give feedback
                statusMessage.textContent = `Please define Point ${state.points[incompletePointIndex].id} on Image 2 before starting a new point.`;
                statusMessage.classList.add('animate-pulse', 'text-orange-600'); // Use orange for this warning
                setTimeout(() => statusMessage.classList.remove('animate-pulse', 'text-orange-600'), 2000);
                redrawAll(); // Redraw to show selection change
                return; // Stop execution here
            }

            // No incomplete point found, proceed to create a new one
            const newPoint = {
                id: state.nextPointId++,
                img1: { x, y }, // Set img1 coordinate
                img2: null,      // img2 starts as null
            };
            state.points.push(newPoint);
            state.activePointIndex = state.points.length - 1; // Select the new incomplete point
            console.log(`Started Point ${newPoint.id} on Image 1`);

        }
        // Case B: Click on Image 2 (index 1)
        else if (imageIndex === 1) {
            // Can only place on image 2 if an active point is selected *and* it's missing its image 2 coordinate
            // Or if the *only* incomplete point is the one we should be completing
            let pointToCompleteIndex = -1;
            if (state.activePointIndex !== -1 && state.points[state.activePointIndex] && !state.points[state.activePointIndex].img2) {
                pointToCompleteIndex = state.activePointIndex;
            } else if (incompletePointIndex !== -1) {
                // If no point is active, but there IS an incomplete point, assume user wants to complete that one.
                pointToCompleteIndex = incompletePointIndex;
                state.activePointIndex = incompletePointIndex; // Select it now
            }


            if (pointToCompleteIndex !== -1) {
                 const point = state.points[pointToCompleteIndex];
                 // Double-check conditions (should be guaranteed by findIndex/active check)
                 if (point && point.img1 && !point.img2) {
                    point.img2 = { x, y };
                    console.log(`Completed Point ${point.id} on Image 2`);
                    // Optional: Deselect after completion? Let's keep selected.
                 } else {
                     // This case should ideally not be reached due to prior checks
                     console.warn("Logic error: Tried to complete point on Img2 under invalid conditions.");
                     return;
                 }
            } else {
                 console.log("Click ignored: Click on Image 1 first to start a new point pair, or select an incomplete point.");
                 statusMessage.classList.add('animate-pulse', 'text-red-600');
                 setTimeout(() => statusMessage.classList.remove('animate-pulse', 'text-red-600'), 1500);
                 return; // Don't redraw if nothing changed
            }
        }

        redrawAll(); // Redraw includes status update
        updateSaveButtonState(); // Check if save is now possible
    }

    // handleMouseMove remains largely the same, ensure clamping
     function handleMouseMove(event, imageIndex, viewType) {
        const canvas = (viewType === 'full') ? state.canvases.full[imageIndex] : state.canvases.zoom[imageIndex];
        const { x, y } = getMousePos(canvas, event, viewType);
         if (x < 0 || y < 0) { // Check if mouse pos is valid (relevant for zoom view edge cases)
             // Optionally reset cursor if it was 'move' or 'grab'
             if (canvas.style.cursor === 'move' || canvas.style.cursor === 'grab') {
                 canvas.style.cursor = 'crosshair';
             }
            return;
         }

        // --- Handle Point Dragging ---
        if (state.draggingPoint && state.draggingPoint.imageIndex === imageIndex) {
            const point = state.points[state.draggingPoint.pointIndex];
            // Ensure point exists (safety check)
            if (!point) {
                state.draggingPoint = null; // Stop dragging if point disappeared
                return;
            }
            const coords = (imageIndex === 0) ? point.img1 : point.img2;
            // Check if coords exist before trying to update
            if (coords) {
                 // Clamp coordinates to image bounds (already done in getMousePos for initial, do again for safety?)
                const img = state.images[imageIndex];
                coords.x = Math.max(0, Math.min(x, img.naturalWidth));
                coords.y = Math.max(0, Math.min(y, img.naturalHeight));
                redrawAll(); // Redraw needed to show movement and update zoom potentially
            }
        }
        // --- Handle Zoom Rectangle Dragging ---
        else if (state.draggingZoomRect && state.draggingZoomRect.imageIndex === imageIndex && viewType === 'full') {
            const canvasFull = state.canvases.full[imageIndex];
            const img = state.images[imageIndex];
            if (!img) return;

            const newCenterX = x - state.draggingZoomRect.offsetX;
            const newCenterY = y - state.draggingZoomRect.offsetY;

            let relX = newCenterX / canvasFull.width;
            let relY = newCenterY / canvasFull.height;
            relX = Math.max(0, Math.min(1, relX));
            relY = Math.max(0, Math.min(1, relY));

            if(state.zoomCenters[imageIndex].x !== relX || state.zoomCenters[imageIndex].y !== relY) {
                 state.zoomCenters[imageIndex] = { x: relX, y: relY };
                 redrawAll(); // Redraw needed to update zoom view and rect
            }
        }
         // --- Update Cursor ---
         else if (state.images[imageIndex]) {
            const nearbyPointIndex = findNearbyPoint(imageIndex, x, y);
             if (nearbyPointIndex !== -1) {
                 canvas.style.cursor = 'move';
             } else if (viewType === 'full' && isInsideZoomRect(imageIndex, x, y)) {
                 canvas.style.cursor = 'grab';
             } else {
                  // Indicate if waiting for placement on image 2
                 let stdCursor = 'crosshair';
                 if (imageIndex === 1 && state.activePointIndex !== -1) {
                     const activePoint = state.points[state.activePointIndex];
                     if (activePoint && activePoint.img1 && !activePoint.img2) {
                         stdCursor = 'copy'; // Or 'cell', 'crosshair' still ok
                     }
                 }
                 canvas.style.cursor = stdCursor;
             }
         }
    }

    // handleMouseUp remains the same
     function handleMouseUp(event) {
        if (state.draggingZoomRect) {
            const canvas = state.canvases.full[state.draggingZoomRect.imageIndex];
            // Check if canvas exists before setting cursor
            if (canvas) {
                 // Set cursor based on current mouse position over the canvas
                 const { x, y } = getMousePos(canvas, event, 'full');
                 if (isInsideZoomRect(state.draggingZoomRect.imageIndex, x, y)) {
                     canvas.style.cursor = 'grab';
                 } else {
                     canvas.style.cursor = 'crosshair';
                 }
            }
        }
        state.draggingPoint = null;
        state.draggingZoomRect = null;
    }


    // handleMouseOut remains the same
    function handleMouseOut(event) {
         // If mouse leaves the window while dragging, stop the drag
        if (state.draggingPoint || state.draggingZoomRect) {
             handleMouseUp(); // Use the existing mouseup logic
         }
     }

    // handleKeyDown - Deletes the ENTIRE selected point pair
    function handleKeyDown(event) {
        if ((event.key === 'Delete' || event.key === 'Backspace') && state.activePointIndex !== -1) {
            // Ensure the point actually exists before trying to access its ID
            const pointToDelete = state.points[state.activePointIndex];
             if (pointToDelete) {
                console.log(`Deleting Point Pair ${pointToDelete.id}`);
                state.points.splice(state.activePointIndex, 1);
                state.activePointIndex = -1; // Deselect
                redrawAll(); // Includes status update
                updateSaveButtonState();
             } else {
                 // Active index was pointing to a non-existent point, reset it
                 state.activePointIndex = -1;
                 redrawAll(); // Update status message
             }
        }
    }

    // handleZoomChange remains the same
    function handleZoomChange(event, index) {
        state.zoomLevels[index] = parseFloat(event.target.value);
        zoomLevelDisplays[index].textContent = state.zoomLevels[index].toFixed(1);
        // Only redraw the affected image view for performance
        drawImageView(index);
    }


     // --- Point Management & Saving ---

    // updatePointCountDisplay - Counts *complete* pairs
    function updatePointCountDisplay() {
         const completePairs = state.points.filter(p => p.img1 && p.img2).length;
        pointCountDisplay.textContent = completePairs; // Display count of complete pairs
    }

    // updateSaveButtonState - Checks for *complete* pairs
    function updateSaveButtonState() {
        const hasCompletePair = state.points.some(p => p.img1 && p.img2);
        saveButton.disabled = !hasCompletePair;
    }

    // handleSavePoints - Filters for *complete* pairs before saving
    function handleSavePoints() {
        const validPoints = state.points.filter(p => p.img1 && p.img2); // Ensure both coords exist

        if (validPoints.length === 0) {
            alert('No complete point pairs to save. Click on Image 1, then Image 2 to define pairs.');
            return;
        }

        // Format as CSV
        let csvContent = "id,img1_x,img1_y,img2_x,img2_y\n";
        validPoints.forEach(p => {
             const img1x = p.img1.x.toFixed(3); // Use nullish coalescing just in case? No, filter guarantees existence.
             const img1y = p.img1.y.toFixed(3);
             const img2x = p.img2.x.toFixed(3);
             const img2y = p.img2.y.toFixed(3);
            csvContent += `${p.id},${img1x},${img1y},${img2x},${img2y}\n`;
        });

        // Create Blob and trigger download (same as before)
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.setAttribute("href", url);
            link.setAttribute("download", `control_points_${timestamp}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            console.log("CSV download triggered.");
        } else {
            alert("CSV download is not supported in your browser.");
        }
    }


    // --- Run Initialization ---
    init();
});
