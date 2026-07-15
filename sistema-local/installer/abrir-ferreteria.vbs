Option Explicit

' Acceso directo del escritorio del titular (ver ferreteria.iss, seccion
' [Icons]): reintenta unos segundos a que el backend responda antes de abrir
' el navegador -- si la PC recien arranco, el servicio (NSSM) puede tardar
' unos segundos en levantar. Corre con wscript.exe (asociacion por default de
' .vbs), asi que NUNCA muestra una consola negra -- ni siquiera un flash.
'
' Se abre en "modo app" de Edge/Chrome (--app=URL): ventana propia sin barra
' de direcciones ni pestanas, como una aplicacion de escritorio.

Dim url, maxIntentos, intento, listo, shell, fso
Dim edgePath, edgePathX86, chromePath, navegador

url = "http://localhost:3000/"
maxIntentos = 30 ' ~30 segundos (1 intento por segundo)

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

listo = False
For intento = 1 To maxIntentos
    If ResponPuerto(url) Then
        listo = True
        Exit For
    End If
    WScript.Sleep 1000
Next

If Not listo Then
    MsgBox "El sistema todavia no respondio en " & url & "." & vbCrLf & vbCrLf & _
           "Si la PC recien se prendio, puede que el servicio este arrancando " & _
           "todavia -- esperá un momento y abri este acceso directo de nuevo." & vbCrLf & _
           "Si el problema sigue, avisale a Mateo.", _
           vbExclamation, "Ferreteria"
    WScript.Quit 1
End If

edgePathX86 = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
edgePath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"

navegador = ""
If fso.FileExists(edgePathX86) Then
    navegador = edgePathX86
ElseIf fso.FileExists(edgePath) Then
    navegador = edgePath
ElseIf fso.FileExists(chromePath) Then
    navegador = chromePath
End If

If navegador <> "" Then
    shell.Run """" & navegador & """ --app=" & url, 1, False
Else
    ' Fallback: navegador por default del sistema, con barra (mejor esto que nada).
    shell.Run url, 1, False
End If

' --- Funciones ---

' Chequea el puerto por HTTP real (no solo TCP): confirma que el backend ya
' esta respondiendo pedidos, no solo que el puerto esta abierto.
Function ResponPuerto(porUrl)
    Dim http
    ResponPuerto = False
    On Error Resume Next
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    http.SetTimeouts 1500, 1500, 1500, 1500
    http.Open "GET", porUrl, False
    http.Send
    If Err.Number = 0 Then
        If http.Status >= 200 And http.Status < 500 Then
            ResponPuerto = True
        End If
    End If
    Err.Clear
    On Error Goto 0
    Set http = Nothing
End Function
