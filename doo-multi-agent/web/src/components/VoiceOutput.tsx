import React, { useState, useEffect, useRef, useCallback } from 'react';

interface VoiceOutputProps {
  text: string;
  autoPlay?: boolean;
}

const TTS_URL = '/api/tts';
const VOICE = 'zh-CN-YunxiaNeural'; // 微软 Yunxia 可爱男童声（浏览器降级兜底）

interface WebAudioPlayback {
  ctx: AudioContext;
  source: AudioBufferSourceNode;
}

/** Web Audio 变调播放：成功返回 playback 供打断控制；不支持或解码失败返回 null 走兜底 */
async function playDetunedChildVoice(
  blob: Blob,
  detuneCents: number,
  onEnd: () => void
): Promise<WebAudioPlayback | null> {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx || detuneCents === 0) return null;
    const ctx = new Ctx();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    if (!source.detune) {
      ctx.close();
      return null;
    }
    source.detune.value = detuneCents;
    source.connect(ctx.destination);
    await ctx.resume();
    source.onended = () => {
      ctx.close();
      onEnd();
    };
    source.start();
    return { ctx, source };
  } catch {
    return null;
  }
}

const VoiceOutput: React.FC<VoiceOutputProps> = ({ text, autoPlay = true }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const webAudioRef = useRef<WebAudioPlayback | null>(null);
  const hasAutoPlayed = useRef(false);

  const stopWebAudio = () => {
    const playing = webAudioRef.current;
    if (!playing) return;
    webAudioRef.current = null;
    try {
      playing.source.onended = null;
      playing.source.stop();
      playing.ctx.close();
    } catch {
      /* 已停止，忽略 */
    }
  };

  const speak = useCallback(async () => {
    if (!text) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    stopWebAudio();
    // 停掉降级 speechSynthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setIsSpeaking(true);
    try {
      const res = await fetch(TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: VOICE, rate: '0%' }), // 奶气萌娃原声足够自然，不额外提速
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);

      const blob = await res.blob();

      // 奶气萌娃等大模型童声本身足够幼态自然，不再叠加变调/变速
      const detune = 0;
      const playback = await playDetunedChildVoice(blob, detune, () => {
        setIsSpeaking(false);
        webAudioRef.current = null;
      });
      if (playback) {
        webAudioRef.current = playback;
        return;
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.src = url;
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      await audio.play();
    } catch {
      // 服务端TTS失败时降级为浏览器内置语音
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'zh-CN';
        utter.rate = 1.0;
        utter.pitch = 1.3; // 浏览器降级语音稍提 pitch 贴近男童
        utter.onend = () => setIsSpeaking(false);
        utter.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utter);
      } else {
        setIsSpeaking(false);
      }
    }
  }, [text]);

  // 自动播放
  useEffect(() => {
    if (!autoPlay || !text || hasAutoPlayed.current) return;
    hasAutoPlayed.current = true;
    const timer = setTimeout(speak, 200);
    return () => clearTimeout(timer);
  }, [text, autoPlay, speak]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      stopWebAudio();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <button
      className={`voice-output-btn ${isSpeaking ? 'speaking' : ''}`}
      onClick={speak}
      title={isSpeaking ? '正在播放...' : '点击播放'}
      type="button"
    >
      {isSpeaking ? '🔊' : '🔈'}

      <style>{`
        .voice-output-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          padding: 2px 6px;
          border-radius: 4px;
          transition: all 0.2s;
          line-height: 1;
          flex-shrink: 0;
        }
        .voice-output-btn:hover {
          background: rgba(107, 91, 149, 0.1);
        }
        .voice-output-btn.speaking {
          animation: voice-pulse 1s ease-in-out infinite;
        }
        @keyframes voice-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
    </button>
  );
};

export default VoiceOutput;
