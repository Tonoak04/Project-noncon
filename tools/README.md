QR code generation tool

This folder contains a small Node script to generate QR PNG files and a simple print
HTML that lays out the generated images with captions (ids). The script reads
`mysql-files/machines.csv` and creates PNGs in `tools/qrcodes/`.

Usage:

1. From the repository root, install the needed packages (only once):

```powershell
cd php\frontend
npm init -y
npm install qrcode csv-parse fs-extra
```

2. Run the script from the repo root (or adjust paths):

```powershell
node tools\generate-qrcodes.js
```

3. Open `tools\qrcodes\print.html` in a browser to preview and print (PDF or paper).

