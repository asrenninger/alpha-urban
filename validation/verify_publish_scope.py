#!/usr/bin/env python3
"""Allow only explicitly reviewed website files in commits sent to a remote."""
import argparse
import json
import subprocess
import sys
from pathlib import Path, PurePosixPath

ROOT=Path(__file__).resolve().parents[1]
CONFIG=ROOT/'validation/publish_allowlist.json'

def git(*args):
    return subprocess.check_output(['git',*args],cwd=ROOT)

def config():
    record=json.loads(CONFIG.read_text())
    paths=record['allowed_files']
    if len(paths)!=len(set(paths)):
        raise ValueError('Duplicate paths in publication allowlist')
    for path in paths:
        p=PurePosixPath(path)
        if p.is_absolute() or '..' in p.parts or '.git' in p.parts or '\n' in path:
            raise ValueError('Unsafe publication path: '+path)
    return set(paths),record['max_file_bytes']

def ignore_text(paths):
    directories=set()
    for path in paths:
        p=PurePosixPath(path)
        for parent in p.parents:
            if str(parent)!='.':directories.add(str(parent))
    return '\n'.join([
        '# Deny by default: this research workspace publishes only reviewed website files.',
        '# Generated from validation/publish_allowlist.json.',
        '# Update that list deliberately, then run:',
        '# python3 validation/verify_publish_scope.py --write-ignore',
        '*','',
        '# Permit traversal only into publication directories.',
        *['!/'+d+'/' for d in sorted(directories,key=lambda s:(s.count('/'),s))],
        '', '# Explicit file exceptions; new files stay ignored until reviewed.',
        *['!/'+p for p in sorted(paths)],''
    ])

def validate(refs,paths,max_bytes):
    failures=[];checks=0
    for ref in refs:
        for entry in git('ls-tree','-rlz',ref).split(b'\0'):
            if not entry:continue
            metadata,name=entry.split(b'\t',1)
            mode,kind,oid,size=metadata.decode().split()
            path=name.decode('utf-8')
            checks+=1
            if path not in paths:failures.append(ref[:12]+': unapproved path '+path)
            if kind!='blob' or mode not in ['100644','100755']:
                failures.append(ref[:12]+': unsupported file type '+path)
            elif int(size)>max_bytes:
                failures.append(ref[:12]+': oversized file '+path)
    if failures:
        raise ValueError('Publication guard rejected the push:\n  '+'\n  '.join(failures[:20])+'\nReview publication files and the explicit allowlist before trying again.')
    print('Publication guard passed: %d commit(s), %d file checks.'%(len(refs),checks))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--write-ignore',action='store_true')
    parser.add_argument('--pre-push',action='store_true')
    parser.add_argument('--ref',default='HEAD')
    args=parser.parse_args()
    paths,max_bytes=config()
    expected=ignore_text(paths)
    if args.write_ignore:
        (ROOT/'.gitignore').write_text(expected)
        return
    if (ROOT/'.gitignore').read_text()!=expected:
        raise ValueError('.gitignore differs from the publication allowlist; regenerate it first.')
    if args.pre_push:
        refs=set()
        for line in sys.stdin:
            local_ref,local_sha,remote_ref,remote_sha=line.split()
            if set(local_sha)=={'0'}:continue  # branch/tag deletion carries no files
            # Check every new commit, not just the final tree: adding then deleting
            # a research file must not smuggle it into pushed history.
            if set(remote_sha)=={'0'}:
                revisions=git('rev-list',local_sha)
            else:
                exists=subprocess.run(['git','cat-file','-e',remote_sha+'^{commit}'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
                revisions=git('rev-list',remote_sha+'..'+local_sha) if exists else git('rev-list',local_sha)
            refs.update(revisions.decode().split())
        if not refs:
            print('Publication guard: no new commits to check.')
            return
    else:refs={git('rev-parse',args.ref).decode().strip()}
    validate(sorted(refs),paths,max_bytes)

if __name__=='__main__':
    try:main()
    except (ValueError,KeyError,OSError,subprocess.CalledProcessError) as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
