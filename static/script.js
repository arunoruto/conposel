document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const fixedCanvas = document.getElementById('fixedCanvas');
    const movingCanvas = document.getElementById('movingCanvas');
    const fixedCtx = fixedCanvas.getContext('2d');
    const movingCtx = movingCanvas.getContext('2d');
    const fixedDetailCanvas = document.getElementById('fixedDetailCanvas');
    const movingDetailCanvas = document.getElementById('movingDetailCanvas');
    const fixedDetailCtx = fixedDetailCanvas.getContext('2d');
    const movingDetailCtx = movingDetailCanvas.getContext('2d');
    const fixedCountEl = document.getElementById('fixedCount');
    const movingCountEl = document.getElementById('movingCount');
    const statusEl = document.getElementById('status');
    const loadStatusEl = document.getElementById('loadStatus');
    const submitButton = document.getElementById('submitButton');
    const resetButton = document.getElementById('resetButton');
    const clearAllButton = document.getElementById('clearAllButton');
    const loadImagesButton = document.getElementById('loadImagesButton');
    const fixedFileEl = document.getElementById('fixedFile');
    const fixedUrlEl = document.getElementById('fixedUrl');
    const movingFileEl = document.getElementById('movingFile');
    const movingUrlEl = document.getElementById('movingUrl');
    const fixedDropZone = document.getElementById('fixedDropZone');
    const movingDropZone = document.getElementById('movingDropZone');
    const dropZones = [fixedDropZone, movingDropZone]; // Keep for styling dragover
    const fixedZoomInput = document.getElementById('fixedZoom');
    const movingZoomInput = document.getElementById('movingZoom');
    const fixedZoomValueEl = document.getElementById('fixedZoomValue');
    const movingZoomValueEl = document.getElementById('movingZoomValue');
    const savePointsButton = document.getElementById('savePointsButton');
    const canvasContainer = document.getElementById('canvasContainer');
    const controlsArea = document.getElementById('controlsArea');


    // --- State Variables ---
    let fixedPoints = [];
    let movingPoints = [];
    let isSelectingFixed = true;
    let fixedImage = new Image();
    let movingImage = new Image();
    let imagesLoaded = 0;
    let selectedPointIndex = -1;
    let selectedPointCanvasId = null;
    let isDragging = false;
    let dragOffsetX = 0; // Offset based on INTRINSIC coordinates
    let dragOffsetY = 0;
    let hoveredPointIndex = -1;
    let hoveredPointCanvasId = null;
    let fixedZoomRect = null; // Stores NON-CLAMPED source rect {sx, sy, sw, sh}
    let movingZoomRect = null;
    let fixedZoomFactor = 4;
    let movingZoomFactor = 4;
    let lastFixedMousePos = null; // Stores last known SCALED intrinsic coordinates {x, y}
    let lastMovingMousePos = null;

    // --- Constants ---
    const DETAIL_VIEW_SIZE = 150;
    const POINT_RADIUS = 5;
    const POINT_HIT_RADIUS = 10; // Hit radius in intrinsic coordinates
    const POINT_COLOR_FIXED = 'rgba(255, 0, 0, 0.8)';
    const POINT_COLOR_MOVING = 'rgba(0, 0, 255, 0.8)';
    const POINT_COLOR_SELECTED = 'rgba(255, 255, 0, 0.9)';
    const ZOOM_BOX_COLOR = 'rgba(0, 255, 0, 0.7)';


    // --- Image Loading ---

    function resetUIForLoading() {
        console.log("Resetting UI for loading...");
        loadStatusEl.textContent = '';
        loadStatusEl.classList.remove('text-red-600', 'text-green-600');
        statusEl.textContent = 'Status: Load images first.';
        canvasContainer.classList.add('hidden');
        canvasContainer.classList.remove('grid');
        controlsArea.classList.add('hidden');
        imagesLoaded = 0;
        fixedImage = new Image();
        movingImage = new Image();
        fixedZoomRect = null;
        movingZoomRect = null;
        fixedZoomFactor = 4;
        movingZoomFactor = 4;
        fixedZoomInput.value = 4;
        movingZoomInput.value = 4;
        fixedZoomValueEl.textContent = `x${Number(4).toFixed(1)}`;
        movingZoomValueEl.textContent = `x${Number(4).toFixed(1)}`;
        lastFixedMousePos = null;
        lastMovingMousePos = null;
         if(fixedCtx) fixedCtx.clearRect(0, 0, fixedCanvas.width, fixedCanvas.height);
         if(movingCtx) movingCtx.clearRect(0, 0, movingCanvas.width, movingCanvas.height);
         if(fixedDetailCtx) fixedDetailCtx.clearRect(0, 0, DETAIL_VIEW_SIZE, DETAIL_VIEW_SIZE);
         if(movingDetailCtx) movingDetailCtx.clearRect(0, 0, DETAIL_VIEW_SIZE, DETAIL_VIEW_SIZE);
        clearAllPoints(false); // Clear point arrays, don't redraw
        submitButton.disabled = true;
        savePointsButton.disabled = true;
    }

    function loadImage(src, canvas, ctx, imageObj, canvasId) {
        console.log(`Attempting to load image for ${canvasId} from: ${src ? src.substring(0,100)+'...' : 'null'}`);
        return new Promise((resolve, reject) => {
            if (!src) {
                 const reason = `No source provided for ${canvasId}`;
                 console.error(reason);
                 reject(reason); return;
            }
            // Reset image object properties before setting src
             imageObj.onload = null;
             imageObj.onerror = null;
             // imageObj.src = ''; // Resetting src might not be necessary/helpful, test without first

            imageObj.onload = () => {
                console.log(`Image successfully loaded: ${canvasId} (w:${imageObj.naturalWidth}, h:${imageObj.naturalHeight})`);
                canvas.width = imageObj.naturalWidth; // Set drawing buffer size
                canvas.height = imageObj.naturalHeight;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(imageObj, 0, 0, canvas.width, canvas.height); // Initial draw
                resolve(imageObj);
            };
            imageObj.onerror = (err) => {
                console.error(`Failed to load image: ${canvasId} from ${src}`, err);
                let reason = `Error loading ${canvasId} image.`;
                 if (src.startsWith('http')) { reason += ' Check browser console (F12) for CORS errors or network issues.'; }
                 else if (src.startsWith('blob:')) { reason += ' Blob URL might be invalid or revoked.'; }
                 reject(reason);
            };
             // Set crossOrigin for external URLs BEFORE setting src
             if (src.startsWith('http')) { imageObj.crossOrigin = "Anonymous"; }
             else { imageObj.crossOrigin = null; } // Reset if not http
             console.log(`Setting image src for ${canvasId}`);
             imageObj.src = src; // Trigger loading
        });
    }

    async function initiateImageLoad(fixedSrc, movingSrc) {
         console.log(`--- Initiating Image Load ---`);
         console.log(`Fixed Source: ${fixedSrc ? fixedSrc.substring(0,100)+'...' : 'null'}`);
         console.log(`Moving Source: ${movingSrc ? movingSrc.substring(0,100)+'...' : 'null'}`);

        if (!fixedSrc || !movingSrc) {
            loadStatusEl.textContent = 'Error: Please provide a source (file or URL) for both images.';
            loadStatusEl.classList.add('text-red-600'); console.error("Load failed: Missing source(s)."); return;
        }
        resetUIForLoading();
        loadStatusEl.textContent = 'Loading images...';
        loadStatusEl.classList.remove('text-red-600', 'text-green-600');

        let revokeFixed = typeof fixedSrc === 'string' && fixedSrc.startsWith('blob:');
        let revokeMoving = typeof movingSrc === 'string' && movingSrc.startsWith('blob:');

        try {
             console.log("Starting image loads...");
             const results = await Promise.allSettled([
                loadImage(fixedSrc, fixedCanvas, fixedCtx, fixedImage, 'fixedCanvas'),
                loadImage(movingSrc, movingCanvas, movingCtx, movingImage, 'movingCanvas')
            ]);
            console.log("Image load results:", results);

            let fixedOk = results[0].status === 'fulfilled';
            let movingOk = results[1].status === 'fulfilled';

            if (fixedOk && movingOk) {
                imagesLoaded = 2;
                console.log("Both images loaded successfully.");
                loadStatusEl.textContent = 'Images loaded successfully.'; loadStatusEl.classList.add('text-green-600');
                statusEl.textContent = 'Status: Select point on Fixed Image';
                canvasContainer.classList.remove('hidden'); canvasContainer.classList.add('grid');
                controlsArea.classList.remove('hidden');
                addCanvasEventListeners();
                // Update detail views with initial coordinates (0,0 intrinsic)
                updateDetailView('fixedCanvas', 0, 0);
                updateDetailView('movingCanvas', 0, 0);
                redrawBothCanvases(); // Draw main canvases with initial zoom boxes
                submitButton.disabled = true; savePointsButton.disabled = true; // Wait for points
            } else {
                 let errorMsg = "Error loading images: ";
                 if (!fixedOk) errorMsg += `Fixed (${results[0].reason || 'Unknown'}) `;
                 if (!movingOk) errorMsg += `Moving (${results[1].reason || 'Unknown'})`;
                 console.error("Image load failed:", errorMsg); loadStatusEl.textContent = errorMsg;
                 loadStatusEl.classList.add('text-red-600'); resetUIForLoading();
            }
        } catch (error) {
             console.error("Unexpected error during image loading:", error);
             loadStatusEl.textContent = `Error: ${error.message || 'Unexpected error.'}`;
             loadStatusEl.classList.add('text-red-600'); resetUIForLoading();
        } finally {
             // Revoke object URLs only if they were actually created and used
             if (revokeFixed && fixedSrc) { console.log("Revoking fixed blob URL"); URL.revokeObjectURL(fixedSrc); }
             if (revokeMoving && movingSrc) { console.log("Revoking moving blob URL"); URL.revokeObjectURL(movingSrc); }
             console.log("--- Image Load Complete ---");
        }
    }

    // --- Drag and Drop Event Handlers (Visual Only) ---
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault(); e.stopPropagation();
            zone.classList.add('bg-blue-100', 'border-blue-400'); // Style feedback
        });
        zone.addEventListener('dragleave', (e) => {
            e.preventDefault(); e.stopPropagation();
            zone.classList.remove('bg-blue-100', 'border-blue-400');
        });
        // REMOVED 'drop' event listener logic
    });

    // --- Button Click Load Handler ---
    loadImagesButton.addEventListener('click', () => {
        console.log("--- Load Images Button Clicked ---");
        let fixedSrc = null; let movingSrc = null;
        let createdFixedBlobUrl = false; // Track if we need to revoke later
        let createdMovingBlobUrl = false;

        if (fixedFileEl.files && fixedFileEl.files.length > 0) {
             fixedSrc = URL.createObjectURL(fixedFileEl.files[0]);
             createdFixedBlobUrl = true; // Mark for revocation
             console.log(`Using Fixed File: ${fixedFileEl.files[0].name}`);
        } else if (fixedUrlEl.value.trim()) {
             fixedSrc = fixedUrlEl.value.trim(); console.log(`Using Fixed URL: ${fixedSrc}`);
        } else { console.log("No Fixed source provided."); }

        if (movingFileEl.files && movingFileEl.files.length > 0) {
             movingSrc = URL.createObjectURL(movingFileEl.files[0]);
             createdMovingBlobUrl = true; // Mark for revocation
             console.log(`Using Moving File: ${movingFileEl.files[0].name}`);
        } else if (movingUrlEl.value.trim()) {
             movingSrc = movingUrlEl.value.trim(); console.log(`Using Moving URL: ${movingSrc}`);
        } else { console.log("No Moving source provided."); }

        // Pass blob URLs to initiateImageLoad, it will handle revocation in finally block
        initiateImageLoad(fixedSrc, movingSrc);
    });

    // --- Drawing ---
    function drawMarker(ctx, x, y, color = 'red', radius = POINT_RADIUS) {
        ctx.fillStyle = color; ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    }

    function redrawCanvas(canvas, ctx, image, points, canvasId, nonClampedZoomRect) {
        if (!image.src || !canvas.width || canvas.width === 0) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        const pointColor = canvasId === 'fixedCanvas' ? POINT_COLOR_FIXED : POINT_COLOR_MOVING;
        points.forEach((p, index) => {
            let color = pointColor;
            if ((isDragging && index === selectedPointIndex && canvasId === selectedPointCanvasId) ||
                (!isDragging && index === hoveredPointIndex && canvasId === hoveredPointCanvasId))
            { color = POINT_COLOR_SELECTED; }
            drawMarker(ctx, p.x, p.y, color, POINT_RADIUS);
        });

        if (nonClampedZoomRect && image.naturalWidth > 0 && image.naturalHeight > 0) {
            const drawSX = Math.max(0, nonClampedZoomRect.sx);
            const drawSY = Math.max(0, nonClampedZoomRect.sy);
            const drawEX = Math.min(image.naturalWidth, nonClampedZoomRect.sx + nonClampedZoomRect.sw);
            const drawEY = Math.min(image.naturalHeight, nonClampedZoomRect.sy + nonClampedZoomRect.sh);
            const drawSW = drawEX - drawSX; const drawSH = drawEY - drawSY;
            if (drawSW > 0 && drawSH > 0) {
                 ctx.strokeStyle = ZOOM_BOX_COLOR; ctx.lineWidth = 1;
                 ctx.strokeRect(drawSX, drawSY, drawSW, drawSH);
            }
        }
     }

    function redrawBothCanvases() {
        redrawCanvas(fixedCanvas, fixedCtx, fixedImage, fixedPoints, 'fixedCanvas', fixedZoomRect);
        redrawCanvas(movingCanvas, movingCtx, movingImage, movingPoints, 'movingCanvas', movingZoomRect);
     }

    // --- Detail View Update ---
    function updateDetailView(targetCanvasId, intrinsicX, intrinsicY) {
        const isFixed = targetCanvasId === 'fixedCanvas';
        const mainImage = isFixed ? fixedImage : movingImage;
        const detailCtx = isFixed ? fixedDetailCtx : movingDetailCtx;
        const detailCanvas = isFixed ? fixedDetailCanvas : movingDetailCanvas;
        const currentZoomFactor = isFixed ? fixedZoomFactor : movingZoomFactor;

         // Store last known INTRINSIC position
         if (isFixed) { lastFixedMousePos = { x: intrinsicX, y: intrinsicY }; }
         else { lastMovingMousePos = { x: intrinsicX, y: intrinsicY }; }

        if (!mainImage.src || !mainImage.complete || mainImage.naturalWidth === 0) {
            detailCtx.fillStyle = '#e0e0e0'; detailCtx.fillRect(0, 0, detailCanvas.width, detailCanvas.height);
            // Optionally clear zoom rect state if image disappears
            // if (isFixed) { fixedZoomRect = null; } else { movingZoomRect = null; }
            return;
        }

        const sourceWidth = Math.max(1, Math.floor(DETAIL_VIEW_SIZE / currentZoomFactor));
        const sourceHeight = Math.max(1, Math.floor(DETAIL_VIEW_SIZE / currentZoomFactor));

        // Calculate source top-left (sx, sy) so intrinsicX, intrinsicY is CENTERED
        let sx = Math.floor(intrinsicX - sourceWidth / 2);
        let sy = Math.floor(intrinsicY - sourceHeight / 2);

        // Store non-clamped rect for redrawCanvas box calculation
        const zoomRect = { sx, sy, sw: sourceWidth, sh: sourceHeight };
        if (isFixed) { fixedZoomRect = zoomRect; } else { movingZoomRect = zoomRect; }

        // Draw detail view background and image portion
        detailCtx.fillStyle = '#ffffff'; detailCtx.fillRect(0, 0, detailCanvas.width, detailCanvas.height);
        detailCtx.imageSmoothingEnabled = false;
        try {
            detailCtx.drawImage( mainImage, sx, sy, sourceWidth, sourceHeight, 0, 0, detailCanvas.width, detailCanvas.height );
        } catch (e) {
             console.error("Error during detail drawImage:", e, {sx, sy, sw: sourceWidth, sh: sourceHeight});
             detailCtx.fillStyle = 'pink'; detailCtx.fillRect(0, 0, detailCanvas.width, detailCanvas.height);
             detailCtx.fillStyle = 'black'; detailCtx.font = '10px sans-serif';
             detailCtx.fillText("Draw Error", 5, 15);
        }

        // Center Crosshair in the detail view box
        const detailCenterX = Math.floor(detailCanvas.width / 2);
        const detailCenterY = Math.floor(detailCanvas.height / 2);
        detailCtx.strokeStyle = 'rgba(0, 255, 0, 0.6)'; detailCtx.lineWidth = 1;
        detailCtx.beginPath();
        detailCtx.moveTo(detailCenterX, 0); detailCtx.lineTo(detailCenterX, detailCanvas.height);
        detailCtx.moveTo(0, detailCenterY); detailCtx.lineTo(detailCanvas.width, detailCenterY);
        detailCtx.stroke();
    }

    // --- Point Interaction Logic ---

    // ** Coordinate Scaling Function **
    function getCanvasCoordinates(event) {
        const canvas = event.target;
        const rect = canvas.getBoundingClientRect();

        // Check if canvas has valid dimensions, return null or zeros if not
         if (!canvas.clientWidth || !canvas.clientHeight || !canvas.width || !canvas.height) {
             console.warn("Canvas dimensions invalid for coordinate calculation:", canvas.id);
             return { x: 0, y: 0, canvasId: canvas.id }; // Or return null and handle upstream
         }

        const cssX = event.clientX - rect.left;
        const cssY = event.clientY - rect.top;

        const scaleX = canvas.width / canvas.clientWidth;
        const scaleY = canvas.height / canvas.clientHeight;

        const intrinsicX = Math.round(cssX * scaleX);
        const intrinsicY = Math.round(cssY * scaleY);

        const finalX = Math.max(0, Math.min(canvas.width, intrinsicX));
        const finalY = Math.max(0, Math.min(canvas.height, intrinsicY));

        return { x: finalX, y: finalY, canvasId: canvas.id }; // Return INTRINSIC coordinates
     }

    function findNearbyPoint(canvasId, intrinsicX, intrinsicY) {
        const points = canvasId === 'fixedCanvas' ? fixedPoints : movingPoints;
        for (let i = points.length - 1; i >= 0; i--) {
            const p = points[i];
            if (isNaN(p.x) || isNaN(p.y)) continue;
            const distance = Math.sqrt((intrinsicX - p.x)**2 + (intrinsicY - p.y)**2);
            if (distance <= POINT_HIT_RADIUS) { return i; }
        }
        return -1;
     }

    // --- Event Handlers (Using intrinsic coordinates) ---
     function handleMouseDown(event) {
          if (imagesLoaded !== 2 || event.button !== 0) return;
          const coords = getCanvasCoordinates(event);
          if (!coords) return; // Handle invalid dims case
          const { x: intrinsicX, y: intrinsicY, canvasId } = coords;
          const pointIndex = findNearbyPoint(canvasId, intrinsicX, intrinsicY);

          if (pointIndex !== -1) {
              isDragging = true;
              selectedPointIndex = pointIndex;
              selectedPointCanvasId = canvasId;
              const points = canvasId === 'fixedCanvas' ? fixedPoints : movingPoints;
              const point = points[selectedPointIndex];
              dragOffsetX = intrinsicX - point.x; // Offset based on intrinsic
              dragOffsetY = intrinsicY - point.y;
              const canvasEl = document.getElementById(canvasId);
              if (canvasEl) canvasEl.classList.add('grabbing');
              console.log(`Start dragging point ${pointIndex} (intrinsic: ${point.x}, ${point.y}) on ${canvasId}`);
              redrawBothCanvases();
              event.preventDefault();
          }
     }

     function handleMouseMove(event) { // Attached to canvas
        if (imagesLoaded !== 2 || isDragging) return;
        const coords = getCanvasCoordinates(event);
        if (!coords) return;
        const { x: intrinsicX, y: intrinsicY, canvasId } = coords;
        let needsMainRedraw = false;
        const canvasEl = document.getElementById(canvasId);

        // Hover Logic uses intrinsic coords
        const pointIndex = findNearbyPoint(canvasId, intrinsicX, intrinsicY);
        let hoverChanged = false;
        if (pointIndex !== -1) {
             if (hoveredPointIndex !== pointIndex || hoveredPointCanvasId !== canvasId) {
                hoveredPointIndex = pointIndex; hoveredPointCanvasId = canvasId;
                if(canvasEl) canvasEl.classList.add('pointer'); hoverChanged = true;
             }
        } else {
             if (hoveredPointIndex !== -1 && hoveredPointCanvasId === canvasId) {
                 hoveredPointIndex = -1; hoveredPointCanvasId = null;
                 if(canvasEl) canvasEl.classList.remove('pointer'); hoverChanged = true;
             }
        }
        needsMainRedraw = hoverChanged;

        // Update Detail View with intrinsic coords & Zoom Box
        updateDetailView(canvasId, intrinsicX, intrinsicY);
        needsMainRedraw = true; // Always redraw for zoom box update

        if (needsMainRedraw) { redrawBothCanvases(); }
    }

    // mouseup is handled by document listener

    function handleMouseLeave(event) {
        if (imagesLoaded !== 2) return;
        const canvasId = event.target.id;
        const canvasEl = document.getElementById(canvasId);

        // Reset hover state if mouse leaves the canvas it was hovering over
        if (hoveredPointCanvasId === canvasId) {
             hoveredPointIndex = -1;
             hoveredPointCanvasId = null;
             if(canvasEl) canvasEl.classList.remove('pointer');
        }

        // Clear zoom rect and detail view only if not currently dragging a point
        if (!isDragging) {
             if (canvasId === 'fixedCanvas') { fixedZoomRect = null; lastFixedMousePos = null;} // Clear last pos too
             else if (canvasId === 'movingCanvas') { movingZoomRect = null; lastMovingMousePos = null;}

             const detailCtx = canvasId === 'fixedCanvas' ? fixedDetailCtx : movingDetailCtx;
             if(detailCtx) detailCtx.clearRect(0, 0, DETAIL_VIEW_SIZE, DETAIL_VIEW_SIZE);

             redrawBothCanvases(); // Redraw main canvases to remove effects
        }
    }

    function handleContextMenu(event) { // Right-click remove
         if (imagesLoaded !== 2) return;
         event.preventDefault();
         const coords = getCanvasCoordinates(event);
         if (!coords) return;
         const { x: intrinsicX, y: intrinsicY, canvasId } = coords;
         const pointIndex = findNearbyPoint(canvasId, intrinsicX, intrinsicY);
         console.log(`Context menu on ${canvasId} at intrinsic (${intrinsicX}, ${intrinsicY}). Nearby point index: ${pointIndex}`);

         if (pointIndex !== -1) {
            if (pointIndex < fixedPoints.length && pointIndex < movingPoints.length) {
                console.log(`Removing point pair at index ${pointIndex}`);
                fixedPoints.splice(pointIndex, 1);
                movingPoints.splice(pointIndex, 1);
                fixedCountEl.textContent = fixedPoints.length;
                movingCountEl.textContent = movingPoints.length;
                redrawBothCanvases();
                statusEl.textContent = `Status: Removed point pair ${pointIndex + 1}. Select point on Fixed Image`;
                isSelectingFixed = true;
                const noPointsLeft = fixedPoints.length === 0;
                submitButton.disabled = noPointsLeft;
                savePointsButton.disabled = noPointsLeft;
            } else {
                console.error(`Inconsistent state: Cannot remove point pair at index ${pointIndex}.`);
                statusEl.textContent = "Error: Inconsistent state trying to remove points.";
            }
         }
      }

    function handleCanvasClick(event) { // Left-click place
         if (imagesLoaded !== 2 || event.button !== 0 || isDragging) return;
         const coords = getCanvasCoordinates(event);
         if (!coords) return;
         const { x: intrinsicX, y: intrinsicY, canvasId } = coords;
         const clickedExistingPoint = findNearbyPoint(canvasId, intrinsicX, intrinsicY);
         if (clickedExistingPoint !== -1) { console.log("Click on existing point; ignored."); return; }
         console.log(`Canvas click on ${canvasId} at intrinsic (${intrinsicX}, ${intrinsicY}) - Placing new point.`);

         if (isSelectingFixed) {
            if (canvasId === 'fixedCanvas') {
                fixedPoints.push({ x: intrinsicX, y: intrinsicY });
                console.log("Added fixed point:", { x: intrinsicX, y: intrinsicY });
                redrawCanvas(fixedCanvas, fixedCtx, fixedImage, fixedPoints, 'fixedCanvas', fixedZoomRect);
                fixedCountEl.textContent = fixedPoints.length;
                statusEl.textContent = 'Status: Select corresponding point on Moving Image';
                isSelectingFixed = false;
                submitButton.disabled = true; // Pair not complete
                savePointsButton.disabled = true;
            } else {
                statusEl.textContent = 'Status: Please click on the FIXED image first.';
            }
         } else { // Selecting moving point
            if (canvasId === 'movingCanvas') {
                if (movingPoints.length < fixedPoints.length) {
                    movingPoints.push({ x: intrinsicX, y: intrinsicY });
                    console.log("Added moving point:", { x: intrinsicX, y: intrinsicY });
                    redrawCanvas(movingCanvas, movingCtx, movingImage, movingPoints, 'movingCanvas', movingZoomRect);
                    movingCountEl.textContent = movingPoints.length;
                    statusEl.textContent = 'Status: Pair complete. Select next point on Fixed Image';
                    isSelectingFixed = true;
                    submitButton.disabled = false; // Pair exists, enable
                    savePointsButton.disabled = false;
                } else {
                      console.warn("Attempted to add moving point without a preceding fixed point.");
                      statusEl.textContent = 'Status: Click on Fixed Image first.';
                      isSelectingFixed = true; // Reset state
                 }
            } else {
                 statusEl.textContent = 'Status: Please click on the MOVING image.';
            }
         }
      }

    // Document listeners for robust dragging outside canvas
     function handleMouseMoveGeneral(event) { // Attached to document
         if(isDragging) {
             const targetCanvas = selectedPointCanvasId === 'fixedCanvas' ? fixedCanvas : movingCanvas;
             if (!targetCanvas) return;
             const rect = targetCanvas.getBoundingClientRect();
             if (!targetCanvas.clientWidth || !targetCanvas.clientHeight) return; // Avoid division by zero

             const cssX = event.clientX - rect.left;
             const cssY = event.clientY - rect.top;
             const scaleX = targetCanvas.width / targetCanvas.clientWidth;
             const scaleY = targetCanvas.height / targetCanvas.clientHeight;
             let currentIntrinsicX = Math.round(cssX * scaleX);
             let currentIntrinsicY = Math.round(cssY * scaleY);

             const points = selectedPointCanvasId === 'fixedCanvas' ? fixedPoints : movingPoints;
             if (selectedPointIndex >= 0 && selectedPointIndex < points.length) {
                 let newX = Math.round(currentIntrinsicX - dragOffsetX);
                 let newY = Math.round(currentIntrinsicY - dragOffsetY);
                 newX = Math.max(0, Math.min(targetCanvas.width, newX)); // Clamp intrinsic
                 newY = Math.max(0, Math.min(targetCanvas.height, newY));

                 if (points[selectedPointIndex].x !== newX || points[selectedPointIndex].y !== newY) {
                     points[selectedPointIndex].x = newX;
                     points[selectedPointIndex].y = newY;
                     redrawBothCanvases();
                     updateDetailView(selectedPointCanvasId, newX, newY);
                 }
             }
         }
     }
     function handleMouseUpGeneral(event) { // Attached to document
         if(isDragging) {
             const lastCanvasId = selectedPointCanvasId;
             const lastPointIndex = selectedPointIndex;
             console.log(`Drag end (mouseup on document). Point: ${lastPointIndex} on ${lastCanvasId}`);

             // Reset dragging state FIRST
             isDragging = false;
             selectedPointIndex = -1;
             selectedPointCanvasId = null;

             // Remove grabbing cursor from potentially both canvases
             const fixedCanvasEl = document.getElementById('fixedCanvas');
             const movingCanvasEl = document.getElementById('movingCanvas');
             if (fixedCanvasEl) fixedCanvasEl.classList.remove('grabbing');
             if (movingCanvasEl) movingCanvasEl.classList.remove('grabbing');

             // Determine final hover state
             const targetCanvas = lastCanvasId === 'fixedCanvas' ? fixedCanvas : movingCanvas;
             if(targetCanvas && targetCanvas.clientWidth && targetCanvas.clientHeight){ // Check target validity
                 const rect = targetCanvas.getBoundingClientRect();
                 const cssX = event.clientX - rect.left;
                 const cssY = event.clientY - rect.top;
                 const scaleX = targetCanvas.width / targetCanvas.clientWidth;
                 const scaleY = targetCanvas.height / targetCanvas.clientHeight;
                 const finalIntrinsicX = Math.round(cssX * scaleX);
                 const finalIntrinsicY = Math.round(cssY * scaleY);
                 const pointIndexUnderMouse = findNearbyPoint(lastCanvasId, finalIntrinsicX, finalIntrinsicY);

                 // Reset hover state before checking
                 hoveredPointIndex = -1;
                 hoveredPointCanvasId = null;
                 if (fixedCanvasEl) fixedCanvasEl.classList.remove('pointer');
                 if (movingCanvasEl) movingCanvasEl.classList.remove('pointer');

                 // Set new hover state only if mouse is over the point just dropped
                 if (pointIndexUnderMouse === lastPointIndex) {
                      hoveredPointIndex = lastPointIndex;
                      hoveredPointCanvasId = lastCanvasId;
                      const canvasEl = document.getElementById(lastCanvasId);
                      if(canvasEl) canvasEl.classList.add('pointer');
                 }
             } else {
                 // Target canvas invalid, just clear hover state
                  hoveredPointIndex = -1;
                  hoveredPointCanvasId = null;
             }
             redrawBothCanvases(); // Final redraw
         }
     }


    // --- Control Button Handlers ---
    function resetLastPair() {
        if (isDragging) return; console.log("Reset Last Pair clicked.");
        let changed = false;
        if (movingPoints.length > 0 && movingPoints.length === fixedPoints.length) {
            fixedPoints.pop(); movingPoints.pop();
            statusEl.textContent = 'Status: Last pair removed. Select point on Fixed Image';
            isSelectingFixed = true; changed = true;
        } else if (fixedPoints.length > movingPoints.length) {
            fixedPoints.pop();
            statusEl.textContent = 'Status: Last fixed point removed. Select point on Fixed Image';
            isSelectingFixed = true; changed = true;
        } else { statusEl.textContent = 'Status: No points or partial pair to remove.'; }

        if (changed) {
             fixedCountEl.textContent = fixedPoints.length; movingCountEl.textContent = movingPoints.length;
             redrawBothCanvases();
             const noPointsLeft = fixedPoints.length === 0;
             submitButton.disabled = noPointsLeft; savePointsButton.disabled = noPointsLeft;
        }
     }
    function clearAllPoints(redraw = true) {
        if (isDragging) return; console.log("Clear All Points clicked.");
        fixedPoints = []; movingPoints = [];
        isSelectingFixed = true;
        fixedCountEl.textContent = '0'; movingCountEl.textContent = '0';
        fixedZoomRect = null; movingZoomRect = null;
        lastFixedMousePos = null; lastMovingMousePos = null;
        statusEl.textContent = 'Status: All points cleared. Select point on Fixed Image';
        submitButton.disabled = true; savePointsButton.disabled = true;

        if (redraw && imagesLoaded === 2) {
            redrawBothCanvases();
            if(fixedDetailCtx) fixedDetailCtx.clearRect(0, 0, DETAIL_VIEW_SIZE, DETAIL_VIEW_SIZE);
            if(movingDetailCtx) movingDetailCtx.clearRect(0, 0, DETAIL_VIEW_SIZE, DETAIL_VIEW_SIZE);
        }
    }
    async function submitPoints() {
        if (isDragging) return; console.log("Submit Points clicked.");
        if (fixedPoints.length === 0 || fixedPoints.length !== movingPoints.length) {
            /* ... alert/status update ... */ return;
        }
        const dataToSend = { /* ... create data ... */ };
        statusEl.textContent = 'Status: Submitting...';
        submitButton.disabled = true; savePointsButton.disabled = true;
        try {
            const response = await fetch('/submit_points', { /* ... */ });
            /* ... handle response ... */
            submitButton.disabled = fixedPoints.length === 0; // Re-enable if points exist
            savePointsButton.disabled = fixedPoints.length === 0;
        } catch (error) {
            /* ... handle error ... */
            submitButton.disabled = fixedPoints.length === 0; // Re-enable if points exist
            savePointsButton.disabled = fixedPoints.length === 0;
        }
    }
    function savePointsToCSV() {
        console.log("Save Points to CSV clicked."); // Log entry
        if (fixedPoints.length === 0 || fixedPoints.length !== movingPoints.length) {
            console.warn("Save aborted: No complete point pairs exist.");
            statusEl.textContent = 'Status: No complete point pairs to save.';
            statusEl.classList.add('text-red-600');
            setTimeout(() => statusEl.classList.remove('text-red-600'), 3000);
            return;
        }
        console.log(`Attempting to save ${fixedPoints.length} point pairs.`);

        let csvContent = "FixedX,FixedY,MovingX,MovingY\n";
        try {
            for (let i = 0; i < fixedPoints.length; i++) {
                const fx = Math.round(fixedPoints[i].x);
                const fy = Math.round(fixedPoints[i].y);
                const mx = Math.round(movingPoints[i].x);
                const my = Math.round(movingPoints[i].y);
                if (isNaN(fx) || isNaN(fy) || isNaN(mx) || isNaN(my)) {
                     throw new Error(`Invalid coordinate data at index ${i}`);
                }
                csvContent += `${fx},${fy},${mx},${my}\n`;
            }
            console.log("CSV content generated successfully.");
            // console.log("CSV Content Preview:\n", csvContent.substring(0, 200) + (csvContent.length > 200 ? "..." : "")); // Optional preview
        } catch (error) {
             console.error("Error generating CSV content:", error);
             statusEl.textContent = 'Status: Error generating CSV data.';
             statusEl.classList.add('text-red-600');
             setTimeout(() => statusEl.classList.remove('text-red-600'), 3000);
             alert("Error generating CSV data. See console for details.");
             return;
        }


        let url = null; // Define url outside try block for finally cleanup
        try {
            console.log("Creating Blob...");
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            console.log("Blob created:", blob);

            console.log("Creating Object URL...");
            url = URL.createObjectURL(blob);
            console.log("Object URL created:", url);

            console.log("Creating link element...");
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "control_points.csv");
            link.style.visibility = 'hidden';
            console.log("Link attributes set (href, download).");

            console.log("Appending link to body...");
            document.body.appendChild(link);
            console.log("Link appended.");

            console.log("Simulating click on link...");
            link.click(); // <<< THE DOWNLOAD TRIGGER >>>
            console.log("Link click simulated.");

            // Cleanup happens *after* the click simulation (in theory, browser handles download)
            console.log("Removing link from body...");
            document.body.removeChild(link);
            console.log("Link removed.");

            // URL Revocation moved to finally block

            statusEl.textContent = `Status: Saved ${fixedPoints.length} points to control_points.csv`;
            statusEl.classList.add('text-green-600');
             setTimeout(() => statusEl.classList.remove('text-green-600'), 3000);
             console.log("CSV download process initiated.");

         } catch (error) {
             // Log the specific error that occurred during the download process
             console.error("Error during CSV download process:", error);
             statusEl.textContent = 'Status: Error creating or downloading CSV file.';
             statusEl.classList.add('text-red-600');
             setTimeout(() => statusEl.classList.remove('text-red-600'), 3000);
             alert("Error creating or downloading CSV file. See console for details.");
         } finally {
              // Ensure URL is revoked even if errors occurred after its creation
              if (url) {
                  console.log("Revoking Object URL:", url);
                  URL.revokeObjectURL(url);
              }
         }
    }


    // --- Initialization ---
    function addCanvasEventListeners() {
        console.log("Adding canvas event listeners.");
        const canvases = [fixedCanvas, movingCanvas];
        canvases.forEach(canvas => {
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseleave', handleMouseLeave);
            canvas.removeEventListener('contextmenu', handleContextMenu);
            canvas.removeEventListener('click', handleCanvasClick);
            canvas.addEventListener('mousedown', handleMouseDown);
            canvas.addEventListener('mousemove', handleMouseMove);
            canvas.addEventListener('mouseleave', handleMouseLeave);
            canvas.addEventListener('contextmenu', handleContextMenu);
            canvas.addEventListener('click', handleCanvasClick);
        });
        document.removeEventListener('mousemove', handleMouseMoveGeneral);
        document.removeEventListener('mouseup', handleMouseUpGeneral);
        document.addEventListener('mousemove', handleMouseMoveGeneral);
        document.addEventListener('mouseup', handleMouseUpGeneral);
    }

    // Add listeners for control buttons
    submitButton.addEventListener('click', submitPoints);
    resetButton.addEventListener('click', resetLastPair);
    clearAllButton.addEventListener('click', () => clearAllPoints(true));
    savePointsButton.addEventListener('click', savePointsToCSV);

    // Add Zoom Input Listeners
    fixedZoomInput.addEventListener('input', (e) => {
        fixedZoomFactor = parseFloat(e.target.value);
        fixedZoomValueEl.textContent = `x${fixedZoomFactor.toFixed(1)}`;
        if (imagesLoaded === 2 && lastFixedMousePos) { // Use stored intrinsic pos
            updateDetailView('fixedCanvas', lastFixedMousePos.x, lastFixedMousePos.y);
            redrawCanvas(fixedCanvas, fixedCtx, fixedImage, fixedPoints, 'fixedCanvas', fixedZoomRect); // Redraw needed for zoom box
        }
    });
    movingZoomInput.addEventListener('input', (e) => {
        movingZoomFactor = parseFloat(e.target.value);
        movingZoomValueEl.textContent = `x${movingZoomFactor.toFixed(1)}`;
        if (imagesLoaded === 2 && lastMovingMousePos) { // Use stored intrinsic pos
            updateDetailView('movingCanvas', lastMovingMousePos.x, lastMovingMousePos.y);
             redrawCanvas(movingCanvas, movingCtx, movingImage, movingPoints, 'movingCanvas', movingZoomRect);
        }
    });


    // Initial UI state set
    console.log("Running initial UI reset.");
    resetUIForLoading();
    console.log("Page setup complete.");

}); // End DOMContentLoaded
