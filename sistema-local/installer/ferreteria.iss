; Instalador de Ferreteria (sistema-local) -- un solo .exe de doble clic.
; Ver README-INSTALADOR.md para como compilar esto y que hace falta en
; vendor/ antes de poder hacerlo. Ver CLAUDE.md -> "Despliegue" para el
; panorama completo (Fase 1 empaquetado / Fase 2 instalacion / Fase 3 ARCA
; produccion, pendiente).
;
; Que hace, en orden (ver [Code] mas abajo para el detalle real):
;   1. Detecta si Postgres ya esta instalado (registro). Si no, lo instala
;      desatendido (vendor/postgresql-installer.exe).
;   2. Crea un usuario y una base PROPIOS de la app, con contrasena
;      ALEATORIA generada en el momento -- nunca una fija en el .exe.
;   3. Copia la app a C:\Ferreteria (backend compilado + frontend + Node
;      embebido -- ver TAREA 1, no exige instalar Node aparte).
;   4. Genera el .env desde una plantilla con esa contrasena + los datos del
;      emisor (los pide por wizard, no van hardcodeados en este script).
;      ARCA queda en homologacion -- el salto a produccion es aparte, a mano.
;   5. Registra el backend como servicio de Windows (NSSM): arranque
;      automatico + reinicio si se cae.
;   6. Crea la tarea programada del backup nocturno (schtasks).
;   7. Crea el acceso directo del escritorio (abrir-ferreteria.vbs -- espera
;      a que el servicio responda, sin consola negra, ventana "app" sin
;      barra de navegador).
;   8. El desinstalador saca servicio + tarea + archivos. NUNCA la base de
;      datos ni la carpeta de backups -- los datos del negocio no se borran
;      por un desinstalador.
;
; Certificados de ARCA: el instalador NO los incluye ni los pide (ver TAREA 4
; / seguridad -- la .key de produccion es la llave fiscal de la empresa). Se
; copian a mano despues, en C:\Ferreteria\certs\ -- ver el LEEME.txt que el
; instalador deja ahi.

#define MyAppName "Sistema Ferreteria"
#define MyAppVersion "1.0"
#define MyAppExeName "abrir-ferreteria.vbs"
#define MyServiceName "FerreteriaBackend"
#define MyTaskName "FerreteriaBackup"

