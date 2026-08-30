#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=/home/claudeuser
SOURCE_DIR=
RELEASE_ID=
RELEASES_ROOT=
ACTIVE_LINK=
DATA_DIR=
BACKUP_DIR=
BACKUP_SCRIPT=
PUBLIC_URL=https://www.elsastredelapasta.com
PM2_APP=fabrica
SMOKE_PORT=3100
PRODUCTION_PORT=3000
MODE=deploy

usage() {
  cat <<'EOF'
Uso: scripts/deploy-production.sh [opciones]

  --source PATH          Fuente verificada que se copiará al release
  --release-id ID        <UTC>-<commit>, por ejemplo 20260830T120000Z-abcdef1
  --root PATH            Raíz operativa (default: /home/claudeuser)
  --releases-root PATH   Debe ser ROOT/releases/fabrica-pastas
  --active-link PATH     Debe ser ROOT/work/fabrica-pastas-current
  --data-dir PATH        Debe ser ROOT/work/fabrica-pastas/data
  --backup-dir PATH      Debe ser ROOT/backups/deployments
  --backup-script PATH   Backup SQLite existente (default: ROOT/backup-fabrica.sh)
  --public-url URL       Dominio de health check
  --pm2-app NAME         Proceso PM2 (default: fabrica)
  --dry-run              Valida y muestra la operación sin escribir ni reiniciar
  --validate             Alias de validación estática segura
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 2
}

while (($#)); do
  case "$1" in
    --root) ROOT=${2-}; shift 2 ;;
    --source) SOURCE_DIR=${2-}; shift 2 ;;
    --release-id) RELEASE_ID=${2-}; shift 2 ;;
    --releases-root) RELEASES_ROOT=${2-}; shift 2 ;;
    --active-link) ACTIVE_LINK=${2-}; shift 2 ;;
    --data-dir) DATA_DIR=${2-}; shift 2 ;;
    --backup-dir) BACKUP_DIR=${2-}; shift 2 ;;
    --backup-script) BACKUP_SCRIPT=${2-}; shift 2 ;;
    --public-url) PUBLIC_URL=${2-}; shift 2 ;;
    --pm2-app) PM2_APP=${2-}; shift 2 ;;
    --dry-run) MODE=dry-run; shift ;;
    --validate) MODE=validate; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "opción desconocida: $1" ;;
  esac
done

