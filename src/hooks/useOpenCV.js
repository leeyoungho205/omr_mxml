import { useEffect, useState } from 'react'

// OpenCV.js CDN 주소 (4.x 안정 버전)
const OPENCV_URL = 'https://docs.opencv.org/4.x/opencv.js'

/**
 * OpenCV.js를 동적으로 로드하는 React 훅.
 * - 한 번만 로드하도록 window.cv 캐싱.
 * - WASM 런타임 초기화까지 끝나야 true 반환.
 */
export function useOpenCV() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // 이미 로드되어 런타임 준비까지 끝났는지 확인
    if (window.cv && typeof window.cv.getBuildInformation === 'function') {
      setReady(true)
      return
    }

    // 이미 스크립트 태그가 들어가 있으면 중복 로드 방지
    const existing = document.querySelector(`script[src="${OPENCV_URL}"]`)
    const script = existing ?? document.createElement('script')

    const onScriptLoad = () => {
      // OpenCV.js는 WASM 초기화가 비동기. 두 가지 경로를 모두 대응.
      const markReady = () => setReady(true)
      if (window.cv && typeof window.cv.getBuildInformation === 'function') {
        markReady()
      } else if (window.cv) {
        window.cv.onRuntimeInitialized = markReady
      } else {
        // 매우 드물게 window.cv가 늦게 붙는 경우 폴링
        const id = setInterval(() => {
          if (window.cv && typeof window.cv.getBuildInformation === 'function') {
            clearInterval(id)
            markReady()
          }
        }, 100)
      }
    }

    if (!existing) {
      script.src = OPENCV_URL
      script.async = true
      script.onload = onScriptLoad
      script.onerror = () => setError(new Error('OpenCV.js 로딩 실패'))
      document.body.appendChild(script)
    } else {
      // 기존 스크립트가 있으면 즉시 준비 시도
      onScriptLoad()
    }
  }, [])

  return { ready, error }
}