[Setup]
AppId={{B3D9F4C2-7A1E-4C6B-9E3D-FE1A2B3C4D5E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Refrigeracion Dimundo S.A.S.
DefaultDirName=C:\Ferreteria
; Ruta fija (no dejamos elegir carpeta): NSSM, schtasks, psql y los .bat
; embebidos se apoyan en rutas conocidas de antemano, y una ruta sin
; espacios evita dolores de cabeza con Program Files (permisos de escritura
; para .env/backups/ desde un servicio, y comillas en cada Exec()).
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=no
PrivilegesRequired=admin
; x64compatible: registro/Archivos de Program Files en su vista NATIVA de 64
; bits (Postgres/NSSM son 64 bits) -- si no, RegKeyExists mira WOW6432Node y
; no ve lo que instalo el EDB installer de 64 bits.
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=FerreteriaSetup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile=app.ico
UninstallDisplayIcon={app}\app.ico
; No pedimos licencia ni mostramos README -- instalador corto, para alguien
; que no escribio el codigo (ver docs/INSTALACION.md).

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Files]
; --- Node embebido (TAREA 1): node.exe + npm + su propio node_modules ---
Source: "vendor\node\*"; DestDir: "{app}\node"; Flags: recursesubdirs skipifsourcedoesntexist

; --- Backend compilado + frontend ya copiado a public/ (ver build:prod) ---
Source: "..\backend\dist\*"; DestDir: "{app}\dist"; Flags: recursesubdirs skipifsourcedoesntexist
Source: "..\backend\public\*"; DestDir: "{app}\public"; Flags: recursesubdirs skipifsourcedoesntexist
Source: "..\backend\node_modules\*"; DestDir: "{app}\node_modules"; Flags: recursesubdirs skipifsourcedoesntexist
Source: "..\backend\package.json"; DestDir: "{app}"; Flags: skipifsourcedoesntexist
Source: "..\backend\scripts\backup.ts"; DestDir: "{app}\scripts"; Flags: skipifsourcedoesntexist
Source: "..\backend\scripts\README-backup.md"; DestDir: "{app}\scripts"; Flags: skipifsourcedoesntexist

; --- Launchers de la version INSTALADA (usan el Node embebido, ver TAREA 1) ---
Source: "plantillas\iniciar-backend.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "plantillas\ejecutar-backup.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "plantillas\certs-leeme.txt"; DestDir: "{app}\certs"; DestName: "LEEME.txt"; Flags: ignoreversion
; env.template NO se copia a {app} tal cual (se genera el .env real a partir
; de esto, ver GenerarEnv) -- mismo patron "dontcopy" que postgresql-installer.exe.
Source: "plantillas\env.template"; DestDir: "{tmp}"; Flags: dontcopy

; --- Acceso directo y su icono ---
Source: "abrir-ferreteria.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "app.ico"; DestDir: "{app}"; Flags: ignoreversion

; --- Herramientas embebidas para el propio instalador (no quedan visibles al titular) ---
Source: "vendor\nssm.exe"; DestDir: "{app}\_instalador"; Flags: skipifsourcedoesntexist

; postgresql-installer.exe NO se copia a {app} (no queda instalado ahi, solo
; se corre una vez y se descarta): "dontcopy" lo empaqueta adentro del
; propio Setup.exe sin extraerlo automaticamente -- se saca a {tmp} a mano
; con ExtractTemporaryFile() justo antes de correrlo (ver InstalarPostgresDesatendido).
Source: "vendor\postgresql-installer.exe"; DestDir: "{tmp}"; Flags: dontcopy skipifsourcedoesntexist

[Dirs]
; backups\ y certs\ existen desde el arranque aunque esten vacias -- certs\
; con su LEEME (arriba) explicando el paso manual de TAREA 4.
Name: "{app}\backups"
Name: "{app}\certs"

[Icons]
; wscript.exe explicito (no confiar en la asociacion de .vbs del sistema):
; asi nunca se abre con cscript.exe (que SI muestra consola).
Name: "{autodesktop}\Ferreteria"; Filename: "{sys}\wscript.exe"; \
    Parameters: """{app}\abrir-ferreteria.vbs"""; WorkingDir: "{app}"; \
    IconFilename: "{app}\app.ico"; Comment: "Sistema de gestion de la ferreteria"

[Code]
var
  PaginaPostgresExistente: TInputQueryWizardPage;
  PaginaEmisor: TInputQueryWizardPage;
  PostgresYaEstaba: Boolean;
  PasswordSuperusuario: String;
  PasswordApp: String;
  CarpetaBinPostgres: String;

const
  DB_USER_APP = 'ferreteria_app';
  DB_NAME_APP = 'ferreteria_local';

// SetEnvironmentVariableW: para que psql (hijo del proceso del instalador)
// reciba PGPASSWORD sin escribirla en la linea de comandos (no queda en el
// log de Windows ni en la lista de procesos).
function SetEnvironmentVariable(lpName, lpValue: string): Boolean;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';

// ---------- Utilidades ----------

function GenerarPasswordAleatoria(Largo: Integer): String;
var
  Alfabeto: String;
  I: Integer;
begin
  Alfabeto := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  Result := '';
  for I := 1 to Largo do
    Result := Result + Alfabeto[Random(Length(Alfabeto)) + 1];
end;

function PostgresYaInstalado(): Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\PostgreSQL\Installations');
end;

// Busca psql.exe recorriendo TODAS las instalaciones registradas -- sirve
// tanto para una instalacion preexistente como para la que hace este mismo
// instalador (el EDB installer escribe ahi tambien). No depende de conocer
// la version de antemano.
function EncontrarCarpetaBinPostgres(): String;
var
  Nombres: TArrayOfString;
  I: Integer;
  BaseDir: String;
begin
  Result := '';
  if RegGetSubkeyNames(HKLM, 'SOFTWARE\PostgreSQL\Installations', Nombres) then
  begin
    for I := 0 to GetArrayLength(Nombres) - 1 do
    begin
      if RegQueryStringValue(HKLM, 'SOFTWARE\PostgreSQL\Installations\' + Nombres[I], 'Base Directory', BaseDir) then
      begin
        if FileExists(BaseDir + '\bin\psql.exe') then
        begin
          Result := BaseDir + '\bin';
          Exit;
        end;
      end;
    end;
  end;
end;

// Reemplaza todas las apariciones del placeholder Token (envuelto en llaves
// dobles en la plantilla) por Valor, dentro de S.
function Reemplazar(const S, Token, Valor: String): String;
begin
  Result := S;
  StringChangeEx(Result, '{{' + Token + '}}', Valor, True);
end;

// ---------- Paginas del wizard ----------

procedure InitializeWizard();
begin
  PostgresYaEstaba := PostgresYaInstalado();

  // Solo se muestra si Postgres YA estaba instalado: necesitamos su
  // contrasena de superusuario para poder crear la base de la app (si lo
  // instalamos nosotros mas abajo, ya la sabemos, no hace falta preguntar).
  PaginaPostgresExistente := CreateInputQueryPage(wpSelectDir,
    'PostgreSQL ya instalado', 'Hace falta la contrasena del superusuario',
    'Se detecto una instalacion de PostgreSQL existente en esta PC. ' +
    'Para crear la base de datos de la ferreteria necesitamos la ' +
    'contrasena del superusuario "postgres" (o el que corresponda). ' +
    'No se guarda en ningun lado: se usa una sola vez, ahora.');
  PaginaPostgresExistente.Add('Usuario superusuario de Postgres:', False);
  PaginaPostgresExistente.Values[0] := 'postgres';
  PaginaPostgresExistente.Add('Contrasena:', True);

  PaginaEmisor := CreateInputQueryPage(wpSelectDir,
    'Datos del emisor', 'Datos fiscales de la ferreteria',
    'Estos datos van en la factura impresa. Se pueden corregir despues a ' +
    'mano editando el archivo .env en la carpeta de instalacion. El CUIT ' +
    'de esta etapa es el de HOMOLOGACION (de pruebas) -- el CUIT real de ' +
    'la empresa se carga recien en el salto a produccion, aparte.');
  PaginaEmisor.Add('Razon social:', False);
  PaginaEmisor.Add('CUIT (homologacion, sin guiones):', False);
  PaginaEmisor.Add('Domicilio comercial:', False);
  PaginaEmisor.Add('Ingresos Brutos:', False);
  PaginaEmisor.Add('Inicio de actividades (DD/MM/AAAA):', False);
  PaginaEmisor.Add('Punto de venta (homologacion = 1):', False);
  PaginaEmisor.Values[5] := '1';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if (PaginaPostgresExistente <> nil) and (PageID = PaginaPostgresExistente.ID) then
    Result := not PostgresYaEstaba;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (PaginaEmisor <> nil) and (CurPageID = PaginaEmisor.ID) then
  begin
    if (Trim(PaginaEmisor.Values[0]) = '') or (Trim(PaginaEmisor.Values[1]) = '') then
    begin
      MsgBox('Razon social y CUIT son obligatorios (el resto se puede completar despues a mano).', mbError, MB_OK);
      Result := False;
    end;
  end;
  if (PaginaPostgresExistente <> nil) and (CurPageID = PaginaPostgresExistente.ID) then
  begin
    if Trim(PaginaPostgresExistente.Values[1]) = '' then
    begin
      MsgBox('Hace falta la contrasena del superusuario de Postgres para poder continuar.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

// ---------- Postgres: instalar (si hace falta) + crear base/usuario ----------

function InstalarPostgresDesatendido(): Boolean;
var
  ResultCode: Integer;
  Instalador: String;
begin
  Result := False;
  // postgresql-installer.exe se empaqueto con "dontcopy" (ver [Files]): hay
  // que sacarlo a {tmp} a mano antes de poder correrlo. Si no estaba
  // disponible al compilar (skipifsourcedoesntexist), ExtractTemporaryFile
  // tira una excepcion -- se atrapa y se avisa en vez de reventar el instalador.
  try
    ExtractTemporaryFile('postgresql-installer.exe');
  except
    MsgBox('No se encontro vendor\postgresql-installer.exe (no estaba disponible al compilar este instalador). ' +
      'Sin PostgreSQL no se puede continuar. Ver installer\vendor\README.md.', mbCriticalError, MB_OK);
    Exit;
  end;
  Instalador := ExpandConstant('{tmp}\postgresql-installer.exe');
  if not FileExists(Instalador) then
  begin
    MsgBox('No se encontro vendor\postgresql-installer.exe. Sin PostgreSQL no se puede continuar. ' +
      'Ver installer\vendor\README.md.', mbCriticalError, MB_OK);
    Exit;
  end;
  PasswordSuperusuario := GenerarPasswordAleatoria(20);
  WizardForm.StatusLabel.Caption := 'Instalando PostgreSQL (puede tardar varios minutos)...';
  // --mode unattended: propio del instalador de EDB (BitRock InstallBuilder).
  // --unattendedmodeui minimal: evita pantallas emergentes durante la instalacion silenciosa.
  Result := Exec(Instalador,
    '--mode unattended --unattendedmodeui minimal --superpassword "' + PasswordSuperusuario + '" ' +
    '--servicename postgresql-ferreteria --servicepassword "' + GenerarPasswordAleatoria(20) + '" ' +
    '--enable-components server,commandlinetools',
    '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
  if Result and (ResultCode <> 0) then
  begin
    MsgBox('El instalador de PostgreSQL termino con un error (codigo ' + IntToStr(ResultCode) + ').', mbCriticalError, MB_OK);
    Result := False;
  end;
end;

// Todo lo de Postgres (instalar si hace falta + localizar psql + crear
// usuario/base/extension) en un solo paso, en orden.
function PrepararPostgres(): Boolean;
var
  ResultCode: Integer;
  ArgsCrear: String;
begin
  Result := False;

  if PostgresYaEstaba then
    PasswordSuperusuario := PaginaPostgresExistente.Values[1]
  else
  begin
    if not InstalarPostgresDesatendido() then
      Exit;
  end;

  CarpetaBinPostgres := EncontrarCarpetaBinPostgres();
  if CarpetaBinPostgres = '' then
  begin
    MsgBox('No se pudo encontrar psql.exe despues de instalar/detectar PostgreSQL. ' +
      'Revisar la instalacion a mano (ver docs/INSTALACION.md, anexo manual).', mbCriticalError, MB_OK);
    Exit;
  end;

  PasswordApp := GenerarPasswordAleatoria(24);

  SetEnvironmentVariable('PGPASSWORD', PasswordSuperusuario);

  // CREATE USER + CREATE DATABASE + CREATE EXTENSION, los 3 con el
  // superusuario: el usuario de la app despues NO tiene permiso para crear
  // la extension uuid-ossp sola (ver docs/INSTALACION.md, mismo gotcha).
  ArgsCrear := '-h localhost -U ' + PaginaPostgresExistente.Values[0];
  if not PostgresYaEstaba then
    ArgsCrear := '-h localhost -U postgres';

  Exec(CarpetaBinPostgres + '\psql.exe', ArgsCrear +
    ' -c "CREATE USER ' + DB_USER_APP + ' WITH PASSWORD ''' + PasswordApp + ''';"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if ResultCode <> 0 then
  begin
    MsgBox('No se pudo crear el usuario de base de datos de la app (codigo ' + IntToStr(ResultCode) + '). ' +
      'Puede que ya existiera de una instalacion anterior -- si es asi, se puede ignorar.', mbInformation, MB_OK);
  end;

  Exec(CarpetaBinPostgres + '\psql.exe', ArgsCrear +
    ' -c "CREATE DATABASE ' + DB_NAME_APP + ' OWNER ' + DB_USER_APP + ';"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if ResultCode <> 0 then
  begin
    MsgBox('No se pudo crear la base de datos (codigo ' + IntToStr(ResultCode) + '). ' +
      'Puede que ya existiera de una instalacion anterior -- si es asi, se puede ignorar.', mbInformation, MB_OK);
  end;

  Exec(CarpetaBinPostgres + '\psql.exe', ArgsCrear +
    ' -d ' + DB_NAME_APP + ' -c "CREATE EXTENSION IF NOT EXISTS ''uuid-ossp'';"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  SetEnvironmentVariable('PGPASSWORD', '');

  Result := True;
end;

// ---------- .env ----------

procedure GenerarEnv();
var
  PlantillaAnsi: AnsiString;
  Plantilla: String;
  PgDumpPath: String;
begin
  // LoadStringFromFile/SaveStringToFile trabajan con AnsiString, no con el
  // String (Unicode) que usa el resto del script -- de ahi el cast en las
  // dos puntas. El template es ASCII puro, no hay perdida en la conversion.
  ExtractTemporaryFile('env.template');
  LoadStringFromFile(ExpandConstant('{tmp}\env.template'), PlantillaAnsi);
  Plantilla := String(PlantillaAnsi);

  Plantilla := Reemplazar(Plantilla, 'FECHA_INSTALACION', GetDateTimeString('dd/mm/yyyy hh:nn', #0, #0));
  Plantilla := Reemplazar(Plantilla, 'DB_USER', DB_USER_APP);
  Plantilla := Reemplazar(Plantilla, 'DB_PASSWORD', PasswordApp);
  Plantilla := Reemplazar(Plantilla, 'DB_NAME', DB_NAME_APP);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_RAZON_SOCIAL', PaginaEmisor.Values[0]);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_CUIT', PaginaEmisor.Values[1]);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_DOMICILIO_COMERCIAL', PaginaEmisor.Values[2]);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_INGRESOS_BRUTOS', PaginaEmisor.Values[3]);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_INICIO_ACTIVIDADES', PaginaEmisor.Values[4]);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_PUNTO_VENTA', PaginaEmisor.Values[5]);
  Plantilla := Reemplazar(Plantilla, 'BACKUP_DIR_LOCAL', ExpandConstant('{app}\backups'));

  PgDumpPath := CarpetaBinPostgres + '\pg_dump.exe';
  Plantilla := Reemplazar(Plantilla, 'PG_DUMP_PATH', PgDumpPath);

  SaveStringToFile(ExpandConstant('{app}\.env'), AnsiString(Plantilla), False);
end;

// ---------- Servicio (NSSM) y tarea programada (schtasks) ----------

procedure RegistrarServicio();
var
  ResultCode: Integer;
  Nssm: String;
begin
  Nssm := ExpandConstant('{app}\_instalador\nssm.exe');
  if not FileExists(Nssm) then
  begin
    MsgBox('No se encontro nssm.exe -- el backend no va a arrancar solo. ' +
      'Ver installer\vendor\README.md y registrar el servicio a mano despues (docs/INSTALACION.md).', mbError, MB_OK);
    Exit;
  end;
  Exec(Nssm, 'install ' + '{#MyServiceName}' + ' "' + ExpandConstant('{app}\iniciar-backend.bat') + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(Nssm, 'set {#MyServiceName} Start SERVICE_AUTO_START', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(Nssm, 'set {#MyServiceName} AppExit Default Restart', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(Nssm, 'set {#MyServiceName} AppDirectory "' + ExpandConstant('{app}') + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(Nssm, 'start {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure RegistrarTareaBackup();
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\schtasks.exe'),
    '/create /tn "{#MyTaskName}" /tr "' + ExpandConstant('{app}\ejecutar-backup.bat') + '" ' +
    '/sc daily /st 23:30 /ru SYSTEM /f',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

// ---------- Orquestacion ----------

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    WizardForm.StatusLabel.Caption := 'Preparando PostgreSQL y la base de datos...';
    if not PrepararPostgres() then
    begin
      MsgBox('No se pudo terminar de preparar PostgreSQL. La instalacion va a seguir, pero ' +
        'el sistema NO va a poder arrancar hasta resolverlo a mano -- ver docs/INSTALACION.md, anexo manual.',
        mbCriticalError, MB_OK);
      Exit;
    end;

    WizardForm.StatusLabel.Caption := 'Generando la configuracion (.env)...';
    GenerarEnv();

    WizardForm.StatusLabel.Caption := 'Registrando el servicio de Windows...';
    RegistrarServicio();

    WizardForm.StatusLabel.Caption := 'Programando el backup nocturno...';
    RegistrarTareaBackup();
  end;
end;

// ---------- Desinstalacion: NUNCA borrar base de datos ni backups ----------

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
  Nssm: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    Nssm := ExpandConstant('{app}\_instalador\nssm.exe');
    if FileExists(Nssm) then
    begin
      Exec(Nssm, 'stop {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Exec(Nssm, 'remove {#MyServiceName} confirm', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
    Exec(ExpandConstant('{sys}\schtasks.exe'), '/delete /tn "{#MyTaskName}" /f', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    // A proposito: NO se toca la base de datos (Postgres sigue instalado,
    // con los datos) ni la carpeta de backups -- ver TAREA 2.8. Solo se van
    // el servicio, la tarea programada y los archivos que instalo este
    // instalador (eso lo hace Inno solo, por [Files]).
    MsgBox('Se desinstalo la aplicacion. La base de datos de PostgreSQL y la carpeta de backups ' +
      'NO se borraron -- si de verdad hace falta borrarlos, es a mano.', mbInformation, MB_OK);
  end;
end;
