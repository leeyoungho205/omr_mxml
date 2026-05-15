/**
 * 입력된 HTMLImageElement에서 종이(악보)의 4개 꼭짓점을 자동 검출.
 * 알고리즘:
 *   1) 그레이스케일 변환
 *   2) 가우시안 블러로 노이즈 제거
 *   3) Canny 에지 검출
 *   4) findContours로 외곽선 찾기
 *   5) 가장 큰 면적의 4각형 다각형 근사 결과를 종이로 판단
 *   6) 못 찾으면 이미지 전체 모서리 반환 (사용자가 수동 조정)
 *
 * @param {HTMLImageElement|HTMLCanvasElement} imageEl - 원본 이미지 요소
 * @returns {Array<{x:number, y:number}>} TL, TR, BR, BL 순서의 4 꼭짓점
 */
export function detectCorners(imageEl) {
  const cv = window.cv
  if (!cv) throw new Error('OpenCV.js가 아직 로드되지 않았습니다.')

  // OpenCV Mat으로 읽기
  const src = cv.imread(imageEl)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edged = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()

  try {
    // 1) 그레이스케일
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0)
    // 2) 블러
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT)
    // 3) Canny 에지
    cv.Canny(blurred, edged, 75, 200)
    // 4) 외곽선 찾기
    cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    let best = null
    let bestArea = 0
    const imgArea = src.rows * src.cols
    const minArea = imgArea * 0.1 // 최소 이미지의 10% 넘는 면적만 후보

    // 5) 4각형 근사 + 면적 최대 후보 선정
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i)
      const peri = cv.arcLength(cnt, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true)
      if (approx.rows === 4) {
        const area = Math.abs(cv.contourArea(approx))
        if (area > bestArea && area > minArea) {
          if (best) best.delete()
          best = approx
          bestArea = area
        } else {
          approx.delete()
        }
      } else {
        approx.delete()
      }
      cnt.delete()
    }

    let corners
    if (best) {
      // approx.data32S에 [x0,y0,x1,y1,x2,y2,x3,y3] 형태로 저장
      const d = best.data32S
      corners = [
        { x: d[0], y: d[1] },
        { x: d[2], y: d[3] },
        { x: d[4], y: d[5] },
        { x: d[6], y: d[7] },
      ]
      best.delete()
    } else {
      // 6) 폴백: 사진의 80% 영역을 기본 사각형으로
      const w = src.cols
      const h = src.rows
      const m = 0.1
      corners = [
        { x: w * m, y: h * m },
        { x: w * (1 - m), y: h * m },
        { x: w * (1 - m), y: h * (1 - m) },
        { x: w * m, y: h * (1 - m) },
      ]
    }

    return orderCorners(corners)
  } finally {
    src.delete()
    gray.delete()
    blurred.delete()
    edged.delete()
    contours.delete()
    hierarchy.delete()
  }
}

/**
 * 4개의 점을 TL, TR, BR, BL 순으로 정렬.
 * 합(x+y)이 가장 작은 점 = TL, 가장 큰 점 = BR
 * 차(y-x)가 가장 작은 점 = TR, 가장 큰 점 = BL
 */
export function orderCorners(pts) {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y))
  const tl = bySum[0]
  const br = bySum[bySum.length - 1]
  const remaining = pts.filter((p) => p !== tl && p !== br)
  const tr = remaining[0].x > remaining[1].x ? remaining[0] : remaining[1]
  const bl = remaining[0].x > remaining[1].x ? remaining[1] : remaining[0]
  return [tl, tr, br, bl]
}
