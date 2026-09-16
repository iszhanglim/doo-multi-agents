import React, { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceInputProps {
  onTranscript: (text: string, isFinal: boolean) => void;
}

/**
 * 语音输入：本地录音（MediaRecorder）+ 服务端 whisper 识别。
 * 不依赖浏览器 Web Speech API（该服务在国内网络下不可用）。
 */
const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript }) => {
  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const cleanupRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupRecording();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch { /* 已停止 */ }
      }
    };
  }, [cleanupRecording]);

  const transcribe = useCallback(async (blob: Blob) => {
    setStatus('transcribing');
    try {
      // 直接以原始二进制发送音频（不用 FormData，避免 multipart 信封破坏音频数据）
      const res = await fetch('/api/stt', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const text = (data.text || '').trim();
      if (!text) throw new Error('未识别到语音内容');
      if (mountedRef.current) {
        onTranscript(text, true);
        setStatus('idle');
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error && err.message ? err.message : '请重试';
        setError(`语音识别失败：${msg}`);
        setStatus('idle');
      }
    }
  }, [onTranscript]);

  const handleStopped = useCallback(() => {
    cleanupRecording();
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'audio/webm' });
    if (blob.size < 3000) {
      setError('录音太短，请重试');
      setStatus('idle');
      return;
    }
    transcribe(blob);
  }, [cleanupRecording, transcribe]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持录音，请使用Chrome或Edge');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = handleStopped;
      recorderRef.current = recorder;
      recorder.start(500);
      setStatus('recording');
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError') setError('麦克风权限被拒绝，请在浏览器地址栏允许麦克风');
      else if (name === 'NotFoundError') setError('未检测到麦克风设备');
      else setError('无法启动录音');
      setStatus('idle');
      cleanupRecording();
    }
  }, [handleStopped, cleanupRecording]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const handleToggle = useCallback(() => {
    if (status === 'recording') stopRecording();
    else if (status === 'idle') startRecording();
    // transcribing 状态下按钮禁用，不处理
  }, [status, startRecording, stopRecording]);

  const label = status === 'recording' ? `录音中 ${seconds}s（点击停止）` : status === 'transcribing' ? '识别中...' : '语音输入';
  const icon = status === 'recording' ? '🔴' : status === 'transcribing' ? '⏳' : '🎤';

  return (
    <div className="voice-input">
      <button
        type="button"
        className={`voice-btn ${status !== 'idle' ? 'active' : ''}`}
        onClick={handleToggle}
        disabled={status === 'transcribing'}
        title={status === 'recording' ? '停止录音并识别' : '点击开始录音'}
      >
        {icon}
        <span>{label}</span>
      </button>

      {status === 'recording' && (
        <div className="voice-wave">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      )}

      {error && <span className="voice-error">{error}</span>}

      <style>{`
        .voice-input {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .voice-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: white;
          border: 2px solid var(--border);
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: 14px;
          color: var(--text-secondary);
          transition: all 0.3s ease;
          font-family: inherit;
        }

        .voice-btn:hover:not(:disabled) {
          border-color: var(--primary);
          color: var(--primary);
        }

        .voice-btn:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        .voice-btn.active {
          border-color: #FF6B6B;
          color: #FF6B6B;
          animation: pulse 1.5s ease-in-out infinite;
        }

        .voice-wave {
          display: flex;
          align-items: center;
          gap: 3px;
          height: 24px;
        }

        .voice-wave span {
          width: 3px;
          background: #FF6B6B;
          border-radius: 2px;
          animation: wave 1s ease-in-out infinite;
        }

        .voice-wave span:nth-child(1) { height: 8px; animation-delay: 0s; }
        .voice-wave span:nth-child(2) { height: 16px; animation-delay: 0.1s; }
        .voice-wave span:nth-child(3) { height: 24px; animation-delay: 0.2s; }
        .voice-wave span:nth-child(4) { height: 16px; animation-delay: 0.3s; }
        .voice-wave span:nth-child(5) { height: 8px; animation-delay: 0.4s; }

        @keyframes wave {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1); }
        }

        .voice-error {
          font-size: 12px;
          color: #FF6B6B;
        }
      `}</style>
    </div>
  );
};

export default VoiceInput;
