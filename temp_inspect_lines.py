from pathlib import Path
lines = Path(r"C:/Projecet-noncon/php/frontend/src/pages/admin/UsersDirectory.jsx").read_text(encoding="utf-8").splitlines()
for idx, line in enumerate(lines[:20], start=1):
    print(idx, repr(line))
