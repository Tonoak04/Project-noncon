from pathlib import Path
path = Path(r"C:/Projecet-noncon/php/frontend/src/pages/admin/UsersDirectory.jsx")
lines = path.read_text(encoding="utf-8").splitlines()
clean = []
blank = False
for line in lines:
    if line.strip() == '':
        if blank:
            continue
        blank = True
        clean.append('')
    else:
        blank = False
        clean.append(line)

path.write_text('\r\n'.join(clean) + '\r\n', encoding="utf-8")
