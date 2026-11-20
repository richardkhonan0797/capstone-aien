"""Run on EC2 from /opt/capstone after uploading frontend/dist and this deploy directory.

Preserves the existing owner password hash without logging it. Never touches the DB.
Usage: python3 deploy/deploy_frontend.py [--rollback BACKUP_DIRECTORY]
"""
from datetime import datetime, timezone
from pathlib import Path
import argparse
import json
import os
import re
import shutil
import subprocess

ROOT = Path('/opt/capstone')
BASE = ['docker', 'compose', '-f', 'compose.yaml']
FRONTEND = BASE + ['-f', 'compose.frontend.yaml']

def run(args):
    subprocess.run(args, cwd=ROOT, check=True)

def select_current(releases, target):
    temporary = releases / 'next'
    if temporary.is_symlink():
        temporary.unlink()
    temporary.symlink_to(target)
    temporary.replace(releases / 'current')

def rollback(backup):
    backup = backup.resolve()
    if backup.parent != (ROOT / 'frontend-backups').resolve():
        raise SystemExit('Backup must be inside /opt/capstone/frontend-backups')
    state = json.loads((backup / 'state.json').read_text())
    shutil.copy2(backup / 'Caddyfile', ROOT / 'Caddyfile')
    if state['previous_release']:
        select_current(ROOT / 'frontend-releases', state['previous_release'])
    # Recreate only the proxy so its bind-mounted Caddyfile is re-read.
    run((FRONTEND if state['previous_release'] else BASE) + ['up', '-d', '--no-deps', '--force-recreate', 'caddy'])
    print('Rolled back proxy configuration and frontend selection.')

def deploy():
    if Path.cwd().resolve() != ROOT:
        raise SystemExit('Run from /opt/capstone')
    source = ROOT / 'frontend' / 'dist'
    for file in ['dashboard/index.html', 'chat/index.html']:
        if not (source / file).is_file():
            raise SystemExit(f'Missing build: {file}')
    if not (source / 'senja-assets').is_dir():
        raise SystemExit('Missing built assets')
    existing = (ROOT / 'Caddyfile').read_text()
    matches = re.findall(r'basic_auth\s*\{[^{}]+\}', existing)
    if len(matches) != 1:
        raise SystemExit('Expected exactly one existing basic_auth block; inspect Caddyfile manually.')
    candidate = (ROOT / 'deploy' / 'Caddyfile.frontend').read_text().replace('__OWNER_AUTH__', matches[0])
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    releases = ROOT / 'frontend-releases'
    releases.mkdir(exist_ok=True)
    previous = os.readlink(releases / 'current') if (releases / 'current').is_symlink() else None
    backup = ROOT / 'frontend-backups' / stamp
    backup.mkdir(parents=True, mode=0o700)
    shutil.copy2(ROOT / 'Caddyfile', backup / 'Caddyfile')
    shutil.copy2(ROOT / 'compose.yaml', backup / 'compose.yaml')
    (backup / 'state.json').write_text(json.dumps({'previous_release': previous}))
    release = releases / stamp
    shutil.copytree(source, release)
    # Retain prior content-hashed assets for browsers that opened an older release.
    if previous:
        for asset in (releases / previous / 'senja-assets').glob('*'):
            destination = release / 'senja-assets' / asset.name
            if asset.is_file() and not destination.exists():
                shutil.copy2(asset, destination)
    candidate_path = backup / 'Caddyfile.candidate'
    candidate_path.write_text(candidate)
    candidate_path.chmod(0o600)
    run(BASE + ['cp', str(candidate_path), 'caddy:/tmp/senja-Caddyfile'])
    run(BASE + ['exec', '-T', 'caddy', 'caddy', 'validate', '--config', '/tmp/senja-Caddyfile', '--adapter', 'caddyfile'])
    run(FRONTEND + ['config', '--quiet'])
    try:
        select_current(releases, stamp)
        shutil.copy2(candidate_path, ROOT / 'Caddyfile')
        run(FRONTEND + ['up', '-d', '--no-deps', '--force-recreate', 'caddy'])
        run(FRONTEND + ['exec', '-T', 'caddy', 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
    except Exception:
        rollback(backup)
        raise
    print(f'Deployed frontend release {stamp}. Rollback: python3 deploy/deploy_frontend.py --rollback {backup}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--rollback', type=Path)
    args = parser.parse_args()
    rollback(args.rollback) if args.rollback else deploy()
