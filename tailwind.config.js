module.exports = {
  content: [
    "./templates/**/*.html", // Scan HTML files in templates
    "./static/**/*.js",      // Scan JS files for potential class names (optional but good practice)
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
