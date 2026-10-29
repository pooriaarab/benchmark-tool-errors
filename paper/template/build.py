"""Build any paper using this template. Run from the repository root."""
import hashlib, io, json, pathlib, shutil, subprocess, urllib.request, zipfile
paper = pathlib.Path('paper')
meta = json.loads((paper / 'meta.json').read_text())
assert meta['license'] == 'CC-BY-4.0'
assert len(meta['abstract']) <= 1920 and meta['abstract'].isascii()
style = paper / 'neurips_2026.sty'
url = 'https://media.neurips.cc/Conferences/NeurIPS2026/Formatting_Instructions_For_NeurIPS_2026.zip'
expected = '82473931e3ef710fcd3f4a8cd4119b9de32e56825f90f9e5a6d55f2d01b817d9'
archive_path = paper / '.style.zip'
archive = archive_path.read_bytes() if archive_path.exists() else urllib.request.urlopen(url, timeout=45).read()
assert hashlib.sha256(archive).hexdigest() == expected, 'Official style archive changed; inspect before updating the pin'
archive_path.write_bytes(archive)
with zipfile.ZipFile(io.BytesIO(archive)) as z:
    member, = [n for n in z.namelist() if pathlib.PurePosixPath(n).name == style.name]
    style.write_bytes(z.read(member))
subprocess.run(['tectonic', '--keep-logs', 'paper.tex'], cwd=paper, check=True)
log = (paper / 'paper.log').read_text()
assert 'undefined references' not in log and 'undefined citations' not in log
target = paper / meta['artifact_name']
assert target.parent == paper and target.suffix == '.pdf'
shutil.copyfile(paper / 'paper.pdf', target)
print(f'Built {target}')
