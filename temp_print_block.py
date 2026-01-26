from pathlib import Path
text = Path(r"C:/Projecet-noncon/php/frontend/src/pages/admin/UsersDirectory.jsx").read_text(encoding="utf-8").replace('\r\n', '\n')
needle = '                                <div className="users-directory__identity">'
pos = text.find(needle)
print(repr(text[pos:pos+600]))
