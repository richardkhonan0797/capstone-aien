"""Run from /opt/capstone. Target only the existing Realtime Token workflow.

python3 deploy/voice_demo.py check
python3 deploy/voice_demo.py install
python3 deploy/voice_demo.py rollback
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
import urllib.request
import urllib.error

ROOT = Path('/opt/capstone')
BACKUP = ROOT / 'voice-backups' / 'before-voice-20261119'
WORKFLOW_ID = 'fGJCjsKF4wXEWyoD'
COMPOSE = ['docker', 'compose', '-f', 'compose.yaml']

def run(*args):
    subprocess.run(list(args), cwd=ROOT, check=True)

def cli(*args):
    run(*COMPOSE, 'exec', '-T', 'n8n', 'n8n', *args)

def check():
    request = urllib.request.Request('http://127.0.0.1:5678/webhook/realtime-token', data=b'{}', headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'Token endpoint failed: HTTP {error.code}. Inspect the execution in n8n; no tokens printed.')
    if not data.get('value') or not isinstance(data.get('expires_at'), (int, float)) or data['expires_at'] <= time.time():
        raise RuntimeError('Token response missing or expired. Inspect n8n execution.')
    print(json.dumps({'token_valid': True, 'model': data.get('model')}))

def wait_ready():
    for _ in range(45):
        try:
            with urllib.request.urlopen('http://127.0.0.1:5678/healthz/readiness', timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(2)
    raise RuntimeError('n8n did not become ready; use rollback.')

def restore_token():
    run(*COMPOSE, 'cp', str(BACKUP / 'realtime-token.json'), 'n8n:/tmp/restore-voice-token.json')
    cli('import:workflow', '--input=/tmp/restore-voice-token.json')
    original = json.loads((BACKUP / 'realtime-token.json').read_text())[0]
    cli('publish:workflow' if original.get('active') else 'unpublish:workflow', '--id=' + WORKFLOW_ID)
    run(*COMPOSE, 'restart', 'n8n')
    wait_ready()

def install():
    if not (BACKUP / 'realtime-token.json').is_file():
        raise SystemExit('Required pre-voice workflow backup missing; refusing to install.')
    cli('export:workflow', '--all', '--output=/tmp/pre-voice-all.json')
    run(*COMPOSE, 'cp', 'n8n:/tmp/pre-voice-all.json', str(BACKUP / 'pre-install-all.json'))
    original = json.loads((BACKUP / 'realtime-token.json').read_text())[0]
    assert original['id'] == WORKFLOW_ID
    template = json.loads((ROOT / 'deploy' / 'realtime-token-voice.json').read_text())
    parameters = {node['name']: node['parameters'] for node in template['nodes']}
    # Preserve live IDs, credentials, ownership, and connections.
    for node in original['nodes']:
        if node['name'] in ('Catatan 0', 'Minta Token OpenAI'):
            node['parameters'] = parameters[node['name']]
    candidate = BACKUP / 'voice-candidate.json'
    candidate.write_text(json.dumps([original], ensure_ascii=False))
    try:
        run(*COMPOSE, 'cp', str(candidate), 'n8n:/tmp/voice-candidate.json')
        cli('import:workflow', '--input=/tmp/voice-candidate.json')
        cli('publish:workflow', '--id=' + WORKFLOW_ID)
        run(*COMPOSE, 'restart', 'n8n')
        wait_ready()
        check()
        cli('export:workflow', '--all', '--output=/tmp/post-voice-all.json')
        run(*COMPOSE, 'cp', 'n8n:/tmp/post-voice-all.json', str(BACKUP / 'post-install-all.json'))
        def other_workflows(path):
            return {w['id']: hashlib.sha256(json.dumps(w, sort_keys=True).encode()).hexdigest() for w in json.loads(path.read_text()) if w['id'] != WORKFLOW_ID}
        if other_workflows(BACKUP / 'pre-install-all.json') != other_workflows(BACKUP / 'post-install-all.json'):
            raise RuntimeError('Another workflow changed during installation; inspect exports.')
        print('Voice token installed. All other workflow exports are unchanged.')
    except Exception:
        restore_token()
        raise

def rollback():
    # First block new voice calls and restore the exact former frontend release.
    import shutil
    from deploy_frontend import select_current
    previous = (BACKUP / 'frontend-release.txt').read_text().strip()
    release = Path(previous)
    if not release.is_absolute():
        release = ROOT / 'frontend-releases' / release
    if not release.is_dir():
        raise SystemExit('Original frontend release missing; inspect backup before rollback.')
    select_current(ROOT / 'frontend-releases', previous)
    shutil.copy2(BACKUP / 'Caddyfile', ROOT / 'Caddyfile')
    run(*COMPOSE, '-f', 'compose.frontend.yaml', 'up', '-d', '--no-deps', '--force-recreate', 'caddy')
    restore_token()
    print('Restored pre-voice frontend, Caddy, and Realtime Token workflow. Database records were not rolled back.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['check', 'install', 'rollback'])
    action = parser.parse_args().action
    if Path.cwd().resolve() != ROOT:
        raise SystemExit('Run from /opt/capstone')
    {'check': check, 'install': install, 'rollback': rollback}[action]()
