# normalize_images.ps1
# Backup uploads/machines then normalize and relocate image files so server can find them.
# Usage: run from project root with PowerShell v5.1+ (Windows)

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot '..\php\uploads\machines' | Resolve-Path -ErrorAction Stop
$root = $root.Path
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backup = Join-Path $PSScriptRoot "..\php\uploads\machines_backup_$timestamp"
Write-Host "Root: $root"
Write-Host "Creating backup at: $backup"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Write-Host "Copying files to backup (this may take a while)..."
Copy-Item -Path (Join-Path $root '*') -Destination $backup -Recurse -Force
Write-Host "Backup complete."

# helper: normalize filename (keep extension)
function Normalize-Name([string]$name) {
    $ext = [System.IO.Path]::GetExtension($name)
    $base = [System.IO.Path]::GetFileNameWithoutExtension($name)
    # replace spaces with underscore, remove problematic chars except - and _ and alnum
    $base = $base -replace '\s+','_'
    $base = $base -replace '[^A-Za-z0-9_\-]',''
    return ($base + $ext.ToLower())
}

# helper: try to extract equipment token from filename or parent folder
function Extract-Equipment([string]$filePath) {
    # check parent folder token
    $parent = Split-Path $filePath -Parent | Split-Path -Leaf
    if ($parent -match '^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$') { return $parent }

    # try filename prefix before first _ or -
    $name = [System.IO.Path]::GetFileNameWithoutExtension($filePath)
    if ($name -match '^([A-Za-z]+[-_]?[0-9]+)') { return $Matches[1] }
    if ($name -match '^([A-Za-z0-9]{2,})[_-]') { return $Matches[1] }

    return $null
}

# collect image files (jpg,jpeg,png,webp,gif)
$exts = '*.jpg','*.jpeg','*.png','*.webp','*.gif','*.JPG','*.JPEG','*.PNG'
$files = Get-ChildItem -Path $root -Include $exts -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike "*$backup*" }
Write-Host "Found $($files.Count) image files to process."
$actions = @()

foreach ($f in $files) {
    $full = $f.FullName
    # skip files already in a top-level machine dir we consider valid (folder name looks like equipment)
    $rel = $full.Substring($root.Length+1)
    $segments = $rel -split '[\\/]'
    # if first segment matches equipment pattern, we consider it already in per-machine folder
    $firstSeg = $segments[0]
    $isMachineDir = $firstSeg -match '^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$' -and (Test-Path (Join-Path $root $firstSeg))

    $equip = Extract-Equipment $full
    if (!$equip -and $isMachineDir) { $equip = $firstSeg }

    # normalize equipment folder name: keep original case from extracted token
    if ($equip) {
        # ensure directory exists
        $targetDir = Join-Path $root $equip
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir | Out-Null }
        # build normalized filename
        $newName = Normalize-Name $f.Name
        $targetPath = Join-Path $targetDir $newName
        # if source already in targetPath and name equal, skip
        if ($full -ieq $targetPath) {
            continue
        }
        # avoid overwriting: if exists, append index
        $i = 1
        $baseNoExt = [System.IO.Path]::GetFileNameWithoutExtension($newName)
        $ext = [System.IO.Path]::GetExtension($newName)
        while (Test-Path $targetPath) {
            $targetPath = Join-Path $targetDir ("{0}_{1}{2}" -f $baseNoExt, $i, $ext)
            $i++
        }
        # move file
        Move-Item -Path $full -Destination $targetPath -Force
        $actions += "Moved: $full -> $targetPath"
    } else {
        # fallback: put into images/ directory
        $flat = Join-Path $root 'images'
        if (-not (Test-Path $flat)) { New-Item -ItemType Directory -Path $flat | Out-Null }
        $newName = Normalize-Name $f.Name
        $targetPath = Join-Path $flat $newName
        $i = 1; $baseNoExt = [System.IO.Path]::GetFileNameWithoutExtension($newName); $ext = [System.IO.Path]::GetExtension($newName)
        while (Test-Path $targetPath) { $targetPath = Join-Path $flat ("{0}_{1}{2}" -f $baseNoExt, $i, $ext); $i++ }
        Move-Item -Path $full -Destination $targetPath -Force
        $actions += "Moved (fallback): $full -> $targetPath"
    }
}

Write-Host "Operations complete. Summary:"
$actions | ForEach-Object { Write-Host $_ }

# Done
Write-Host "Normalization done. Backup at: $backup"