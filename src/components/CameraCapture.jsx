import { useEffect, useRef, useState } from 'react'

/**
 * 라이브 카메라 미리보기 + 촬영 컴포넌트.
 * - getUserMedia로 카메라 스트림을 받아 <video>에 표시
 * - 후면 카메라(environment)를 우선 요청
 * - 촬영 버튼을 누르면 현재 프레임을 캔버스로 캡처 → Blob → onCapture(blob)
 * - 닫기 시 모든 트랙을 stop()으로 해제 (배터리/프라이버시)
 */
export function CameraCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const [facing, setFacing] = useState('environment') // 후면 우선

  // 스트림 시작/재시작 (카메라 전환 시에도 호출)
  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        setReady(false)
        // 이전 스트림 정리
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }

        // 카메라 스트림 요청
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // iOS Safari 자동재생 호환
          await videoRef.current.play().catch(() => {})
          setReady(true)
        }
      } catch (e) {
        console.error('카메라 접근 실패', e)
        setError(getFriendlyError(e))
      }
    }

    start()

    // 언마운트 시 트랙 정리
    return () => {
      cancelled = true
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [facing])

  // 현재 프레임 캡처
  const handleShutter = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob)
      },
      'image/jpeg',
      0.95,
    )
  }

  // 전·후면 카메라 토글
  const handleFlip = () => {
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'))
  }

  if (error) {
    return (
      <section className="space-y-4 rounded-2xl border border-rose-700 bg-rose-950/40 p-6 text-center">
        <p className="text-rose-200">{error}</p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-600 px-4 py-2 text-slate-200 hover:bg-slate-800"
        >
          돌아가기
        </button>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      {/*
        세로 모바일에서 비디오가 너무 길어 촬영 버튼이 화면 밖으로 밀리던 문제 수정.
        - 컨테이너 높이를 viewport에 비례해 제한 (calc로 헤더/버튼 여유 확보)
        - 비디오는 object-contain으로 비율 유지하며 컨테이너에 맞춤
      */}
      <div
        className="relative w-full overflow-hidden rounded-xl bg-black"
        style={{ height: 'min(70vh, calc(100svh - 220px))' }}
      >
        <video
          ref={videoRef}
          className="block h-full w-full object-contain"
          playsInline
          muted
          autoPlay
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-200">
            카메라 준비 중…
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-600 px-4 py-3 text-slate-200 hover:bg-slate-800"
        >
          ↺ 취소
        </button>
        <button
          type="button"
          onClick={handleShutter}
          disabled={!ready}
          className="rounded-xl bg-indigo-500 px-4 py-3 font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          📸 촬영
        </button>
        <button
          type="button"
          onClick={handleFlip}
          disabled={!ready}
          className="rounded-xl border border-slate-600 px-4 py-3 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          🔄 전/후면
        </button>
      </div>
      <p className="text-center text-xs text-slate-400">
        지금 카메라: {facing === 'environment' ? '후면(권장)' : '전면'}
      </p>
    </section>
  )
}

// 흔한 에러를 한국어 안내로 변환
function getFriendlyError(e) {
  const name = e?.name || ''
  if (name === 'NotAllowedError')
    return '카메라 권한이 거부되었습니다. 브라우저 주소창의 카메라 아이콘에서 허용해주세요.'
  if (name === 'NotFoundError')
    return '사용 가능한 카메라를 찾지 못했습니다.'
  if (name === 'NotReadableError')
    return '카메라가 다른 앱에서 사용 중일 수 있습니다.'
  if (name === 'OverconstrainedError')
    return '요청한 카메라 사양을 지원하지 않습니다.'
  if (location.protocol !== 'https:' && location.hostname !== 'localhost')
    return 'HTTPS 환경에서만 카메라 접근이 허용됩니다.'
  return `카메라 접근 실패: ${e?.message || e}`
}
