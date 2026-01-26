Param(
    [string]$Id = "AD-011"
)

# Resolve uploads path relative to workspace
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$uploads = Join-Path $scriptDir '..\php\uploads\machines' | Resolve-Path -ErrorAction Stop
$uploads = $uploads.Path

# Normalized key: lowercase, remove non-alphanumeric
function Normalize([string]$s) {
    return ($s -replace '[^A-Za-z0-9]','').ToLower()
}

$n = Normalize $Id
$allowed = @('*.jpg','*.jpeg','*.png','*.webp','*.gif')

Write-Host "Searching for images matching '$Id' (normalized '$n') under: $uploads"

# gather files
$files = @()
foreach ($pat in $allowed) {
    $files += Get-ChildItem -Path $uploads -Recurse -Include $pat -File -ErrorAction SilentlyContinue
}
$files = $files | Sort-Object FullName -Unique

if (-not $files) {
    Write-Host "No image files found under uploads folder."
    exit 0
}

foreach ($f in $files) {
    $fname = $f.Name
    $nbase = Normalize $fname
    $parent = $f.Directory.Name
    $nparent = Normalize $parent
    $rel = $f.FullName.Substring($uploads.Length + 1) -replace '\\','/'

    if ($nbase -like "*${n}*" -or $nparent -eq $n) {
        $out = [PSCustomObject]@{
            url = "/uploads/machines/$rel"
            filename = $fname
            path = $f.FullName
            parent = $parent
        }
        $out | ConvertTo-Json -Depth 3
    }
}

Write-Host "Search complete."