[[ -n "$SOURCE_DIR" ]] || die 'falta --source'
[[ -n "$RELEASE_ID" ]] || die 'falta --release-id'
[[ "$RELEASE_ID" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7,40}$ ]] || die 'release-id inválido'
[[ "$PM2_APP" =~ ^[A-Za-z0-9._-]+$ ]] || die 'pm2-app inválido'
[[ "$PUBLIC_URL" =~ ^https://[^/]+/?$ ]] || die 'public-url debe ser un origen HTTPS sin ruta'
PUBLIC_URL=${PUBLIC_URL%/}

[[ "$ROOT" = /* ]] || die 'root debe ser absoluto'
[[ -d "$ROOT" ]] || die "root no existe: $ROOT"
ROOT=$(realpath "$ROOT")
[[ "$ROOT" != / ]] || die 'root no puede ser /'

RELEASES_ROOT=${RELEASES_ROOT:-$ROOT/releases/fabrica-pastas}
ACTIVE_LINK=${ACTIVE_LINK:-$ROOT/work/fabrica-pastas-current}
DATA_DIR=${DATA_DIR:-$ROOT/work/fabrica-pastas/data}
BACKUP_DIR=${BACKUP_DIR:-$ROOT/backups/deployments}
BACKUP_SCRIPT=${BACKUP_SCRIPT:-$ROOT/backup-fabrica.sh}

canonical_future() {
  [[ "$1" = /* ]] || die "$2 debe ser absoluto"
  realpath -m "$1"
}

SOURCE_DIR=$(canonical_future "$SOURCE_DIR" source)
RELEASES_ROOT=$(canonical_future "$RELEASES_ROOT" releases-root)
[[ "$ACTIVE_LINK" = /* ]] || die 'active-link debe ser absoluto'
ACTIVE_LINK=$(realpath -ms "$ACTIVE_LINK")
DATA_DIR=$(canonical_future "$DATA_DIR" data-dir)
BACKUP_DIR=$(canonical_future "$BACKUP_DIR" backup-dir)
BACKUP_SCRIPT=$(canonical_future "$BACKUP_SCRIPT" backup-script)

[[ "$RELEASES_ROOT" == "$ROOT/releases/fabrica-pastas" ]] || die "releases-root debe ser $ROOT/releases/fabrica-pastas"
[[ "$ACTIVE_LINK" == "$ROOT/work/fabrica-pastas-current" ]] || die "active-link debe ser $ROOT/work/fabrica-pastas-current"
[[ "$DATA_DIR" == "$ROOT/work/fabrica-pastas/data" ]] || die "data-dir debe ser $ROOT/work/fabrica-pastas/data"
[[ "$BACKUP_DIR" == "$ROOT/backups/deployments" ]] || die "backup-dir debe ser $ROOT/backups/deployments"
case "$SOURCE_DIR" in
  "$ROOT"/*) ;;
  *) die "source debe estar dentro de $ROOT" ;;
esac
case "$SOURCE_DIR/" in
  "$DATA_DIR/"*|"$RELEASES_ROOT/"*|"$BACKUP_DIR/"*) die 'source apunta a un área persistente o de releases' ;;
esac

[[ -d "$SOURCE_DIR" ]] || die "source no existe: $SOURCE_DIR"
[[ -f "$SOURCE_DIR/package.json" ]] || die 'source no contiene package.json'
[[ -f "$SOURCE_DIR/package-lock.json" ]] || die 'source no contiene package-lock.json'
[[ -f "$SOURCE_DIR/server.js" ]] || die 'source no contiene server.js'
[[ -d "$DATA_DIR" ]] || die "data-dir no existe: $DATA_DIR"
[[ ! -e "$RELEASES_ROOT" || -d "$RELEASES_ROOT" ]] || die 'releases-root existe pero no es un directorio'
[[ ! -e "$BACKUP_DIR" || -d "$BACKUP_DIR" ]] || die 'backup-dir existe pero no es un directorio'
[[ ! -e "$ACTIVE_LINK" || -L "$ACTIVE_LINK" ]] || die 'active-link existe pero no es un symlink'

RELEASE_DIR=$RELEASES_ROOT/$RELEASE_ID
[[ ! -e "$RELEASE_DIR" ]] || die "el release ya existe: $RELEASE_DIR"

echo 'VALIDACIÓN OK'
echo "  source:       $SOURCE_DIR"
echo "  release:      $RELEASE_DIR"
echo "  data excluida:$DATA_DIR"
echo "  enlace activo:$ACTIVE_LINK"
echo "  health:       $PUBLIC_URL"
echo '  estrategia:   release inmutable + rollback automático al release anterior'

if [[ "$MODE" == dry-run || "$MODE" == validate ]]; then
  echo "MODO ${MODE^^}: sin cambios en archivos, PM2, base ni red"
  exit 0
fi

mkdir -p "$RELEASES_ROOT" "$BACKUP_DIR"
for command in realpath rsync curl node npm pm2 tar sha256sum; do
  command -v "$command" >/dev/null || die "falta comando requerido: $command"
done
[[ -x "$BACKUP_SCRIPT" ]] || die "backup-script no es ejecutable: $BACKUP_SCRIPT"
DB_PATH=$DATA_DIR/fabrica.db
[[ -f "$DB_PATH" ]] || die "no existe la base operativa: $DB_PATH"

SMOKE_PID=
SMOKE_DB=
SWITCHED=0
PREVIOUS_RELEASE=
LEGACY_DIR=$ROOT/work/fabrica-pastas

stop_smoke() {
  if [[ -n "$SMOKE_PID" ]] && kill -0 "$SMOKE_PID" 2>/dev/null; then
    kill "$SMOKE_PID"
    wait "$SMOKE_PID" 2>/dev/null || true
  fi
  SMOKE_PID=
  if [[ -n "$SMOKE_DB" ]]; then
    rm -f -- "$SMOKE_DB" "$SMOKE_DB-wal" "$SMOKE_DB-shm"
  fi
}

assert_status() {
  local url=$1 expected=$2 actual
  actual=$(curl --fail-with-body --silent --show-error --output /dev/null --write-out '%{http_code}' "$url" || true)
  [[ "$actual" == "$expected" ]] || {
    echo "health inesperado: $url => $actual (esperado $expected)" >&2
    return 1
  }
}

assert_headers() {
  local url=$1 headers
  headers=$(curl --silent --show-error --dump-header - --output /dev/null "$url")
  grep -Eiq '^strict-transport-security: max-age=31536000; includeSubDomains' <<<"$headers"
  grep -Eiq '^content-security-policy:.*default-src .self.' <<<"$headers"
  grep -Eiq '^x-content-type-options: nosniff' <<<"$headers"
  grep -Eiq '^x-frame-options: DENY' <<<"$headers"
  grep -Eiq '^referrer-policy: strict-origin-when-cross-origin' <<<"$headers"
  grep -Eiq '^permissions-policy: camera=\(\), microphone=\(\), geolocation=\(\)' <<<"$headers"
}

quick_check() {
  local release=$1 database=$2
  (
    cd "$release"
    CHECK_DB="$database" node <<'NODE'
const Database = require('better-sqlite3');
const db = new Database(process.env.CHECK_DB, { readonly: true, fileMustExist: true });
const rows = db.pragma('quick_check');
db.close();
if (rows.length !== 1 || rows[0].quick_check !== 'ok') {
  console.error(JSON.stringify(rows));
  process.exit(1);
}
console.log('SQLite quick_check: ok');
NODE
  )
}

start_pm2() {
  local release=$1
  pm2 delete "$PM2_APP" >/dev/null 2>&1 || true
  COOKIE_SEGURA=1 DB_PATH="$DB_PATH" PORT="$PRODUCTION_PORT" \
    pm2 start "$release/server.js" --name "$PM2_APP" --cwd "$release" --time
}

check_pm2() {
  PM2_JSON="$(pm2 jlist)" PM2_APP_NAME="$PM2_APP" node <<'NODE'
const processInfo = JSON.parse(process.env.PM2_JSON)
  .find((item) => item.name === process.env.PM2_APP_NAME);
if (!processInfo || processInfo.pm2_env.status !== 'online' || processInfo.pm2_env.unstable_restarts > 0) {
  console.error('PM2 no está estable');
  process.exit(1);
}
console.log('PM2 online; reinicios inestables: 0');
NODE
}

rollback() {
  local status=$?
  trap - ERR INT TERM
  stop_smoke
  if ((SWITCHED)); then
    echo "FALLO: iniciando rollback automático a $PREVIOUS_RELEASE" >&2
    local next_link=$ACTIVE_LINK.rollback.$$
    ln -s "$PREVIOUS_RELEASE" "$next_link"
    mv -Tf "$next_link" "$ACTIVE_LINK"
    start_pm2 "$PREVIOUS_RELEASE"
    assert_status "http://127.0.0.1:$PRODUCTION_PORT/" 200
    assert_status "$PUBLIC_URL/" 200
    assert_status "$PUBLIC_URL/api/publico/productos" 200
    assert_status "$PUBLIC_URL/api/productos" 401
    quick_check "$PREVIOUS_RELEASE" "$DB_PATH"
    pm2 save
    echo 'ROLLBACK COMPLETADO' >&2
  fi
  exit "$status"
}
trap rollback ERR INT TERM

if [[ -L "$ACTIVE_LINK" ]]; then
  PREVIOUS_RELEASE=$(realpath "$ACTIVE_LINK")
  case "$PREVIOUS_RELEASE/" in
    "$RELEASES_ROOT/"*) ;;
    *) die 'el enlace activo no apunta al árbol de releases validado' ;;
  esac
  [[ -f "$PREVIOUS_RELEASE/server.js" ]] || die 'el release activo no contiene server.js'
else
  [[ -d "$LEGACY_DIR" && -f "$LEGACY_DIR/server.js" ]] || die 'no hay release activo ni aplicación legacy para rollback'
  PREVIOUS_RELEASE=$RELEASES_ROOT/${RELEASE_ID}-rollback
  [[ ! -e "$PREVIOUS_RELEASE" ]] || die "snapshot de rollback ya existe: $PREVIOUS_RELEASE"
fi

echo '1/7 Backup consistente e integridad previa'
CURRENT_CODE=$LEGACY_DIR
[[ -L "$ACTIVE_LINK" ]] && CURRENT_CODE=$PREVIOUS_RELEASE
"$BACKUP_SCRIPT"
quick_check "$CURRENT_CODE" "$DB_PATH"
DB_BACKUP=$BACKUP_DIR/database-${RELEASE_ID}.db
SOURCE_DB="$DB_PATH" DEST_DB="$DB_BACKUP" RELEASE="$CURRENT_CODE" node <<'NODE'
const path = require('node:path');
const Database = require(path.join(process.env.RELEASE, 'node_modules', 'better-sqlite3'));
const db = new Database(process.env.SOURCE_DB, { readonly: true, fileMustExist: true });
db.backup(process.env.DEST_DB).then(() => db.close()).catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
quick_check "$CURRENT_CODE" "$DB_BACKUP"
SOURCE_ARCHIVE=$BACKUP_DIR/source-${RELEASE_ID}.tar.gz
tar -C "$CURRENT_CODE" --exclude='./data' --exclude='./node_modules' --exclude='./.git' -czf "$SOURCE_ARCHIVE" .
sha256sum "$DB_BACKUP" "$SOURCE_ARCHIVE" >"$BACKUP_DIR/${RELEASE_ID}.sha256"

if [[ ! -L "$ACTIVE_LINK" ]]; then
  echo '2/7 Snapshot inmutable para rollback inicial'
  mkdir "$PREVIOUS_RELEASE"
  rsync -a --delete \
    --exclude='/.git/' --exclude='/node_modules/' --exclude='/data/' \
    --exclude='/.claude/' --exclude='/.superpowers/' \
    "$LEGACY_DIR/" "$PREVIOUS_RELEASE/"
  (cd "$PREVIOUS_RELEASE" && npm ci --omit=dev)
  ln -s "$DATA_DIR" "$PREVIOUS_RELEASE/data"
  chmod -R a-w "$PREVIOUS_RELEASE"
else
  echo '2/7 Release anterior validado para rollback'
fi

echo '3/7 Preparación del release inmutable (data/ excluida)'
mkdir "$RELEASE_DIR"
rsync -a --delete \
  --exclude='/.git/' --exclude='/node_modules/' --exclude='/data/' \
  --exclude='/.claude/' --exclude='/.superpowers/' \
  "$SOURCE_DIR/" "$RELEASE_DIR/"
[[ ! -e "$RELEASE_DIR/data" ]] || { echo 'data/ fue copiada al release' >&2; false; }
(cd "$RELEASE_DIR" && npm ci --omit=dev)
ln -s "$DATA_DIR" "$RELEASE_DIR/data"

echo '4/7 Smoke previo con copia descartable de SQLite'
SMOKE_DB=$BACKUP_DIR/smoke-${RELEASE_ID}.db
SOURCE_DB="$DB_PATH" DEST_DB="$SMOKE_DB" RELEASE="$RELEASE_DIR" node <<'NODE'
const path = require('node:path');
const Database = require(path.join(process.env.RELEASE, 'node_modules', 'better-sqlite3'));
const db = new Database(process.env.SOURCE_DB, { readonly: true, fileMustExist: true });
db.backup(process.env.DEST_DB).then(() => db.close()).catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
quick_check "$RELEASE_DIR" "$SMOKE_DB"
(
  cd "$RELEASE_DIR"
  exec env COOKIE_SEGURA=0 DB_PATH="$SMOKE_DB" PORT="$SMOKE_PORT" \
    node server.js >"$BACKUP_DIR/smoke-${RELEASE_ID}.log" 2>&1
) &
SMOKE_PID=$!
for _ in {1..50}; do
  curl --silent --output /dev/null "http://127.0.0.1:$SMOKE_PORT/" && break
  sleep 0.2
done
assert_status "http://127.0.0.1:$SMOKE_PORT/" 200
assert_status "http://127.0.0.1:$SMOKE_PORT/api/publico/productos" 200
assert_status "http://127.0.0.1:$SMOKE_PORT/api/productos" 401
assert_headers "http://127.0.0.1:$SMOKE_PORT/"
stop_smoke
chmod -R a-w "$RELEASE_DIR"

echo '5/7 Cambio atómico y reinicio PM2'
NEXT_LINK=$ACTIVE_LINK.next.$$
ln -s "$RELEASE_DIR" "$NEXT_LINK"
mv -Tf "$NEXT_LINK" "$ACTIVE_LINK"
SWITCHED=1
start_pm2 "$RELEASE_DIR"

echo '6/7 Health checks locales y públicos'
for _ in {1..50}; do
  curl --silent --output /dev/null "http://127.0.0.1:$PRODUCTION_PORT/" && break
  sleep 0.2
done
assert_status "http://127.0.0.1:$PRODUCTION_PORT/" 200
assert_status "$PUBLIC_URL/" 200
assert_status "$PUBLIC_URL/api/publico/productos" 200
assert_status "$PUBLIC_URL/api/productos" 401
assert_headers "$PUBLIC_URL/"
check_pm2
quick_check "$RELEASE_DIR" "$DB_PATH"

echo '7/7 Persistencia del proceso y cierre'
pm2 save
trap - ERR INT TERM
echo "DESPLIEGUE COMPLETADO: $RELEASE_DIR"
