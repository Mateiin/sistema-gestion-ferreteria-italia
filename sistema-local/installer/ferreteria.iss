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
;   6. Crea la tarea programada del backup (PowerShell, diaria 19:00 + al
;      inicio del sistema si la PC estaba apagada -- ver registrar-tarea-backup.ps1).
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

; ---------------------------------------------------------------------------
; Guard de compilacion: [Files] mas abajo usa "skipifsourcedoesntexist" para
; que un vendor/ incompleto en una maquina no rompa a alguien que solo quiere
; iterar sobre el wizard -- pero eso significa que un archivo faltante NO
; frena la compilacion, solo lo omite EN SILENCIO. Ya paso dos veces (primero
; postgresql-installer.exe/env.template, despues backend/public/ entero -- un
; .exe de ~51MB o sin frontend, compilando "bien" las dos veces). Estos
; chequeos con el preprocesador (ISPP, corren ANTES de armar el .exe) frenan
; la compilacion con un mensaje claro en vez de dejar pasar un instalador
; roto. Si de verdad haces falta compilar sin alguno de estos (por ejemplo,
; iterando el wizard sin querer bajar Postgres todavia), comenta la linea
; correspondiente a mano -- a propósito no hay una forma de saltearlos por
; parametro, para que no quede un hueco permanente.
#if !FileExists("vendor\node\node.exe")
  #error "Falta vendor\node\node.exe -- ver installer\vendor\README.md (Node.js embebido)."
#endif
#if !FileExists("vendor\postgresql-installer.exe")
  #error "Falta vendor\postgresql-installer.exe -- ver installer\vendor\README.md (instalador de PostgreSQL)."
#endif
#if !FileExists("vendor\nssm.exe")
  #error "Falta vendor\nssm.exe -- ver installer\vendor\README.md (NSSM)."
#endif
#if !FileExists("plantillas\env.template")
  #error "Falta installer\plantillas\env.template."
#endif
#if !FileExists("..\backend\dist\main.js")
  #error "Falta ..\backend\dist\main.js -- correr 'npm run build:prod' en sistema-local\backend\ antes de compilar (ver docs\INSTALACION.md)."
#endif
#if !FileExists("..\backend\public\index.html")
  #error "Falta ..\backend\public\index.html -- 'npm run build:prod' no corrio o corrio antes de este cambio: el instalador quedaria SIN FRONTEND (ver docs\INSTALACION.md, hallazgo del 2026-07-16 -- ya paso una vez)."
#endif

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
; Verificación de solo lectura contra ARCA producción (ver CLAUDE.md /
; docs/INSTALACION.md -> Fase 3): se copia igual que backup.ts para poder
; correr "npm run verificar:prod" en esta misma PC antes del salto a
; producción, sin necesitar el resto de scripts/ (pruebas de homologación).
Source: "..\backend\scripts\verificar-produccion.ts"; DestDir: "{app}\scripts"; Flags: skipifsourcedoesntexist
Source: "..\backend\.env.produccion.example"; DestDir: "{app}"; Flags: skipifsourcedoesntexist

