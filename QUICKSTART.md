# Quick Start Guide

## Step-by-step for beginners:

### 1. Install Node.js
- Go to https://nodejs.org/
- Download the LTS version (recommended)
- Run the installer (keep all default options)
- Restart your computer

### 2. Install packages
On Windows, open PowerShell in this folder and run:
```powershell
npm install
```

### 3. Start Chrome for debugging
Close all Chrome windows, then run ONE of these:
```powershell
# Try this first:
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-debug"

# If that doesn't work, try:
& "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\temp\chrome-debug"
```

### 4. Log in to Penzu
1. Chrome will open a debug version - go to https://penzu.com
2. Log in to your account
3. Navigate to your journal (just open any journal page or entry)

### 5. Run the script
In PowerShell:
```powershell
npm start
```

Your entries will be saved in:
- `penzu-entries.json` (all entries)
- `exported-entries/` folder (individual text files)

### 6. Convert to ENEX format (optional)
If you want to import your entries into Journey, Diarium, or other apps that support Evernote format:
```powershell
node convert-to-enex.js
```

This creates `penzu-entries.enex` that you can import into your journaling app!

Done! 🎉
