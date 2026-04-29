# Remove <Navbar /> render and its import from all individual pages
# since it's now in the global layout.tsx

$appDir = "app"
$pages = Get-ChildItem -Path $appDir -Recurse -Filter "*.tsx" | Where-Object { $_.FullName -notmatch "layout\.tsx" }

$importPattern  = "^import \{ Navbar \}.*from '@/components/dashboard/navbar';\r?\n?"
$renderPatterns = @(
    "\r?\n\s*<Navbar\s*/>\r?\n",   # standalone <Navbar />
    "\r?\n\s*<Navbar\s*/>"         # at end of block
)

$count = 0
foreach ($file in $pages) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $original = $content

    # Remove import line
    $content = [regex]::Replace($content, $importPattern, '', 'Multiline')

    # Remove <Navbar /> render occurrences
    foreach ($pat in $renderPatterns) {
        $content = [regex]::Replace($content, $pat, "`n")
    }

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.Encoding]::UTF8)
        Write-Host "Cleaned: $($file.FullName)"
        $count++
    }
}

Write-Host ""
Write-Host "Done. Cleaned $count files."
