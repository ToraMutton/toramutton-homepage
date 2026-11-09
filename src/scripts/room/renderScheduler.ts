// 必要なときだけ描くためのスケジューラ。
//
// requestAnimationFrame を回し続けると、部屋が止まっていても GPU が動き続ける。
// そこで invalidate() された時だけ 1 回描き、render が「まだ動いている」と返す間だけ続ける。

export interface RenderScheduler {
  /** 次のフレームで描く */
  invalidate(): void;
  /** リサイズ中など、今この瞬間に描く（ちらつき防止） */
  renderNow(): void;
  /** 非表示タブ・画面外で止める。再開時に 1 フレーム描く */
  setSuspended(suspended: boolean): void;
  dispose(): void;
  readonly renderCount: number;
}

/** 長く止まった後の復帰で、カメラが一気に飛ばないようにする上限（秒） */
const MAX_DELTA = 0.1;

export function createRenderScheduler(
  render: (deltaSeconds: number) => boolean,
): RenderScheduler {
  let frame = 0;
  let lastTime = 0;
  let suspended = false;
  let disposed = false;
  let renderCount = 0;

  function draw(delta: number): boolean {
    renderCount += 1;
    return render(delta);
  }

  function request() {
    if (frame === 0 && !suspended && !disposed) {
      frame = requestAnimationFrame(tick);
    }
  }

  function tick(now: number) {
    frame = 0;
    const delta = lastTime === 0 ? 1 / 60 : (now - lastTime) / 1000;
    if (draw(Math.min(delta, MAX_DELTA))) {
      lastTime = now;
      request();
    } else {
      lastTime = 0;
    }
  }

  function cancel() {
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  return {
    invalidate: request,
    renderNow() {
      if (suspended || disposed) return;
      cancel();
      if (draw(0)) request();
    },
    setSuspended(next) {
      if (next === suspended) return;
      suspended = next;
      if (suspended) cancel();
      else request();
    },
    dispose() {
      disposed = true;
      cancel();
    },
    get renderCount() {
      return renderCount;
    },
  };
}
