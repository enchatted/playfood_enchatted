#!/usr/bin/env python3
"""Package the current working tree as a fresh local game/panel review build.

No Git checkout, real installation settings or existing database is copied.
The label identifies the review checkpoint; it is not a publication claim.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

DEFAULT_LABEL = '2026-10-15'
PROJECT_ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = (
    'start-local.mjs', 'START_MAC.command', 'START_WINDOWS.cmd',
    'START_LINUX.sh', 'package.json', 'README_EN.md', 'ΟΔΗΓΙΕΣ_EL.txt',
)
MARKET_FIXTURES = (
    'local-seasonal-food.md', 'eu-local-food-systems.md',
    'eufic-seasonality-environment.md',
)
LEGACY_GAMES = {
    'client/src/games/foodwaste/FoodRescue.jsx',
    'client/src/games/local/FoodMiles.jsx',
    'client/src/games/climate/CarbonCalculator.jsx',
    'client/src/games/climate/EcoChallenge.jsx',
    'client/src/games/climate/BalanceScale.jsx',
    'client/src/games/climate/GreenMenu.jsx',
    'client/src/games/circular/PackagePicker.jsx',
    'client/src/games/circular/WasteJourney.jsx',
    'client/src/games/circular/RecycleRush.jsx',
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def excluded(relative: Path) -> bool:
    return (
        any(part in {'node_modules', '.git', '__pycache__', '__MACOSX', 'archive'} for part in relative.parts)
        or relative.name in {'.DS_Store', '_cmp.mjs', 'playfood-games-board.html', '_ComingSoon.jsx'}
        or relative.name.startswith(('.env', '__scratch_'))
        or relative.suffix in {'.node', '.pyc'}
        or relative.as_posix() in LEGACY_GAMES
    )


def select_sources(root: Path) -> dict[str, Path]:
    """Map only approved package destinations to current, possibly dirty files."""
    selected = {}

    def add(source: str, destination: str | None = None):
        path = root / source
        if path.is_symlink():
            raise RuntimeError(f'source symlink is not supported: {source}')
        if not path.is_file():
            raise FileNotFoundError(f'required package source is missing: {source}')
        selected[destination or source] = path

    for directory in ['client/src', 'client/public', 'client/e2e',
                      'server/src', 'server/public', 'server/test', 'server/scripts']:
        base = root / directory
        if not base.is_dir() or base.is_symlink():
            raise FileNotFoundError(f'required package directory is missing: {directory}')
        for path in sorted(base.rglob('*')):
            relative = path.relative_to(root)
            if excluded(relative):
                continue
            if path.is_symlink():
                raise RuntimeError(f'source symlink is not supported: {relative}')
            if path.is_file():
                add(relative.as_posix())
    for filename in ['package.json', 'package-lock.json', '.npmrc']:
        add(f'client/{filename}')
        add(f'server/{filename}')
    for filename in ['index.html', 'vite.config.js', 'vitest.config.js', 'playwright.config.js']:
        add(f'client/{filename}')
    add('.nvmrc')
    for name in TEMPLATES:
        add(f'deployment/local-share/{name}', name)
    for name in MARKET_FIXTURES:
        add(f'client/test-fixtures/market-trip/{name}')
    for name in ['DATA_COLLECTION_EN.md', 'ΣΥΛΛΟΓΗ_ΔΕΔΟΜΕΝΩΝ_EL.txt']:
        add(f'server/{name}')
        add(f'server/{name}', name)
    add('server/HOSTING_CONFIG.md')
    return selected


def source_hashes(sources: dict[str, Path]) -> dict[str, str]:
    return {name: digest(path) for name, path in sources.items()}


def public_market_source_fixture(note: str) -> str:
    """Keep the two public passages needed by the packaged authenticity tests."""
    publisher = re.search(r'\*\*publisher:\*\* ([^·\n]+)', note)
    url = re.search(r'\*\*URL:\*\* (https://[^\s·]+)', note)
    passages = re.findall(
        r'^- Public (lesson framing|balance statement) \(verified \d{4}-\d{2}-\d{2}\): \*"(.+)"\*$',
        note, re.MULTILINE,
    )
    if not publisher or not url or [kind for kind, _ in passages] != ['lesson framing', 'balance statement']:
        raise RuntimeError('public source fixture changed; inspect the archive before packaging')
    return (
        '# Local and Seasonal Food\n\n'
        f'Publisher: {publisher.group(1).strip()}\n'
        f'URL: {url.group(1)}\n\n'
        '## Public passages\n\n'
        + ''.join(f'> {passage}\n\n' for _, passage in passages)
    )


def assert_sources_unchanged(root: Path, expected: dict[str, str], catalog_hash: str) -> None:
    current = source_hashes(select_sources(root))
    changed = sorted(name for name in expected.keys() | current.keys() if expected.get(name) != current.get(name))
    if digest(root / 'server/phygital-codes.json') != catalog_hash:
        changed.append('server/phygital-codes.json')
    if changed:
        raise RuntimeError('source files changed while preparing the package: ' + ', '.join(changed))


def isolated_build_environment(secret: str, original=None) -> dict[str, str]:
    original = os.environ if original is None else original
    env = {key: value for key, value in original.items() if not key.startswith('VITE_')}
    env.update(NODE_ENV='production', VITE_PANEL_SECRET=secret, VITE_DEMO_ISLAND1='')
    return env


def build_client(root: Path, package: Path, node: Path, secret: str, log: Path) -> None:
    dependencies = root / 'client/node_modules'
    vite_cli = dependencies / 'vite/bin/vite.js'
    if not vite_cli.is_file():
        raise FileNotFoundError('installed client dependencies are required; run npm ci inside client first')
    client = package / 'client'
    link = client / 'node_modules'
    config = client / '.package-build.config.mjs'
    config.write_text(
        "import { defineConfig } from 'vite';\n"
        "import react from '@vitejs/plugin-react';\n"
        "export default defineConfig({ plugins: [react()], envDir: false, "
        "build: { outDir: 'dist', emptyOutDir: true } });\n", encoding='utf-8')
    try:
        link.symlink_to(dependencies, target_is_directory=True)
        with log.open('x', encoding='utf-8') as output:
            result = subprocess.run(
                [str(node), str(vite_cli), 'build', '--config', str(config)],
                cwd=client, env=isolated_build_environment(secret), stdout=output, stderr=subprocess.STDOUT,
                check=False,
            )
        if result.returncode:
            raise RuntimeError(f'isolated client build failed; see {log}')
    finally:
        if link.is_symlink():
            link.unlink()
        config.unlink(missing_ok=True)
    dist = client / 'dist'
    if not (dist / 'index.html').is_file():
        raise RuntimeError('isolated client build did not produce dist/index.html')
    if not any(secret.encode() in path.read_bytes() for path in dist.rglob('*.js')):
        raise RuntimeError('built client is missing the newly generated recording token')


def write_local_settings(package: Path, activities: list, label: str) -> str:
    secret = secrets.token_hex(32)
    email = 'teacher@localhost.test'
    password = secrets.token_urlsafe(12)
    salt = secrets.token_bytes(16)
    password_hash = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, dklen=32)
    stored = f'scrypt$16384$8$1${salt.hex()}${password_hash.hex()}'
    (package / 'server/users.txt').write_text(f'{email} : {stored}\n', encoding='utf-8')
    config = {
        'PANEL_ENABLED': 'yes', 'PANEL_SECRET': secret, 'RETENTION_MONTHS': 24,
        'TIMEZONE': 'Europe/Athens', 'PORT': 5177, 'MAX_EVENTS_PER_DAY': 200000,
        'TRUST_PROXY': 'no', 'CORS_ORIGINS': '',
    }
    (package / 'server/playfood.config.txt').write_text(
        '# Fresh local review settings; no existing installation data is included.\n'
        + ''.join(f'{key}={value}\n' for key, value in config.items()), encoding='utf-8')
    (package / 'client/.env.local').write_text(
        f'VITE_PANEL_SECRET={secret}\nVITE_DEMO_ISLAND1=\n', encoding='utf-8')
    (package / 'LOCAL_PANEL_LOGIN.txt').write_text(
        'PLAYFOOD local teacher panel\n'
        'Open the panel URL printed by the launcher. PORT can be changed in server/playfood.config.txt.\n'
        f'Email: {email}\n'
        f'Password: {password}\n\n'
        'This account is for this local package only. On a real host, create your own account and password.\n', encoding='utf-8')
    if not isinstance(activities, list) or len(activities) != 5:
        raise RuntimeError('expected the five existing phygital activities; inspect the catalog before packaging')
    local_activities = []
    descriptions = ['PLAYFOOD local activity codes. Type the code at the start of each line, '
                    'for example LOCAL01. The rest of the line only describes the activity.\n\n']
    for index, activity in enumerate(activities, 1):
        keys = ['id', 'points', 'island', 'enabled', 'description']
        if any(key not in activity for key in keys):
            raise RuntimeError('phygital activity is missing a required field')
        entry = {key: activity[key] for key in keys}
        entry['code'] = f'LOCAL{index:02d}'
        local_activities.append(entry)
        about = entry['description'].get('en', '') if isinstance(entry['description'], dict) else entry['description']
        # The activity id (e.g. SAVEIT) looks like a code but is rejected, so it is not printed.
        descriptions.append(f"{entry['code']}: {about}, {entry['points']} points, island {entry['island']}\n")
    write_json(package / 'server/phygital-codes.json', local_activities)
    (package / 'LOCAL_PHYGITAL_CODES.txt').write_text(''.join(descriptions), encoding='utf-8')
    write_json(package / 'VERSION.json', {
        'label': label, 'package_type': 'local-review', 'islands': 4, 'games': 12,
        'built_at_utc': datetime.now(timezone.utc).isoformat(),
        'published': False, 'translations': {'nl': 'partner draft', 'pt': 'partner draft'},
    })
    return secret


def package_files(package: Path) -> list[Path]:
    return sorted(path for path in package.rglob('*') if path.is_file())


def create_verified_zip(package: Path, archive: Path) -> tuple[str, int]:
    files = package_files(package)
    for path in files:
        if path.is_symlink() or 'node_modules' in path.relative_to(package).parts:
            raise RuntimeError('temporary dependencies or symlinks must not be shipped')
        path.chmod(0o755 if path.name in {'START_MAC.command', 'START_LINUX.sh'} else 0o644)
    manifest = {path.relative_to(package).as_posix(): digest(path) for path in files}
    write_json(package / 'MANIFEST_SHA256.json', manifest)
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for path in package_files(package):
            info = zipfile.ZipInfo(package.name + '/' + path.relative_to(package).as_posix(),
                                   date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            mode = 0o755 if path.name in {'START_MAC.command', 'START_LINUX.sh'} else 0o644
            info.external_attr = (stat.S_IFREG | mode) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            output.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(archive) as result:
        failed_crc = result.testzip()
        if failed_crc:
            raise RuntimeError(f'ZIP CRC verification failed: {failed_crc}')
        for name, expected in manifest.items():
            if hashlib.sha256(result.read(package.name + '/' + name)).hexdigest() != expected:
                raise RuntimeError(f'ZIP manifest verification failed: {name}')
        for name in ['START_MAC.command', 'START_LINUX.sh']:
            if not result.getinfo(package.name + '/' + name).external_attr >> 16 & stat.S_IXUSR:
                raise RuntimeError(f'executable metadata is missing: {name}')
    return digest(archive), len(files) + 1


def build_package(project_root: Path, output: Path, label: str, node: Path) -> dict:
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}', label):
        raise ValueError('label must contain only letters, digits, dots, underscores or hyphens')
    root, output, node = Path(project_root).resolve(), Path(output).absolute(), Path(node).resolve()
    if output.suffix.lower() != '.zip':
        raise ValueError('output must end in .zip')
    checksum = Path(str(output) + '.sha256')
    receipt = Path(str(output) + '.receipt.json')
    log = Path(str(output) + '.build.log')
    for destination in [output, checksum, receipt, log]:
        if destination.exists():
            raise FileExistsError(f'refusing to overwrite existing output: {destination}')
    version = subprocess.run([str(node), '--version'], capture_output=True, text=True, check=True).stdout.strip()
    match = re.fullmatch(r'v(\d+)\.\d+\.\d+', version)
    if not match or not 22 <= int(match.group(1)) < 27:
        raise RuntimeError('build requires a supported Node version: >=22 <27')
    sources = select_sources(root)
    before = source_hashes(sources)
    catalog = root / 'server/phygital-codes.json'
    catalog_bytes = catalog.read_bytes()
    catalog_hash = hashlib.sha256(catalog_bytes).hexdigest()
    activities = json.loads(catalog_bytes)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Stage on the destination filesystem so publishing by hard link is atomic.
    with tempfile.TemporaryDirectory(prefix='.playfood-local-share-', dir=output.parent) as temporary:
        work = Path(temporary)
        package = work / f'PLAYFOOD_Local_Game_and_Panel_{label}'
        package.mkdir()
        for relative, source in sources.items():
            destination = package / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(source.read_bytes())
            if digest(destination) != before[relative]:
                raise RuntimeError(f'source changed while copying: {relative}')
        assert_sources_unchanged(root, before, catalog_hash)
        source_fixture = package / 'client/test-fixtures/market-trip/local-seasonal-food.md'
        source_fixture.write_text(
            public_market_source_fixture(source_fixture.read_text(encoding='utf-8')),
            encoding='utf-8',
        )
        secret = write_local_settings(package, activities, label)
        build_client(root, package, node, secret, log)
        # A fresh process must create SQLite itself; no pre-existing DB is included.
        if list((package / 'server').glob('*.db*')):
            raise RuntimeError('a database must never be included in the local share')
        assert_sources_unchanged(root, before, catalog_hash)
        archive = work / 'verified.zip'
        sha256, count = create_verified_zip(package, archive)
        assert_sources_unchanged(root, before, catalog_hash)
        # Link an already verified archive atomically; link fails if the target exists.
        os.link(archive, output)
        output.chmod(0o644)
        created_sidecars = []
        try:
            with checksum.open('x', encoding='utf-8') as target:
                created_sidecars.append(checksum)
                target.write(f'{sha256}  {output.name}\n')
            result = {'label': label, 'node': version, 'files': count,
                      'bytes': output.stat().st_size, 'sha256': sha256,
                      'zip_crc_verified': True, 'manifest_verified': True,
                      'source_files_compared': len(before), 'source_hashes': before}
            with receipt.open('x', encoding='utf-8') as target:
                created_sidecars.append(receipt)
                json.dump(result, target, ensure_ascii=False, sort_keys=True, indent=2)
                target.write('\n')
        except Exception:
            output.unlink(missing_ok=True)
            for path in created_sidecars:
                path.unlink(missing_ok=True)
            raise
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--label', default=DEFAULT_LABEL, help='review checkpoint label (default: 2026-10-15)')
    parser.add_argument('--node', default=shutil.which('node'), help='supported Node executable')
    parser.add_argument('--output', type=Path, help='new ZIP path; existing output is never overwritten')
    args = parser.parse_args()
    if not args.node:
        parser.error('Node is not on PATH; pass --node /absolute/path/to/node')
    output = args.output or PROJECT_ROOT / 'releases' / f'PLAYFOOD_Game_and_Panel_{args.label}.zip'
    try:
        result = build_package(PROJECT_ROOT, output, args.label, Path(args.node))
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f'Local-share packaging failed: {error}', file=sys.stderr)
        return 1
    print(f'Created {output} ({result["files"]} files, {result["bytes"]} bytes)')
    print(f'SHA256 {result["sha256"]}')
    print('Verified source stability, ZIP CRC, file hashes and launcher executable metadata.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
