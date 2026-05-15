/**
 * 4개의 꼭짓점을 받아 원근 변환(perspective transform)을 수행하여
 * 평면화된 직사각형 이미지를 출력 canvas에 그린다.
 *
 * 출력 가로/세로는 입력 꼭짓점의 변 길이에서 추정:
 *   - 너비 = max(상단 변 길이, 하단 변 길이)
 *   - 높이 = max(좌측 변 길이, 우측 변 길이)
 *
 * @param {HTMLImageElement|HTMLCanvasElement} imageEl 원본 이미지
 * @param {Array<{x:number,y:number}>} corners TL, TR, BR, BL 순서의 4점
 * @param {HTMLCanvasElement} outCanvas 결과를 그릴 canvas
 */
export function flatten(imageEl, corners, outCanvas) {
  const cv = window.cv
  if (!cv) throw new Error('OpenCV.js가 아직 로드되지 않았습니다.')

  const [tl, tr, br, bl] = corners

  // 결과 이미지 너비/높이 추정
  const widthTop = dist(tl, tr)
  const widthBottom = dist(bl, br)
  const heightLeft = dist(tl, bl)
  const heightRight = dist(tr, br)
  const maxWidth = Math.max(widthTop, widthBottom)
  const maxHeight = Math.max(heightLeft, heightRight)

  const src = cv.imread(imageEl)
  const dst = new cv.Mat()
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
  ])
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    maxWidth - 1, 0,
    maxWidth - 1, maxHeight - 1,
    0, maxHeight - 1,
  ])

  try {
    const M = cv.getPerspectiveTransform(srcTri, dstTri)
    cv.warpPerspective(
      src,
      dst,
      M,
      new cv.Size(maxWidth, maxHeight),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255),
    )
    M.delete()

    // canvas 크기 맞춰 출력
    outCanvas.width = maxWidth
    outCanvas.height = maxHeight
    cv.imshow(outCanvas, dst)
  } finally {
    src.delete()
    dst.delete()
    srcTri.delete()
    dstTri.delete()
  }
}

function dist(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}