; --- Launchers de la version INSTALADA (usan el Node embebido, ver TAREA 1) ---
Source: "plantillas\iniciar-backend.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "plantillas\ejecutar-backup.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "plantillas\certs-leeme.txt"; DestDir: "{app}\certs"; DestName: "LEEME.txt"; Flags: ignoreversion
; Logo del emisor: a diferencia de los certificados de ARCA, NO es un
; secreto (es el mismo logo que va en la cartelería del local), así que sí
; se embebe en el instalador y se copia solo -- el titular no tiene que
; copiar nada a mano (ver CLAUDE.md/docs/INSTALACION.md -> "Logo del
; emisor"). "skipifsourcedoesntexist" a propósito, NO está en el guard de
; #error de más arriba: es opcional, si falta el instalador se compila
; igual (env.template deja EMISOR_LOGO_PATH apuntando igual a este archivo;
; si no está, el PDF cae solo al texto de la razón social, ver
; cargarLogoDataUrl en config/emisor.ts -- no rompe nada).
Source: "assets\logo-ferreteria.png"; DestDir: "{app}\certs"; Flags: skipifsourcedoesntexist ignoreversion
; env.template NO se copia a {app} tal cual (se genera el .env real a partir
; de esto, ver GenerarEnv) -- mismo patron "dontcopy" que postgresql-installer.exe.
Source: "plantillas\env.template"; DestDir: "{tmp}"; Flags: dontcopy

; --- Acceso directo y su icono ---
Source: "abrir-ferreteria.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "app.ico"; DestDir: "{app}"; Flags: ignoreversion

; --- Herramientas embebidas para el propio instalador (no quedan visibles al titular) ---
Source: "vendor\nssm.exe"; DestDir: "{app}\_instalador"; Flags: skipifsourcedoesntexist
Source: "plantillas\registrar-tarea-backup.ps1"; DestDir: "{app}\_instalador"; Flags: ignoreversion

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
; Carpeta de backup en el escritorio del usuario: el titular la ve apenas
; instala, sin tener que buscar en C:\Ferreteria. Si el usuario cambia la
; ruta en el wizard, se usa esa en vez de esta (ver ForceDirectories en
; CurStepChanged).
Name: "{userdesktop}\Ferreteria Backups"

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
  PaginaBackup: TInputQueryWizardPage;
  PostgresYaEstaba: Boolean;
  PasswordSuperusuario: String;
  NombreSuperusuario: String;
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

  // El destino LOCAL es obligatorio (siempre se escribe primero, ver
  // backup.ts); pendrive y Drive son opcionales -- si quedan vacios el
  // backup sigue funcionando "solo local" (degradado, ver TAREA 3 del
  // banner de alerta) y se pueden completar despues a mano editando el .env,
  // sin reinstalar.
  PaginaBackup := CreateInputQueryPage(PaginaEmisor.ID,
    'Backup', 'Donde se guardan las copias de seguridad',
    'El backup corre solo, todas las noches (tarea programada). El destino ' +
    'local es obligatorio; el pendrive y Google Drive son opcionales y se ' +
    'pueden completar despues editando el archivo .env en la carpeta de ' +
    'instalacion, sin tener que reinstalar.');
  PaginaBackup.Add('Carpeta de backup local:', False);
  PaginaBackup.Values[0] := ExpandConstant('{userdesktop}\Ferreteria Backups');
  // Sin acentos a proposito, como el resto del texto de UI de este script
  // (ver GenerarEnv): el .iss se guarda en UTF-8 SIN BOM, y sin BOM el
  // compilador de Inno Setup interpreta el archivo con el codepage ANSI del
  // sistema, no como UTF-8 -- un acento literal ACA se compilaria mal
  // (mojibake) en el texto que ve el usuario del wizard. Los acentos que SI
  // hace falta soportar son datos que el usuario TIPEA (razon social,
  // domicilio, etiqueta del pendrive) -- esos viajan como String Unicode en
  // memoria sin pasar por este problema, por eso alcanza con Utf8Encode al
  // escribirlos al .env (ver GenerarEnv).
  PaginaBackup.Add('Etiqueta del pendrive de backup (opcional). Pone una etiqueta al ' +
    'pendrive (ej. BACKUP_FERRE) y escribila aca. Se puede configurar despues:', False);
  PaginaBackup.Add('Carpeta de Google Drive sincronizada (opcional). Requiere tener ' +
    'instalado Google Drive para escritorio. Se puede configurar despues:', False);
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
  if (PaginaBackup <> nil) and (CurPageID = PaginaBackup.ID) then
  begin
    if Trim(PaginaBackup.Values[0]) = '' then
    begin
      MsgBox('La carpeta de backup local es obligatoria (pendrive y Google Drive son opcionales).', mbError, MB_OK);
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
  begin
    NombreSuperusuario := PaginaPostgresExistente.Values[0];
    PasswordSuperusuario := PaginaPostgresExistente.Values[1];
  end
  else
  begin
    NombreSuperusuario := 'postgres';
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
  // El TEMPLATE es ASCII puro (env.template no tiene tildes), asi que leerlo
  // como AnsiString con LoadStringFromFile no pierde nada. El PROBLEMA esta
  // del otro lado: los valores que vienen del wizard (PaginaEmisor.Values,
  // razon social/domicilio) SI pueden tener tildes/enie, y de ahi salen a
  // TODAS las facturas (son datos fiscales impresos en cada comprobante) --
  // por eso el .env final se escribe con Utf8Encode, no con un cast directo
  // a AnsiString (que usaria el codepage ANSI de Windows y corromperia esos
  // caracteres apenas Node los lea como UTF-8, ej. "Cordoba" -> "C{indice}rdoba").
  // Utf8Encode no antepone BOM -- necesario porque dotenv puede no parsear
  // la primera variable si el archivo lleva BOM.
  ExtractTemporaryFile('env.template');
  LoadStringFromFile(ExpandConstant('{tmp}\env.template'), PlantillaAnsi);
  Plantilla := String(PlantillaAnsi);

  Plantilla := Reemplazar(Plantilla, 'FECHA_INSTALACION', GetDateTimeString('dd/mm/yyyy hh:nn', #0, #0));
  Plantilla := Reemplazar(Plantilla, 'DB_USER', DB_USER_APP);
  Plantilla := Reemplazar(Plantilla, 'DB_PASSWORD', PasswordApp);
  Plantilla := Reemplazar(Plantilla, 'DB_NAME', DB_NAME_APP);
  Plantilla := Reemplazar(Plantilla, 'PG_SUPERUSER_USER', NombreSuperusuario);
  Plantilla := Reemplazar(Plantilla, 'PG_SUPERUSER_PASSWORD', PasswordSuperusuario);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_RAZON_SOCIAL', PaginaEmisor.Values[0]);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_CUIT', PaginaEmisor.Values[1]);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_DOMICILIO_COMERCIAL', PaginaEmisor.Values[2]);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_INGRESOS_BRUTOS', PaginaEmisor.Values[3]);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_INICIO_ACTIVIDADES', PaginaEmisor.Values[4]);
  Plantilla := Reemplazar(Plantilla, 'EMISOR_PUNTO_VENTA', PaginaEmisor.Values[5]);
  Plantilla := Reemplazar(Plantilla, 'BACKUP_DIR_LOCAL', PaginaBackup.Values[0]);
  Plantilla := Reemplazar(Plantilla, 'BACKUP_PENDRIVE_LABEL', Trim(PaginaBackup.Values[1]));
  Plantilla := Reemplazar(Plantilla, 'BACKUP_DIR_DRIVE', Trim(PaginaBackup.Values[2]));

  PgDumpPath := CarpetaBinPostgres + '\pg_dump.exe';
  Plantilla := Reemplazar(Plantilla, 'PG_DUMP_PATH', PgDumpPath);

  SaveStringToFile(ExpandConstant('{app}\.env'), Utf8Encode(Plantilla), False);
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
  Ps1Path: String;
begin
  // PowerShell Register-ScheduledTask: soporta multiples triggers (diario +
  // al inicio del sistema), cosa que schtasks no puede hacer solo. Si la PC
  // esta apagada a las 19:00, el backup corre cuando se prende al otro dia.
  Ps1Path := ExpandConstant('{app}\_instalador\registrar-tarea-backup.ps1');
  Exec('powershell.exe',
    '-ExecutionPolicy Bypass -NoProfile -File "' + Ps1Path + '" ' +
    '-TaskName "{#MyTaskName}" -BatPath "' + ExpandConstant('{app}\ejecutar-backup.bat') + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  if ResultCode <> 0 then
  begin
    // Fallback: si PowerShell falla (version muy vieja, restriccion de
    // politica, etc.), caemos al schtasks clasico (solo trigger diario).
    Exec(ExpandConstant('{sys}\schtasks.exe'),
      '/create /tn "{#MyTaskName}" /tr "' + ExpandConstant('{app}\ejecutar-backup.bat') + '" ' +
      '/sc daily /st 19:00 /ru SYSTEM /f',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
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
    // [Dirs] ya crea {userdesktop}\Ferreteria Backups por default, pero
    // PaginaBackup.Values[0] se puede haber editado a otra carpeta -- nos
    // aseguramos de que exista antes de que el backup de esta noche la necesite.
    if Trim(PaginaBackup.Values[0]) = '' then
      PaginaBackup.Values[0] := ExpandConstant('{userdesktop}') + '\Ferreteria Backups';
    ForceDirectories(PaginaBackup.Values[0]);
    GenerarEnv();

    // La contrasena del superusuario ya quedo en el .env (PG_SUPERUSER_PASSWORD,
    // ver GenerarEnv), pero ese archivo vive en la misma PC que se quiere poder
    // recuperar -- mostrarla ahora le da al titular la chance de anotarla en un
    // lugar aparte (gestor de contrasenas, papel) antes de seguir.
    MsgBox('Postgres quedo configurado con el superusuario "' + NombreSuperusuario + '".' + #13#10 +
      'Contrasena: ' + PasswordSuperusuario + #13#10#13#10 +
      'Esta contrasena tambien quedo guardada en el archivo .env (PG_SUPERUSER_PASSWORD), ' +
      'pero conviene anotarla ADEMAS en un lugar aparte (gestor de contrasenas, papel guardado ' +
      'bajo llave): hace falta para restaurar un backup si el .env se pierde junto con el resto ' +
      'del sistema.', mbInformation, MB_OK);

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
    // schtasks /delete funciona para tareas creadas por schtasks O por
    // Register-ScheduledTask (ambas se guardan en la misma base del Task
    // Scheduler de Windows). Si schtasks falla (raro), fallback a PowerShell.
    if not Exec(ExpandConstant('{sys}\schtasks.exe'), '/delete /tn "{#MyTaskName}" /f', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      Exec('powershell.exe', '-NoProfile -Command "Unregister-ScheduledTask -TaskName ''{#MyTaskName}'' -Confirm:$false -ErrorAction SilentlyContinue"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    // A proposito: NO se toca la base de datos (Postgres sigue instalado,
    // con los datos) ni la carpeta de backups -- ver TAREA 2.8. Solo se van
    // el servicio, la tarea programada y los archivos que instalo este
    // instalador (eso lo hace Inno solo, por [Files]).
    MsgBox('Se desinstalo la aplicacion. La base de datos de PostgreSQL y la carpeta de backups ' +
      'NO se borraron -- si de verdad hace falta borrarlos, es a mano.', mbInformation, MB_OK);
  end;
end;
