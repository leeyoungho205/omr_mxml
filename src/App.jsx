import { useEffect, useRef, useState } from 'react'
import { useOpenCV } from './hooks/useOpenCV'
import { detectCorners } from './utils/detectCorners'
import { flatten } from './utils/flatten'
import { CameraCapture } from './components/CameraCapture'

// 앱 단계 상수
const STEP = {
  PICK: 'pick',         // 1단계: 입력 방식 선택 (카메라/파일)
  CAMERA: 'camera',     // 1-b단계: 라이브 카메라 촬영
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

  // 사진(File 또는 Blob)을 받아 Image 객체로 로드
  const handleFile = (fileOrBlob) => {
    if (!fileOrBlob) return
    const url = URL.createObjectURL(fileOrBlob)
    setImageUrl(url)
    const img = new Image()
    img.onload = () => {
      setImageEl(img)
      setCorners(null) // 새 이미지마다 꼭짓점 재검출
      setStep(STEP.ADJUST)
    }
    img.onerror = () => {
      console.error('이미지 로딩 실패')
      alert('이미지를 불러올 수 없습니다. 다른 사진을 시도해보세요.')
    }
    img.src = url
  }

  // 단계 진입 시 자동 꼭짓점 검출
  useEffect(() => {
    if (step === STEP.ADJUST && imageEl && cvReady && !corners) {
      try {
        const c = detectCorners(imageEl)
        setCorners(c)
      } catch (e) {
        console.error('꼭짓점 검출 실패', e)
        // 검출에 실패해도 수동 조정이 가능하도록 80% 사각형 폴백
        const w = imageEl.naturalWidth || imageEl.width
        const h = imageEl.naturalHeight || imageEl.height
        const m = 0.1
        setCorners([
          { x: w * m, y: h * m },
          { x: w * (1 - m), y: h * m },
          { x: w * (1 - m), y: h * (1 - m) },
          { x: w * m, y: h * (1 - m) },
        ])
      }
    }
  }, [step, imageEl, cvReady, corners])

  // 평면화 단계로 전환 (실제 변환은 ResultStep이 mount 직후 useEffect로 수행)
  const handleFlatten = () => {
    if (!imageEl || !corners) return
    setStep(STEP.RESULT)
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

      {/* 1단계: 입력 방식 선택 */}
      {step === STEP.PICK && (
        <PickStep
          onFile={handleFile}
          onCameraOpen={() => setStep(STEP.CAMERA)}
          fileInputRef={fileInputRef}
          cvReady={cvReady}
        />
      )}

      {/* 1-b단계: 라이브 카메라 */}
      {step === STEP.CAMERA && (
        <CameraCapture
          onCapture={(blob) => handleFile(blob)}
          onCancel={() => setStep(STEP.PICK)}
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
      {step === STEP.RESULT && imageEl && corners && (
        <ResultStep
          imageEl={imageEl}
          corners={corners}
          onReset={handleReset}
          onReadjust={() => setStep(STEP.ADJUST)}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
 * 1단계: 입력 방식 선택
 * - 카메라 버튼: 라이브 카메라(getUserMedia) — 모바일/데스크탑 모두 지원
 * - 파일 버튼: 갤러리/파일 선택 (capture 속성 없음)
 * ───────────────────────────────────────────── */
function PickStep({ onFile, onCameraOpen, fileInputRef, cvReady }) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/40 p-6 text-center">
      <p className="mb-4 text-slate-300">
        카메라로 직접 촬영하거나, 이미 가지고 있는 사진을 선택하세요.
      </p>

      {/* 파일 선택용 input (모바일에선 갤러리에서 고를 수 있음) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onCameraOpen}
          disabled={!cvReady}
          className="rounded-xl bg-indigo-500 px-5 py-3 font-medium text-white shadow hover:bg-indigo-400 disabled:opacity-50"
        >
          📷 카메라로 촬영
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!cvReady}
          className="rounded-xl border border-slate-600 bg-slate-800/60 px-5 py-3 font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
        >
          🖼️ 파일/갤러리에서 선택
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
 * - 자체 canvas ref를 갖고, mount 직후 useEffect에서 flatten() 실행
 *   (이전 버그: 상위에서 ref를 만들면 canvas가 아직 렌더 전이라 ref.current=null)
 * ───────────────────────────────────────────── */
function ResultStep({ imageEl, corners, onReset, onReadjust }) {
  const canvasRef = useRef(null)
  const [err, setErr] = useState(null)

  // mount 시점에 평면화 실행
  useEffect(() => {
    if (!canvasRef.current || !imageEl || !corners) return
    try {
      flatten(imageEl, corners, canvasRef.current)
    } catch (e) {
      console.error('평면화 실패', e)
      setErr(e?.message || String(e))
    }
  }, [imageEl, corners])

  // JPG 다운로드 (canvas.toBlob)
  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(
      (blob) => {
        if (!blob) return
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

  return (
    <section className="space-y-4">
      <p className="text-sm text-slate-300">
        평면화된 악보 이미지입니다. 마음에 들면 JPG로 저장하세요.
      </p>
      {err && (
        <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
          평면화 중 오류: {err}
        </p>
      )}
      <div className="rounded-xl bg-white p-2">
        <canvas ref={canvasRef} className="block h-auto w-full" />
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
          onClick={handleDownload}
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
