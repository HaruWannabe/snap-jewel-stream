

## 📱 Jewellery Photo Capture App (iPhone PWA)

A fast, reliable mobile app for your showroom to photograph jewellery items and save them with stock-software-compatible filenames.

---

### 🎯 Core Features

**1. Instant Camera Interface**
- App opens directly to camera view - no splash screen or navigation
- Full-screen rear camera preview using iPhone's highest available resolution
- Clean, minimal interface with light theme for professional showroom feel

**2. Product Prefix Selection**
- Three large, prominent toggle buttons at the bottom of screen:
  - **AWNC** (Necklace)
  - **AWRG** (Ring)  
  - **AWBG** (Bangle)
- Currently selected prefix highlighted clearly
- Editable prefix list in Settings (accessed via small gear icon)

**3. Tag Number Input**
- Large numeric input field that auto-opens keyboard when app starts
- Live filename preview showing: `AWNC102345.jpg`
- Capture button disabled until both prefix selected AND tag entered

**4. Camera Controls**
- Tap anywhere on preview to focus (shows focus indicator)
- Focus lock indicator (locks after focus achieved)
- Exposure lock toggle
- No zoom, no filters - just clean photography

**5. Blur Detection (Strict)**
- Before saving, image analyzed for sharpness
- If potentially blurry: warning dialog appears
- Must confirm to save blurry image, or retake

**6. Duplicate Protection**
- If filename exists: red warning appears
- "AWNC102345.jpg already exists!"
- Explicit confirmation required to overwrite

---

### ⚡ Fast Workflow

- After successful save:
  - Camera stays active
  - Tag field clears automatically
  - Keyboard refocuses to tag input
  - Prefix remains selected
- Zero navigation between captures - designed for speed

---

### 📊 Daily Counter
- Top of screen shows: "Today: 24 photos"
- Auto-resets at midnight each day
- Simple visual progress indicator

---

### 💾 Local Storage (Offline-First)
- All images stored locally on device
- IndexedDB for metadata (tag, prefix, timestamp)
- Blob storage for actual images
- Survives page refresh and app restart
- Works completely offline after first load

---

### 📦 Export to PC
- One-tap "Export All Photos" button
- Creates a single ZIP file containing:
  - All saved images with original filenames
  - Downloads via iOS Safari share sheet
- Clear indicator of how many photos will be exported

---

### ⚙️ Settings Screen
- Edit/add/remove product prefixes
- View storage usage
- Clear all photos (with confirmation)
- About/version info

---

### 📲 PWA Installation
- Installable to iPhone home screen
- Custom app icon for easy recognition
- Full-screen experience (no Safari UI)
- Install instructions shown on first visit

---

### 🚫 Intentionally Excluded
- No barcode scanning
- No auto-increment numbers
- No multi-angle capture
- No user login
- No image editing
- No cloud sync (added later as requested)

