param($Url)
try {
    Invoke-RestMethod -Uri $Url -Method Post -ErrorAction Stop | Out-Null
    Write-Output 'OK'
} catch {
    Write-Output ('ERROR: ' + $_.Exception.Message)
}
