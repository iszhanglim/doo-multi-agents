import React, { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceInputProps {
  onTranscript: (text: string, isFinal: boolean) => void;
}

const TARGET_SAMPLE_RATE = 16000;

/** 线性重采样到 16kHz 单声道，编码 16-bit PCM WAV——ASR 原生格式，服务端无需转码 */
function encodeWav(samples: Float32Array, inRate: number): Blob {
  let pcm = samples;
  if (Math.abs(inRate - TARGET_SAMPLE_RATE) > 1) {
    const ratio = inRate / TARGET_SAMPLE_RATE;
    const out = new Float32Array(Math.floor(samples.length / ratio));
    for (let i = 0; i < out.length; i++) {
      const t = i * ratio;
      const j = Math.floor(t);
      const cur = samples[j];
      const next = samples[Math.min(j + 1, samples.length - 1)];
      out[i] = cur + (next - cur) * (t - j);
    }
    pcm = out;
  }
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const w = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
}

/**
 * 语音输入：Web Audio 采集 PCM 编码 WAV + 服务端语音识别。
 * 不用 MediaRecorder（其产出 webm/mp4，服务端转码依赖 ffmpeg，部署环境不可用）。
 */
const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript }) => {
  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(TARGET_SAMPLE_RATE);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const cleanupRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (silentRef.current) {
      silentRef.current.disconnect();
      silentRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current) {
      void ctxRef.current.close().catch(() => { /* 已关闭 */ });
      ctxRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupRecording();
    };
  }, [cleanupRecording]);

  const transcribe = useCallback(async (blob: Blob) => {
    setStatus('transcribing');
    try {
      // 直接以原始二进制发送音频（不用 FormData，避免 multipart 信封破坏音频数据）
      const res = await fetch('/api/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
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

  const finishRecording = useCallback(() => {
    cleanupRecording();
    const rate = sampleRateRef.current;
    const total = pcmChunksRef.current.reduce((n, c) => n + c.length, 0);
    if (total < rate) {
      setError('录音太短，请重试');
      setStatus('idle');
      return;
    }
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of pcmChunksRef.current) {
      merged.set(c, off);
      off += c.length;
    }
    pcmChunksRef.current = [];
    transcribe(encodeWav(merged, rate));
  }, [cleanupRecording, transcribe]);

  const startRecording = useCallback(async () => {
    setError(null);
    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !Ctx) {
      setError('当前浏览器不支持录音，请使用Chrome或Edge');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      sampleRateRef.current = ctx.sampleRate;
      pcmChunksRef.current = [];
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        pcmChunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      // 静音增益接 destination：驱动处理循环但避免麦克风回放外放
      const silent = ctx.createGain();
      silent.gain.value = 0;
      silentRef.current = silent;
      source.connect(processor);
      processor.connect(silent);
      silent.connect(ctx.destination);
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
  }, [cleanupRecording]);

  const stopRecording = useCallback(() => {
    if (ctxRef.current) {
      finishRecording();
    }
  }, [finishRecording]);

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
