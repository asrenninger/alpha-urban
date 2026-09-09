"""Exercise ignored files, force-add bypass, and add-then-delete pushed history."""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE=Path(__file__).resolve().parent

def run(cwd,*args,input=None):
    return subprocess.run(args,cwd=cwd,input=input,text=True,capture_output=True)

def main():
    with tempfile.TemporaryDirectory(prefix='alpha-push-guard-') as directory:
        root=Path(directory);(root/'validation').mkdir()
        shutil.copy2(HERE/'verify_publish_scope.py',root/'validation/verify_publish_scope.py')
        allow=['.gitignore','index.html','validation/verify_publish_scope.py','validation/publish_allowlist.json']
        (root/'validation/publish_allowlist.json').write_text(json.dumps({'allowed_files':allow,'max_file_bytes':90000000}))
        assert run(root,'git','init','-b','main').returncode==0
        assert run(root,sys.executable,'validation/verify_publish_scope.py','--write-ignore').returncode==0
        (root/'index.html').write_text('<h1>Reviewed site</h1>')
        assert run(root,'git','add','.').returncode==0
        commit=['git','-c','user.name=Guard test','-c','user.email=guard@example.invalid','commit','-m']
        assert run(root,*commit,'Reviewed baseline').returncode==0
        baseline=run(root,'git','rev-parse','HEAD').stdout.strip()
        assert run(root,sys.executable,'validation/verify_publish_scope.py').returncode==0
        assert run(root,sys.executable,'validation/verify_publish_scope.py','--worktree').returncode==0
        (root/'research.csv').write_text('not intended for publication\n')
        assert run(root,'git','check-ignore','-q','research.csv').returncode==0
        assert run(root,'git','add','-f','research.csv').returncode==0
        prospective=run(root,sys.executable,'validation/verify_publish_scope.py','--worktree')
        assert prospective.returncode!=0 and 'unapproved path research.csv' in prospective.stderr
        assert run(root,*commit,'Accidental force-add').returncode==0
        bad=run(root,sys.executable,'validation/verify_publish_scope.py')
        assert bad.returncode!=0 and 'unapproved path research.csv' in bad.stderr
        assert run(root,'git','rm','research.csv').returncode==0
        assert run(root,*commit,'Remove accidental file').returncode==0
        tip=run(root,'git','rev-parse','HEAD').stdout.strip()
        assert run(root,sys.executable,'validation/verify_publish_scope.py').returncode==0
        hidden=run(root,sys.executable,'validation/verify_publish_scope.py','--pre-push',input=f'refs/heads/main {tip} refs/heads/main {baseline}\n')
        assert hidden.returncode!=0 and 'unapproved path research.csv' in hidden.stderr
    result={'status':'passed','checks':['reviewed baseline accepted','prospective working tree accepted','new research file ignored','force-added worktree path rejected','force-added research file rejected','research file removed from final tree still rejected in pushed history']}
    (HERE/'push_guard_validation.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
if __name__=='__main__':main()
