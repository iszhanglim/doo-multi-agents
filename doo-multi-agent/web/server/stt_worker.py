#!/usr/bin/env python3
"""本地语音识别常驻进程（faster-whisper，不依赖任何外部云服务）。

协议（stdin/stdout 按行 JSON）：
  上游 -> 本进程: {"id": "req1", "file": "/tmp/xxx.webm"}
  本进程 -> 上游: {"id": "req1", "ok": true, "text": "识别文字"}
               或 {"id": "req1", "ok": false, "error": "失败原因"}
模型加载完成后先输出: {"ready": true, "model": "small"}
"""
import json
import os
import subprocess
import sys


def transcribe_file(model, path: str) -> str:
    segments, _info = model.transcribe(
        path,
        language="zh",
        vad_filter=True,
        initial_prompt="以下是幼儿园小朋友用中文讲述的日常经历。",
    )
    return "".join(seg.text for seg in segments).strip()


def main() -> None:
    # 模型下载走国内镜像（可被环境变量覆盖）；清理失效代理避免下载卡死
    os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
    for key in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"):
        os.environ.pop(key, None)

    from faster_whisper import WhisperModel

    model_size = os.environ.get("STT_MODEL", "small")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    print(json.dumps({"ready": True, "model": model_size}, ensure_ascii=False), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        rid = req.get("id")
        path = req.get("file")
        if not rid or not path:
            continue

        try:
            text = transcribe_file(model, path)
        except Exception:
            # 浏览器 MediaRecorder 的流式录音缺少 duration/cues 元数据，
            # 直接解码可能失败：用 ffmpeg 转成标准 16k 单声道 wav 后重试
            wav_path = path + ".wav"
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-loglevel", "error", "-i", path,
                     "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav_path],
                    check=True,
                    timeout=60,
                )
                text = transcribe_file(model, wav_path)
            except Exception as exc:  # noqa: BLE001
                print(json.dumps({"id": rid, "ok": False, "error": str(exc)}, ensure_ascii=False), flush=True)
                continue
            finally:
                try:
                    os.remove(wav_path)
                except OSError:
                    pass

        print(json.dumps({"id": rid, "ok": True, "text": text}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
