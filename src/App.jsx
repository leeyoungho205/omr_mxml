import { useEffect, useRef, useState } from 'react'
import { useOpenCV } from './hooks/useOpenCV'
import { detectCorners } from './utils/detectCorners'
import { flatten } from './utils/flatten'

// 앱 단계 상수
const STEP = {
  PICK: 'pick',         // 1단계: 사진 선택/촬영
  ADJUST: 'adjust',     // 2단계: 꼭짓점 조정
  RESULT: 'result',     // 3단계: 평면화 결과
}

export default function App() {
  const { ready: cvReady, error: cvError } = useOpenCV()
  const [step, setStep] = useState(STEP.PICK)
  const [imageUrl, setImageUrl] = useState(null)
  const [imageEl, setImageEl] = useState(null)
  const [corners, setCorners] = useState(null)

  const fileInputRef = useRef(null)
  const resultCanvasRef = useRef(null)

  // 사진 파일을 받아 Image 객체로 로드
  const handleFile = (file) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    const img = new Image()
    img.onload = () => {
      setImageEl(img)
      setStep(STEP.ADJUST)
    }
    img.src = url
  }

  // 단계 진입 시 자동 꼭짓점 검출
  useEffect(() => {
    if (step === STEP.ADJUST && imageEl && cvReady) {
      try {
        const c = detectCorners(imageEl)
        setCorners(c)
      } catch (e) {
        console.error('꼭짓점 검출 실패', e)
      }
    }
  }, [step, imageEl, cvReady])

  // 평면화 실행
  const handleFlatten = () => {
    if (!imageEl || !corners || !resultCanvasRef.current) return
    flatten(imageEl, corners, resultCanvasRef.current)
    setStep(STEP.RESULT)
  }

  // JPG 다운로드
  const handleDownload = () => {
    const canvas = resultCanvasRef.current
    if (!canvas) return
    canvas.toBlob(
      (blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `score_${Date.now()}.jpg`
        a.click()
        URL.revokeObjectURL(url)
      },
      'image/jpeg',
      0.92,
    )
  }

  // 처음으로 돌아가기
  const handleReset = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setImageUrl(null)
    setImageEl(null)
    setCorners(null)
    setStep(STEP.PICK)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          🎼 악보 평면화 MVP
        </h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            cvReady
              ? 'bg-emerald-900/40 text-emerald-300'
              : 'bg-amber-900/40 text-amber-300'
          }`}
          title={cvError ? cvError.message : 'OpenCV.js 상태'}
        >
          {cvError ? 'CV 오류' : cvReady ? 'OpenCV 준비됨' : 'OpenCV 로딩…'}
        </span>
      </header>

      {/* 1단계: 사진 선택/촬영 */}
      {step === STEP.PICK && (
        <PickStep
          onFile={handleFile}
          fileInputRef={fileInputRef}
          cvReady={cvReady}
        />
      )}

      {/* 2단계: 꼭짓점 조정 */}
      {step === STEP.ADJUST && imageEl && (
        <AdjustStep
          imageEl={imageEl}
          corners={corners}
          setCorners={setCorners}
          onFlatten={handleFlatten}
          onReset={handleReset}
        />
      )}

      {/* 3단계: 결과 */}
      {step === STEP.RESULT && (
        <ResultStep
          resultCanvasRef={resultCanvasRef}
          onDownload={handleDownload}
          onReset={handleReset}
          onReadjust={() => setStep(STEP.ADJUST)}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
 * 1단계: 사진 선택/촬영
 * 모바일에서는 input capture 속성으로 카메라 직접 호출
 * ───────────────────────────────────────────── */
function PickStep({ onFile, fileInputRef, cvReady }) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/40 p-6 text-center">
      <p className="mb-4 text-slate-300">
        스마트폰 카메라로 악보를 촬영하거나, 이미 찍은 사진을 업로드하세요.
      </p>

      {/* 후면 카메라 직접 호출 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!cvReady}
          className="w-full rounded-xl bg-indigo-500 px-5 py-3 font-medium text-white shadow hover:bg-indigo-400 disabled:opacity-50 sm:w-auto"
        >
          📷 촬영하기 / 사진 선택
        </button>
      </div>

      {!cvReady && (
        <p className="mt-4 text-sm text-slate-400">
          OpenCV.js를 불러오는 중입니다(최초 1회, 약 10MB)…
        </p>
      )}
    </section>
  )
}

/* ─────────────────────────────────────────────
 * 2단계: 꼭짓점 조정
 * - 이미지를 화면 폭에 맞춰 표시
 * - SVG 오버레이로 4개 꼭짓점을 드래그
 * - 좌표 변환: 화면 좌표 ↔ 원본 이미지 좌표
 * ───────────────────────────────────────────── */
function AdjustStep({ imageEl, corners, setCorners, onFlatten, onReset }) {
  const wrapRef = useRef(null)
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 })
  const [draggingIdx, setDraggingIdx] = useState(-1)

  // 화면에 표시할 이미지 크기 계산 (가로 폭에 맞춤)
  useEffect(() => {
    const update = () => {
      if (!wrapRef.current || !imageEl) return
      const containerW = wrapRef.current.clientWidth
      const ratio = imageEl.naturalHeight / imageEl.naturalWidth
      setDisplaySize({ w: containerW, h: containerW * ratio })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [imageEl])

  // 원본→화면 좌표 스케일
  const scale = displaySize.w / (imageEl?.naturalWidth || 1)

  // 포인터 이동 → 꼭짓점 위치 갱신
  const handlePointerMove = (e) => {
    if (draggingIdx < 0 || !corners) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clientX = e.clientX
    const clientY = e.clientY
    const xOnScreen = clientX - rect.left
    const yOnScreen = clientY - rect.top
    // 원본 좌표로 변환해서 저장
    const next = corners.map((p, i) =>
      i === draggingIdx
        ? {
            x: clamp(xOnScreen / scale, 0, imageEl.naturalWidth),
            y: clamp(yOnScreen / scale, 0, imageEl.naturalHeight),
          }
        : p,
    )
    setCorners(next)
  }

  const stopDrag = () => setDraggingIdx(-1)

  return (
    <section className="space-y-4">
      <p className="text-sm text-slate-300">
        검출된 꼭짓점을 확인하고 필요하면 드래그로 미세 조정하세요.
      </p>

      <div
        ref={wrapRef}
        className="relative w-full touch-none select-none rounded-xl bg-black overflow-hidden"
        style={{ height: displaySize.h || 'auto' }}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
      >
        {/* 원본 이미지 */}
        <img
          src={imageEl.src}
          alt="원본"
          className="absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
        {/* SVG 오버레이: 꼭짓점 + 연결선 */}
        {corners && displaySize.w > 0 && (
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${displaySize.w} ${displaySize.h}`}
          >
            <polygon
              points={corners
                .map((p) => `${p.x * scale},${p.y * scale}`)
                .join(' ')}
              fill="rgba(99, 102, 241, 0.18)"
              stroke="#818cf8"
              strokeWidth="2"
            />
            {corners.map((p, i) => (
              <circle
                key={i}
                cx={p.x * scale}
                cy={p.y * scale}
                r="14"
                fill="#fbbf24"
                stroke="#0b0f14"
                strokeWidth="2"
                style={{ cursor: 'grab', touchAction: 'none' }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  setDraggingIdx(i)
                }}
              />
            ))}
          </svg>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-xl border border-slate-600 px-4 py-3 text-slate-200 hover:bg-slate-800"
        >
          ↺ 다시 찍기
        </button>
        <button
          type="button"
          onClick={onFlatten}
          disabled={!corners}
          className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-white hover:bg-emerald-400 disabled:opacity-50"
        >
          📐 평면화하기
        </button>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────
 * 3단계: 결과
 * ───────────────────────────────────────────── */
function ResultStep({ resultCanvasRef, onDownload, onReset, onReadjust }) {
  return (
    <section className="space-y-4">
      <p className="text-sm text-slate-300">
        평면화된 악보 이미지입니다. 마음에 들면 JPG로 저장하세요.
      </p>
      <div className="rounded-xl bg-white p-2">
        <canvas ref={resultCanvasRef} className="block h-auto w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={onReadjust}
          className="rounded-xl border border-slate-600 px-4 py-3 text-slate-200 hover:bg-slate-800"
        >
          ← 꼭짓점 다시 조정
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl border border-slate-600 px-4 py-3 text-slate-200 hover:bg-slate-800"
        >
          ↺ 새 사진
        </button>
        <button
          type="button"
          onClick={onDownload}
          className="rounded-xl bg-indigo-500 px-4 py-3 font-medium text-white hover:bg-indigo-400"
        >
          💾 JPG 다운로드
        </button>
      </div>
    </section>
  )
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}
