const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000; // Or any port you prefer

// Middleware to serve static files (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse JSON request bodies (if we decide to save server-side)
// app.use(express.json()); // Keep commented out for client-side download approach

// Basic route to serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* // --- Optional: Server-side CSV Saving Route ---
const pointsDir = path.join(__dirname, 'points');
if (!fs.existsSync(pointsDir)){
    fs.mkdirSync(pointsDir);
}

app.post('/save-points', (req, res) => {
    const points = req.body.points; // Expecting { points: [...] } in JSON body
    if (!points || !Array.isArray(points)) {
        return res.status(400).json({ message: 'Invalid points data format.' });
    }

    // Filter points that have coordinates defined for both images
    const validPoints = points.filter(p =>
        p.img1 && typeof p.img1.x === 'number' && typeof p.img1.y === 'number' && p.img1.x >= 0 && p.img1.y >= 0 &&
        p.img2 && typeof p.img2.x === 'number' && typeof p.img2.y === 'number' && p.img2.x >= 0 && p.img2.y >= 0
    );

    if (validPoints.length === 0) {
        return res.status(400).json({ message: 'No valid point pairs to save.' });
    }

    // Format as CSV
    let csvContent = "id,img1_x,img1_y,img2_x,img2_y\n";
    validPoints.forEach(p => {
        csvContent += `${p.id},${p.img1.x.toFixed(2)},${p.img1.y.toFixed(2)},${p.img2.x.toFixed(2)},${p.img2.y.toFixed(2)}\n`;
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `control_points_${timestamp}.csv`;
    const filepath = path.join(pointsDir, filename);

    fs.writeFile(filepath, csvContent, (err) => {
        if (err) {
            console.error("Error saving CSV:", err);
            return res.status(500).json({ message: 'Failed to save points file.' });
        }
        console.log(`Points saved to ${filename}`);
        res.status(200).json({ message: `Points saved successfully to ${filename}` });
    });
});
// --- End Optional Server-side Saving ---
*/

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log('Run "npm run build:css" or "npm run watch:css" in another terminal if not using "npm run dev".');
});
