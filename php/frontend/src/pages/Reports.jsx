import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet } from '../api.js';

const MAX_ATTACHMENTS = 3;

export default function Reports() {
    const [note, setNote] = useState('');
    const [status, setStatus] = useState('idle');
    const [attachments, setAttachments] = useState([]);
    const [machineCode, setMachineCode] = useState('');
    const fileInputRef = useRef(null);
    const pickerRef = useRef(null);
    const [showDialog, setShowDialog] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [attachmentError, setAttachmentError] = useState('');
    const navigate = useNavigate();
    const [machines, setMachines] = useState([]);
    useEffect(() => {
        (async () => {
            try {
                const data = await apiGet('/api/machines.php?limit=5000');
                const normalized = (data.items || []).map((row) => ({
                    value: row.Equipment || String(row.Machine_Id),
                    label: `${row.Equipment || row.Machine_Id} · ${(row.Description || row.Name || '').trim()}`.trim(),
                    id: row.Machine_Id,
                }));
                normalized.sort((a, b) => (a.id || 0) - (b.id || 0));
                setMachines(normalized);
            } catch (e) {
            }
        })();
    }, []);

    const machineOptions = useMemo(() => machines, [machines]);

    const filteredOptions = useMemo(() => {
        const query = machineCode.trim().toLowerCase();
        if (!query) return machineOptions;
        return machineOptions.filter((option) => {
            const value = option.value.toLowerCase();
            const label = option.label.toLowerCase();
            return value.includes(query) || label.includes(query);
        });
    }, [machineCode, machineOptions]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!pickerRef.current || pickerRef.current.contains(event.target)) {
                return;
            }
            setShowOptions(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (highlightIndex >= filteredOptions.length) {
            setHighlightIndex(0);
        }
    }, [filteredOptions.length, highlightIndex]);

    const handleSelectMachine = (code) => {
        setMachineCode(code);
        setShowOptions(false);
    };

    const releaseUrls = (list) => {
        list.forEach((item) => URL.revokeObjectURL(item.url));
    };

    const resetFileInput = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const MAX_FILE_SIZE_MB = 5;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    const handleFileChange = (event) => {
        const files = Array.from(event.target.files ?? []);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (files.length === 0) return;

        const invalidType = files.find(f => !ALLOWED_MIME.includes(f.type));
        if (invalidType) {
            setAttachmentError(`ไฟล์ "${invalidType.name}" ไม่ใช่รูปภาพที่รองรับ (รองรับ: jpg, png, webp, gif)`);
            return;
        }
        const oversized = files.find(f => f.size > MAX_FILE_SIZE_BYTES);
        if (oversized) {
            setAttachmentError(`ไฟล์ "${oversized.name}" มีขนาดเกิน ${MAX_FILE_SIZE_MB}MB กรุณาเลือกไฟล์ที่เล็กกว่านี้`);
            return;
        }

        setAttachmentError('');
        setAttachments((prev) => {
            const remaining = MAX_ATTACHMENTS - prev.length;
            if (remaining <= 0) {
                setAttachmentError(`แนบรูปได้สูงสุด ${MAX_ATTACHMENTS} รูปเท่านั้น`);
                return prev;
            }
            const nextBatch = files.slice(0, remaining).map((file) => ({
                file,
                url: URL.createObjectURL(file),
            }));
            return [...prev, ...nextBatch];
        });
    };

    const handleRemoveAttachment = (index) => {
        setAttachments((prev) => {
            if (index < 0 || index >= prev.length) {
                return prev;
            }
            const next = [...prev];
            const [removed] = next.splice(index, 1);
            if (removed) {
                URL.revokeObjectURL(removed.url);
            }
            if (next.length === 0) {
                resetFileInput();
            }
            return next;
        });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!machineCode || !note.trim()) {
            return;
        }

        const selected = machines.find((m) => m.value === machineCode || String(m.id) === machineCode);
        const machineId = selected ? selected.id : 0;

        setStatus('submitting');

        const fd = new FormData();
        fd.append('Machine_Id', machineId);
        fd.append('Details', note);
        fd.append('Status', 'new');
        attachments.forEach((a) => fd.append('files[]', a.file));

        try {
                const apiBase = window.location.protocol + '//' + window.location.hostname + ':8080';
            const resp = await fetch(`${apiBase}/server/reports.php`, {
                method: 'POST',
                mode: 'cors',
                credentials: 'include',
                body: fd,
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                setStatus('error');
                const msg = data?.message || `Error ${resp.status}`;
                alert(msg);
                return;
            }

            setStatus('submitted');
            setNote('');
            setMachineCode('');
            setAttachments((prev) => {
                releaseUrls(prev);
                return [];
            });
            resetFileInput();
            setShowDialog(true);
            window.setTimeout(() => setStatus('idle'), 2500);
        } catch (e) {
            setStatus('error');
            alert(e.message || 'Network error');
        }
    };

    const handleDialogConfirm = () => {
        setShowDialog(false);
        navigate('/worksite', { replace: true });
    };

    return (
        <div className="portal">
            <section>
                <div className="page-banner">
                    <Link to="/worksite" className="back-link">
                        ย้อนกลับ
                    </Link>
                    <h2>รายงานปัญหา</h2>
                </div>
                <p className="text-muted">พิมพ์แจ้งปัญหา ความต้องการ หรือรายงานภาคสนามเพื่อส่งให้ทีมหลังบ้าน</p>
                <form className="report-form" onSubmit={handleSubmit}>
                    <label htmlFor="report-machine">ระบุรหัสเครื่องจักร</label>
                    <div className="machine-picker" ref={pickerRef}>
                        <input
                            id="report-machine"
                            type="text"
                            className="machine-input"
                            placeholder="โปรดเลือกรหัสเครื่องจักร"
                            value={machineCode}
                            onChange={(event) => {
                                setMachineCode(event.target.value);
                                setShowOptions(true);
                                setHighlightIndex(0);
                            }}
                            onFocus={() => setShowOptions(true)}
                            onKeyDown={(event) => {
                                if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    setShowOptions(true);
                                    setHighlightIndex((prev) =>
                                        Math.min(prev + 1, Math.max(filteredOptions.length - 1, 0)),
                                    );
                                } else if (event.key === 'ArrowUp') {
                                    event.preventDefault();
                                    setHighlightIndex((prev) => Math.max(prev - 1, 0));
                                } else if (event.key === 'Enter') {
                                    if (showOptions && filteredOptions[highlightIndex]) {
                                        event.preventDefault();
                                        handleSelectMachine(filteredOptions[highlightIndex].value);
                                    }
                                } else if (event.key === 'Escape') {
                                    setShowOptions(false);
                                }
                            }}
                            role="combobox"
                            aria-expanded={showOptions}
                            aria-controls="machine-picker-options"
                            aria-autocomplete="list"
                        />
                        {showOptions && filteredOptions.length > 0 && (
                            <ul className="picker-options" id="machine-picker-options" role="listbox">
                                {filteredOptions.map((option, index) => (
                                    <li key={option.value}>
                                        <button
                                            type="button"
                                            className={`picker-option${index === highlightIndex ? ' active' : ''}`}
                                            onMouseDown={(event) => {
                                                event.preventDefault();
                                                handleSelectMachine(option.value);
                                            }}
                                            role="option"
                                            aria-selected={index === highlightIndex}
                                        >
                                            <strong>{option.value}</strong>
                                            <span>{option.label.replace(option.value, '').replace(/^\s*·\s*/, '')}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <label htmlFor="report-note">รายละเอียดรายงาน</label>
                    <textarea
                        id="report-note"
                        rows="6"
                        placeholder="เช่น เครื่องมีเสียงดังผิดปกติ ..."
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                    />
                    <label htmlFor="report-photo">แนบรูปภาพ (สูงสุด {MAX_ATTACHMENTS} รูป)</label>
                    <input
                        id="report-photo"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        multiple
                        ref={fileInputRef}
                        onChange={handleFileChange}
                    />
                    {attachmentError && (
                        <div style={{ color: '#dc3545', fontSize: '13px', marginTop: '4px' }}>{attachmentError}</div>
                    )}
                    {attachments.length > 0 && (
                        <div className="attachment-preview">
                            {attachments.map((item, index) => (
                                <figure key={`${item.url}-${index}`}>
                                    <button
                                        type="button"
                                        className="attachment-remove"
                                        onClick={() => handleRemoveAttachment(index)}
                                        aria-label={`ลบรูปที่ ${index + 1}`}
                                    >
                                        ×
                                    </button>
                                    <img src={item.url} alt={`แนบรูปที่ ${index + 1}`} />
                                    <figcaption>รูปที่ {index + 1}</figcaption>
                                </figure>
                            ))}
                        </div>
                    )}
                    <button type="submit" className="button primary full-width">
                        ส่งรายงาน
                    </button>
                </form>
            </section>
            {showDialog && (
                <div className="dialog-overlay" role="dialog" aria-modal="true">
                    <div className="dialog-card">
                        <h3>ส่งรายงานเรียบร้อย</h3>
                        <p>ระบบบันทึกข้อมูลแล้ว</p>
                        <button type="button" className="button primary" onClick={handleDialogConfirm}>
                            ยืนยัน
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
