from pathlib import Path

path = Path(r"C:/Projecet-noncon/php/frontend/src/pages/admin/UsersDirectory.jsx")
raw_text = path.read_text(encoding="utf-8")
text = raw_text.replace('\r\n', '\n')

start = text.index('const roleDictionary')
end = text.index('const resolveLastLogin')
new_header = """const roleDictionary = {
    admin: 'ผู้ดูแลระบบ',
    operator: 'หัวหน้างาน',
    inspector: 'ผู้ตรวจสอบ',
    viewer: 'อ่านอย่างเดียว',
};

const PencilIcon = () => (
    <svg viewBox=\"0 0 20 20\" aria-hidden=\"true\" focusable=\"false\">
        <path
            fill=\"currentColor\"
            d=\"M2.5 13.8V17h3.2l9.4-9.4-3.2-3.2-9.4 9.4zm13.7-8.3a.9.9 0 0 0 0-1.2L13.7 2.8a.9.9 0 0 0-1.2 0l-1.8 1.8 3.2 3.2 1.8-1.8z\"
        />
    </svg>
);

const TrashIcon = () => (
    <svg viewBox=\"0 0 20 20\" aria-hidden=\"true\" focusable=\"false\">
        <path
            fill=\"currentColor\"
            d=\"M7 17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V7H7v10zm9-12h-3.6l-.6-1.3A1 1 0 0 0 11 3H9a1 1 0 0 0-.8.7L7.6 5H4v2h12V5z\"
        />
    </svg>
);

"""
text = text[:start] + new_header + text[end:]

old_identity = """                                <div className=\"users-directory__identity\">\n                                    <div>\n                                        <div className=\"users-directory__name-row\">\n                                            {renderActions(user)}\n                                            <strong>{user.fullName || user.username || '-'}</strong>\n                                        </div>\n                                    </div>\n                                </div>\n"""
new_identity = """                                <div className=\"users-directory__identity\">\n                                    {renderActions(user)}\n                                    <div className=\"users-directory__identity-body\">\n                                        <div className=\"users-directory__identity-head\">\n                                            <div className=\"users-directory__avatar\">\n                                                {(user.fullName || user.username || '?').slice(0, 2).toUpperCase()}\n                                            </div>\n                                            <div>\n                                                <strong>{user.fullName || user.username || '-'}</strong>\n                                                <div className=\"muted\">{user.username} · #{user.employeeId || '-'}</div>\n                                            </div>\n                                        </div>\n                                    </div>\n                                </div>\n"""
if old_identity not in text:
    raise SystemExit('old identity block not found')
text = text.replace(old_identity, new_identity, 1)

path.write_text(text.replace('\n', '\r\n'), encoding="utf-8")
