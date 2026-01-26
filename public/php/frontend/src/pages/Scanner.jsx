import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import jsQR from 'jsqr';

export default function Scanner() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [scanning, setScanning] = useState(false);
    const [status, setStatus] = useState('พร้อมสแกน');
    const streamRef = useRef(null);
    const [errorMessage, setErrorMessage] = useState(null);

    useEffect(() => {
        if (!isMobile()) {
            startCamera();
        } else {
            setStatus('กดปุ่ม "สแกน" เพื่อเริ่มใช้งานกล้องบนโทรศัพท์');
        }
        return () => stopCamera();
    }, []);

    const isMobile = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');

    async function startCamera() {
        try {
            setErrorMessage(null);
            setStatus('กำลังเปิดกล้อง...');
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('ไม่พบ API กล้องบนเบราว์เซอร์นี้');
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setScanning(true);
            setStatus('สแกนกล้อง: เล็ง QR ภายในกรอบ');
            requestAnimationFrame(tick);
        } catch (err) {
            console.error('Camera start failed', err);
            const msg = (err && (err.message || err.name)) || String(err);
            setErrorMessage(msg);
            setStatus('ไม่สามารถเข้าถึงกล้องได้');
            setScanning(false);
        }
    }

    function stopCamera() {
        setScanning(false);
        setStatus('หยุดสแกน');
        const s = streamRef.current;
        if (s) {
            s.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }

    function navigateToScanned(data) {
        if (!data) return;
        setStatus('พบ QR: ' + data);
        setTimeout(() => {
            try {
                if (/^https?:\/\//i.test(data)) {
                    window.location.href = data;
                } else if (data.startsWith('#') || data.startsWith('/')) {
                    window.location.href = data;
                } else {
                    if (/^\d+$/.test(data)) {
                        window.location.href = `#\/machines\/${data}`;
                    } else {
                        window.location.href = data;
                    }
                }
            } catch (e) {
                console.error('Navigation failed', e);
            }
        }, 350);
    }

    function tick() {
        if (!scanning) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
            requestAnimationFrame(tick);
            return;
        }
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (width === 0 || height === 0) {
            requestAnimationFrame(tick);
            return;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
            setStatus('อ่านได้: ' + code.data);
            stopCamera();
            navigateToScanned(code.data);
            return;
        }
        requestAnimationFrame(tick);
    }

    return (
        <div className="portal">
            <section>
                <div className="page-banner">
                    <Link to="/worksite" className="back-link">ย้อนกลับ</Link>
                    <h2>เครื่องอ่านบาร์โค้ด</h2>
                </div>

                <div className="scanner-box">
                    <p>{status}</p>

                    <div className="scanner-area">
                        <video ref={videoRef} style={{ width: '100%', maxHeight: 400 }} muted playsInline />
                        <canvas ref={canvasRef} style={{ display: 'none' }} />
                        <div className="scanner-line" />
                    </div>

                    <div className="scanner-actions">
                        {scanning ? (
                            <button className="button" onClick={stopCamera}>หยุดสแกน</button>
                        ) : (
                            isMobile() ? (
                                <button className="button primary" onClick={startCamera}>ขออนุญาตเข้าถึงกล้อง</button>
                            ) : (
                                <button className="button primary" onClick={startCamera}>สแกน</button>
                            )
                        )}
                    </div>

                    {errorMessage && (
                        <div style={{ marginTop: 12, color: '#b00' }}>
                            <strong>ข้อผิดพลาดกล้อง:</strong>
                            <div>{errorMessage}</div>
                            <div style={{ marginTop: 8 }}>
                                - ตรวจสอบว่าเบราว์เซอร์ให้สิทธิ์กล้องสำหรับเว็บไซต์นี้แล้ว<br />
                                - หากเปิดหน้าโดยใช้ IP (http) บางเบราว์เซอร์จะบล็อกกล้อง ต้องใช้ HTTPS หรือเปิดจาก `localhost`<br />
                                - ลองกดปุ่มอีกครั้งหรือรีสตาร์ทเบราว์เซอร์
                            </div>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
